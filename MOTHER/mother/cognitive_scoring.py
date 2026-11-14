"""Scoring of the in-app cognitive tests (PVT-B, Go/No-Go, DSST) from trial-level data.

This module is the SOURCE OF TRUTH for every cognitive metric. It has no dependencies outside the
standard library so the ETL (DATABASE/etl/load_cognitive.py) can import it too. The GUI has a line-by-line
JavaScript port (GUI/src/cognitive/tests/*/scoring.js); both are checked against the shared fixtures in
config/cognitive/fixtures/*.json (MOTHER/tests/test_cognitive_scoring.py and GUI parity.test.js).

Conventions (keep identical in the JS port):
  * only trials with is_practice == False and valid == True are scored;
  * median of an even-length list = mean of the two middle values;
  * "10 %" of n values = ceil(0.1 * n) values (at least 1 when n > 0);
  * sample standard deviation (n - 1); None when fewer than 2 values;
  * every metric that cannot be computed is None (never NaN / inf);
  * no rounding inside scoring (the UI rounds for display).

Not a medical diagnosis: these are performance indicators compared with the person's own baseline.
"""
from __future__ import annotations

import math
from statistics import NormalDist
from typing import Any, Iterable

SCORING_VERSION = "1.0"

PROTOCOLS = {
    "pvt": "pvtb-1.0",
    "gonogo": "gonogo-1.0",
    "dsst": "dsst-1.0",
}

# PVT-B (Basner, Mollicone & Dinges 2011, PMC3197786)
PVT_FALSE_START_MS = 100.0   # rt < 100 ms -> false start
PVT_LAPSE_MS = 355.0         # rt >= 355 ms -> lapse
PVT_TIMEOUT_MS = 30000.0     # no response within 30 s -> lapse (timeout)
PVT_MIN_VALID = 20           # fewer valid RTs -> quality 'low'

GONOGO_ANTICIPATION_MS = 150.0  # GO responses faster than this are anticipations (excluded from RT)
DSST_MIN_ACCURACY = 0.6         # below -> session 'invalid' (random answers / wrong keys)

# event types allowed per test (the API rejects anything else)
EVENT_TYPES = {
    "pvt": {"response", "lapse", "false_start"},
    "gonogo": {"hit", "omission", "commission", "correct_rejection"},
    "dsst": {"correct", "error"},
}

# direction: +1 = higher is better, -1 = lower is better (used for performance z-scores)
METRIC_DIRECTION = {
    "pvt_median_rt_ms": -1, "pvt_mean_rt_ms": -1, "pvt_mean_inv_rt": +1, "pvt_slowest10_inv_rt": +1,
    "pvt_fastest10_rt_ms": -1, "pvt_lapses": -1, "pvt_false_starts": -1, "pvt_score": +1,
    "gonogo_commission_rate": -1, "gonogo_omission_rate": -1, "gonogo_mean_rt_go_ms": -1,
    "gonogo_sd_rt_go_ms": -1, "gonogo_dprime": +1,
    "dsst_correct": +1, "dsst_errors": -1, "dsst_attempts": +1, "dsst_throughput_per_min": +1,
    "dsst_accuracy": +1, "dsst_median_rt_correct_ms": -1,
}


# ------------------------------------------------------------------ helpers
def median(values: Iterable[float]) -> float | None:
    v = sorted(values)
    n = len(v)
    if n == 0:
        return None
    mid = n // 2
    return v[mid] if n % 2 else (v[mid - 1] + v[mid]) / 2


def mean(values: Iterable[float]) -> float | None:
    v = list(values)
    return sum(v) / len(v) if v else None


def sd(values: Iterable[float]) -> float | None:
    v = list(values)
    if len(v) < 2:
        return None
    m = sum(v) / len(v)
    return math.sqrt(sum((x - m) ** 2 for x in v) / (len(v) - 1))


def tenth(n: int) -> int:
    return math.ceil(0.1 * n) if n > 0 else 0


def inv_norm(p: float) -> float:
    return NormalDist().inv_cdf(p)


def dprime(hits: int, n_signal: int, false_alarms: int, n_noise: int) -> float | None:
    """d' with the log-linear correction (Hautus 1995): finite even for 0 % / 100 % rates."""
    if n_signal <= 0 or n_noise <= 0:
        return None
    h = (hits + 0.5) / (n_signal + 1)
    f = (false_alarms + 0.5) / (n_noise + 1)
    return inv_norm(h) - inv_norm(f)


def _scored(trials: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    return [t for t in trials if not t.get("is_practice", False) and t.get("valid", True)]


def _rt(t: dict[str, Any]) -> float | None:
    v = t.get("rt_ms")
    return None if v is None else float(v)


# ------------------------------------------------------------------ PVT-B
def classify_pvt(rt_ms: float | None) -> str:
    """Classify one PVT reaction. None (no response) is a timeout lapse; responses before the stimulus are
    reported by the client as false starts with rt_ms None or < 100."""
    if rt_ms is None:
        return "lapse"
    if rt_ms < PVT_FALSE_START_MS:
        return "false_start"
    if rt_ms < PVT_LAPSE_MS:
        return "response"
    return "lapse"


def score_pvt(trials: Iterable[dict[str, Any]]) -> dict[str, Any]:
    ts = [t for t in _scored(trials) if t.get("event_type") in EVENT_TYPES["pvt"]]
    n = len(ts)
    fs = sum(1 for t in ts if t["event_type"] == "false_start")
    lapses = sum(1 for t in ts if t["event_type"] == "lapse")
    rts = [_rt(t) for t in ts
           if t["event_type"] in ("response", "lapse") and not t.get("timeout", False) and _rt(t) is not None]
    k = tenth(len(rts))
    srt = sorted(rts)
    metrics = {
        "pvt_median_rt_ms": median(rts),
        "pvt_mean_rt_ms": mean(rts),
        "pvt_mean_inv_rt": mean(1000.0 / r for r in rts) if rts else None,
        "pvt_slowest10_inv_rt": mean(1000.0 / r for r in srt[-k:]) if k else None,
        "pvt_fastest10_rt_ms": mean(srt[:k]) if k else None,
        "pvt_lapses": lapses if n else None,
        "pvt_false_starts": fs if n else None,
        "pvt_score": 100.0 - 100.0 * (lapses + fs) / n if n else None,
    }
    quality = "ok" if len(rts) >= PVT_MIN_VALID else "low"
    return {"metrics": metrics, "quality": quality, "status": "complete" if n else "invalid", "n_trials": n}


# ------------------------------------------------------------------ Go/No-Go
def score_gonogo(trials: Iterable[dict[str, Any]]) -> dict[str, Any]:
    ts = [t for t in _scored(trials) if t.get("event_type") in EVENT_TYPES["gonogo"]]
    go = [t for t in ts if t.get("stimulus") == "go"]
    nogo = [t for t in ts if t.get("stimulus") == "nogo"]
    hits = sum(1 for t in go if t["event_type"] == "hit")
    omissions = sum(1 for t in go if t["event_type"] == "omission")
    commissions = sum(1 for t in nogo if t["event_type"] == "commission")
    rts = [_rt(t) for t in go if t["event_type"] == "hit" and not t.get("anticipation", False) and _rt(t) is not None]
    metrics = {
        "gonogo_commission_rate": commissions / len(nogo) if nogo else None,
        "gonogo_omission_rate": omissions / len(go) if go else None,
        "gonogo_mean_rt_go_ms": mean(rts),
        "gonogo_sd_rt_go_ms": sd(rts),
        "gonogo_dprime": dprime(hits, len(go), commissions, len(nogo)),
    }
    status = "complete" if go and nogo else "invalid"
    return {"metrics": metrics, "quality": "ok", "status": status, "n_trials": len(ts)}


# ------------------------------------------------------------------ DSST
def score_dsst(trials: Iterable[dict[str, Any]], duration_s: float = 90.0) -> dict[str, Any]:
    ts = [t for t in _scored(trials) if t.get("event_type") in EVENT_TYPES["dsst"]]
    correct = sum(1 for t in ts if t["event_type"] == "correct")
    errors = sum(1 for t in ts if t["event_type"] == "error")
    attempts = correct + errors
    accuracy = correct / attempts if attempts else None
    rts = [_rt(t) for t in ts if t["event_type"] == "correct" and _rt(t) is not None]
    metrics = {
        "dsst_correct": correct,
        "dsst_errors": errors,
        "dsst_attempts": attempts,
        "dsst_throughput_per_min": correct / (duration_s / 60.0) if duration_s > 0 else None,
        "dsst_accuracy": accuracy,
        "dsst_median_rt_correct_ms": median(rts),
    }
    status = "complete" if attempts and accuracy is not None and accuracy >= DSST_MIN_ACCURACY else "invalid"
    return {"metrics": metrics, "quality": "ok", "status": status, "n_trials": attempts}


def score(test_id: str, trials: Iterable[dict[str, Any]], duration_s: float | None = None) -> dict[str, Any]:
    trials = list(trials)
    if test_id == "pvt":
        return score_pvt(trials)
    if test_id == "gonogo":
        return score_gonogo(trials)
    if test_id == "dsst":
        return score_dsst(trials, 90.0 if duration_s is None else duration_s)
    raise ValueError(f"unknown test_id {test_id!r}")


# ------------------------------------------------------------------ baseline / z-scores
BASELINE_MIN_SESSIONS = 3
BASELINE_MAX_SESSIONS = 5
SD_FLOOR = {  # minimum baseline SD so 3 very similar sessions don't produce huge z-scores
    "pvt_median_rt_ms": ("rel", 0.05), "pvt_mean_rt_ms": ("rel", 0.05), "pvt_mean_inv_rt": ("rel", 0.05),
    "gonogo_mean_rt_go_ms": ("rel", 0.05), "dsst_median_rt_correct_ms": ("rel", 0.05),
    "dsst_correct": ("abs", 2.0), "dsst_throughput_per_min": ("abs", 1.33),
    "gonogo_commission_rate": ("abs", 0.03), "gonogo_omission_rate": ("abs", 0.03),
    "pvt_lapses": ("abs", 1.0), "gonogo_dprime": ("abs", 0.25),
}


def baseline(values: list[float]) -> dict[str, Any] | None:
    """Fixed baseline from the first qualifying sessions (oldest first). None until 3 sessions exist."""
    v = [float(x) for x in values if x is not None][:BASELINE_MAX_SESSIONS]
    if len(v) < BASELINE_MIN_SESSIONS:
        return None
    return {"mean": sum(v) / len(v), "sd": sd(v), "n": len(v)}


def floored_sd(metric: str, mu: float, s: float | None) -> float:
    kind, val = SD_FLOOR.get(metric, ("rel", 0.05))
    floor = abs(mu) * val if kind == "rel" else val
    return max(s or 0.0, floor, 1e-9)


def performance_z(metric: str, x: float | None, base: dict[str, Any] | None) -> float | None:
    """Negative = worse than own baseline, whatever the metric's direction."""
    if x is None or base is None:
        return None
    s = floored_sd(metric, base["mean"], base["sd"])
    return METRIC_DIRECTION.get(metric, 1) * (float(x) - base["mean"]) / s


def pct_change(x: float | None, base: dict[str, Any] | None) -> float | None:
    if x is None or base is None or not base["mean"]:
        return None
    return (float(x) - base["mean"]) / base["mean"] * 100.0
