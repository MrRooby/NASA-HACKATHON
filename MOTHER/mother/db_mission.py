"""Load a whole mission from the team database into MOTHER (read-only).

Crew observations come from `astro_api.observations`, cabin and space-weather series from the environment
table for the mission's time window. Database indicator codes are mapped to MOTHER ids where they differ.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, time, timedelta, timezone
from typing import Any

from .config import Config
from .db_source import TeamDatabase, _utc
from .models import Astronaut, Measurement, Mission

HABITAT_ID = "hab-1"
SPACE_WEATHER_ID = "space_weather"
DB_TO_MOTHER = {"body_mass": "body_mass_kg", "vo2max": "vo2max_ml_kg_min", "strength_knee_extension": "strength_index",
                # PVT median RT (preflight value or the in-app cognitive tests) feeds derive.py's reaction_time_pct_change
                "pvt_reaction_ms": "reaction_time_ms", "pvt_median_rt_ms": "reaction_time_ms"}
PREFLIGHT = ["body_mass_kg", "vo2max_ml_kg_min", "strength_index", "reaction_time_ms"]


def pick_mission(db: TeamDatabase, code: str | None = None) -> dict[str, Any]:
    rows = db._q("SELECT mission_code, mission_name, environment, duration_days, is_synthetic, n_subjects "
                 "FROM astro_api.missions ORDER BY is_synthetic DESC, duration_days DESC")
    if code:
        rows = [r for r in rows if r["mission_code"] == code]
    # a mission MOTHER can replay needs daily crew data and a known length
    for r in rows:
        if r["duration_days"] and (r["duration_days"] or 0) >= 30:
            return r
    raise LookupError("No mission with a known duration of 30+ days in the database")


def load_mission(db: TeamDatabase, cfg: Config, code: str | None = None) -> tuple[Mission, list[Measurement], dict]:
    m = pick_mission(db, code)
    mcode, days, env_id = m["mission_code"], int(m["duration_days"]), m["environment"]
    subjects = db._q("SELECT subject_code, sex, age_band FROM astro_api.subjects WHERE mission_code = %s "
                     "ORDER BY subject_code", (mcode,))
    obs = db._q("SELECT subject_code, indicator_code, anchor, day_offset, measured_at, value, unit, phase, "
                "sample_type, is_synthetic, source_id FROM astro_api.observations "
                "WHERE mission_code = %s AND value IS NOT NULL ORDER BY time_order", (mcode,))

    # launch = measured_at - day_offset for any launch-anchored row (works with read-only astro_api access)
    launch = None
    for o in obs:
        if o["anchor"] == "launch" and o["measured_at"] is not None and o["day_offset"] is not None:
            launch = datetime.combine((_utc(o["measured_at"]) - timedelta(days=int(o["day_offset"]))).date(),
                                      time(0), tzinfo=timezone.utc)
            break
    if launch is None:
        raise LookupError(f"Cannot determine launch date of {mcode}")
    end = launch + timedelta(days=days)

    ms: list[Measurement] = []
    pre: dict[tuple[str, str], list[float]] = defaultdict(list)
    for o in obs:
        if o["measured_at"] is None:
            base = launch if o["anchor"] == "launch" else end
            ts = datetime.combine((base + timedelta(days=int(o["day_offset"] or 0))).date(), time(8), tzinfo=timezone.utc)
        else:
            ts = _utc(o["measured_at"])
        ind = DB_TO_MOTHER.get(o["indicator_code"], o["indicator_code"])
        meas = Measurement(o["subject_code"], ind, ts, float(o["value"]), o["unit"],
                           source=o["source_id"], simulated=bool(o["is_synthetic"]))
        ms.append(meas)
        if o["phase"] == "pre" and ind in PREFLIGHT:
            pre[(o["subject_code"], ind)].append(float(o["value"]))

    env = cfg.environments.get(env_id)
    env_rows = db._q(
        "SELECT i.code ind, e.measured_at t, e.value_num v, e.is_synthetic syn, e.source_id src "
        "FROM astro_core.env_observation e JOIN astro_core.indicator i ON i.id = e.indicator_id "
        "WHERE e.environment_code = %s AND e.measured_at >= %s AND e.measured_at < %s "
        "AND i.code IN ('cabin_co2','cabin_temperature','cabin_humidity','cabin_ppo2','noise_24h',"
        "'solar_proton_flux_10MeV','radiation_daily_vs_environment')",
        (env_id, (launch - timedelta(days=1)).replace(tzinfo=None), (end + timedelta(days=1)).replace(tzinfo=None)))
    for r in env_rows:
        ts = _utc(r["t"])
        if r["ind"] == "solar_proton_flux_10MeV":
            ms.append(Measurement(SPACE_WEATHER_ID, r["ind"], ts, float(r["v"]), "pfu", source=r["src"], simulated=bool(r["syn"])))
        elif r["ind"] == "radiation_daily_vs_environment":
            # daily ratio to the environment's typical dose -> dose equivalent for MOTHER's cumulative model
            dose = float(r["v"]) * (env.dose_mSv_per_day if env else 0.68)
            ms.append(Measurement(HABITAT_ID, "radiation_dose_mSv", ts.replace(hour=23, minute=45), dose, "mSv",
                                  source=r["src"], simulated=bool(r["syn"])))
        else:
            ms.append(Measurement(HABITAT_ID, r["ind"], ts, float(r["v"]), None, source=r["src"], simulated=bool(r["syn"])))

    crew = []
    for s in subjects:
        code = s["subject_code"]
        preflight = {k: sum(v) / len(v) for (subj, k), v in pre.items() if subj == code and v}
        info = " · ".join(x for x in (f"sex {s['sex']}" if s["sex"] else "", f"age {s['age_band']}" if s["age_band"] else "") if x)
        crew.append(Astronaut(code, code, HABITAT_ID, preflight, 0.0, lab_subject_id=None))
        crew[-1].info = info  # type: ignore[attr-defined]
    mission = Mission(mcode, env_id, launch, days, crew)
    meta = {"mission_code": mcode, "mission_name": m["mission_name"], "is_synthetic": bool(m["is_synthetic"]),
            "n_observations": len(obs), "n_env": len(env_rows)}
    return mission, ms, meta


def database_version(db: TeamDatabase) -> str:
    """Changes whenever the database owner imports data (DB plan: use import_log as cache key)."""
    r = db._q("SELECT MAX(finished_at) m, COUNT(*) n FROM astro_api.import_log WHERE status = 'ok'")
    return f"{r[0]['m']}|{r[0]['n']}" if r else "unknown"
