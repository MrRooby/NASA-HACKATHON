"""Run MOTHER over the REAL data in the team database (no synthetic data involved).

* Space weather: NOAA GOES >=10 MeV protons (last 7 days) -> rules + per-environment EVA verdict.
* ISS cabin: OSDR EDA daily telemetry 2014-2024 -> ingest quality gate + rules evaluated day by day.
* Bone: NASA LSDA MR035G bed-rest DXA -> measured loss vs MOTHER's BMD projection model.
* Labs: Inspiration4 panels with sex-matched reference ranges chosen by the database.
"""
from __future__ import annotations

from collections import Counter
from datetime import timedelta
from typing import Any

from .config import Config
from .db_source import ISS_REAL, SPACE_WEATHER, TeamDatabase
from .derive import BMD_RATE
from .ingest import ingest
from .models import Mission, Status
from .repository import InMemoryRepository
from .rules import RulesEngine

CABIN = ["cabin_co2", "cabin_temperature", "cabin_humidity"]


def _space_weather(cfg: Config, rules: RulesEngine, ms) -> dict[str, Any] | None:
    if not ms:
        return None
    repo = InMemoryRepository()
    last = ms[-1].ts
    rep = ingest(repo, ms, now=last + timedelta(minutes=1))
    state = rules.evaluate_indicator(repo, SPACE_WEATHER, "solar_proton_flux_10MeV", last)
    peak24 = max(m.value for m in repo.series(SPACE_WEATHER, "solar_proton_flux_10MeV", start=last - timedelta(hours=24), end=last))
    envs = []
    for e in cfg.environments.values():
        alert = 1000 if e.magnetosphere_protected else 100
        st = Status.ALERT if peak24 >= alert else Status.CAUTION if peak24 >= 10 and not e.magnetosphere_protected else Status.OK
        envs.append({"id": e.id, "label": e.label, "status": st.value, "eva": "NO-GO" if st == Status.ALERT else "GO",
                     "alert_threshold_pfu": alert, "protected": e.magnetosphere_protected})
    hourly: dict = {}
    for m in repo.series(SPACE_WEATHER, "solar_proton_flux_10MeV"):
        k = m.ts.replace(minute=0, second=0, microsecond=0)
        hourly[k] = max(hourly.get(k, 0.0), m.value)
    return {
        "latest": {"ts": last.isoformat(), "value": state.latest.value if state and state.latest else None,
                   "status": state.status.value if state else None, "message": state.message if state else None},
        "peak_24h": peak24, "environments": envs, "n": len(ms), "rejected": len(rep.rejected),
        "series": [[k.isoformat(), round(v, 4)] for k, v in sorted(hourly.items())],
        "source": "noaa_swpc",
    }


def _iss_cabin(rules: RulesEngine, ms) -> dict[str, Any] | None:
    if not ms:
        return None
    repo = InMemoryRepository()
    rep = ingest(repo, ms, now=max(m.ts for m in ms) + timedelta(days=1))
    out: dict[str, Any] = {"rejected": [{"indicator": m.indicator_id, "date": m.ts.date().isoformat(), "value": m.value,
                                         "reason": r} for m, r in rep.rejected],
                           "indicators": {}, "source": "osdr_eda"}
    for ind in CABIN:
        series = repo.series(ISS_REAL, ind)
        if not series:
            continue
        pts, counts, episodes = [], Counter(), []
        for m in series:
            st = rules.evaluate_indicator(repo, ISS_REAL, ind, m.ts)
            s = st.status.value if st else "ok"
            counts[s] += 1
            pts.append([m.ts.date().isoformat(), round(m.value, 3), s])
            if s != "ok":
                episodes.append({"date": m.ts.date().isoformat(), "value": round(m.value, 2), "status": s,
                                 "message": st.message if st else ""})
        episodes.sort(key=lambda e: (e["status"] != "alert", -e["value"]))
        out["indicators"][ind] = {"points": pts, "counts": dict(counts), "n": len(series),
                                  "first": series[0].ts.date().isoformat(), "last": series[-1].ts.date().isoformat(),
                                  "top_episodes": episodes[:6]}
    return out


def _bone(rows: list[dict]) -> dict[str, Any]:
    # MOTHER's projection without countermeasures (bed rest = no ARED), %/month
    def model(ind: str, day: float | None) -> float | None:
        if day is None or day <= 0:
            return None
        rate = BMD_RATE["bmd_femoral_neck_pct_baseline" if "neck" in ind else "bmd_hip_spine_pct_baseline"][1]
        return round(100 - rate * day / 30.44, 2)
    for r in rows:
        r["model_pct"] = model(r["indicator"], r["day"]) if r["phase"] == "in" else None
    return {"rows": rows, "source": "lsda_mr035g"}


def real_data_report(cfg: Config, mission: Mission | None = None) -> dict[str, Any]:
    from datetime import datetime, timezone
    rules = RulesEngine(cfg)
    db = TeamDatabase()
    try:
        sw = db.space_weather()
        cabin = db.iss_cabin_daily()
        bone = db.bed_rest_bone()
        now = datetime.now(timezone.utc)
        labs = {}
        if mission:
            for a in mission.crew:
                if a.lab_subject_id:
                    panel, findings = db.lab_panel(f"I4-{a.lab_subject_id}", a.id, now)
                    labs[a.id] = {"panel": panel, "findings": [f.to_dict() for f in findings],
                                  "subject": f"I4-{a.lab_subject_id}"}
    finally:
        db.close()
    return {"space_weather": _space_weather(cfg, rules, sw), "iss_cabin": _iss_cabin(rules, cabin),
            "bone": _bone(bone), "labs": labs, "generated_at": datetime.now(timezone.utc).isoformat()}
