"""Organ cards: the small, stable output MOTHER gives the UI.

For one person: at most 10 cards (one per organ / body area), each with ONE status, ONE sentence and up to
THREE numbers. Everything else (formulas, inputs, references) is optional detail behind the card.
Contract: MOTHER/UI_CONTRACT.md · schema version 1.0
"""
from __future__ import annotations

import statistics
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from . import clinical as C
from .db_source import TeamDatabase

SCHEMA_VERSION = "1.0"
ORGANS = [
    ("brain", "Brain & sleep"), ("eyes", "Eyes"), ("heart", "Heart & circulation"), ("lungs", "Lungs & oxygen"),
    ("blood", "Blood"), ("kidneys", "Kidneys & urine"), ("gut", "Digestion & metabolism"),
    ("musculoskeletal", "Bones & muscles"), ("limbs", "Limbs (circulation)"), ("exposure", "Radiation & air"),
]
# What each organ needs when the database has nothing for it (from the MEDICAL-DIAGNOSIS device list)
NEEDS = {
    "brain": "sleep log or EEG headband, mood check-in", "eyes": "visual acuity, fundus photo, eye pressure (tonometer)",
    "heart": "heart rate + blood pressure (wearable / cuff)", "lungs": "SpO2 (wearable), spirometry",
    "blood": "blood analyser (CBC + electrolytes)", "kidneys": "creatinine, urine analyser",
    "gut": "glucose, urine strip, stool log", "musculoskeletal": "grip strength, VO2 test, BIA / bone scan",
    "limbs": "4 limb bands (pulse + SpO2 per limb)", "exposure": "personal dosimeter, cabin CO2 sensor",
}
URINE_CHANNELS = ["urine_volume_24h", "urine_specific_gravity", "water_intake_24h", "urine_calcium_24h", "urine_oxalate_24h",
                  "urine_citrate_24h", "urine_albumin_creatinine", "feces_bristol", "dose_personal_cum",
                  "urine_dipstick_blood", "urine_dipstick_nitrite", "urine_dipstick_leukocytes", "urine_dipstick_ketones",
                  "urine_dipstick_glucose", "urine_dipstick_protein"]
LAB_CODES = ["creatinine", "bun", "egfr", "potassium", "sodium", "chloride", "bicarbonate", "calcium", "albumin", "hemoglobin",
             "wbc", "lymphocytes_abs", "alt", "ast", "glucose", "glucose_fasting"]
VITAL_CODES = ["heart_rate_resting", "bp_systolic", "bp_diastolic", "spo2", "body_temperature", "sleep_hours", "mood",
               "vo2max", "strength_knee_extension", "body_mass"]


def _age_mid(band: str | None) -> float | None:
    if not band or "-" not in band:
        return None
    a, b = band.split("-")
    return (float(a) + float(b)) / 2


# ------------------------------------------------------------------ data loading
def list_subjects(db: TeamDatabase) -> list[dict[str, Any]]:
    people = db._q("SELECT DISTINCT s.subject_code, s.sex, s.age_band, s.is_synthetic, s.mission_code, s.mission_name, s.data_kind "
                   "FROM astro_api.subjects s WHERE s.mission_code NOT LIKE 'MR035G%%' ORDER BY s.is_synthetic DESC, s.subject_code")
    out, seen = [], set()
    for p in people:  # one row per person even when they take part in several missions
        if p["subject_code"] in seen:
            continue
        seen.add(p["subject_code"])
        out.append({"code": p["subject_code"], "label": p["subject_code"], "kind": "crew_health", "sex": p["sex"],
                    "age_band": p["age_band"], "mission": p["mission_name"], "synthetic": bool(p["is_synthetic"]),
                    "data_kind": p["data_kind"]})
    for c in db._q("SELECT c.code, c.subject_id, c.home_zone_code, h.name FROM astro_habitat.crew c "
                   "JOIN astro_habitat.habitat h ON h.id = c.habitat_id ORDER BY c.code"):
        out.append({"code": f"HAB-{c['code']}", "label": f"Habitat crew {c['code']}", "kind": "habitat_crew", "sex": None,
                    "age_band": None, "mission": c["name"], "synthetic": True, "data_kind": "synthetic",
                    "home_zone": c["home_zone_code"], "linked_subject_id": c["subject_id"]})
    return out


def _person(db: TeamDatabase, code: str, day: int | None, mission: str | None = None) -> dict[str, Any]:
    """One person's data for ONE mission (never mixes missions). Default: the mission with the most recent data."""
    if mission is None:
        m = db._q("SELECT mission_code FROM astro_api.observations WHERE subject_code = %s "
                  "GROUP BY mission_code ORDER BY MAX(measured_at) DESC LIMIT 1", (code,))
        mission = m[0]["mission_code"] if m else None
    subj = db._q("SELECT sex, age_band, data_kind, is_synthetic, mission_name FROM astro_api.subjects "
                 "WHERE subject_code = %s AND (%s IS NULL OR mission_code = %s) LIMIT 1", (code, mission, mission))
    if not subj:
        raise KeyError(code)
    rows = db._q(
        "SELECT indicator_code c, value v, value_text t, phase, mission_day d, time_order o, timepoint_label tp, measured_at m "
        "FROM astro_api.observations WHERE subject_code = %s AND mission_code = %s AND indicator_code IN %s "
        "AND (value IS NOT NULL OR value_text IS NOT NULL) "
        + ("AND (mission_day IS NULL OR mission_day <= %s) " if day is not None else "") + "ORDER BY time_order",
        (code, mission, tuple(LAB_CODES + VITAL_CODES)) + ((day,) if day is not None else ()))
    series: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        series[r["c"]].append(r)
    s = subj[0]
    return {"sex": s["sex"], "age": _age_mid(s["age_band"]), "series": series, "data_kind": s["data_kind"],
            "synthetic": bool(s["is_synthetic"]), "mission": s["mission_name"], "mission_code": mission,
            "as_of": {"mission_day": day}}


def _habitat(db: TeamDatabase, crew: str, sol: int | None) -> dict[str, Any]:
    c = db._q("SELECT home_zone_code FROM astro_habitat.crew WHERE code = %s", (crew,))
    if not c:
        raise KeyError(crew)
    zone = c[0]["home_zone_code"]
    if sol is None:
        sol = db._q("SELECT MAX(sol) s FROM astro_habitat.reading WHERE crew_code = %s", (crew,))[0]["s"]
    rows = db._q("SELECT channel_code c, sol, ts_utc m, value_num v, value_text t FROM astro_habitat.reading "
                 "WHERE crew_code = %s AND channel_code IN %s AND sol <= %s AND sol > %s ORDER BY ts_utc",
                 (crew, tuple(URINE_CHANNELS), sol, sol - 14))
    dose = db._q("SELECT value_num v, sol FROM astro_habitat.reading WHERE crew_code = %s AND channel_code = 'dose_personal_cum' "
                 "ORDER BY ts_utc DESC LIMIT 1", (crew,))
    co2 = db._q("SELECT AVG(value_num) v FROM astro_habitat.reading WHERE channel_code = 'ppco2' AND zone_code = %s AND sol BETWEEN %s AND %s",
                (zone, sol, sol))
    series: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        series[r["c"]].append(r)
    return {"series": series, "dose": dose[0] if dose else None, "co2": co2[0]["v"] if co2 else None, "zone": zone,
            "as_of": {"sol": sol}, "synthetic": True, "data_kind": "synthetic", "mission": "Mars lava-tube habitat"}


# ------------------------------------------------------------------ helpers
def _last(series, code):
    s = series.get(code) or []
    return s[-1] if s else None


def _lastv(series, code):
    r = _last(series, code)
    return float(r["v"]) if r and r["v"] is not None else None


def _mean_last(series, code, n=7):
    vals = [float(r["v"]) for r in (series.get(code) or [])[-n:] if r["v"] is not None]
    return statistics.fmean(vals) if vals else None


# ------------------------------------------------------------------ checks per data source
def person_checks(p: dict[str, Any]) -> list[C.Check]:
    s, female, age = p["series"], (p["sex"] == "F") if p["sex"] in ("F", "M") else None, p["age"]
    out: list[C.Check] = []
    cr = s.get("creatinine") or []
    if cr:
        out.append(C.check_egfr(float(cr[-1]["v"]), age, female, _lastv(s, "egfr")))
        pre = [float(r["v"]) for r in cr if r["phase"] == "pre"] or [float(cr[0]["v"])]
        rise48 = None
        if len(cr) >= 2 and cr[-1]["m"] and cr[-2]["m"] and (cr[-1]["m"] - cr[-2]["m"]).total_seconds() <= 48 * 3600:
            rise48 = float(cr[-1]["v"]) - float(cr[-2]["v"])
        out.append(C.check_aki_kdigo(min(pre), float(cr[-1]["v"]), rise48))
        if _lastv(s, "bun") is not None:
            out.append(C.check_bun_creatinine(_lastv(s, "bun"), float(cr[-1]["v"])))
    for code, fn in (("potassium", C.check_potassium), ("sodium", C.check_sodium)):
        v = _lastv(s, code)
        if v is not None:
            out.append(fn(v))
    if _lastv(s, "calcium") is not None:
        out.append(C.check_calcium(_lastv(s, "calcium"), _lastv(s, "albumin")))
    if None not in (_lastv(s, "sodium"), _lastv(s, "chloride"), _lastv(s, "bicarbonate")):
        out.append(C.check_anion_gap(_lastv(s, "sodium"), _lastv(s, "chloride"), _lastv(s, "bicarbonate")))
    if _lastv(s, "hemoglobin") is not None:
        out.append(C.check_anemia(_lastv(s, "hemoglobin"), female))
    if _lastv(s, "wbc") is not None:
        out.append(C.check_wbc(_lastv(s, "wbc")))
    if _lastv(s, "lymphocytes_abs") is not None:
        out.append(C.check_lymphocytes(_lastv(s, "lymphocytes_abs")))
    out.append(C.check_liver(_lastv(s, "alt"), _lastv(s, "ast"), female))
    g = _lastv(s, "glucose_fasting") or _lastv(s, "glucose")
    if g is not None:
        out.append(C.check_glucose(g))
    hr, sbp, dbp = _lastv(s, "heart_rate_resting"), _lastv(s, "bp_systolic"), _lastv(s, "bp_diastolic")
    if hr and sbp:
        out.append(C.check_shock_index(hr, sbp))
    if sbp and dbp:
        out.append(C.check_map(sbp, dbp))
    if _lastv(s, "spo2") is not None:
        out.append(C.check_spo2(_lastv(s, "spo2")))
    sl = _mean_last(s, "sleep_hours", 7)
    if sl is not None:
        st = C.ALERT if sl < 5 else C.CAUTION if sl < 6 else C.OK
        out.append(C.Check("brain", "sleep_7d", "Sleep (7-day average)", sl, "h", st, f"Sleeping {sl:.1f} h a night on average.",
                           None if st == C.OK else "Protect the sleep period; no caffeine 6–12 h before sleep.",
                           "mean of last 7 nights; NASA plans 8.5 h", "NASA-STD-3001 Vol 1 [6001]; HRP sleep evidence"))
    md = _mean_last(s, "mood", 5)
    if md is not None:
        st = C.CAUTION if md < 3 else C.OK
        out.append(C.Check("brain", "mood_5d", "Mood (5-day average)", md, "1–5", st, f"Mood {md:.1f}/5.",
                           None if st == C.OK else "Offer a private psychological conference.", "mean of last 5 self-ratings",
                           "NASA behavioural health operations", basis="team_assumption"))
    for code, label, unit in (("vo2max", "Aerobic capacity vs preflight", "% of preflight"), ("strength_knee_extension", "Leg strength vs preflight", "% of preflight")):
        rows = s.get(code) or []
        pre = [float(r["v"]) for r in rows if r["phase"] == "pre"]
        if pre and rows and rows[-1]["phase"] != "pre":
            pct = float(rows[-1]["v"]) / statistics.fmean(pre) * 100
            st = C.ALERT if pct < 80 else C.CAUTION if pct < 85 else C.OK
            out.append(C.Check("musculoskeletal", code + "_pct", label, pct, unit, st, f"{label}: {pct:.0f}%.",
                               None if st == C.OK else "Adjust the exercise prescription.", "latest ÷ preflight mean × 100 (NASA minimum 80%)",
                               "NASA-STD-3001 Vol 1 [4001, 4024]"))
    return [c for c in out if c is not None]


def habitat_checks(h: dict[str, Any], female: bool | None = None) -> list[C.Check]:
    s = h["series"]
    out: list[C.Check] = []
    out.append(C.check_stone_risk(_lastv(s, "urine_calcium_24h"), _lastv(s, "urine_oxalate_24h"), _lastv(s, "urine_citrate_24h"),
                                  _lastv(s, "urine_volume_24h"), female))
    out.append(C.check_hydration(_lastv(s, "urine_specific_gravity"), _lastv(s, "water_intake_24h")))
    if _lastv(s, "urine_albumin_creatinine") is not None:
        out.append(C.check_albumin_creatinine(_lastv(s, "urine_albumin_creatinine")))
    strip = {k.replace("urine_dipstick_", ""): (_last(s, k) or {}).get("t") for k in URINE_CHANNELS if k.startswith("urine_dipstick_") and _last(s, k)}
    out += C.check_dipstick(strip)
    bris = [float(r["v"]) for r in (s.get("feces_bristol") or []) if r["v"] is not None]
    if bris:
        abnormal_run = 0
        for v in reversed(bris):
            if 3 <= round(v) <= 5:
                break
            abnormal_run += 1
        out.append(C.check_bristol(bris[-1], max(1, abnormal_run)))
    if h["dose"]:
        out.append(C.check_personal_dose(float(h["dose"]["v"])))
    if h["co2"] is not None:
        out.append(C.check_co2_exposure(float(h["co2"])))
    return [c for c in out if c is not None]


def cross_checks(checks: list[C.Check], limbs: dict | None = None) -> list[C.Check]:
    """Combine results from different devices (blood analyser + urine strip + limb bands)."""
    out = []
    limb_checks = C.check_limb_perfusion(limbs) if limbs else []
    out += limb_checks
    by = {c.code: c for c in checks}
    k = by["potassium"].value if "potassium" in by else None
    urine_blood = "urine_blood" in by and by["urine_blood"].status != C.OK
    aki = by["aki_kdigo"].value if "aki_kdigo" in by else 0
    crush = C.check_crush_syndrome(any(c.status == C.ALERT for c in limb_checks), k, urine_blood, aki)
    if crush:
        out.append(crush)
    return out


# ------------------------------------------------------------------ cards
def build_cards(checks: list[C.Check], meta: dict[str, Any]) -> dict[str, Any]:
    by_organ: dict[str, list[C.Check]] = defaultdict(list)
    for c in checks:
        by_organ[c.organ].append(c)
    cards = []
    for organ, label in ORGANS:
        cs = sorted(by_organ.get(organ, []), key=lambda c: -C._RANK[c.status])
        if not cs:
            cards.append({"organ": organ, "label": label, "status": "no_data", "headline": f"No data yet - needs {NEEDS[organ]}.",
                          "metrics": [], "why": None, "action": None, "checks": []})
            continue
        top = cs[0]
        status = top.status
        headline = top.message if status != C.OK else f"All {len(cs)} check{'s' if len(cs) > 1 else ''} normal."
        cards.append({
            "organ": organ, "label": label, "status": status, "headline": headline,
            "metrics": [{"name": c.label, "value": c.value if not isinstance(c.value, float) else round(c.value, 2),
                         "unit": c.unit, "status": c.status} for c in cs[:3]],
            "why": (f"{top.formula} · {top.reference}" if top.formula else top.reference) if status != C.OK else None,
            "action": top.action if status != C.OK else None,
            "checks": [c.to_dict() for c in cs],
        })
    statuses = [c["status"] for c in cards if c["status"] != "no_data"]
    overall = C.worst(statuses) if statuses else "no_data"
    worst_card = next((c for c in cards if c["status"] == overall), None)
    return {"schema_version": SCHEMA_VERSION, "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            **meta, "overall_status": overall, "top_message": worst_card["headline"] if worst_card and overall != C.OK else "All checks normal.",
            "organs": cards}


def organ_report(db: TeamDatabase, subject: str, day: int | None = None, sol: int | None = None,
                 mission: str | None = None) -> dict[str, Any]:
    if subject.startswith("HAB-"):
        crew = subject[4:]
        h = _habitat(db, crew, sol)
        checks = habitat_checks(h)
        link = db._q("SELECT s.code, s.sex, m.code mission FROM astro_habitat.crew c JOIN astro_core.subject s ON s.id = c.subject_id "
                     "JOIN astro_habitat.habitat h ON h.id = c.habitat_id LEFT JOIN astro_core.mission m ON m.id = h.mission_id "
                     "WHERE c.code = %s", (crew,))
        if link:  # the database links habitat crew to a health subject: both data sets merge into one person
            p = _person(db, link[0]["code"], h["as_of"]["sol"], link[0]["mission"])
            checks = habitat_checks(h, female=(link[0]["sex"] == "F") if link[0]["sex"] in ("F", "M") else None) + person_checks(p)
        checks += cross_checks(checks)
        meta = {"subject": {"code": subject, "label": f"Habitat crew {crew}", "home_zone": h["zone"], "mission": h["mission"],
                            "linked_health_subject": link[0]["code"] if link else None, "data_kind": "synthetic"}, "as_of": h["as_of"]}
    else:
        p = _person(db, subject, day, mission)
        checks = person_checks(p)
        checks += cross_checks(checks)
        meta = {"subject": {"code": subject, "label": subject, "sex": p["sex"], "mission": p["mission"],
                            "mission_code": p["mission_code"], "data_kind": p["data_kind"]},
                "as_of": p["as_of"]}
    return build_cards(checks, meta)


def overview(db: TeamDatabase) -> list[dict[str, Any]]:
    """One row per person: status of each organ (for a crew grid)."""
    rows = []
    for s in list_subjects(db):
        try:
            r = organ_report(db, s["code"])
        except Exception as e:  # keep the grid usable if one person's data is odd
            rows.append({"subject": s, "error": f"{type(e).__name__}"})
            continue
        rows.append({"subject": s, "overall_status": r["overall_status"], "top_message": r["top_message"],
                     "organs": {c["organ"]: c["status"] for c in r["organs"]}})
    return rows
