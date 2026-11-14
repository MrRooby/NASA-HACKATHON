"""Read-only adapter for the team MariaDB (`astro_api` views, contract v0.2).

MOTHER never writes here. Everything read from the database is real data (data_kind != synthetic) and is
returned as MOTHER `Measurement`s with simulated=False and the database source id, so the GUI can label it.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, time, timedelta, timezone
from typing import Any

from .db import connect
from .models import Finding, FindingKind, Measurement, Status

SPACE_WEATHER = "space_weather"
ISS_REAL = "iss-real"                       # subject id for the real ISS cabin telemetry
LAB_CATEGORIES = ("lab_cbc", "lab_cmp", "lab_cardio")


def _utc(dt) -> datetime:
    if isinstance(dt, datetime):
        return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)
    return datetime.combine(dt, time(12), tzinfo=timezone.utc)


class TeamDatabase:
    def __init__(self, conn=None) -> None:
        self.conn = conn or connect()

    def close(self) -> None:
        self.conn.close()

    def _q(self, sql: str, args: tuple = ()) -> list[dict[str, Any]]:
        with self.conn.cursor() as cur:
            cur.execute(sql, args)
            return list(cur.fetchall())

    # ------------------------------------------------------------ space weather
    def space_weather(self, hours: int = 24 * 7) -> list[Measurement]:
        """NOAA GOES >=10 MeV integral proton flux (5-min cadence), most recent `hours`."""
        rows = self._q(
            "SELECT e.measured_at, e.value_num FROM astro_core.env_observation e "
            "JOIN astro_core.indicator i ON i.id = e.indicator_id "
            "WHERE i.code = 'solar_proton_flux_10MeV' AND e.measured_at >= "
            "(SELECT MAX(measured_at) FROM astro_core.env_observation e2 WHERE e2.indicator_id = e.indicator_id) "
            "- INTERVAL %s HOUR ORDER BY e.measured_at", (hours,))
        return [Measurement(SPACE_WEATHER, "solar_proton_flux_10MeV", _utc(r["measured_at"]), float(r["value_num"]),
                            "pfu", source="noaa_swpc") for r in rows]

    # ------------------------------------------------------------ ISS cabin
    def iss_cabin_daily(self) -> list[Measurement]:
        """Real ISS cabin telemetry (OSDR EDA), daily means, all available days."""
        rows = self._q(
            "SELECT indicator_code, unit, measured_date, value_mean FROM astro_api.environment_daily "
            "WHERE environment = 'iss' AND indicator_code IN ('cabin_co2','cabin_temperature','cabin_humidity') "
            "ORDER BY measured_date")
        return [Measurement(ISS_REAL, r["indicator_code"], _utc(r["measured_date"]), float(r["value_mean"]),
                            r["unit"], source="osdr_eda", quality_flags=("daily_mean",)) for r in rows]

    # ------------------------------------------------------------ labs
    def lab_panel(self, subject_code: str, astronaut_id: str, now: datetime) -> tuple[list[dict], list[Finding]]:
        rows = self._q(
            "SELECT category, indicator_code, indicator_label, timepoint_label, time_order, value, unit, ref_min, "
            "ref_max, ref_flag, ref_basis, ref_conflict, source_id FROM astro_api.observations "
            "WHERE subject_code = %s AND category IN %s AND value IS NOT NULL ORDER BY indicator_code, time_order",
            (subject_code, LAB_CATEGORIES))
        by_ind: dict[str, list[dict]] = defaultdict(list)
        for r in rows:
            by_ind[r["indicator_code"]].append(r)
        panel, findings = [], []
        for code, pts_raw in sorted(by_ind.items()):
            pts, prev = [], 0
            for r in pts_raw:
                flag = r["ref_flag"] or "in_range"
                d = -1 if flag in ("below", "critical_low") else 1 if flag in ("above", "critical_high") else 0
                st = Status.ALERT if flag.startswith("critical") else Status.CAUTION if d else Status.OK
                if d and d == prev:   # out of range on two consecutive draws (thresholds.json lab_panels)
                    st = Status.ALERT
                prev = d
                pts.append({"timepoint": r["timepoint_label"], "value": _round(r["value"]), "status": st.value})
            last = pts_raw[-1]
            last_status = Status(pts[-1]["status"])
            panel.append({"panel": last["category"].replace("lab_", "").upper(), "analyte": last["indicator_label"],
                          "code": code, "units": last["unit"], "range": [_round(last["ref_min"]), _round(last["ref_max"])],
                          "ref_basis": last["ref_basis"], "ref_conflict": bool(last["ref_conflict"]),
                          "points": pts, "latest_status": last_status.value, "risk": None,
                          "source_file": last["source_id"]})
            if last_status != Status.OK:
                findings.append(Finding(
                    subject_id=astronaut_id, kind=FindingKind.LAB, status=last_status,
                    title=f"Lab {last['indicator_label']}: {_round(last['value'])} {last['unit']} outside reference range",
                    rule_id=f"lab.db.{code}", ts=now, basis="source",
                    evidence={"subject": subject_code, "timepoint": last["timepoint_label"], "value": last["value"],
                              "range": [last["ref_min"], last["ref_max"]], "ref_basis": last["ref_basis"],
                              "real_data": True},
                    sources=[last["source_id"]],
                    explanation=(f"Team database ({subject_code}, {last['timepoint_label']}): reference range "
                                 f"{_round(last['ref_min'])}-{_round(last['ref_max'])} {last['unit']} chosen by sex "
                                 f"({last['ref_basis']})."),
                ))
        return panel, findings

    # ------------------------------------------------------------ bone (bed rest)
    def bed_rest_bone(self) -> list[dict[str, Any]]:
        """Mean % of baseline BMD per bed-rest campaign, region and timepoint (NASA LSDA MR035G)."""
        rows = self._q(
            "SELECT mission_code, indicator_code, indicator_label, timepoint_label, phase, "
            "MIN(day_offset) day_offset, MIN(time_order) t, AVG(pct_of_baseline) pct, COUNT(*) n "
            "FROM astro_api.change_from_baseline WHERE category = 'bone_dxa' AND indicator_code LIKE 'bmd%%' "
            "AND pct_of_baseline IS NOT NULL GROUP BY mission_code, indicator_code, indicator_label, timepoint_label, phase "
            "ORDER BY mission_code, indicator_code, t")
        return [{"mission": r["mission_code"], "indicator": r["indicator_code"], "label": r["indicator_label"],
                 "timepoint": r["timepoint_label"], "phase": r["phase"], "day": _round(r["day_offset"]),
                 "pct": _round(r["pct"]), "n": int(r["n"])} for r in rows]


def _round(v, n=3):
    if v is None:
        return None
    return round(float(v), n)
