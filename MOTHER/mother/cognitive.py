"""In-app cognitive tests (PVT-B, Go/No-Go, DSST): validation, saving and reporting.

Contract: config/cognitive/CONTRACT.md. Metrics come ONLY from `cognitive_scoring` (the source of truth);
whatever metrics the browser sends are only compared, never stored. These are performance indicators compared
with the person's own baseline, not a medical diagnosis.

  * `CognitiveSession`  pydantic v2 model of POST /api/cognitive/sessions (every 422 rule of contract §3)
  * `save_session`      one transaction: import_batch + session + trials + events + metrics + observation mirror
  * `cognitive_report`  GET /api/cognitive/{subject} (reads the astro_api views through TeamDatabase)
  * `protocols`         GET /api/cognitive/protocols
"""
from __future__ import annotations

import hashlib
import json
import logging
import math
import uuid as uuidlib
from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from . import cognitive_scoring as S

log = logging.getLogger("mother.cognitive")

SCHEMA_VERSION = "cog-1.0"
DISCLAIMER = "Performance indicator compared with your own baseline - not a diagnosis."
TESTS = ("pvt", "gonogo", "dsst")
LABELS = {"pvt": "Reaction time (PVT)", "gonogo": "Response inhibition (Go/No-Go)", "dsst": "Processing speed (DSST)"}
KEY_METRIC = {"pvt": "pvt_median_rt_ms", "gonogo": "gonogo_commission_rate", "dsst": "dsst_throughput_per_min"}
STIMULUS_SETS = "ABCD"
BASELINE_NEEDED = S.BASELINE_MIN_SESSIONS
TREND_LEN = 12

MAX_BODY_BYTES = 1_000_000
MAX_TRIALS, MAX_EVENTS = 400, 500
MAX_FUTURE = timedelta(minutes=5)
MAX_AGE = timedelta(days=30)
# duration_s feeds DSST throughput (correct / (duration_s / 60)): a bogus value would inflate it, so it is range-checked
DURATION_RANGE_S = {"pvt": (150.0, 240.0), "dsst": (85.0, 95.0)}
MISMATCH_TOLERANCE = 0.01          # client vs server metric, relative
MIN_TIMER_RESOLUTION_MS = 2.0      # coarser timer (e.g. privacy mode) -> quality 'low'
SOURCE_ID = "mother_app_cognitive"
ADAPTER = "mother_cognitive"
# metric -> (astro_core.indicator.code) mirrored into astro_core.observation (complete, non-practice, quality ok)
MIRROR = {
    "pvt_median_rt_ms": "pvt_reaction_ms",
    "pvt_lapses": "pvt_lapses",
    "gonogo_commission_rate": "gonogo_commission_rate",
    "dsst_throughput_per_min": "dsst_throughput_per_min",
}


class SessionNotFound(LookupError):
    """Unknown subject, or the subject does not take part in the mission (HTTP 404)."""


# ====================================================================== request models
def _check_uuid(v: str | None) -> str | None:
    if v is None:
        return None
    try:
        return str(uuidlib.UUID(str(v)))
    except ValueError:
        raise ValueError("must be a UUID") from None


def _aware_utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


class _Base(BaseModel):
    model_config = ConfigDict(extra="ignore")


class Trial(_Base):
    idx: int = Field(ge=0, le=32767)
    is_practice: bool = False
    stimulus: str | None = Field(None, max_length=32)
    condition: str | None = Field(None, max_length=24)
    isi_ms: int | None = Field(None, ge=0, le=32767)
    t_onset_ms: float | None = Field(None, allow_inf_nan=False)
    t_response_ms: float | None = Field(None, allow_inf_nan=False)
    rt_ms: float | None = Field(None, ge=0, le=S.PVT_TIMEOUT_MS, allow_inf_nan=False)
    expected: str | None = Field(None, max_length=8)
    actual: str | None = Field(None, max_length=8)
    event_type: str = Field(max_length=24)
    timeout: bool = False
    anticipation: bool = False
    valid: bool = True
    focus_lost: bool = False
    ts_source: str | None = Field(None, max_length=1)

    @field_validator("isi_ms", mode="before")
    @classmethod
    def _round_isi(cls, v):
        return round(v) if isinstance(v, float) and math.isfinite(v) else v

    @field_validator("expected", "actual", mode="before")
    @classmethod
    def _as_text(cls, v):
        return None if v is None else str(v)


class Event(_Base):
    seq: int = Field(ge=0, le=32767)
    t_ms: float = Field(allow_inf_nan=False)
    kind: str = Field(min_length=1, max_length=24)
    detail: str | None = None

    @field_validator("detail", mode="before")
    @classmethod
    def _detail(cls, v):
        if v is None:
            return None
        if not isinstance(v, str):
            v = json.dumps(v, default=str, separators=(",", ":"))
        return v[:200]


class Device(_Base):
    device_class: Literal["keyboard", "touch", "mouse", "unknown"] = "unknown"
    user_agent: str | None = None
    screen_w: int | None = Field(None, ge=0, le=32767)
    screen_h: int | None = Field(None, ge=0, le=32767)
    dpr: float | None = Field(None, ge=0, lt=100, allow_inf_nan=False)
    refresh_hz: float | None = Field(None, ge=0, lt=10000, allow_inf_nan=False)
    frame_jitter_ms: float | None = Field(None, ge=0, lt=10000, allow_inf_nan=False)
    timer_resolution_ms: float | None = Field(None, ge=0, lt=10000, allow_inf_nan=False)
    focus_lost_ms: int | None = Field(None, ge=0, le=2_000_000_000)


class Context(_Base):
    sleep_h: float | None = Field(None, ge=0, le=24, allow_inf_nan=False)
    sleep_quality: int | None = Field(None, ge=1, le=10)
    fatigue: int | None = Field(None, ge=1, le=10)
    kss: int | None = Field(None, ge=1, le=9)
    stress: int | None = Field(None, ge=1, le=10)
    caffeine_3h: bool | None = None


class CognitiveSession(_Base):
    client_session_uuid: str
    subject_code: str = Field(min_length=1, max_length=40)
    mission_code: str | None = Field(None, max_length=40)
    test_id: str
    protocol_version: str
    app_version: str = Field(max_length=24)
    stimulus_set: str = Field(pattern="^[A-D]$")
    seed: int = Field(ge=0, lt=2**63)
    session_no: int | None = Field(None, ge=1, le=100000)
    battery_uuid: str | None = None
    battery_position: int | None = Field(None, ge=0, le=100)
    is_practice: bool = False
    status: Literal["complete", "interrupted", "aborted"] = "complete"
    status_reason: str | None = Field(None, max_length=200)
    started_at: datetime
    completed_at: datetime | None = None
    tz_offset_min: int | None = Field(None, ge=-1440, le=1440)
    duration_s: float | None = Field(None, gt=0, le=3600, allow_inf_nan=False)
    device: Device
    context: Context = Field(default_factory=Context)
    client_metrics: dict[str, float | None] = Field(default_factory=dict)
    trials: list[Trial] = Field(default_factory=list, max_length=MAX_TRIALS)
    events: list[Event] = Field(default_factory=list, max_length=MAX_EVENTS)

    @field_validator("client_session_uuid", "battery_uuid")
    @classmethod
    def _uuids(cls, v):
        return _check_uuid(v)

    @field_validator("started_at", "completed_at")
    @classmethod
    def _utc(cls, v):
        return None if v is None else _aware_utc(v)

    @model_validator(mode="after")
    def _rules(self):
        if self.test_id not in S.PROTOCOLS:
            raise ValueError(f"unknown test_id {self.test_id!r} (expected one of {sorted(S.PROTOCOLS)})")
        if self.duration_s is not None and self.test_id in DURATION_RANGE_S:
            lo, hi = DURATION_RANGE_S[self.test_id]
            if not lo <= self.duration_s <= hi:
                raise ValueError(f"duration_s must be {lo}-{hi} for {self.test_id}")
        if self.protocol_version != S.PROTOCOLS[self.test_id]:
            raise ValueError(f"unknown protocol_version {self.protocol_version!r} for {self.test_id} "
                             f"(expected {S.PROTOCOLS[self.test_id]!r})")
        allowed = S.EVENT_TYPES[self.test_id]
        bad = sorted({t.event_type for t in self.trials if t.event_type not in allowed})
        if bad:
            raise ValueError(f"event_type {bad} not allowed for {self.test_id} (allowed: {sorted(allowed)})")
        idxs = [t.idx for t in self.trials]
        if len(set(idxs)) != len(idxs):
            raise ValueError("duplicate trial idx")
        seqs = [e.seq for e in self.events]
        if len(set(seqs)) != len(seqs):
            raise ValueError("duplicate event seq")
        now = datetime.now(timezone.utc)
        if self.started_at > now + MAX_FUTURE:
            raise ValueError("started_at is in the future")
        if self.started_at < now - MAX_AGE:
            raise ValueError("started_at is older than 30 days")
        return self


# ====================================================================== helpers
def clean(obj: Any) -> Any:
    """Make a structure JSON-safe: NaN / inf -> None, datetimes -> ISO strings."""
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, dict):
        return {k: clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [clean(v) for v in obj]
    if isinstance(obj, datetime):
        return _iso(obj)
    return obj


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    d = _aware_utc(dt)
    return d.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _naive_utc(dt: datetime) -> datetime:
    return _aware_utc(dt).replace(tzinfo=None)


def _num(v: Any) -> float | None:
    if v is None:
        return None
    f = float(v)
    return f if math.isfinite(f) else None


def stimulus_set_for(session_no: int) -> str:
    return STIMULUS_SETS[(session_no - 1) % len(STIMULUS_SETS)]


def validation_errors(exc) -> list[dict[str, Any]]:
    """pydantic ValidationError -> JSON-safe list for a 422 body."""
    out = []
    for e in exc.errors(include_url=False, include_context=False, include_input=False):
        out.append({"loc": [str(x) for x in e["loc"]], "msg": e["msg"], "type": e["type"]})
    return out


# ====================================================================== saving
def _result(row: dict[str, Any], metrics: dict[str, Any], duplicate: bool) -> dict[str, Any]:
    return clean({"session_id": int(row["session_id"]), "client_session_uuid": row["client_session_uuid"],
                  "duplicate": duplicate, "test_id": row["test_id"], "status": row["status"], "quality": row["quality"],
                  "is_practice": bool(row["is_practice"]), "metrics": metrics, "scoring_version": row["scoring_version"]})


def _existing(cur, cid: str) -> dict[str, Any] | None:
    cur.execute("SELECT id, client_session_uuid, test_id, status, quality, is_practice "
                "FROM astro_cognitive.test_session WHERE client_session_uuid = %s", (cid,))
    r = cur.fetchone()
    if not r:
        return None
    cur.execute("SELECT metric_code, value, scoring_version FROM astro_cognitive.test_metric WHERE session_id = %s",
                (r["id"],))
    rows = cur.fetchall()
    metrics = {m["metric_code"]: _num(m["value"]) for m in rows}
    version = rows[0]["scoring_version"] if rows else S.SCORING_VERSION
    return _result({"session_id": r["id"], "client_session_uuid": r["client_session_uuid"], "test_id": r["test_id"],
                    "status": r["status"], "quality": r["quality"], "is_practice": r["is_practice"],
                    "scoring_version": version}, metrics, True)


def _to_date(v) -> date | None:
    if v is None:
        return None
    return v.date() if isinstance(v, datetime) else v


def _mismatches(client: dict[str, float | None], server: dict[str, float | None]) -> list[str]:
    out = []
    for k, c in sorted(client.items()):
        s = server.get(k)
        if c is None or s is None:
            continue
        if abs(c - s) > MISMATCH_TOLERANCE * abs(s):
            out.append(f"{k}: client {c:.6g} server {s:.6g}")
    return out


def save_session(writer, payload: CognitiveSession, now: datetime | None = None) -> tuple[dict[str, Any], bool]:
    """Store one session. Returns (response body, created). created=False -> the uuid was already stored (HTTP 200).

    Everything happens in ONE transaction on `writer` (a connection with autocommit off); any error rolls back
    and is re-raised. Raises SessionNotFound for an unknown subject / mission participation.
    """
    cid = payload.client_session_uuid
    try:
        with writer.cursor() as cur:
            dup = _existing(cur, cid)
            if dup:
                writer.rollback()
                return dup, False
            res = _insert_session(cur, payload)
        writer.commit()
        return res, True
    except Exception as e:
        try:
            writer.rollback()
        except Exception:  # pragma: no cover - connection already gone
            pass
        if getattr(e, "args", None) and e.args and e.args[0] == 1062:   # lost a race on the unique uuid
            with writer.cursor() as cur:
                dup = _existing(cur, cid)
            writer.rollback()
            if dup:
                return dup, False
        raise


def _insert_session(cur, p: CognitiveSession) -> dict[str, Any]:
    cur.execute("SELECT id, is_synthetic FROM astro_core.subject WHERE code = %s", (p.subject_code,))
    subj = cur.fetchone()
    if not subj:
        raise SessionNotFound(f"Unknown person {p.subject_code!r}")
    if p.mission_code:
        cur.execute("SELECT m.id, m.start_date FROM astro_core.participation pa JOIN astro_core.mission m "
                    "ON m.id = pa.mission_id WHERE pa.subject_id = %s AND m.code = %s", (subj["id"], p.mission_code))
    else:
        cur.execute("SELECT m.id, m.start_date FROM astro_core.participation pa JOIN astro_core.mission m "
                    "ON m.id = pa.mission_id WHERE pa.subject_id = %s ORDER BY m.start_date DESC, m.id DESC LIMIT 1",
                    (subj["id"],))
    mis = cur.fetchone()
    if not mis:
        raise SessionNotFound(f"{p.subject_code!r} does not take part in mission {p.mission_code!r}"
                              if p.mission_code else f"{p.subject_code!r} has no mission participation")

    cur.execute("SELECT COUNT(*) AS n, COALESCE(MAX(session_no), 0) AS max_no, COALESCE(SUM(status = 'complete'), 0) AS n_ok "
                "FROM astro_cognitive.test_session WHERE subject_id = %s AND test_id = %s", (subj["id"], p.test_id))
    prev = cur.fetchone() or {}
    session_no = p.session_no or int(prev.get("max_no") or 0) + 1
    # the very first session per person and test is practice (learning effect) and never enters the baseline
    is_practice = p.is_practice or int(prev.get("n_ok") or 0) == 0

    trials = [t.model_dump() for t in p.trials]     # rt_ms is stored exactly (DOUBLE), so scoring is reproducible from the DB
    sc = S.score(p.test_id, trials, p.duration_s)
    metrics = sc["metrics"]
    status = "invalid" if (p.status == "complete" and sc["status"] == "invalid") else p.status
    quality = sc["quality"]
    d = p.device
    if d.timer_resolution_ms is not None and d.timer_resolution_ms > MIN_TIMER_RESOLUTION_MS:
        quality = "low"
    reason = p.status_reason
    if status == "invalid" and not reason:
        reason = "scoring: too few usable trials or accuracy below minimum"

    started = _naive_utc(p.started_at)
    start_date = _to_date(mis["start_date"])
    anchor, day_offset = ("launch", (started.date() - start_date).days) if start_date else ("none", None)

    ev_rows = [(e.seq, e.t_ms, e.kind, e.detail) for e in sorted(p.events, key=lambda e: e.seq)]
    next_seq = (max((e[0] for e in ev_rows), default=-1)) + 1
    mism = _mismatches(p.client_metrics, metrics)
    for line in mism:
        ev_rows.append((next_seq, 0.0, "scoring_mismatch", line[:200]))
        next_seq += 1
    if mism:
        log.warning("scoring mismatch for %s (%s): %s", p.client_session_uuid, p.test_id, "; ".join(mism))

    batch_hash = hashlib.sha256(p.client_session_uuid.encode()).hexdigest()
    mirror = status == "complete" and not is_practice and quality == "ok"
    cur.execute("INSERT INTO astro_core.import_batch (source_id, adapter, file_name, file_sha256, finished_at, status, "
                "rows_read, rows_upserted, rows_rejected) VALUES (%s, %s, %s, %s, UTC_TIMESTAMP(), 'ok', %s, %s, 0)",
                (SOURCE_ID, ADAPTER, f"session:{p.client_session_uuid}", batch_hash, len(trials), len(trials)))
    batch_id = cur.lastrowid

    c = p.context
    cols = {
        "client_session_uuid": p.client_session_uuid, "subject_id": subj["id"], "mission_id": mis["id"],
        "test_id": p.test_id, "battery_uuid": p.battery_uuid, "battery_position": p.battery_position,
        "protocol_version": p.protocol_version, "app_version": p.app_version, "stimulus_set": p.stimulus_set,
        "seed": p.seed, "session_no": session_no, "is_practice": int(is_practice), "status": status,
        "quality": quality, "status_reason": reason, "started_at": started,
        "completed_at": _naive_utc(p.completed_at) if p.completed_at else None, "tz_offset_min": p.tz_offset_min,
        "duration_s": p.duration_s, "anchor": anchor, "day_offset": day_offset, "device_class": d.device_class,
        "user_agent": (d.user_agent or None) and d.user_agent[:300], "screen_w": d.screen_w, "screen_h": d.screen_h,
        "dpr": d.dpr, "refresh_hz": d.refresh_hz, "frame_jitter_ms": d.frame_jitter_ms,
        "timer_resolution_ms": d.timer_resolution_ms, "focus_lost_ms": d.focus_lost_ms or 0,
        "sleep_h": c.sleep_h, "sleep_quality": c.sleep_quality, "fatigue": c.fatigue, "kss": c.kss, "stress": c.stress,
        "caffeine_3h": None if c.caffeine_3h is None else int(c.caffeine_3h),
        "is_synthetic": int(bool(subj["is_synthetic"])), "source_id": SOURCE_ID, "import_batch_id": batch_id,
    }
    cur.execute(f"INSERT INTO astro_cognitive.test_session ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(cols))})",
                tuple(cols.values()))
    sid = cur.lastrowid

    if trials:
        cur.executemany(
            "INSERT INTO astro_cognitive.test_trial (session_id, idx, is_practice, stimulus, `condition`, isi_ms, "
            "t_onset_ms, t_response_ms, rt_ms, expected, actual, event_type, timeout, anticipation, valid, focus_lost, "
            "ts_source) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            [(sid, t["idx"], int(t["is_practice"]), t["stimulus"] or "", t["condition"], t["isi_ms"], t["t_onset_ms"],
              t["t_response_ms"], t["rt_ms"], t["expected"], t["actual"], t["event_type"], int(t["timeout"]),
              int(t["anticipation"]), int(t["valid"]), int(t["focus_lost"]), t["ts_source"]) for t in trials])
    if ev_rows:
        cur.executemany("INSERT INTO astro_cognitive.test_event (session_id, seq, t_ms, kind, detail) "
                        "VALUES (%s, %s, %s, %s, %s)", [(sid, *e) for e in ev_rows])
    cur.executemany("INSERT INTO astro_cognitive.test_metric (session_id, metric_code, value, scoring_version) "
                    "VALUES (%s, %s, %s, %s)", [(sid, k, v, S.SCORING_VERSION) for k, v in metrics.items()])

    if mirror:
        wanted = {code: metrics.get(m) for m, code in MIRROR.items() if m in metrics and metrics.get(m) is not None}
        if wanted:
            cur.execute("SELECT id, code FROM astro_core.indicator WHERE code IN %s", (tuple(wanted),))
            ids = {r["code"]: r["id"] for r in cur.fetchall()}
            rows = []
            for code, val in wanted.items():
                if code not in ids:
                    log.warning("indicator %s missing in astro_core.indicator: not mirrored", code)
                    continue
                rows.append((subj["id"], mis["id"], ids[code], SOURCE_ID, batch_id, anchor, day_offset, started,
                             float(val), "manual_device", int(bool(subj["is_synthetic"]))))
            if rows:
                cur.executemany(
                    "INSERT INTO astro_core.observation (subject_id, mission_id, indicator_id, source_id, import_batch_id, "
                    "anchor, day_offset, measured_at, value_num, sample_type, is_synthetic) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", rows)
    return _result({"session_id": sid, "client_session_uuid": p.client_session_uuid, "test_id": p.test_id,
                    "status": status, "quality": quality, "is_practice": is_practice,
                    "scoring_version": S.SCORING_VERSION}, metrics, False)


# ====================================================================== report
def _rule_pvt(m: dict[str, Any], pct: float | None) -> list[tuple[str, str]]:
    out = []
    if pct is not None:
        st = "alert" if pct >= 20 else "caution" if pct >= 10 else "ok"
        out.append((st, f"Reaction time {pct:+.0f}% vs your baseline."))
    lap = m.get("pvt_lapses")
    if lap is not None:
        st = "alert" if lap >= 6 else "caution" if lap >= 3 else "ok"
        out.append((st, f"{lap:.0f} lapse{'' if lap == 1 else 's'} (responses of 355 ms or more) in the latest test."))
    return out


def _rule_gonogo(m: dict[str, Any], _z: float | None) -> list[tuple[str, str]]:
    r = m.get("gonogo_commission_rate")
    if r is None:
        return []
    st = "alert" if r >= 0.30 else "caution" if r >= 0.15 else "ok"
    return [(st, f"Pressed on {r * 100:.0f}% of No-Go trials.")]


def _rule_dsst(m: dict[str, Any], z: float | None) -> list[tuple[str, str]]:
    if z is None:
        return []
    st = "alert" if z <= -2 else "caution" if z < -1 else "ok"
    t = m.get("dsst_throughput_per_min")
    return [(st, f"Processing speed {t:.0f} symbols/min (z {z:+.1f} vs your baseline).")] if t is not None else []


def _status(test: str, metrics: dict[str, Any], z: dict[str, float | None], pct: dict[str, float | None]) -> tuple[str, str]:
    key = KEY_METRIC[test]
    if test == "pvt":
        rules = _rule_pvt(metrics, pct.get(key))
    elif test == "gonogo":
        rules = _rule_gonogo(metrics, z.get(key))
    else:
        rules = _rule_dsst(metrics, z.get(key))
    if not rules:
        return "no_data", "The latest session has no usable result."
    rank = {"ok": 0, "caution": 1, "alert": 2}
    st, text = max(rules, key=lambda r: rank[r[0]])      # worst rule wins; first listed on a tie
    return st, text


def _fetch(db, subject_code: str) -> tuple[dict[str, Any], list[dict[str, Any]], dict[int, dict[str, float | None]]]:
    subj = db._q("SELECT data_kind FROM astro_api.subjects WHERE subject_code = %s LIMIT 1", (subject_code,))
    if not subj:
        raise KeyError(subject_code)
    sessions = db._q("SELECT session_id, test_id, session_no, stimulus_set, status, quality, is_practice, started_at, "
                     "device_class FROM astro_api.cognitive_sessions WHERE subject_code = %s "
                     "ORDER BY started_at, session_id", (subject_code,))
    rows = db._q("SELECT session_id, metric_code, value FROM astro_api.cognitive_metrics WHERE subject_code = %s",
                 (subject_code,))
    metrics: dict[int, dict[str, float | None]] = {}
    for r in rows:
        metrics.setdefault(int(r["session_id"]), {})[r["metric_code"]] = _num(r["value"])
    return subj[0], sessions, metrics


def _test_block(test: str, sessions: list[dict[str, Any]], metrics: dict[int, dict[str, float | None]]):
    mine = sorted((s for s in sessions if s["test_id"] == test), key=lambda s: (s["started_at"], s["session_id"]))
    valid = [s for s in mine if s["status"] == "complete" and not s["is_practice"]]
    latest = valid[-1] if valid else None
    device = latest["device_class"] if latest else None
    # baseline = the first qualifying sessions BEFORE the latest one: the latest session must never be part of the
    # baseline it is compared with (that would damp a real change, e.g. 31 -> 22 DSST symbols/min gave z -1.7, not -4)
    qualifying = [s for s in valid if s["quality"] == "ok" and s["device_class"] == device and s is not latest]
    base_sessions = qualifying[:S.BASELINE_MAX_SESSIONS]
    n = len(base_sessions)
    ready = n >= BASELINE_NEEDED
    key = KEY_METRIC[test]
    max_no = max((int(s["session_no"] or 0) for s in mine), default=0)
    nxt = {"session_no": max_no + 1, "stimulus_set": stimulus_set_for(max_no + 1)}
    trend = [{"started_at": _iso(s["started_at"]), "value": metrics.get(s["session_id"], {}).get(key)}
             for s in valid if metrics.get(s["session_id"], {}).get(key) is not None][-TREND_LEN:]
    block: dict[str, Any] = {"test_id": test, "label": LABELS[test], "status": "no_data",
                             "headline": f"Building your baseline ({min(n, BASELINE_NEEDED)}/{BASELINE_NEEDED}).",
                             "baseline": {"n": n, "needed": BASELINE_NEEDED, "ready": ready},
                             "latest": None, "trend": trend, "next": nxt}
    z_key = None
    if latest:
        lm = metrics.get(latest["session_id"], {})
        z: dict[str, float | None] = {}
        for code in lm:
            base = S.baseline([metrics.get(s["session_id"], {}).get(code) for s in base_sessions]) if ready else None
            zz = S.performance_z(code, lm[code], base)
            if zz is not None:
                z[code] = zz
        pct = {}
        if ready:
            p = S.pct_change(lm.get(key), S.baseline([metrics.get(s["session_id"], {}).get(key) for s in base_sessions]))
            if p is not None:
                pct[key] = p
        block["latest"] = {"session_id": int(latest["session_id"]), "started_at": _iso(latest["started_at"]),
                           "session_no": latest["session_no"], "quality": latest["quality"], "metrics": lm, "z": z,
                           "pct_change": pct}
        if ready:
            block["status"], block["headline"] = _status(test, lm, z, pct)
            if latest["quality"] != "ok" and block["status"] != "no_data":
                block["headline"] += " (low-quality session: interpret with care)"
        z_key = z.get(key)
    return block, z_key


def cognitive_report(db, subject_code: str) -> dict[str, Any]:
    """GET /api/cognitive/{subject}. Raises KeyError for an unknown person (-> 404)."""
    subj, sessions, metrics = _fetch(db, subject_code)
    tests, zs = [], []
    for t in TESTS:
        block, z_key = _test_block(t, sessions, metrics)
        tests.append(block)
        zs.append(z_key if block["baseline"]["ready"] else None)
    composite = sum(zs) / 3 if all(z is not None for z in zs) else None
    return clean({"schema_version": SCHEMA_VERSION,
                  "subject": {"code": subject_code, "data_kind": subj.get("data_kind")},
                  "disclaimer": DISCLAIMER, "tests": tests, "composite_z": composite})


# ====================================================================== protocols
def protocols() -> dict[str, Any]:
    """GET /api/cognitive/protocols: what the GUI runs and how MOTHER judges it (contract §1 and §4)."""
    return {
        "schema_version": SCHEMA_VERSION, "scoring_version": S.SCORING_VERSION, "disclaimer": DISCLAIMER,
        "stimulus_sets": list(STIMULUS_SETS),
        "stimulus_set_rule": "'ABCD'[(session_no - 1) % 4]",
        "seed_rule": "FNV-1a 32-bit of '<subject_code>|<test_id>|<stimulus_set>|<session_no>' -> mulberry32",
        "baseline": {"min_sessions": S.BASELINE_MIN_SESSIONS, "max_sessions": S.BASELINE_MAX_SESSIONS,
                     "qualifying": "is_practice=0, status=complete, quality=ok, same test_id and device_class",
                     "first_session_is_practice": True},
        "tests": [
            {"test_id": "pvt", "label": LABELS["pvt"], "protocol_version": S.PROTOCOLS["pvt"], "key_metric": KEY_METRIC["pvt"],
             "params": {"duration_s": 180, "isi_ms": [1000, 4000], "isi_includes_feedback": True, "feedback_ms": 1000, "timeout_ms": 30000,
                        "false_start_below_ms": S.PVT_FALSE_START_MS, "lapse_from_ms": S.PVT_LAPSE_MS,
                        "practice_trials": 3, "input": "Space / tap"},
             "event_types": sorted(S.EVENT_TYPES["pvt"])},
            {"test_id": "gonogo", "label": LABELS["gonogo"], "protocol_version": S.PROTOCOLS["gonogo"],
             "key_metric": KEY_METRIC["gonogo"],
             "params": {"practice_trials": 10, "trials": 120, "go": 90, "nogo": 30, "stimulus_ms": 500, "response_window_ms": 800,
                        "iti_ms": [750, 1250], "anticipation_below_ms": S.GONOGO_ANTICIPATION_MS,
                        "first_go_trials": 3, "max_nogo_in_a_row": 2, "nogo_per_quarter": [7, 8]},
             "event_types": sorted(S.EVENT_TYPES["gonogo"])},
            {"test_id": "dsst", "label": LABELS["dsst"], "protocol_version": S.PROTOCOLS["dsst"], "key_metric": KEY_METRIC["dsst"],
             "params": {"duration_s": 90, "symbols": 9, "practice_trials": 9, "block_size": 9, "min_accuracy": S.DSST_MIN_ACCURACY,
                        "input": "Digit1-9 / Numpad1-9 / on-screen keypad"},
             "event_types": sorted(S.EVENT_TYPES["dsst"])},
        ],
        "status_rules": {
            "pvt": [{"metric": "pct_change(pvt_median_rt_ms)", "ok": "<10", "caution": "10-20", "alert": ">=20",
                     "source": "basner_2024", "basis": "team_assumption"},
                    {"metric": "pvt_lapses", "ok": "0-2", "caution": "3-5", "alert": ">=6", "basis": "team_assumption"}],
            "gonogo": [{"metric": "gonogo_commission_rate", "ok": "<0.15", "caution": "0.15-0.30", "alert": ">=0.30",
                        "basis": "team_assumption"}],
            "dsst": [{"metric": "performance_z(dsst_throughput_per_min)", "ok": ">=-1", "caution": "(-2,-1)", "alert": "<=-2",
                      "basis": "team_assumption"}],
            "combine": "worst rule wins; no_data until the baseline has 3 sessions",
        },
    }
