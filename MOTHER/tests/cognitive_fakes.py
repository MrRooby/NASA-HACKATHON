"""In-memory stand-ins for the cognitive writer connection and for the astro_api views (no real database)."""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from typing import Any

from tests.fakes import FakeConn


class FakeWriter:
    """Mimics a pymysql connection with autocommit off for the exact statements cognitive.save_session issues."""

    def __init__(self, subjects=None, missions=None, indicators=None, crew=None):
        # subjects: code -> {"id", "is_synthetic"}; missions: subject_id -> [(code, id, start_date)]
        # crew: habitat crew code ('C1') -> (subject_code, habitat mission_code)
        self.crew = crew or {}
        self.subjects = subjects if subjects is not None else {"SYN-01": {"id": 1, "is_synthetic": 1}}
        self.missions = missions if missions is not None else {1: [("SYN-ISS-180", 5, date(2026, 11, 1))]}
        self.indicators = indicators if indicators is not None else {
            "pvt_reaction_ms": 11, "pvt_lapses": 12, "gonogo_commission_rate": 13, "dsst_throughput_per_min": 14}
        self.committed = {"sessions": [], "metrics": [], "trials": [], "events": [], "obs": [], "batches": []}
        self.pending = self._empty()
        self.commits = self.rollbacks = 0
        self.closed = False
        self.fail_on: str | None = None     # substring of an INSERT that must raise
        self._ids = {"sessions": 0, "batches": 0}

    @staticmethod
    def _empty():
        return {"sessions": [], "metrics": [], "trials": [], "events": [], "obs": [], "batches": []}

    # --- connection API
    def cursor(self):
        return _Cursor(self)

    def commit(self):
        for k, v in self.pending.items():
            self.committed[k].extend(v)
        self.pending = self._empty()
        self.commits += 1

    def rollback(self):
        self.pending = self._empty()
        self.rollbacks += 1

    def close(self):
        self.closed = True

    # --- helpers for tests
    def all(self, key):
        return self.committed[key] + self.pending[key]


class _Cursor:
    def __init__(self, conn: FakeWriter):
        self.c = conn
        self.rows: list[dict] = []
        self.lastrowid = None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def fetchone(self):
        return self.rows[0] if self.rows else None

    def fetchall(self):
        return list(self.rows)

    def _maybe_fail(self, sql):
        if self.c.fail_on and self.c.fail_on in sql:
            raise RuntimeError(f"boom in {self.c.fail_on}")

    def execute(self, sql, args=()):
        c = self.c
        self._maybe_fail(sql)
        sql1 = " ".join(sql.split())
        self.rows = []
        if "FROM astro_cognitive.test_session WHERE client_session_uuid" in sql1:
            self.rows = [s for s in c.all("sessions") if s["client_session_uuid"] == args[0]][:1]
            self.rows = [{"id": s["id"], **s} for s in self.rows]
        elif "FROM astro_cognitive.test_metric" in sql1:
            self.rows = [m for m in c.all("metrics") if m["session_id"] == args[0]]
        elif "FROM astro_habitat.crew c" in sql1:
            link = c.crew.get(args[0])
            self.rows = [{"subject_code": link[0], "mission_code": link[1]}] if link else []
        elif "FROM astro_core.subject WHERE code" in sql1:
            s = c.subjects.get(args[0])
            self.rows = [s] if s else []
        elif "FROM astro_core.participation" in sql1:
            parts = c.missions.get(args[0], [])
            if "m.code = %s" in sql1:
                parts = [p for p in parts if p[0] == args[1]]
            else:
                parts = sorted(parts, key=lambda p: (p[2] or date.min, p[1]), reverse=True)[:1]
            self.rows = [{"id": p[1], "start_date": p[2]} for p in parts]
        elif "COUNT(*) AS n" in sql1:
            mission_id, subject_id, test_id = args
            ss = [s for s in c.all("sessions") if s["subject_id"] == subject_id and s["test_id"] == test_id]
            self.rows = [{"n": len(ss), "max_no": max([s["session_no"] for s in ss if s.get("mission_id", mission_id) == mission_id], default=0),
                          "n_ok": sum(1 for s in ss if s["status"] == "complete")}]
        elif "INSERT INTO astro_core.import_batch" in sql1:
            c._ids["batches"] += 1
            self.lastrowid = c._ids["batches"]
            c.pending["batches"].append({"id": self.lastrowid, "file_name": args[2]})
        elif "INSERT INTO astro_cognitive.test_session" in sql1:
            cols = [x.strip() for x in re.search(r"\((.*?)\) VALUES", sql1).group(1).split(",")]
            c._ids["sessions"] += 1
            self.lastrowid = c._ids["sessions"]
            c.pending["sessions"].append({"id": self.lastrowid, **dict(zip(cols, args))})
        elif "FROM astro_core.indicator" in sql1:
            self.rows = [{"id": i, "code": k} for k, i in c.indicators.items() if k in args[0]]
        else:  # pragma: no cover
            raise AssertionError(f"unexpected SQL: {sql1}")

    def executemany(self, sql, seq):
        self._maybe_fail(sql)
        sql1 = " ".join(sql.split())
        c = self.c
        for a in seq:
            if "INTO astro_cognitive.test_trial" in sql1:
                c.pending["trials"].append({"session_id": a[0], "idx": a[1], "event_type": a[11], "rt_ms": a[8]})
            elif "INTO astro_cognitive.test_event" in sql1:
                c.pending["events"].append({"session_id": a[0], "seq": a[1], "kind": a[3], "detail": a[4]})
            elif "INTO astro_cognitive.test_metric" in sql1:
                c.pending["metrics"].append({"session_id": a[0], "metric_code": a[1], "value": a[2], "scoring_version": a[3]})
            elif "INTO astro_core.observation" in sql1:
                c.pending["obs"].append({"subject_id": a[0], "mission_id": a[1], "indicator_id": a[2], "source_id": a[3],
                                         "import_batch_id": a[4], "anchor": a[5], "day_offset": a[6], "measured_at": a[7],
                                         "value_num": a[8], "sample_type": a[9]})
            else:  # pragma: no cover
                raise AssertionError(f"unexpected SQL: {sql1}")


# ---------------------------------------------------------------- read side (astro_api views)
def report_db(sessions: list[dict], metrics: dict[int, dict[str, float]], known=("SYN-01",), crew=None) -> FakeConn:
    """FakeConn answering the queries of cognitive_report. Sessions may carry "mission_code" (filtered when asked);
    crew: habitat crew code ('C1') -> (subject_code, mission_code)."""
    crew = crew or {}

    def pick(sql, a):
        return [s for s in sessions if len(a) < 2 or s.get("mission_code") == a[1]]

    def pick_metrics(sql, a):
        ids = {s["session_id"] for s in pick(sql, a)}
        return [{"session_id": sid, "metric_code": k, "value": v}
                for sid, ms in metrics.items() if sid in ids for k, v in ms.items()]

    return FakeConn([
        ("FROM astro_habitat.crew c", lambda sql, a: [{"subject_code": crew[a[0]][0], "mission_code": crew[a[0]][1]}]
         if a[0] in crew else []),
        ("FROM astro_api.subjects WHERE subject_code", lambda sql, a: [{"data_kind": "synthetic"}] if a[0] in known else []),
        ("FROM astro_api.cognitive_sessions", pick),
        ("FROM astro_api.cognitive_metrics", pick_metrics),
    ])


T0 = datetime(2026, 11, 2, 8, tzinfo=timezone.utc)


def sess(sid: int, test="pvt", day=0, practice=False, status="complete", quality="ok", device="keyboard", no=None):
    return {"session_id": sid, "test_id": test, "session_no": no or sid, "stimulus_set": "ABCD"[(sid - 1) % 4],
            "status": status, "quality": quality, "is_practice": int(practice), "started_at": T0 + timedelta(days=day),
            "device_class": device}
