"""A tiny stand-in for a pymysql connection: answers queries by matching a substring of the SQL."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone


class FakeCursor:
    def __init__(self, conn):
        self.conn, self.rows = conn, []

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, args=()):
        self.conn.queries.append((sql, args))
        for needle, rows in self.conn.routes:
            if needle in sql:
                self.rows = rows(sql, args) if callable(rows) else rows
                return
        self.rows = []

    def fetchall(self):
        return list(self.rows)

    def fetchone(self):
        return self.rows[0] if self.rows else None


class FakeConn:
    def __init__(self, routes):
        self.routes = list(routes)
        self.queries = []
        self.closed = False

    def cursor(self):
        return FakeCursor(self)

    def close(self):
        self.closed = True


T = datetime(2026, 9, 1, 8, tzinfo=timezone.utc)


def obs(code, v, phase="in", day=1, t=None):
    return {"c": code, "v": v, "t": None, "phase": phase, "d": day, "o": day, "tp": f"FD{day}",
            "m": T + timedelta(days=day)}


PERSON_ROWS = [
    obs("creatinine", 0.9, "pre", -10), obs("creatinine", 1.0, "in", 5),
    obs("potassium", 6.2, "in", 5), obs("sodium", 140, "in", 5), obs("hemoglobin", 13.5, "in", 5),
    obs("heart_rate_resting", 62, "in", 5), obs("bp_systolic", 118, "in", 5), obs("bp_diastolic", 76, "in", 5),
    obs("spo2", 97, "in", 5), obs("glucose_fasting", 90, "in", 5),
    *[obs("sleep_hours", 7.5, "in", d) for d in range(1, 8)],
    obs("vo2max", 45.0, "pre", -30), obs("vo2max", 34.0, "in", 15),
]


def person_db(rows=PERSON_ROWS, known=("CREW-1",)):
    def subjects(sql, args):
        return ([{"sex": "F", "age_band": "30-39", "data_kind": "synthetic", "is_synthetic": 1, "mission_name": "Test mission"}]
                if args and args[0] in known else [])

    return FakeConn([
        ("SELECT DISTINCT s.subject_code", [{"subject_code": c, "sex": "F", "age_band": "30-39", "is_synthetic": 1,
                                             "mission_code": "M1", "mission_name": "Test mission", "data_kind": "synthetic"}
                                            for c in known]),
        ("FROM astro_habitat.crew c JOIN astro_habitat.habitat", []),
        ("SELECT mission_code FROM astro_api.observations", [{"mission_code": "M1"}]),
        ("FROM astro_api.subjects WHERE subject_code", subjects),
        ("indicator_code c, value v", rows),
        ("FROM astro_wearables.device d JOIN", []),
        ("FROM astro_api.import_log", [{"m": "2026-11-14 10:00:00", "n": 7}]),
    ])
