"""Mission-level projections (stage 2): where will this astronaut be at mission end if nothing changes?

Each forecast also returns a "what if" counterfactual (e.g. full exercise compliance) so the GUI can show
the crew that their actions change the outcome - the strongest motivator for countermeasure compliance.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from .analytics import theil_sen
from .config import Config
from .derive import BMD_RATE, exercise_compliance
from .models import Astronaut, Finding, FindingKind, Mission, Status, utc

BMD_STANDARD = {"bmd_hip_spine_pct_baseline": 95.0, "bmd_femoral_neck_pct_baseline": 90.0}


def _finding(a: Astronaut, now, rid, title, ind, evidence, expl, action, sources, escalate=False) -> Finding:
    return Finding(subject_id=a.id, kind=FindingKind.FORECAST, status=Status.CAUTION, title=title,
                   rule_id=f"forecast.{rid}", ts=now, indicator_id=ind, action=action, escalate=escalate,
                   basis="team_assumption", evidence=evidence, sources=sources, explanation=expl)


def forecast_radiation(repo, cfg: Config, mission: Mission, a: Astronaut, now: datetime):
    cum = repo.latest(a.id, "radiation_career_mSv", at=now)
    if cum is None:
        return None, None
    daily = [m.value for m in repo.series(a.id, "radiation_daily_vs_environment", start=now - timedelta(days=14), end=now)]
    env_rate = cfg.environments[mission.environment_id].dose_mSv_per_day
    rate = (sum(daily) / len(daily) * env_rate) if daily else env_rate
    remaining = max(0.0, (mission.end - now).total_seconds() / 86400)
    projected = cum.value + rate * remaining
    limit = cfg.radiation_limits.get("career_effective_mSv", 600)
    days_to_limit = (limit - cum.value) / rate if rate > 0 else None
    d30 = sum(m.value for m in repo.series(a.id, "radiation_daily_vs_environment",
                                           start=now - timedelta(days=30), end=now)) * env_rate
    out = {"indicator_id": "radiation_career_mSv", "current": cum.value, "rate_mSv_per_day": rate,
           "projected_at_mission_end": projected, "career_limit": limit, "days_to_limit": days_to_limit,
           "last_30_days_mSv": d30, "mission_end": mission.end}
    finding = None
    if projected >= 0.9 * limit:
        finding = _finding(
            a, now, "radiation_career", f"Projected career dose {projected:.0f} mSv by mission end (limit {limit:.0f})",
            "radiation_career_mSv", out,
            (f"Current cumulative dose {cum.value:.0f} mSv (incl. prior missions) plus {rate:.2f} mSv/day for the remaining "
             f"{remaining:.0f} days projects {projected:.0f} mSv against the NASA career limit of {limit:.0f} mSv."),
            "Apply ALARA: minimise EVA time and time in poorly shielded modules; flight surgeon to review.",
            ["nasa_std_3001_v1", "ochmo_tb_radiation"], escalate=True)
    return out, finding


def forecast_bmd(repo, mission: Mission, a: Astronaut, now: datetime):
    outs, findings = [], []
    compliance = exercise_compliance(repo, a, now)
    remaining = max(0.0, (mission.end - now).total_seconds() / 86400)
    for ind, (with_cm, without_cm) in BMD_RATE.items():
        cur = repo.latest(a.id, ind, at=now)
        if cur is None:
            continue
        rate_now = with_cm * compliance + without_cm * (1 - compliance)
        proj = cur.value - rate_now / 30.44 * remaining
        proj_full = cur.value - with_cm / 30.44 * remaining
        std = BMD_STANDARD[ind]
        breach_day = None
        if proj < std and rate_now > 0:
            days = (cur.value - std) / (rate_now / 30.44)
            breach_day = mission.flight_day(now + timedelta(days=max(0.0, days)))
        o = {"indicator_id": ind, "current": cur.value, "exercise_compliance_7d": compliance,
             "loss_rate_pct_per_month": rate_now, "projected_at_mission_end": proj,
             "what_if_full_compliance": proj_full, "nasa_standard_min": std, "breach_flight_day": breach_day}
        outs.append(o)
        if proj < std:
            findings.append(_finding(
                a, now, ind, f"Bone density projected below NASA standard ({proj:.1f}% < {std:.0f}%) by FD{breach_day}",
                ind, o,
                (f"BMD cannot be measured in flight; MOTHER projects it from exercise compliance ({compliance:.0%} of the "
                 f"weekly prescription in the last 7 days -> {rate_now:.2f}%/month loss). With full ARED compliance the "
                 f"projection at mission end would be {proj_full:.1f}% instead of {proj:.1f}%."),
                "Return to the full resistive exercise prescription (ARED ~6 days/week).",
                ["ochmo_mtb_bone", "hrr_er_bone", "nasa_std_3001_v1"]))
    return outs, findings


def forecast_mass(repo, mission: Mission, a: Astronaut, now: datetime):
    pts = repo.series(a.id, "body_mass_change_pct", start=now - timedelta(days=28), end=now)
    if len(pts) < 4:
        return None, None
    t0 = pts[0].ts
    xs = [(p.ts - t0).total_seconds() / 86400 for p in pts]
    slope, intercept, agree = theil_sen(xs, [p.value for p in pts])
    remaining = max(0.0, (mission.end - now).total_seconds() / 86400)
    cur = slope * ((now - t0).total_seconds() / 86400) + intercept
    proj = cur + slope * remaining
    o = {"indicator_id": "body_mass_change_pct", "current_fitted": cur, "slope_pct_per_week": slope * 7,
         "projected_at_mission_end": proj, "agreement": agree}
    f = None
    if proj <= -5 and slope < 0 and agree >= 0.7:
        f = _finding(a, now, "body_mass", f"Body mass projected {proj:.1f}% vs preflight at mission end",
                     "body_mass_change_pct", o,
                     f"Trend over 4 weeks: {slope * 7:+.2f}%/week; if unchanged mass reaches {proj:.1f}% (caution below -5%).",
                     "Increase energy intake; review weekly with the nutrition plan.",
                     ["hrr_er_nutrition", "zwart_2014"])
    return o, f


def forecast_all(repo, cfg: Config, mission: Mission, a: Astronaut, now: datetime):
    now = utc(now)
    forecasts: list[dict[str, Any]] = []
    findings: list[Finding] = []
    o, f = forecast_radiation(repo, cfg, mission, a, now)
    if o:
        forecasts.append(o)
    if f:
        findings.append(f)
    os_, fs = forecast_bmd(repo, mission, a, now)
    forecasts.extend(os_)
    findings.extend(fs)
    o, f = forecast_mass(repo, mission, a, now)
    if o:
        forecasts.append(o)
    if f:
        findings.append(f)
    return forecasts, findings
