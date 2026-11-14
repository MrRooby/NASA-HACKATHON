#!/usr/bin/env python3
"""load_cognitive.py | idempotent import of DATABASE/synthetic/cognitive_generate.py output into astro_cognitive.

Run:  python DATABASE/etl/load_cognitive.py [data/synthetic/cognitive_demo]     (DB credentials from DATABASE/.env)

Requires the SYN-ISS-180 mission, its subjects and participations plus the data source of the generator
(`synthetic_v1`); load them first with load_canonical.py data/synthetic/demo. Every run
  1. deletes this mission's synthetic cognitive sessions (is_synthetic=1; trials/metrics/events CASCADE) and the
     observations mirrored by earlier runs (import_batch adapter `cognitive_synthetic`),
  2. inserts sessions, trials and metrics (metrics are re-scored with MOTHER/mother/cognitive_scoring.py, the
     source of truth, so DB values equal what MOTHER would compute),
  3. mirrors complete, non-practice, quality 'ok' sessions into astro_core.observation (CONTRACT section 5).
"""
from __future__ import annotations

import csv
import datetime as dt
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from load import ROOT, connect  # noqa: E402

sys.path.insert(0, str(ROOT / "MOTHER" / "mother"))
import cognitive_scoring as cs  # noqa: E402  (stdlib only)

ADAPTER = "cognitive_synthetic"
SAMPLE_TYPE = "manual_device"
# session metric -> astro_core indicator code (CONTRACT section 5)
MIRROR = {
    "pvt_median_rt_ms": "pvt_reaction_ms",
    "pvt_lapses": "pvt_lapses",
    "gonogo_commission_rate": "gonogo_commission_rate",
    "dsst_throughput_per_min": "dsst_throughput_per_min",
}
INT_TRIAL = ("idx", "isi_ms")
FLOAT_TRIAL = ("t_onset_ms", "t_response_ms", "rt_ms")
BOOL_TRIAL = ("is_practice", "timeout", "anticipation", "valid", "focus_lost")
STR_TRIAL = ("stimulus", "condition", "expected", "actual", "event_type", "ts_source")
SESSION_NUM = ("seed", "session_no", "is_practice", "tz_offset_min", "screen_w", "screen_h", "focus_lost_ms",
               "sleep_quality", "fatigue", "kss", "stress", "caffeine_3h", "day_offset")
SESSION_FLOAT = ("duration_s", "dpr", "refresh_hz", "frame_jitter_ms", "timer_resolution_ms", "sleep_h")


# ------------------------------------------------------------------ pure helpers
def _blank(v) -> bool:
    return v is None or v == ""


def parse_trial(row: dict) -> dict:
    """CSV row -> trial dict as used by cognitive_scoring (empty cell = None, flags = bool)."""
    t = {}
    for k in INT_TRIAL:
        t[k] = None if _blank(row.get(k)) else int(row[k])
    for k in FLOAT_TRIAL:
        t[k] = None if _blank(row.get(k)) else float(row[k])
    for k in BOOL_TRIAL:
        t[k] = bool(int(row[k])) if not _blank(row.get(k)) else (k == "valid")
    for k in STR_TRIAL:
        t[k] = None if _blank(row.get(k)) else row[k]
    return t


def parse_session(row: dict) -> dict:
    s = dict(row)
    for k in SESSION_NUM:
        s[k] = None if _blank(row.get(k)) else int(float(row[k]))
    for k in SESSION_FLOAT:
        s[k] = None if _blank(row.get(k)) else float(row[k])
    for k in ("started_at", "completed_at"):
        s[k] = None if _blank(row.get(k)) else dt.datetime.fromisoformat(row[k])
    return s


def compute_metrics(test_id: str, trials: list[dict], duration_s: float | None) -> dict:
    """Re-score with cognitive_scoring: {'metrics', 'status', 'quality', 'scoring_version'}."""
    r = cs.score(test_id, trials, duration_s)
    return {"metrics": r["metrics"], "status": r["status"], "quality": r["quality"],
            "scoring_version": cs.SCORING_VERSION}


def day_offset(started_at: dt.datetime, start_date: dt.date | None):
    """('launch', days since mission start) or ('none', None) when the mission has no start date."""
    if start_date is None:
        return "none", None
    return "launch", (started_at.date() - start_date).days


def qualifies_for_mirror(is_practice, status: str, quality: str) -> bool:
    return not is_practice and status == "complete" and quality == "ok"


def mirror_values(metrics: dict) -> list[tuple[str, float]]:
    """(indicator_code, value) pairs to mirror; metrics that cannot be computed are skipped."""
    return [(code, float(metrics[m])) for m, code in MIRROR.items() if metrics.get(m) is not None]


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def read_dataset(directory: Path):
    meta = json.loads((directory / "meta.json").read_text(encoding="utf-8"))
    with (directory / "sessions.csv").open(newline="", encoding="utf-8") as f:
        sessions = [parse_session(r) for r in csv.DictReader(f)]
    trials: dict[str, list[dict]] = {}
    with (directory / "trials.csv").open(newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            trials.setdefault(r["session_uuid"], []).append(parse_trial(r))
    return meta, sessions, trials


# ------------------------------------------------------------------ database
SESSION_COLS = ["client_session_uuid", "subject_id", "mission_id", "test_id", "protocol_version", "app_version",
                "stimulus_set", "seed", "session_no", "is_practice", "status", "quality", "started_at",
                "completed_at", "tz_offset_min", "duration_s", "anchor", "day_offset", "device_class", "user_agent",
                "screen_w", "screen_h", "dpr", "refresh_hz", "frame_jitter_ms", "timer_resolution_ms",
                "focus_lost_ms", "sleep_h", "sleep_quality", "fatigue", "kss", "stress", "caffeine_3h",
                "is_synthetic", "source_id", "import_batch_id"]
TRIAL_COLS = ["session_id", "idx", "is_practice", "stimulus", "condition", "isi_ms", "t_onset_ms", "t_response_ms",
              "rt_ms", "expected", "actual", "event_type", "timeout", "anticipation", "valid", "focus_lost",
              "ts_source"]


def clear_previous(cur, mission_id: int, source_id: str) -> tuple[int, int]:
    cur.execute("DELETE FROM astro_cognitive.test_session WHERE is_synthetic = 1 AND mission_id = %s "
                "AND source_id = %s", (mission_id, source_id))
    sessions = cur.rowcount
    cur.execute("DELETE o FROM astro_core.observation o JOIN astro_core.import_batch b ON b.id = o.import_batch_id "
                "WHERE b.adapter = %s AND b.source_id = %s AND o.mission_id = %s", (ADAPTER, source_id, mission_id))
    obs = cur.rowcount
    cur.execute("DELETE b FROM astro_core.import_batch b WHERE b.adapter = %s AND b.source_id = %s "
                "AND NOT EXISTS (SELECT 1 FROM astro_core.observation o WHERE o.import_batch_id = b.id)",
                (ADAPTER, source_id))
    return sessions, obs


def load(con, directory: Path) -> dict:
    meta, sessions, trials = read_dataset(directory)
    source_id, mission_code = meta["source_id"], meta["mission_code"]
    sessions_csv = directory / "sessions.csv"
    with con.cursor() as cur:
        cur.execute("SELECT id, start_date FROM astro_core.mission WHERE code=%s", (mission_code,))
        mission = cur.fetchone()
        if not mission:
            raise RuntimeError(f"Cognitive import requires mission {mission_code!r}; "
                               "run load_canonical.py data/synthetic/demo first")
        mission_id, start_date = mission
        cur.execute("SELECT 1 FROM astro_core.data_source WHERE id=%s", (source_id,))
        if not cur.fetchone():
            raise RuntimeError(f"Cognitive import requires data source {source_id!r}; "
                               "run load_canonical.py data/synthetic/demo first")
        cur.execute("SELECT s.code, s.id FROM astro_core.subject s JOIN astro_core.participation p "
                    "ON p.subject_id = s.id WHERE p.mission_id = %s", (mission_id,))
        subject_ids = dict(cur.fetchall())
        missing = sorted({s["subject_code"] for s in sessions} - set(subject_ids))
        if missing:
            raise RuntimeError(f"no subject/participation in {mission_code}: {missing}")
        cur.execute("SELECT code, id FROM astro_core.indicator")
        indicator_ids = dict(cur.fetchall())
        absent = sorted(set(MIRROR.values()) - set(indicator_ids))
        if absent:
            raise RuntimeError(f"indicators missing ({absent}); apply schema/016_cognitive_seed.sql")

        removed_sessions, removed_obs = clear_previous(cur, mission_id, source_id)
        file_name = str(sessions_csv.resolve().relative_to(ROOT)) if sessions_csv.resolve().is_relative_to(ROOT) \
            else str(sessions_csv.resolve())
        cur.execute("INSERT INTO astro_core.import_batch (source_id, adapter, file_name, file_sha256) "
                    "VALUES (%s,%s,%s,%s)", (source_id, ADAPTER, file_name,
                                             hashlib.sha256(sessions_csv.read_bytes()).hexdigest()))
        batch_id = cur.lastrowid

        n_trials = n_metrics = n_obs = 0
        obs_rows = []
        for s in sessions:
            tr = trials.get(s["session_uuid"], [])
            scored = compute_metrics(s["test_id"], tr, s["duration_s"])
            anchor, offset = day_offset(s["started_at"], start_date)
            row = dict(s, client_session_uuid=s["session_uuid"], subject_id=subject_ids[s["subject_code"]],
                       mission_id=mission_id, status=scored["status"], quality=scored["quality"], anchor=anchor,
                       day_offset=offset, is_synthetic=1, source_id=source_id, import_batch_id=batch_id)
            cur.execute(f"INSERT INTO astro_cognitive.test_session ({', '.join(SESSION_COLS)}) "
                        f"VALUES ({', '.join(['%s'] * len(SESSION_COLS))})", [row[c] for c in SESSION_COLS])
            sid = cur.lastrowid
            if tr:
                cur.executemany(
                    f"INSERT INTO astro_cognitive.test_trial ({', '.join('`%s`' % c for c in TRIAL_COLS)}) "
                    f"VALUES ({', '.join(['%s'] * len(TRIAL_COLS))})",
                    [[sid if c == "session_id" else t[c] for c in TRIAL_COLS] for t in tr])
                n_trials += len(tr)
            mrows = [(sid, code, None if v is None else float(v), scored["scoring_version"])
                     for code, v in scored["metrics"].items()]
            cur.executemany("INSERT INTO astro_cognitive.test_metric (session_id, metric_code, value, "
                            "scoring_version) VALUES (%s,%s,%s,%s)", mrows)
            n_metrics += len(mrows)
            if qualifies_for_mirror(s["is_practice"], scored["status"], scored["quality"]):
                for code, value in mirror_values(scored["metrics"]):
                    obs_rows.append((row["subject_id"], mission_id, indicator_ids[code], source_id, batch_id, anchor,
                                     offset, s["started_at"], value, SAMPLE_TYPE, 1))
        if obs_rows:
            cur.executemany(
                "INSERT INTO astro_core.observation (subject_id, mission_id, indicator_id, source_id, "
                "import_batch_id, anchor, day_offset, measured_at, value_num, sample_type, is_synthetic) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", obs_rows)
            n_obs = len(obs_rows)
        cur.execute("UPDATE astro_core.import_batch SET finished_at=UTC_TIMESTAMP(), status='ok', rows_read=%s, "
                    "rows_upserted=%s, rows_rejected=0 WHERE id=%s", (len(sessions), n_obs, batch_id))
    con.commit()
    return {"removed_sessions": removed_sessions, "removed_observations": removed_obs, "sessions": len(sessions),
            "trials": n_trials, "metrics": n_metrics, "observations": n_obs}


def main(argv: list[str]) -> None:
    directory = Path(argv[0]) if argv else ROOT / "data" / "synthetic" / "cognitive_demo"
    con = connect()
    try:
        res = load(con, directory)
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()
    print("cognitive import: {sessions} sessions, {trials} trials, {metrics} metrics, {observations} mirrored "
          "observations (replaced {removed_sessions} sessions, {removed_observations} observations)".format(**res))


if __name__ == "__main__":
    main(sys.argv[1:])
