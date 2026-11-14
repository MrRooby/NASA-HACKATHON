"""Statistical early-warning layer (stage 2).

Fixed thresholds only fire once a value is already abnormal. Here MOTHER learns each astronaut's own
*in-flight* normal (after the first week of space adaptation) and watches for drift:

* EWMA and tabular CUSUM control charts per indicator (classic statistical process control, the same
  family of methods used for spacecraft telemetry monitoring);
* a multivariate nominal-envelope monitor in the spirit of NASA Ames' Inductive Monitoring System (IMS):
  it learns clusters of "normal days" and measures how far today is from all of them, with per-indicator
  contributions so the result is explainable;
* robust trends (Theil-Sen) with a projected date of crossing into the next worse band.

All findings here are CAUTION-level early warnings: statistics can raise attention, only the rules engine
(and syndromes built on it) can raise an ALERT.
"""
from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from statistics import median
from typing import Any

import numpy as np

from .config import Config, Indicator
from .models import Finding, FindingKind, Mission, Status, utc

# Indicator -> which direction is bad (+1 up, -1 down, 0 both) and a minimum sigma (measurement noise floor).
MONITORED: dict[str, tuple[int, float]] = {
    "heart_rate_resting": (+1, 1.5),
    "bp_systolic": (0, 2.0),
    "bp_diastolic": (0, 1.5),
    "body_temperature": (+1, 0.15),
    "spo2": (-1, 0.7),
    "sleep_hours": (-1, 0.25),
    "mood": (-1, 0.3),
    "fatigue": (+1, 0.3),
    "cabin_co2": (+1, 0.15),
}
MULTIVARIATE_FEATURES = ["heart_rate_resting", "bp_systolic", "bp_diastolic", "body_temperature", "sleep_hours", "mood"]

ADAPTATION_DAYS = 7          # FD1-7: space adaptation, excluded from the personal reference
REFERENCE_DAYS = 21          # FD8-28 form the personal in-flight reference
EWMA_LAMBDA, EWMA_L = 0.2, 3.0
CUSUM_K, CUSUM_H = 0.5, 6.0
Z_CLIP = 4.0                 # winsorise single days so one outage cannot dominate for months
TREND_WINDOW_DAYS = 21
TREND_HORIZON_DAYS = 30


@dataclass
class Reference:
    mean: float
    sigma: float
    n: int
    period: tuple[date, date]


@dataclass
class AnalyticsResult:
    findings: list[Finding] = field(default_factory=list)
    references: dict[str, Reference] = field(default_factory=dict)
    status: str = "collecting_baseline"          # collecting_baseline | monitoring
    envelope: dict[str, Any] = field(default_factory=dict)
    trends: dict[str, dict[str, Any]] = field(default_factory=dict)


# ----------------------------------------------------------------- helpers
def daily_means(repo, subject_id: str, indicator_id: str, end: datetime) -> dict[date, float]:
    acc: dict[date, list[float]] = defaultdict(list)
    for m in repo.series(subject_id, indicator_id, end=end):
        acc[m.ts.date()].append(m.value)
    return {d: sum(v) / len(v) for d, v in sorted(acc.items())}


def robust_reference(values: list[float], sigma_floor: float) -> tuple[float, float]:
    med = median(values)
    mad = median(abs(v - med) for v in values)
    sigma = 1.4826 * mad
    if len(values) > 1:
        sigma = max(sigma, 0.9 * float(np.std(values, ddof=1)))
    return med, max(sigma, sigma_floor)


def reference_period(mission: Mission) -> tuple[date, date]:
    start = mission.date_of_flight_day(ADAPTATION_DAYS + 1)
    return start, start + timedelta(days=REFERENCE_DAYS - 1)


def theil_sen(xs: list[float], ys: list[float]) -> tuple[float, float, float]:
    """Return (slope, intercept, sign agreement 0..1) - robust to single outliers."""
    slopes = [(ys[j] - ys[i]) / (xs[j] - xs[i])
              for i in range(len(xs)) for j in range(i + 1, len(xs)) if xs[j] != xs[i]]
    if not slopes:
        return 0.0, ys[0] if ys else 0.0, 0.0
    slope = median(slopes)
    intercept = median(y - slope * x for x, y in zip(xs, ys))
    pos = sum(1 for s in slopes if s > 0)
    neg = sum(1 for s in slopes if s < 0)
    agreement = max(pos, neg) / len(slopes)
    return slope, intercept, agreement


# ------------------------------------------------------- control charts
def ewma_cusum(series: dict[date, float], ref: Reference) -> dict[str, Any]:
    """Run both charts over the series; report the state at the last day and when the excursion began."""
    z = ref.mean
    s_pos = s_neg = 0.0
    lim = EWMA_L * ref.sigma * math.sqrt(EWMA_LAMBDA / (2 - EWMA_LAMBDA))
    ewma_start = cusum_start = None
    last_zero_pos = last_zero_neg = None
    ewma_sig = cusum_sig = 0
    for d, x in series.items():
        xc = ref.mean + max(-Z_CLIP, min(Z_CLIP, (x - ref.mean) / ref.sigma)) * ref.sigma
        z = EWMA_LAMBDA * xc + (1 - EWMA_LAMBDA) * z
        dev = z - ref.mean
        sig = 1 if dev > lim else -1 if dev < -lim else 0
        if sig and d > ref.period[1]:
            if ewma_sig != sig:
                ewma_start = d
            ewma_sig = sig
        else:
            ewma_sig, ewma_start = 0, None

        u = max(-Z_CLIP, min(Z_CLIP, (x - ref.mean) / ref.sigma))
        s_pos = min(2 * CUSUM_H, max(0.0, s_pos + u - CUSUM_K))
        s_neg = min(2 * CUSUM_H, max(0.0, s_neg - u - CUSUM_K))
        if s_pos == 0:
            last_zero_pos = d
        if s_neg == 0:
            last_zero_neg = d
        if d > ref.period[1] and s_pos > CUSUM_H:
            if cusum_sig != 1:
                cusum_start = last_zero_pos
            cusum_sig = 1
        elif d > ref.period[1] and s_neg > CUSUM_H:
            if cusum_sig != -1:
                cusum_start = last_zero_neg
            cusum_sig = -1
        else:
            cusum_sig, cusum_start = 0, None
    return {"ewma": z, "ewma_limit": lim, "ewma_signal": ewma_sig, "ewma_since": ewma_start,
            "cusum_pos": s_pos, "cusum_neg": s_neg, "cusum_signal": cusum_sig, "cusum_shift_began": cusum_start}


# ----------------------------------------------- IMS-style nominal envelope
class NominalEnvelope:
    """Greedy box clustering of nominal (z-scored) vectors, as in Inductive Monitoring System (IMS)."""

    def __init__(self, radius: float = 1.0) -> None:
        self.radius = radius
        self.lo: list[np.ndarray] = []
        self.hi: list[np.ndarray] = []
        self.threshold = 0.0

    @staticmethod
    def _dist_to_box(x: np.ndarray, lo: np.ndarray, hi: np.ndarray) -> np.ndarray:
        return np.where(x < lo, x - lo, np.where(x > hi, x - hi, 0.0))

    def _fit_boxes(self, X: np.ndarray) -> tuple[list[np.ndarray], list[np.ndarray]]:
        lo: list[np.ndarray] = []
        hi: list[np.ndarray] = []
        for x in X:
            best, best_d = None, math.inf
            for i in range(len(lo)):
                centre = (lo[i] + hi[i]) / 2
                d = float(np.linalg.norm(x - centre))
                if d < best_d:
                    best, best_d = i, d
            if best is not None and best_d <= self.radius:
                lo[best] = np.minimum(lo[best], x)
                hi[best] = np.maximum(hi[best], x)
            else:
                lo.append(x.copy())
                hi.append(x.copy())
        return lo, hi

    def distance(self, x: np.ndarray, lo=None, hi=None) -> tuple[float, np.ndarray]:
        lo = self.lo if lo is None else lo
        hi = self.hi if hi is None else hi
        best, best_vec = math.inf, np.zeros_like(x)
        for a, b in zip(lo, hi):
            v = self._dist_to_box(x, a, b)
            d = float(np.linalg.norm(v))
            if d < best:
                best, best_vec = d, v
        return best, best_vec

    def fit(self, X: np.ndarray) -> "NominalEnvelope":
        self.lo, self.hi = self._fit_boxes(X)
        # Leave-one-out calibration: how far is a *normal* day from boxes built without it?
        loo = []
        for i in range(len(X)):
            lo, hi = self._fit_boxes(np.delete(X, i, axis=0))
            loo.append(self.distance(X[i], lo, hi)[0])
        self.threshold = max(2.5, 1.5 * float(np.percentile(loo, 95))) if loo else 2.5
        return self


# ----------------------------------------------------------------- main
def _bad_direction_label(direction: int) -> str:
    return "rising" if direction > 0 else "falling"


def analyze_subject(repo, cfg: Config, mission: Mission, subject_id: str, now: datetime) -> AnalyticsResult:
    now = utc(now)
    res = AnalyticsResult()
    ref_start, ref_end = reference_period(mission)
    if now.date() <= ref_end:
        res.status = "collecting_baseline"
        res.envelope = {"status": "collecting_baseline", "reference_ready_on": ref_end + timedelta(days=1)}
        return res
    res.status = "monitoring"

    series_by_ind: dict[str, dict[date, float]] = {}
    for ind_id, (direction, floor) in MONITORED.items():
        series = daily_means(repo, subject_id, ind_id, now)
        ref_vals = [v for d, v in series.items() if ref_start <= d <= ref_end]
        if len(ref_vals) < 10:
            continue
        mean, sigma = robust_reference(ref_vals, floor)
        ref = Reference(mean, sigma, len(ref_vals), (ref_start, ref_end))
        res.references[ind_id] = ref
        mon = {d: v for d, v in series.items() if d >= ref_start}
        series_by_ind[ind_id] = mon
        cc = ewma_cusum(mon, ref)
        # Report only when both charts agree on the direction (cuts false alarms across crew x indicators).
        agree = cc["ewma_signal"] if cc["ewma_signal"] and cc["ewma_signal"] == cc["cusum_signal"] else 0
        bad = [agree] if agree and (direction == 0 or agree == direction) else []
        if bad and (now.date() - max(mon)).days <= 2:
            sign = bad[0]
            ind = cfg.indicator(ind_id)
            label = ind.label if ind else ind_id
            unit = ind.unit if ind else ""
            methods = [n for n, s in (("EWMA", cc["ewma_signal"]), ("CUSUM", cc["cusum_signal"])) if s == sign]
            since = cc["cusum_shift_began"] or cc["ewma_since"]
            res.findings.append(Finding(
                subject_id=subject_id, kind=FindingKind.ANOMALY, status=Status.CAUTION,
                title=f"{label}: sustained {_bad_direction_label(sign)} drift vs personal in-flight normal",
                rule_id=f"anomaly.spc.{ind_id}", ts=datetime.combine(max(mon), time(12), tzinfo=timezone.utc),
                indicator_id=ind_id, basis="statistical",
                action="Not an emergency: review the trend chart and re-check this indicator carefully over the next days.",
                evidence={"methods": methods, "reference_mean": mean, "reference_sigma": sigma,
                          "reference_period": [ref_start, ref_end], "ewma": cc["ewma"], "ewma_limit": cc["ewma_limit"],
                          "cusum_pos": cc["cusum_pos"], "cusum_neg": cc["cusum_neg"], "drift_since": since,
                          "latest_daily_mean": mon[max(mon)]},
                sources=list(ind.sources) if ind else [],
                explanation=(f"Statistical process control ({' + '.join(methods)}) shows a persistent shift in "
                             f"{label.lower()} away from this astronaut's own normal of {mean:.2f}±{sigma:.2f} {unit} "
                             f"(FD{ADAPTATION_DAYS + 1}-FD{ADAPTATION_DAYS + REFERENCE_DAYS})"
                             + (f", starting around {since.isoformat()}" if since else "")
                             + ". This catches slow changes before any fixed threshold is crossed."),
            ))
        trend = _trend(cfg.indicator(ind_id), mon, direction, now)
        if trend:
            res.trends[ind_id] = trend
            if trend.get("finding"):
                f = trend.pop("finding")
                f.subject_id = subject_id
                res.findings.append(f)

    _multivariate(res, series_by_ind, subject_id, ref_start, ref_end, now)
    return res


def _trend(ind: Indicator | None, series: dict[date, float], direction: int, now: datetime) -> dict[str, Any] | None:
    if ind is None or not ind.bands:
        return None
    window = [(d, v) for d, v in series.items() if d > now.date() - timedelta(days=TREND_WINDOW_DAYS)]
    if len(window) < 7:
        return None
    t0 = window[0][0]
    xs = [(d - t0).days for d, _ in window]
    ys = [v for _, v in window]
    slope, intercept, agreement = theil_sen(xs, ys)
    current = slope * xs[-1] + intercept
    out: dict[str, Any] = {"slope_per_day": slope, "fitted_now": current, "agreement": agreement,
                           "window_days": TREND_WINDOW_DAYS}
    if agreement < 0.7 or slope == 0 or (direction and math.copysign(1, slope) != direction):
        return out
    band = ind.band_for(current)
    if band is None:
        return out
    # Next band edge in the direction of travel whose status is worse than the current one.
    if slope > 0:
        edges = [(b.min, b) for b in ind.bands if b.min is not None and b.min > current and b.status.severity > band.status.severity]
        edge = min(edges, key=lambda e: e[0]) if edges else None
    else:
        edges = [(b.max, b) for b in ind.bands if b.max is not None and b.max <= current and b.status.severity > band.status.severity]
        edge = max(edges, key=lambda e: e[0]) if edges else None
    if edge is None:
        return out
    days = (edge[0] - current) / slope
    out.update({"next_edge": edge[0], "next_status": edge[1].status.value, "days_to_edge": days})
    if 0 < days <= TREND_HORIZON_DAYS:
        out["finding"] = Finding(
            subject_id="", kind=FindingKind.TREND, status=Status.CAUTION,
            title=f"{ind.label}: at the current trend reaches {edge[1].status.value.upper()} range in ~{days:.0f} days",
            rule_id=f"trend.{ind.id}", ts=datetime.combine(window[-1][0], time(12), tzinfo=timezone.utc),
            indicator_id=ind.id, basis="statistical",
            action=edge[1].action or "Act now while the value is still in range.",
            evidence={"slope_per_day": slope, "fitted_now": current, "edge": edge[0], "days_to_edge": days,
                      "agreement": agreement, "window_days": TREND_WINDOW_DAYS},
            sources=list(ind.sources),
            explanation=(f"A robust Theil-Sen trend over the last {TREND_WINDOW_DAYS} days ({slope:+.3f} {ind.unit}/day, "
                         f"{agreement:.0%} of pairwise slopes agree) projects {ind.label.lower()} to cross {edge[0]} {ind.unit} "
                         f"in about {days:.0f} days."),
        )
    return out


def _multivariate(res: AnalyticsResult, series_by_ind, subject_id, ref_start, ref_end, now) -> None:
    feats = [f for f in MULTIVARIATE_FEATURES if f in series_by_ind and f in res.references]
    if len(feats) < 3:
        return
    days = sorted(set().union(*(series_by_ind[f].keys() for f in feats)))

    def vec(d: date) -> np.ndarray | None:
        vals = []
        for f in feats:
            v = series_by_ind[f].get(d)
            if v is None:
                return None
            r = res.references[f]
            vals.append((v - r.mean) / r.sigma)
        return np.array(vals)

    train = [v for d in days if ref_start <= d <= ref_end and (v := vec(d)) is not None]
    if len(train) < 10:
        return
    env = NominalEnvelope().fit(np.array(train))
    recent = [(d, v) for d in days if d > ref_end and d > now.date() - timedelta(days=14) and (v := vec(d)) is not None]
    scored = [(d, *env.distance(v)) for d, v in recent]
    res.envelope = {
        "status": "monitoring", "features": feats, "clusters": len(env.lo), "threshold": env.threshold,
        "recent": [{"date": d, "distance": dist} for d, dist, _ in scored],
    }
    # Require two consecutive out-of-envelope days to suppress single noisy days.
    if len(scored) >= 2 and scored[-1][1] > env.threshold and scored[-2][1] > env.threshold:
        d, dist, contrib = scored[-1]
        order = np.argsort(-np.abs(contrib))
        top = [{"indicator_id": feats[i], "z_outside_normal": float(contrib[i])} for i in order if abs(contrib[i]) > 0][:3]
        names = ", ".join(f"{t['indicator_id']} ({t['z_outside_normal']:+.1f}σ)" for t in top)
        res.findings.append(Finding(
            subject_id=subject_id, kind=FindingKind.ANOMALY, status=Status.CAUTION,
            title="Unusual combination of vital signs vs this astronaut's normal days",
            rule_id="anomaly.envelope", ts=datetime.combine(d, time(12), tzinfo=timezone.utc), basis="statistical",
            action="Complete a symptom check-in; MOTHER will re-assess after the next measurements.",
            evidence={"distance": dist, "threshold": env.threshold, "clusters": len(env.lo), "top_contributors": top,
                      "features": feats},
            explanation=(f"Inductive-monitoring style envelope: MOTHER learned {len(env.lo)} clusters of normal days "
                         f"from FD{ADAPTATION_DAYS + 1}-FD{ADAPTATION_DAYS + REFERENCE_DAYS}. The last two days lie "
                         f"{dist:.1f} (threshold {env.threshold:.1f}) outside all of them, driven mainly by: {names}. "
                         "Each value may still be 'in range' on its own - it is the combination that is unusual."),
        ))
