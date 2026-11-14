"""Deterministic rules engine driven by the team's `config/thresholds.json`.

This layer is the *authority* on status: every ok/caution/alert shown to the crew can be traced to a band
or rolling rule in the config, with its NASA source and whether the edge is sourced or a team assumption.
Statistical layers (anomaly, trend) may add early warnings, but never downgrade what the rules say.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from statistics import median
from typing import Any

from .config import Band, Config, Indicator
from .models import Finding, FindingKind, Measurement, Status, utc

NON_EVALUATED = {"input"}


@dataclass
class IndicatorState:
    indicator_id: str
    label: str
    unit: str
    category: str
    latest: Measurement | None
    status: Status
    message: str
    findings: list[Finding]

    def to_dict(self) -> dict[str, Any]:
        lm = self.latest
        return {
            "indicator_id": self.indicator_id,
            "label": self.label,
            "unit": self.unit,
            "category": self.category,
            "value": None if lm is None else round(lm.value, 3),
            "ts": None if lm is None else lm.ts.isoformat(),
            "source": None if lm is None else lm.source,
            "simulated": None if lm is None else lm.simulated,
            "quality_flags": [] if lm is None else list(lm.quality_flags),
            "status": self.status.value,
            "message": self.message,
            "finding_ids": [f.id for f in self.findings if f.status != Status.OK],
        }


def _fmt(v: float | None) -> str:
    if v is None:
        return "-"
    return f"{v:.0f}" if abs(v) >= 100 else f"{v:.2f}".rstrip("0").rstrip(".")


def _band_range(b: Band) -> str:
    lo = _fmt(b.min) if b.min is not None else "-inf"
    hi = _fmt(b.max) if b.max is not None else "+inf"
    return f"[{lo}, {hi})"


class RulesEngine:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg

    # ------------------------------------------------------------------ bands
    def _band_finding(self, ind: Indicator, m: Measurement, now: datetime) -> Finding | None:
        band = ind.band_for(m.value)
        if band is None:
            return None
        age_h = (now - m.ts).total_seconds() / 3600
        expl = (f"{ind.label} = {_fmt(m.value)} {ind.unit} falls in band {_band_range(band)} -> "
                f"{band.status.value.upper()}: {band.message}")
        if band.basis == "team_assumption":
            expl += " (Band edge is a team assumption built on the cited sources.)"
        if "projected" in m.quality_flags:
            expl += " Value is a model projection, not a measurement."
        if ind.spaceflight_context and band.status != Status.OK:
            expl += f" Spaceflight context: {ind.spaceflight_context}"
        return Finding(
            subject_id=m.subject_id, kind=FindingKind.THRESHOLD, status=band.status,
            title=f"{ind.label}: {band.message}", rule_id=f"band.{ind.id}", ts=m.ts,
            indicator_id=ind.id, action=band.action, escalate=band.escalate, basis=band.basis,
            evidence={"value": m.value, "unit": ind.unit, "band": _band_range(band),
                      "measured_at": m.ts, "age_hours": round(age_h, 1), "source": m.source,
                      "simulated": m.simulated, "quality_flags": list(m.quality_flags)},
            sources=list(ind.sources), explanation=expl,
        )

    # --------------------------------------------------------- baseline rule
    def _baseline_finding(self, repo, ind: Indicator, m: Measurement) -> Finding | None:
        rule = ind.baseline_rule
        if not rule or rule.get("metric") != "delta_vs_inflight_baseline_14d":
            return None
        hist = repo.series(m.subject_id, ind.id, start=m.ts - timedelta(days=14), end=m.ts - timedelta(hours=12))
        if len(hist) < 5:
            return None
        base = median(h.value for h in hist)
        delta = m.value - base
        status = Status.OK
        if delta > rule["alert_above"]:
            status = Status.ALERT
        elif delta > rule["caution_above"]:
            status = Status.CAUTION
        return Finding(
            subject_id=m.subject_id, kind=FindingKind.BASELINE, status=status,
            title=f"{ind.label}: {delta:+.2f} {ind.unit} vs personal 14-day in-flight baseline",
            rule_id=f"baseline.{ind.id}", ts=m.ts, indicator_id=ind.id,
            action="Re-measure in 1 h and log symptoms." if status != Status.OK else None,
            escalate=status == Status.ALERT, basis=rule.get("basis", "team_assumption"),
            evidence={"value": m.value, "baseline_median_14d": base, "delta": delta, "n_baseline": len(hist),
                      "caution_above": rule["caution_above"], "alert_above": rule["alert_above"]},
            sources=list(ind.sources),
            explanation=(f"Compared with this astronaut's own median of the previous 14 days ({_fmt(base)} {ind.unit}, "
                         f"n={len(hist)}), today's value is {delta:+.2f} {ind.unit}. A personal baseline catches changes "
                         "that a population range would miss in spaceflight."),
        )

    # ---------------------------------------------------------- rolling rules
    @staticmethod
    def _window(rule: dict) -> timedelta:
        if "window_days" in rule:
            return timedelta(days=rule["window_days"])
        return timedelta(hours=rule["window_hours"])

    def _rolling_findings(self, repo, ind: Indicator, m: Measurement) -> list[Finding]:
        out: list[Finding] = []
        first = None
        for rule in ind.rolling_rules:
            win = self._window(rule)
            if "window_days" in rule:
                # daily logs: window = the last N calendar entries ending with this one
                start = m.ts - win + timedelta(hours=1)
            else:
                start = m.ts - win
            vals = [x.value for x in repo.series(m.subject_id, ind.id, start=start, end=m.ts)]
            if not vals:
                continue
            if first is None:
                s = repo.series(m.subject_id, ind.id, end=m.ts)
                first = s[0].ts if s else m.ts
            # Coverage: we need history spanning (most of) the window, otherwise a sum/mean is meaningless.
            if first > start + win * 0.1:
                continue
            if "window_days" in rule and rule["metric"] == "mean" and len(vals) < math.ceil(rule["window_days"] / 2):
                continue

            metric = rule["metric"]
            if metric == "mean":
                stat = sum(vals) / len(vals)
                hit = (("below" not in rule or stat < rule["below"]) and
                       ("above" not in rule or stat > rule["above"]) and
                       ("at_least" not in rule or stat >= rule["at_least"]))
                thr = rule.get("below", rule.get("above", rule.get("at_least")))
            elif metric == "sum":
                stat = sum(vals)
                hit = stat < rule["below"] if "below" in rule else stat > rule.get("above", math.inf)
                thr = rule.get("below", rule.get("above"))
            elif metric == "count_below":
                stat = sum(1 for v in vals if v < rule["below"])
                hit = stat >= rule["count_at_least"]
                thr = rule["count_at_least"]
            else:
                continue
            if not hit:
                continue
            status = Status(rule["status"])
            wlabel = (f"{rule['window_days']}-day" if "window_days" in rule else f"{rule['window_hours']}-hour")
            cond = next((f"{k.replace('_', ' ')} {rule[k]}" for k in ("below", "above", "at_least") if k in rule), "")
            msg = rule.get("message") or f"{wlabel} {metric.replace('_', ' ')} {cond} {ind.unit}".strip()
            out.append(Finding(
                subject_id=m.subject_id, kind=FindingKind.ROLLING, status=status,
                title=f"{ind.label}: {msg}", rule_id=f"rolling.{ind.id}.{wlabel}.{metric}", ts=m.ts,
                indicator_id=ind.id, action=rule.get("action"), escalate=bool(rule.get("escalate", False)),
                basis=rule.get("basis", "team_assumption"),
                evidence={"window": wlabel, "metric": metric, "value": stat, "threshold": thr, "n": len(vals)},
                sources=list(ind.sources),
                explanation=(f"Over the last {wlabel} window the {metric.replace('_', ' ')} of {ind.label.lower()} is "
                             f"{_fmt(stat)} (n={len(vals)}), which meets the rule '{cond}' -> {status.value.upper()}. "
                             "Trends over days matter more than any single reading."),
            ))
        if not out:
            return []
        # keep the most severe; on a tie the most extreme threshold (e.g. CO2 > 4.5 beats > 3.0)
        out.sort(key=lambda f: (f.status.severity, f.evidence.get("threshold") or 0))
        return [out[-1]]

    # --------------------------------------------------------------- public
    def evaluate_indicator(self, repo, subject_id: str, indicator_id: str, now: datetime) -> IndicatorState | None:
        ind = self.cfg.indicator(indicator_id)
        if ind is None or ind.evaluation in NON_EVALUATED:
            return None
        m = repo.latest(subject_id, indicator_id, at=utc(now))
        if m is None:
            return None
        findings: list[Finding] = []
        if ind.bands:
            f = self._band_finding(ind, m, utc(now))
            if f:
                findings.append(f)
        f = self._baseline_finding(repo, ind, m)
        if f:
            findings.append(f)
        findings.extend(self._rolling_findings(repo, ind, m))

        status = Status.OK
        message = "No data rule triggered."
        for f in findings:
            if f.status.severity >= status.severity:
                status, message = f.status, f.title
        if findings and status == Status.OK:
            message = findings[0].title
        return IndicatorState(indicator_id=ind.id, label=ind.label, unit=ind.unit, category=ind.category,
                              latest=m, status=status, message=message, findings=findings)

    def evaluate_subject(self, repo, subject_id: str, now: datetime) -> dict[str, IndicatorState]:
        out = {}
        for ind_id in repo.indicators_for(subject_id):
            st = self.evaluate_indicator(repo, subject_id, ind_id, now)
            if st:
                out[ind_id] = st
        return out
