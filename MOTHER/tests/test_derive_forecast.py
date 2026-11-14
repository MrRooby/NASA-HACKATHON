from __future__ import annotations

from datetime import timedelta

import pytest

from mother import analytics
from mother.derive import (BMD_RATE, DEFAULT_ENERGY_TARGET_KCAL, EVA_BONUS_KCAL_PER_H, derive_all, derive_bmd,
                           derive_radiation, exercise_compliance)
from mother.forecast import forecast_all, forecast_bmd, forecast_mass, forecast_radiation
from mother.models import FindingKind, Status
from tests.conftest import T0, daily, m


def test_percent_of_preflight_derivations(repo, mission, cfg):
    repo.add(m("body_mass_kg", T0 + timedelta(days=5), 66.5))          # preflight 70
    repo.add(m("vo2max_ml_kg_min", T0 + timedelta(days=5), 36.0))      # preflight 45
    repo.add(m("reaction_time_ms", T0 + timedelta(days=5), 336.0))     # preflight 280
    ov = derive_all(repo, mission, cfg, T0 + timedelta(days=6))
    assert ov.latest("AST-01", "body_mass_change_pct").value == pytest.approx(-5.0)
    assert ov.latest("AST-01", "vo2max_pct_baseline").value == pytest.approx(80.0)
    assert ov.latest("AST-01", "reaction_time_pct_change").value == pytest.approx(20.0)
    assert ov.latest("AST-01", "body_mass_change_pct").source == "derived"
    # overlay is a merged read-only view over base + derived
    assert "body_mass_kg" in ov.indicators_for("AST-01") and "vo2max_pct_baseline" in ov.indicators_for("AST-01")
    assert ov.latest("AST-01", "body_mass_kg").value == 66.5


def test_energy_target_includes_eva_bonus(repo, mission, cfg):
    day = T0 + timedelta(days=2)
    repo.add(m("eva_hours", day + timedelta(hours=10), 6.0))
    repo.add(m("energy_intake_kcal", day + timedelta(hours=20), DEFAULT_ENERGY_TARGET_KCAL))
    ov = derive_all(repo, mission, cfg, day + timedelta(hours=22))
    pct = ov.latest("AST-01", "energy_intake_pct_target").value
    assert pct == pytest.approx(100 * DEFAULT_ENERGY_TARGET_KCAL / (DEFAULT_ENERGY_TARGET_KCAL + 6 * EVA_BONUS_KCAL_PER_H))


def test_radiation_cumulative_uses_measured_then_environment_estimate(repo, mission, astronaut, cfg):
    env_rate = cfg.environments["iss"].dose_mSv_per_day
    repo.add(m("radiation_dose_mSv", T0 + timedelta(hours=23), 2.0, subject="hab-1"))        # FD1 habitat
    repo.add(m("radiation_dose_mSv", T0 + timedelta(days=1, hours=23), 3.0))                 # FD2 personal
    now = T0 + timedelta(days=3, hours=12)                                                   # FD3 has none -> estimate; FD4 today -> stop
    out = derive_radiation(repo, mission, astronaut, cfg, now)
    career = [x for x in out if x.indicator_id == "radiation_career_mSv"]
    assert [round(x.value, 6) for x in career] == pytest.approx([50 + 2, 50 + 5, 50 + 5 + env_rate])
    assert "estimated_from_environment" in career[-1].quality_flags
    ratio = [x for x in out if x.indicator_id == "radiation_daily_vs_environment"]
    assert ratio[1].value == pytest.approx(3.0 / env_rate)


def test_exercise_compliance_and_bmd_projection(repo, mission, astronaut):
    repo.add_many(daily("exercise_minutes_daily", [90] * 30, hour=17))
    end = T0 + timedelta(days=29, hours=23, minutes=59)
    assert exercise_compliance(repo, astronaut, end) == pytest.approx(min(1.0, 7 * 90 / 540))
    full = derive_bmd(repo, mission, astronaut, end)
    hip = [x for x in full if x.indicator_id == "bmd_hip_spine_pct_baseline"]
    assert len(hip) == 30 and all("projected" in x.quality_flags for x in hip)
    with_cm, without_cm = BMD_RATE["bmd_hip_spine_pct_baseline"]
    # once a full week of exercise is logged, the projected loss runs at the with-countermeasure rate
    assert hip[-2].value - hip[-1].value == pytest.approx(with_cm / 30.44)
    assert 100 - 30 * without_cm / 30.44 < hip[-1].value < 100 - 30 * with_cm / 30.44 + 1e-9
    # no exercise at all -> faster projected loss
    from mother.repository import InMemoryRepository
    none = derive_bmd(InMemoryRepository(), mission, astronaut, end)
    hip_none = [x for x in none if x.indicator_id == "bmd_hip_spine_pct_baseline"]
    assert hip_none[-1].value < hip[-1].value


def test_forecast_radiation_flags_projected_limit_breach(repo, mission, astronaut, cfg):
    astronaut.prior_career_dose_mSv = 560.0   # already close to the 600 mSv career limit
    now = T0 + timedelta(days=10)
    ov = derive_all(repo, mission, cfg, now)
    out, finding = forecast_radiation(ov, cfg, mission, astronaut, now)
    assert out["career_limit"] == cfg.radiation_limits.get("career_effective_mSv", 600)
    assert out["projected_at_mission_end"] > out["current"] >= 560
    assert finding is not None and finding.kind == FindingKind.FORECAST and finding.escalate
    astronaut.prior_career_dose_mSv = 0.0
    _, none = forecast_radiation(derive_all(repo, mission, cfg, now), cfg, mission, astronaut, now)
    assert none is None


def test_forecast_bmd_counterfactual_and_breach(repo, mission, astronaut, cfg):
    mission.planned_days = 400                      # long mission, no exercise logged -> breach
    now = T0 + timedelta(days=20, hours=12)
    ov = derive_all(repo, mission, cfg, now)
    outs, findings = forecast_bmd(ov, mission, astronaut, now)
    hip = next(o for o in outs if o["indicator_id"] == "bmd_hip_spine_pct_baseline")
    assert hip["exercise_compliance_7d"] == 0
    assert hip["what_if_full_compliance"] > hip["projected_at_mission_end"]
    assert hip["breach_flight_day"] is not None and 20 < hip["breach_flight_day"] <= 400
    assert any(f.indicator_id == "bmd_hip_spine_pct_baseline" for f in findings)
    assert all(f.status == Status.CAUTION for f in findings)


def test_forecast_mass_trend(repo, mission, astronaut, cfg):
    mission.planned_days = 200
    repo.add_many([m("body_mass_kg", T0 + timedelta(days=d), 70 * (1 - 0.002 * d)) for d in range(0, 28, 3)])
    now = T0 + timedelta(days=27, hours=12)
    ov = derive_all(repo, mission, cfg, now)
    o, f = forecast_mass(ov, mission, astronaut, now)
    assert o["slope_pct_per_week"] == pytest.approx(-1.4, abs=0.01)
    assert f is not None and f.indicator_id == "body_mass_change_pct"
    forecasts, findings = forecast_all(ov, cfg, mission, astronaut, now)
    assert {x["indicator_id"] for x in forecasts} >= {"radiation_career_mSv", "bmd_hip_spine_pct_baseline",
                                                       "body_mass_change_pct"}


def test_forecast_mass_needs_four_points(repo, mission, astronaut, cfg):
    repo.add_many([m("body_mass_kg", T0 + timedelta(days=d), 69) for d in (0, 7)])
    now = T0 + timedelta(days=8)
    assert forecast_mass(derive_all(repo, mission, cfg, now), mission, astronaut, now) == (None, None)


# ------------------------------------------------------------------ analytics
def test_theil_sen_is_robust_to_outlier():
    xs = list(range(10))
    ys = [2 * x + 1 for x in xs]
    ys[5] = 100
    slope, intercept, agreement = analytics.theil_sen(xs, ys)
    assert slope == pytest.approx(2.0) and intercept == pytest.approx(1.0)
    assert agreement > 0.7
    assert analytics.theil_sen([1, 1], [3, 4]) == (0.0, 3, 0.0)


def test_robust_reference_respects_sigma_floor():
    mean, sigma = analytics.robust_reference([60.0] * 10, sigma_floor=1.5)
    assert mean == 60 and sigma == 1.5


def test_analytics_waits_for_reference_period(repo, mission, cfg):
    res = analytics.analyze_subject(repo, cfg, mission, "AST-01", T0 + timedelta(days=10))
    assert res.status == "collecting_baseline" and not res.findings


def test_spc_detects_sustained_drift_but_only_as_caution(repo, mission, cfg):
    # FD1-28 stable around 115 with noise; FD29+ drift up by +1.2/day (still inside alert band at the end)
    import numpy as np
    rng = np.random.default_rng(0)
    vals = [115 + rng.normal(0, 2) for _ in range(28)] + [115 + 1.2 * i + rng.normal(0, 2) for i in range(1, 15)]
    repo.add_many(daily("bp_systolic", vals))
    now = T0 + timedelta(days=len(vals) - 1, hours=12)
    res = analytics.analyze_subject(repo, cfg, mission, "AST-01", now)
    assert res.status == "monitoring" and "bp_systolic" in res.references
    ids = {f.rule_id for f in res.findings}
    assert "anomaly.spc.bp_systolic" in ids
    assert all(f.status == Status.CAUTION for f in res.findings), "statistics may never raise ALERT"
    assert res.trends["bp_systolic"]["slope_per_day"] > 0.5
