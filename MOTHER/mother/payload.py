"""Build the dashboard payload (the JSON the dashboard page renders) for any mission + data set.

Used by the live server (mission from the team database) and by the static export (seeded simulator).
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Callable

from .config import Config
from .engine import Mother
from .models import Mission

CHART_INDICATORS = [
    "heart_rate_resting", "bp_systolic", "bp_diastolic", "body_temperature", "spo2", "sleep_hours", "mood",
    "fatigue", "symptom_headache", "glucose_fasting", "exercise_minutes_daily", "energy_intake_pct_target",
    "body_mass_change_pct", "vo2max_pct_baseline", "strength_pct_baseline", "reaction_time_pct_change",
    "bmd_hip_spine_pct_baseline", "bmd_femoral_neck_pct_baseline", "radiation_career_mSv",
    "radiation_daily_vs_environment",
]
HABITAT_CHARTS = ["cabin_co2", "cabin_ppo2", "cabin_temperature", "cabin_humidity", "noise_24h"]


def _r(v, n=2):
    return None if v is None else round(v, n)


def compact(s: dict) -> dict:
    def ind(d):
        return {k: [_r(v["value"]), v["status"], v["message"], v["stale"]] for k, v in d.items()}

    return {
        "o": s["overall_status"], "sum": s["summary"], "c": s["counts"],
        "i": ind(s["indicators"]), "h": ind(s["habitat"]), "sw": ind(s["space_weather"]),
        "f": [{k: f[k] for k in ("id", "kind", "status", "title", "action", "explanation", "escalate", "basis",
                                 "risks", "sources", "indicator_id", "rule_id")} for f in s["findings"][:30]],
        "r": {r["id"]: [r["status"], r["score"], r["finding_ids"]] for r in s["risks"]},
        "b": {k: v["status"] for k, v in s["body_map"].items()},
        "eva": s["eva_readiness"],
        "fc": s["forecasts"],
        "an": s["analytics"]["status"],
        "t": [{k: t[k] for k in ("title", "kind", "priority", "done", "points", "category", "reason")}
              for t in s["tasks"]][:16],
        "esc": len(s["escalations"]),
    }


def detected_events(snapshots: dict[str, list], limit: int = 14) -> list[dict]:
    """First day each alert-level conclusion or syndrome appears, per astronaut (data-driven 'what happened')."""
    events = []
    for who, days in snapshots.items():
        active: dict[str, int] = {}
        last_seen: dict[str, int] = {}
        for i, s in enumerate(days):
            fd = i + 1
            today = {f["rule_id"]: f for f in s["f"] if f["status"] == "alert" or f["kind"] == "syndrome"}
            for rid, f in today.items():
                if rid not in active and fd - last_seen.get(rid, -99) > 10:
                    active[rid] = fd
                    events.append({"kind": f["title"], "fd": fd, "dur": 1, "who": who, "desc": f["title"],
                                   "status": f["status"], "_rid": rid})
                last_seen[rid] = fd
            for rid in [r for r in active if r not in today]:
                start = active.pop(rid)
                for e in reversed(events):
                    if e["who"] == who and e["_rid"] == rid and e["fd"] == start:
                        e["dur"] = max(1, fd - start)
                        break
    # the same crew-wide event (e.g. a solar storm) seen by every astronaut becomes one 'crew' event
    merged: dict[tuple, dict] = {}
    for e in events:
        k = (e["_rid"], e["fd"])
        if k in merged:
            merged[k]["who"] = None
        else:
            merged[k] = e
    events = list(merged.values())

    def score(e):  # syndromes and multi-day alerts matter more than one short night
        rid = e["_rid"]
        return ((3 if rid.startswith("syndrome.") else 0) + (2 if e["status"] == "alert" else 0)
                + (1 if rid.startswith("rolling.") else 0) + min(e["dur"], 5) * 0.5)
    events = [e for e in events if e["dur"] >= 2 or e["_rid"].startswith(("syndrome.", "rolling."))
              or e["who"] is None] or events
    events.sort(key=lambda e: (-score(e), e["fd"]))
    per_rule: dict[str, int] = {}
    varied = []
    for e in sorted(events, key=lambda e: e["fd"]):   # at most the first two occurrences of each rule
        per_rule[e["_rid"]] = per_rule.get(e["_rid"], 0) + 1
        if per_rule[e["_rid"]] <= 2:
            varied.append(e)
    varied.sort(key=lambda e: (-score(e), e["fd"]))
    picked = sorted(varied[:limit], key=lambda e: e["fd"])
    for e in picked:
        e.pop("_rid", None)
    return picked


def build_payload(mother: Mother, mission: Mission, cfg: Config, *, scenarios: list[dict] | None = None,
                  labs: dict[str, Any] | None = None, real: dict | None = None, info: dict | None = None,
                  progress: Callable[[float, str], None] | None = None) -> dict:
    days = mission.planned_days
    launch = mission.launch
    crew = mission.crew

    def at(fd: int, hh: int, mm: int = 0) -> datetime:
        return (launch + timedelta(days=fd - 1)).replace(hour=hh, minute=mm)

    def fdx(iso: str) -> float:
        t = datetime.fromisoformat(iso)
        return mission.flight_day(t) + round((t.hour * 60 + t.minute) / 1440, 3)

    snapshots: dict[str, list] = {a.id: [] for a in crew}
    for fd in range(1, days + 1):
        for a in crew:
            snapshots[a.id].append(compact(mother.assess(a.id, at(fd, 21))))
        if progress and fd % 5 == 0:
            progress(fd / days * 0.95, f"Assessed flight day {fd} of {days}")

    end = at(days, 23, 59)
    in_mission = lambda pts: [p for p in pts if 1 <= p[0] < days + 1]
    series = {a.id: {ind: in_mission([[fdx(p["ts"]), p["value"]] for p in mother.series(a.id, ind, days=days + 2, now=end)["points"]])
                     for ind in CHART_INDICATORS} for a in crew}
    habitat_id = crew[0].habitat_id if crew else "hab-1"
    hab = {}
    for ind in HABITAT_CHARTS + ["solar_proton_flux_10MeV"]:
        subj = "space_weather" if ind == "solar_proton_flux_10MeV" else habitat_id
        pts = in_mission([[fdx(p["ts"]), p["value"]] for p in mother.series(subj, ind, days=days + 2, now=end)["points"]])
        hab[ind] = pts[::3] if len(pts) > 1000 else pts

    last = mother.assess(crew[0].id, end)
    if labs is None:
        labs = {a.id: mother.assess(a.id, end)["labs"] for a in crew}
    meta = {
        "mission": last["mission"], "launch": launch.isoformat(), "days": days, "info": info or {},
        "crew": [{"id": a.id, "name": a.name, "lab": a.lab_subject_id, "prior_dose": a.prior_career_dose_mSv,
                  "info": getattr(a, "info", None)} for a in crew],
        "indicators": {k: {"label": v.label, "unit": v.unit, "category": v.category,
                           "bands": [[b.min, b.max, b.status.value] for b in v.bands], "context": v.spaceflight_context}
                       for k, v in cfg.indicators.items()},
        "risks": {r["id"]: {"label": r["label"], "hazards": r["hazards"], "regions": r["body_regions"],
                            "cm": r["countermeasures"], "links": r.get("links", []), "sources": r["sources"]}
                  for r in cfg.knowledge["risks"]},
        "hazards": {h["id"]: h["label"] for h in cfg.knowledge["hazards"]},
        "regions": {b["id"]: b["label"] for b in cfg.knowledge["body_regions"]},
        "sources": {k: {"t": v.get("title") or v.get("name") or k, "u": v.get("url")} for k, v in cfg.sources.items()},
        "scenarios": scenarios if scenarios is not None else detected_events(snapshots),
        "scenarios_title": "Injected scenarios:" if scenarios is not None else "Detected by MOTHER:",
    }
    if progress:
        progress(1.0, "Ready")
    return {"meta": meta, "snap": snapshots, "series": series, "hab": hab, "labs": labs, "real": real}
