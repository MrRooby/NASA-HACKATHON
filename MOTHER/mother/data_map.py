"""Build the data map: what the team database contains (by body system and sensor) and how
sources -> indicators -> MOTHER conclusions -> NASA HRP risks -> hazards connect.

Served live as GET /api/data-map. Offline snapshot:

    python -m mother.data_map            (needs MOTHER/.env + Tailscale) -> MOTHER/exports/data_map.json
"""
from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone

from .config import MOTHER_DIR, load_config
from .db import connect

# MOTHER id -> database indicator code (or group id) where the names differ
NAME_MAP = {
    "body_mass_kg": "body_mass", "body_mass_change_pct": "body_mass",
    "vo2max_ml_kg_min": "vo2max", "vo2max_pct_baseline": "vo2max",
    "strength_index": "strength_knee_extension", "strength_pct_baseline": "strength_knee_extension",
    "bmd_hip_spine_pct_baseline": "grp:bmd", "bmd_femoral_neck_pct_baseline": "grp:bmd",
    "radiation_career_mSv": "absorbed_dose_daily", "radiation_daily_vs_environment": "absorbed_dose_daily",
    "radiation_dose_mSv": "absorbed_dose_daily",
    "reaction_time_pct_change": "reaction_time", "reaction_time_ms": "reaction_time",
}
# Indicators MOTHER uses that the database does not have yet
MISSING = {
    "symptom_headache": ("Headache (self-report)", "score 0-3"),
    "symptom_vision_change": ("Vision change (self-report)", "yes/no"),
    "symptom_nausea": ("Nausea (self-report)", "score 0-3"),
    "fatigue": ("Fatigue (self-report)", "score 1-5"),
    "reaction_time": ("Reaction time test (PVT-like)", "ms"),
    "eva_hours": ("EVA duration", "h"),
}
GROUPS = {  # collapse long lists into one readable node
    "lab_cytokine": ("grp:cytokines", "Cytokine panel"),
    "lab_cbc": ("grp:cbc", "Complete blood count (CBC)"),
    "lab_cmp": ("grp:cmp", "Metabolic panel (CMP)"),
    "lab_cardio": ("grp:cardio_panel", "Cardio / inflammation panel"),
    "body_composition": ("grp:body_comp", "Body composition (DXA)"),
}
GROUP_RISKS = {
    "grp:cytokines": ["immune"], "grp:cbc": ["immune"], "grp:cmp": ["nutrition", "renal"],
    "grp:cardio_panel": ["cardiovascular", "immune"], "grp:body_comp": ["muscle_aerobic", "nutrition"],
    "grp:bmd": ["bone_loss"], "grp:tscore": ["bone_loss"], "grp:zscore": ["bone_loss"],
    "grp:protons": ["radiation"], "cardiac_output": ["cardiovascular"], "stroke_volume": ["cardiovascular"],
    "bp_mean_arterial": ["cardiovascular"], "absorbed_dose_daily": ["radiation"], "iss_dose_gcr_daily": ["radiation"],
    "iss_dose_saa_daily": ["radiation"], "body_mass": ["nutrition"], "vo2max": ["muscle_aerobic"],
    "strength_knee_extension": ["muscle_aerobic"], "reaction_time": ["behavioral"], "eva_hours": ["nutrition", "radiation"],
}
PSEUDO_SYSTEMS = {
    "habitat": ("Habitat & cabin sensors", "cabin"),
    "space": ("Radiation & space weather", "environment"),
    "missing": ("Needed by MOTHER, not in database yet", "-"),
}
SYNDROMES = [
    ("spc", "Personal baseline drift (EWMA, CUSUM, IMS envelope)",
     ["heart_rate_resting", "bp_systolic", "bp_diastolic", "body_temperature", "spo2", "sleep_hours", "mood", "fatigue", "cabin_co2"],
     ["cardiovascular", "immune", "sleep_circadian", "behavioral", "atmosphere"]),
    ("co2_headache", "CO2 + headache", ["cabin_co2", "symptom_headache"], ["atmosphere", "sans"]),
    ("sans_pattern", "SANS pattern (vision + headache + CO2)", ["symptom_vision_change", "symptom_headache", "cabin_co2"], ["sans"]),
    ("behavioral_strain", "Behavioural strain (sleep, mood, fatigue, reaction)", ["sleep_hours", "mood", "fatigue", "reaction_time"],
     ["behavioral", "sleep_circadian"]),
    ("infection_pattern", "Infection pattern (temperature + heart rate)", ["body_temperature", "heart_rate_resting"], ["immune"]),
    ("hypoxia_source", "Hypoxia source (SpO2 vs cabin O2)", ["spo2", "cabin_ppo2"], ["atmosphere", "immune"]),
    ("energy_deficit", "Energy deficit (mass + intake)", ["body_mass", "energy_intake_pct_target"], ["nutrition"]),
    ("bmd_forecast", "Bone density forecast (from exercise)", ["exercise_minutes_daily", "grp:bmd"], ["bone_loss"]),
    ("radiation_event", "Solar particle event / dose", ["solar_proton_flux_10MeV", "grp:protons", "absorbed_dose_daily"], ["radiation"]),
    ("motion_sickness", "Space adaptation sickness > 72 h", ["symptom_nausea"], ["sensorimotor"]),
    ("eva_readiness", "EVA GO / NO-GO", ["solar_proton_flux_10MeV", "sleep_hours", "vo2max", "reaction_time"],
     ["radiation", "muscle_aerobic", "behavioral"]),
]


def _q(cur, sql):
    cur.execute(sql)
    return list(cur.fetchall())


def build() -> dict:
    cfg = load_config()
    conn = connect()
    with conn.cursor() as cur:
        systems = _q(cur, "SELECT code, label, body_region, sort_order FROM astro_core.body_system ORDER BY sort_order")
        inds = _q(cur, "SELECT indicator_code, label, category, body_system, body_region, unit, scope, threshold_id, "
                       "n_subjects, n_observations, sources FROM astro_api.indicators")
        sources = _q(cur, "SELECT source_id, title, publisher, data_kind, url, n_subjects, n_observations, "
                          "n_env_observations, n_cohorts FROM astro_api.sources")
        env = _q(cur, "SELECT i.code ind, e.environment_code env, e.source_id src, e.aggregation agg, COUNT(*) n, "
                      "MIN(e.measured_at) t0, MAX(e.measured_at) t1 FROM astro_core.env_observation e "
                      "JOIN astro_core.indicator i ON i.id = e.indicator_id GROUP BY 1, 2, 3, 4")
        missions = _q(cur, "SELECT mission_code, mission_name, environment, duration_days, is_synthetic, n_subjects "
                           "FROM astro_api.missions")
    conn.close()

    kind = {s["source_id"]: s["data_kind"] for s in sources}
    env_by_ind: dict[str, list] = defaultdict(list)
    for e in env:
        env_by_ind[e["ind"]].append(e)

    # ---------------- inventory (flat, GUI-ready) ----------------
    inventory = []
    for i in inds:
        srcs = [s.strip() for s in (i["sources"] or "").split(",") if s.strip()]
        env_rows = env_by_ind.get(i["indicator_code"], [])
        srcs += [e["src"] for e in env_rows if e["src"] not in srcs]
        n_env = sum(e["n"] for e in env_rows)
        n_obs = int(i["n_observations"] or 0)
        if n_obs + n_env == 0:
            continue
        system = i["body_system"] or ("habitat" if i["category"] == "environment" else "space")
        inventory.append({
            "code": i["indicator_code"], "label": i["label"], "category": i["category"], "unit": i["unit"],
            "body_system": system, "body_region": i["body_region"], "scope": i["scope"],
            "n_subjects": int(i["n_subjects"] or 0), "n_observations": n_obs, "n_env_observations": n_env,
            "sources": srcs, "data_kinds": sorted({kind.get(s, "unknown") for s in srcs}),
            "threshold_id": i["threshold_id"],
            "env_series": [{"environment": e["env"], "source": e["src"], "aggregation": e["agg"], "n": e["n"],
                            "from": str(e["t0"])[:10], "to": str(e["t1"])[:10]} for e in env_rows],
        })

    # ---------------- graph ----------------
    nodes: dict[str, dict] = {}
    edges: set[tuple[str, str]] = set()

    def node(nid, col, label, **kw):
        nodes.setdefault(nid, {"id": nid, "col": col, "label": label, **kw})

    for s in sources:
        if (s["n_observations"] or 0) + (s["n_env_observations"] or 0) + (s["n_cohorts"] or 0) == 0:
            continue
        node(f"src:{s['source_id']}", 0, s["title"], kind=s["data_kind"], url=s["url"], publisher=s["publisher"],
             n=int((s["n_observations"] or 0) + (s["n_env_observations"] or 0)), code=s["source_id"])
    node("src:missing", 0, "Not in database yet (app check-in / tests)", kind="missing", n=0, code="-")

    sys_label = {s["code"]: s["label"] for s in systems}
    sys_label.update({k: v[0] for k, v in PSEUDO_SYSTEMS.items()})
    grouped: dict[str, list] = defaultdict(list)
    for it in inventory:
        c = it["code"]
        if it["category"] in GROUPS:
            gid, glabel = GROUPS[it["category"]]
        elif c.startswith("bmd_"):
            gid, glabel = "grp:bmd", "Bone mineral density (DXA)"
        elif c.startswith("tscore_"):
            gid, glabel = "grp:tscore", "Bone T-scores (DXA)"
        elif c.startswith("zscore_"):
            gid, glabel = "grp:zscore", "Bone Z-scores (DXA)"
        elif c.startswith("proton_flux_ge"):
            gid, glabel = "grp:protons", "Proton flux channels (GOES)"
        else:
            gid, glabel = c, it["label"]
        grouped[gid].append((glabel, it))
    for gid, members in grouped.items():
        label = members[0][0]
        items = [m[1] for m in members]
        system = Counter(i["body_system"] for i in items).most_common(1)[0][0]
        if len(items) > 1:
            label = f"{label} ({len(items)})"
        srcs = sorted({s for i in items for s in i["sources"]})
        node(f"ind:{gid}", 1, label, system=system, system_label=sys_label.get(system, system),
             unit=items[0]["unit"] if len(items) == 1 else "various", members=[i["code"] for i in items],
             n=sum(i["n_observations"] + i["n_env_observations"] for i in items),
             kinds=sorted({k for i in items for k in i["data_kinds"]}), threshold=items[0]["threshold_id"] if len(items) == 1 else None)
        for s in srcs:
            edges.add((f"src:{s}", f"ind:{gid}"))
    for code, (label, unit) in MISSING.items():
        node(f"ind:{code}", 1, label, system="missing", system_label=sys_label["missing"], unit=unit, members=[code],
             n=0, kinds=["missing"], missing=True)
        edges.add(("src:missing", f"ind:{code}"))
    # threshold indicators that exist in the DB dictionary but have no data yet
    for i in inds:
        if i["threshold_id"] and f"ind:{i['indicator_code']}" not in nodes and i["indicator_code"] in ("cabin_ppo2", "noise_24h"):
            node(f"ind:{i['indicator_code']}", 1, i["label"], system="habitat", system_label=sys_label["habitat"], unit=i["unit"],
                 members=[i["indicator_code"]], n=0, kinds=["missing"], missing=True)
            edges.add(("src:missing", f"ind:{i['indicator_code']}"))

    def ind_node(mother_id: str) -> str | None:
        code = NAME_MAP.get(mother_id, mother_id)
        nid = code if code.startswith("grp:") else f"ind:{code}"
        if not nid.startswith("ind:"):
            nid = "ind:" + nid
        return nid if nid in nodes else None

    for sid, label, ins, risks in SYNDROMES:
        node(f"syn:{sid}", 2, label, risks=risks)
        for m in ins:
            n = ind_node(m)
            if n:
                edges.add((n, f"syn:{sid}"))
        for r in risks:
            edges.add((f"syn:{sid}", f"risk:{r}"))

    for r in cfg.knowledge["risks"]:
        node(f"risk:{r['id']}", 3, r["label"], countermeasures=r["countermeasures"], links=r.get("links", []))
        for h in r["hazards"]:
            edges.add((f"risk:{r['id']}", f"haz:{h}"))
        for m in r["indicators"]:
            n = ind_node(m)
            if n:
                edges.add((n, f"risk:{r['id']}"))
    for gid, risks in GROUP_RISKS.items():
        n = gid if gid.startswith("grp:") else gid
        nid = f"ind:{n}"
        if nid in nodes:
            for r in risks:
                edges.add((nid, f"risk:{r}"))
    # remaining environment indicators -> risks
    for nid, nd in list(nodes.items()):
        if nd["col"] == 1 and nd.get("system") == "habitat" and not any(e[0] == nid and e[1].startswith("risk:") for e in edges):
            edges.add((nid, "risk:habitability"))
    for h in cfg.knowledge["hazards"]:
        node(f"haz:{h['id']}", 4, h["label"], link=h.get("link"))

    edges = {e for e in edges if e[0] in nodes and e[1] in nodes}
    used = {x for e in edges for x in e}
    nodes = {k: v for k, v in nodes.items() if k in used}

    # ---------------- naming map MOTHER <-> DB ----------------
    naming = [{"mother": k, "database": v} for k, v in NAME_MAP.items()]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="minutes"),
        "systems": [{"code": s["code"], "label": s["label"], "body_region": s["body_region"]} for s in systems]
                   + [{"code": k, "label": v[0], "body_region": v[1]} for k, v in PSEUDO_SYSTEMS.items() if k != "missing"],
        "inventory": inventory,
        "missing": [{"code": k, "label": v[0], "unit": v[1]} for k, v in MISSING.items()]
                   + [{"code": c, "label": nodes[f"ind:{c}"]["label"], "unit": nodes[f"ind:{c}"]["unit"]}
                      for c in ("cabin_ppo2", "noise_24h") if f"ind:{c}" in nodes],
        "sources": [{"id": s["source_id"], "title": s["title"], "publisher": s["publisher"], "kind": s["data_kind"],
                     "url": s["url"], "n_subjects": int(s["n_subjects"] or 0),
                     "n_observations": int(s["n_observations"] or 0), "n_env": int(s["n_env_observations"] or 0),
                     "n_cohorts": int(s["n_cohorts"] or 0)} for s in sources
                    if (s["n_observations"] or 0) + (s["n_env_observations"] or 0) + (s["n_cohorts"] or 0) > 0],
        "missions": [{**m, "duration_days": m["duration_days"], "is_synthetic": bool(m["is_synthetic"])} for m in missions],
        "graph": {"nodes": list(nodes.values()), "edges": sorted(edges),
                  "columns": ["Data sources", "Indicators by body system", "MOTHER reasoning", "NASA HRP risks", "HRP hazards"]},
        "naming": naming,
    }


def write(data: dict) -> None:
    """Offline snapshot: exports/data_map.json (same shape as GET /api/data-map)."""
    out = MOTHER_DIR / "exports"
    out.mkdir(parents=True, exist_ok=True)
    (out / "data_map.json").write_text(json.dumps(data, ensure_ascii=False, default=str, separators=(",", ":")),
                                       encoding="utf-8")


if __name__ == "__main__":
    d = build()
    write(d)
    g = d["graph"]
    print(f"inventory {len(d['inventory'])} indicators with data, graph {len(g['nodes'])} nodes / {len(g['edges'])} edges",
          file=sys.stderr)
