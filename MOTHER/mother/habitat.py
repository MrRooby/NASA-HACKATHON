"""Habitat zones and their sensor readings for one sol (GET /api/habitat).

Read-only. One row per zone and channel: the latest value in the sol, the sol's min/max and a status.
Zone-level channels only (per-crew channels such as urine belong to the organ cards, see organs.py).

Sources: astro_habitat.habitat / zone / channel / channel_limit / reading_hourly / reading / crew_location / event.
High-cadence channels live in reading_hourly (hour means); event-like and scenario readings in reading.
Both are read by time range (the sol's UTC window), which uses the tables' leading indexes.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

SEVERITY = {"unrated": 0, "ok": 1, "caution": 2, "alert": 3}
LEVEL_STATUS = {"normal": "ok", "caution": "caution", "alert": "alert", "emergency": "alert"}
# Categorical channel values that are a problem by themselves.
TEXT_STATUS = {"leak": "alert", "breach": "alert", "fault": "alert", "detected": "alert",
               "degraded": "caution", "shelter": "caution", "contingency": "caution"}
ROUTINE_EVENTS = ("airlock_cycle",)
# Channels whose normal range is a comfort/expectation band, not a health limit (dark at night, wind, power
# split...). Leaving the band is reported as `outside_normal` but does not raise a caution.
INFORMATIVE_CATEGORIES = {"noise_light", "exterior", "power", "structure_thermal", "presence"}


def _worst(*statuses: str) -> str:
    return max(statuses, key=lambda s: SEVERITY.get(s, 0)) if statuses else "unrated"


def _iso(t: datetime | None) -> str | None:
    if t is None:
        return None
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    return t.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _num(v) -> float | None:
    return None if v is None else round(float(v), 4)


def outside_normal(value: float | None, channel: dict[str, Any]) -> bool:
    lo, hi = channel.get("normal_min"), channel.get("normal_max")
    return value is not None and ((lo is not None and value < float(lo)) or (hi is not None and value > float(hi)))


def rate(value: float | None, channel: dict[str, Any], limits: list[dict[str, Any]], use_normal: bool = True) -> str:
    """Status of one numeric value: channel limits first, then (optionally) the channel's normal range.

    Only instantaneous limits are applied (metric 'value', or a mean over at most one hour). Limits on
    long averages, trends or ratios need history and are left to MOTHER's analytics.
    """
    if value is None:
        return "unrated"
    hit = "unrated"
    rated = False
    for lim in limits:
        window = lim.get("window_hours")
        if lim.get("metric") not in ("value", "mean") or (window is not None and float(window) > 1):
            continue
        lo, hi = lim.get("min_value"), lim.get("max_value")
        if lo is None and hi is None:
            continue
        rated = True
        if (lo is not None and value >= float(lo)) or (hi is not None and value <= float(hi)):
            hit = _worst(hit, LEVEL_STATUS.get(lim.get("level"), "caution"))
    if hit != "unrated":
        return hit
    has_range = channel.get("normal_min") is not None or channel.get("normal_max") is not None
    if not has_range:
        return "ok" if rated else "unrated"
    if use_normal and channel.get("category") not in INFORMATIVE_CATEGORIES and outside_normal(value, channel):
        return "caution"
    return "ok"


def sol_window(habitat: dict[str, Any], sol: int) -> tuple[datetime, datetime]:
    start = habitat["sol_epoch_utc"] + timedelta(seconds=(sol - 1) * float(habitat["sol_length_s"]))
    return start, start + timedelta(seconds=float(habitat["sol_length_s"]))


def _latest_sol(db, habitat: dict[str, Any]) -> int:
    row = db._q("SELECT MAX(hour_utc) t FROM astro_habitat.reading_hourly WHERE habitat_id = %s", (habitat["id"],))
    last = row[0]["t"] if row else None
    if last is None:
        return 1
    sol = int((last - habitat["sol_epoch_utc"]).total_seconds() // float(habitat["sol_length_s"])) + 1
    return max(1, min(sol, int(habitat.get("mission_sols") or sol)))


def habitat_report(db, sol: int | None = None) -> dict[str, Any]:
    hab = db._q("SELECT id, code, name, atm_pressure_kpa, atm_o2_fraction_pct, atm_ppo2_inspired_mmhg, sol_epoch_utc, "
                "sol_length_s, mission_sols, crew_capacity, is_synthetic FROM astro_habitat.habitat ORDER BY id LIMIT 1")
    if not hab:
        raise KeyError("habitat")
    hab = hab[0]
    latest = _latest_sol(db, hab)
    sol = latest if sol is None else int(sol)
    t0, t1 = sol_window(hab, sol)

    zones = db._q("SELECT code, label, zone_type, module_id, pressurized, dose_shielding_factor FROM astro_habitat.zone "
                  "WHERE habitat_id = %s ORDER BY sort_order, code", (hab["id"],))
    limits: dict[str, list[dict[str, Any]]] = {}
    for lim in db._q("SELECT channel_code, level, min_value, max_value, window_hours, metric FROM astro_habitat.channel_limit"):
        limits.setdefault(lim["channel_code"], []).append(lim)
    channels = {c["code"]: c for c in db._q(
        "SELECT code, label, category, unit, value_type, normal_min, normal_max FROM astro_habitat.channel WHERE per_crew = 0")}

    # (zone, channel) -> accumulated state
    acc: dict[tuple[str, str], dict[str, Any]] = {}

    def slot(zone: str, channel: str) -> dict[str, Any]:
        return acc.setdefault((zone, channel), {"sensors": {}, "min": None, "max": None, "lo": None, "hi": None, "texts": [],
                                                "quality": "ok",
                                                "source_flag": None})

    def note_quality(s: dict[str, Any], q: str) -> None:
        if q == "sensor_fault" or (q == "suspect" and s["quality"] == "ok"):
            s["quality"] = q

    def note_range(s: dict[str, Any], lo, hi, level) -> None:
        """min/max = true extremes of the sol (shown); lo/hi = extremes of hour means and raw readings (rated),
        so one noisy sample inside an hour does not flag a zone for the whole sol."""
        for v in (lo, hi):
            if v is not None:
                v = float(v)
                s["min"] = v if s["min"] is None else min(s["min"], v)
                s["max"] = v if s["max"] is None else max(s["max"], v)
        if level is not None:
            level = float(level)
            s["lo"] = level if s["lo"] is None else min(s["lo"], level)
            s["hi"] = level if s["hi"] is None else max(s["hi"], level)

    for r in db._q("SELECT zone_code, channel_code, sensor, hour_utc, value_mean, value_min, value_max, n_suspect, n_fault, "
                   "source_flag FROM astro_habitat.reading_hourly WHERE habitat_id = %s AND hour_utc >= %s AND hour_utc < %s "
                   "AND crew_code = '' ORDER BY hour_utc", (hab["id"], t0.replace(minute=0, second=0, microsecond=0), t1)):
        if r["channel_code"] not in channels or r["value_mean"] is None:
            continue
        s = slot(r["zone_code"], r["channel_code"])
        s["sensors"][r["sensor"] or ""] = (r["hour_utc"], float(r["value_mean"]))
        note_range(s, r["value_min"], r["value_max"], r["value_mean"])
        s["source_flag"] = r["source_flag"]
        if r["n_fault"]:
            note_quality(s, "sensor_fault")
        elif r["n_suspect"]:
            note_quality(s, "suspect")

    for r in db._q("SELECT zone_code, channel_code, sensor, ts_utc, value_num, value_text, quality, source_flag "
                   "FROM astro_habitat.reading WHERE habitat_id = %s AND crew_code IS NULL AND ts_utc >= %s AND ts_utc < %s "
                   "ORDER BY ts_utc", (hab["id"], t0, t1)):
        if r["channel_code"] not in channels:
            continue
        s = slot(r["zone_code"], r["channel_code"])
        s["source_flag"] = r["source_flag"]
        note_quality(s, r["quality"] or "ok")
        if r["value_num"] is not None:
            s["sensors"][r["sensor"] or ""] = (r["ts_utc"], float(r["value_num"]))
            note_range(s, r["value_num"], r["value_num"], r["value_num"])
        if r["value_text"]:
            s["texts"].append((r["ts_utc"], r["value_text"]))

    by_zone: dict[str, list[dict[str, Any]]] = {}
    last_ts: datetime | None = None
    for (zone, code), s in acc.items():
        ch = channels[code]
        lims = limits.get(code, [])
        value = ts = None
        if s["sensors"]:
            ts = max(t for t, _ in s["sensors"].values())
            value = sum(v for _, v in s["sensors"].values()) / len(s["sensors"])
        text = None
        if s["texts"]:
            text_ts, text = s["texts"][-1]
            ts = text_ts if ts is None else max(ts, text_ts)
        status = rate(value, ch, lims)
        # over the sol only hard limits count; the normal band is judged on the latest value alone
        worst = _worst(status, rate(s["lo"], ch, lims, use_normal=False), rate(s["hi"], ch, lims, use_normal=False))
        if text is not None:
            status = _worst(status, TEXT_STATUS.get(text, "ok"))
            worst = _worst(worst, status, *(TEXT_STATUS.get(t, "ok") for _, t in s["texts"]))
        if ts is not None and (last_ts is None or ts > last_ts):
            last_ts = ts
        by_zone.setdefault(zone, []).append({
            "channel": code, "label": ch["label"], "category": ch["category"], "unit": ch["unit"],
            "value": _num(value), "text": text, "ts_utc": _iso(ts),
            "min": _num(s["min"]), "max": _num(s["max"]),
            "normal_min": _num(ch["normal_min"]), "normal_max": _num(ch["normal_max"]),
            "outside_normal": outside_normal(value, ch),
            "status": status, "worst_status": worst, "quality": s["quality"], "source_flag": s["source_flag"],
            "sensors": {k: _num(v) for k, (_, v) in sorted(s["sensors"].items())} if len(s["sensors"]) > 1 else None,
        })

    # who is where at the last data point of the sol
    ref = last_ts or t1
    occupants: dict[str, list[str]] = {}
    seen: set[str] = set()
    for r in db._q("SELECT crew_code, zone_code, from_utc FROM astro_habitat.crew_location WHERE habitat_id = %s "
                   "AND from_utc <= %s AND from_utc >= %s ORDER BY from_utc DESC", (hab["id"], ref, t0 - timedelta(days=2))):
        if r["crew_code"] not in seen:
            seen.add(r["crew_code"])
            occupants.setdefault(r["zone_code"], []).append(r["crew_code"])

    out_zones = []
    for z in zones:
        readings = sorted(by_zone.get(z["code"], []), key=lambda x: (x["category"], x["channel"]))
        rated = [x["worst_status"] for x in readings if x["worst_status"] != "unrated"]
        out_zones.append({
            "code": z["code"], "label": z["label"], "type": z["zone_type"], "module_id": z["module_id"],
            "pressurized": bool(z["pressurized"]), "dose_shielding_factor": _num(z["dose_shielding_factor"]),
            "status": _worst(*rated) if rated else "no_data",
            "now_status": _worst(*[x["status"] for x in readings if x["status"] != "unrated"]) if rated else "no_data",
            "occupants": sorted(occupants.get(z["code"], [])),
            "readings": readings,
        })

    events = [{"code": e["event_code"], "type": e["event_type"], "start_utc": _iso(e["start_utc"]), "end_utc": _iso(e["end_utc"]),
               "sol": e["sol"], "zone": e["zone_code"], "crew": e["crew_code"], "severity": e["severity"],
               "source_flag": e["source_flag"]}
              for e in db._q("SELECT event_code, event_type, start_utc, end_utc, sol, zone_code, crew_code, severity, source_flag "
                             "FROM astro_habitat.event WHERE habitat_id = %s AND start_utc < %s AND (end_utc IS NULL OR end_utc >= %s) "
                             "AND event_type NOT IN %s ORDER BY start_utc DESC LIMIT 60", (hab["id"], t1, t0, ROUTINE_EVENTS))]

    statuses = [z["status"] for z in out_zones if z["status"] != "no_data"]
    return {
        "schema_version": "1.0",
        "habitat": {"code": hab["code"], "name": hab["name"], "atm_pressure_kpa": _num(hab["atm_pressure_kpa"]),
                    "atm_o2_fraction_pct": _num(hab["atm_o2_fraction_pct"]),
                    "atm_ppo2_inspired_mmhg": _num(hab["atm_ppo2_inspired_mmhg"]),
                    "mission_sols": hab["mission_sols"], "crew_capacity": hab["crew_capacity"],
                    "data_kind": "synthetic" if hab["is_synthetic"] else "real"},
        "as_of": {"sol": sol, "latest_sol": latest, "from_utc": _iso(t0), "to_utc": _iso(t1), "last_reading_utc": _iso(last_ts)},
        "overall_status": _worst(*statuses) if statuses else "no_data",
        "zones": out_zones,
        "events": events,
    }
