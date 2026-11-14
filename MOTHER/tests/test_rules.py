from __future__ import annotations

from datetime import timedelta

import pytest

from mother.models import FindingKind, Status
from mother.rules import RulesEngine
from tests.conftest import T0, daily, m


@pytest.fixture
def rules(cfg):
    return RulesEngine(cfg)


@pytest.mark.parametrize("ind,value,expected", [
    ("bp_systolic", 115, Status.OK),
    ("bp_systolic", 120, Status.CAUTION),      # lower edge inclusive
    ("bp_systolic", 150, Status.ALERT),
    ("bp_diastolic", 95, Status.ALERT),
    ("heart_rate_resting", 55, Status.OK),
    ("heart_rate_resting", 130, Status.ALERT),
    ("glucose_fasting", 65, Status.ALERT),
    ("glucose_fasting", 110, Status.CAUTION),
    ("glucose_fasting", 126, Status.ALERT),
    ("body_temperature", 36.8, Status.OK),
    ("body_temperature", 38.0, Status.CAUTION),
    ("body_temperature", 39.0, Status.ALERT),
    ("spo2", 97, Status.OK),
    ("spo2", 92, Status.CAUTION),
    ("spo2", 88, Status.ALERT),
])
def test_single_reading_band_status(rules, repo, ind, value, expected):
    repo.add(m(ind, T0, value))
    st = rules.evaluate_indicator(repo, "AST-01", ind, T0 + timedelta(minutes=5))
    assert st.status == expected
    band = [f for f in st.findings if f.kind == FindingKind.THRESHOLD][0]
    assert band.rule_id == f"band.{ind}" and band.status == expected
    assert band.sources, "every band finding must carry its source ids"
    assert st.to_dict()["value"] == round(value, 3)


def test_alert_band_carries_action_and_escalation(rules, repo):
    repo.add(m("spo2", T0, 85))
    st = rules.evaluate_indicator(repo, "AST-01", "spo2", T0)
    f = st.findings[0]
    assert f.action and f.escalate is True
    assert "falls in band" in f.explanation
    assert st.to_dict()["finding_ids"] == [f.id]


def test_no_data_or_unknown_indicator_returns_none(rules, repo):
    assert rules.evaluate_indicator(repo, "AST-01", "bp_systolic", T0) is None
    repo.add(m("not_an_indicator", T0, 1))
    assert rules.evaluate_indicator(repo, "AST-01", "not_an_indicator", T0) is None


def test_future_reading_is_ignored_at_evaluation_time(rules, repo):
    repo.add(m("bp_systolic", T0 + timedelta(hours=1), 190))
    assert rules.evaluate_indicator(repo, "AST-01", "bp_systolic", T0) is None


def test_sleep_three_short_nights_rolling_caution(rules, repo):
    # each night individually is in the 5-7 h caution band; the 3-day mean < 6 h triggers the rolling rule
    repo.add_many(daily("sleep_hours", [7.5, 7.5, 7.5, 5.5, 5.5, 5.5]))
    st = rules.evaluate_indicator(repo, "AST-01", "sleep_hours", T0 + timedelta(days=5, hours=9))
    kinds = {f.kind for f in st.findings}
    assert FindingKind.ROLLING in kinds
    rolling = [f for f in st.findings if f.kind == FindingKind.ROLLING][0]
    assert rolling.status == Status.CAUTION and "3-day" in rolling.rule_id
    assert rolling.evidence["value"] == pytest.approx(5.5)


def test_sleep_week_mean_below_5_is_alert(rules, repo):
    repo.add_many(daily("sleep_hours", [4.5] * 8))
    st = rules.evaluate_indicator(repo, "AST-01", "sleep_hours", T0 + timedelta(days=7, hours=9))
    assert st.status == Status.ALERT
    rolling = [f for f in st.findings if f.kind == FindingKind.ROLLING]
    assert len(rolling) == 1, "only the most severe rolling rule is kept"
    assert "7-day" in rolling[0].rule_id and rolling[0].escalate


def test_rolling_rule_needs_history_covering_the_window(rules, repo):
    # only two days of data: a 7-day mean must not be computed from partial coverage
    repo.add_many(daily("sleep_hours", [4.5, 4.5]))
    st = rules.evaluate_indicator(repo, "AST-01", "sleep_hours", T0 + timedelta(days=1, hours=9))
    assert all(f.kind != FindingKind.ROLLING for f in st.findings)
    assert st.status == Status.ALERT  # the single-reading band still applies (< 5 h)


def test_mood_count_below_rule(rules, repo):
    repo.add_many(daily("mood", [4, 4, 4, 2, 2, 2, 2, 3]))
    st = rules.evaluate_indicator(repo, "AST-01", "mood", T0 + timedelta(days=7, hours=9))
    rolling = [f for f in st.findings if f.kind == FindingKind.ROLLING]
    assert rolling and rolling[0].status == Status.ALERT
    assert rolling[0].evidence["value"] == 4
    assert st.status == Status.ALERT  # rolling alert beats the OK band of the last reading


def test_exercise_weekly_sum_below_prescription(rules, repo):
    repo.add_many(daily("exercise_minutes_daily", [95] * 7 + [30] * 8))
    st = rules.evaluate_indicator(repo, "AST-01", "exercise_minutes_daily", T0 + timedelta(days=14, hours=9))
    rolling = [f for f in st.findings if f.kind == FindingKind.ROLLING]
    assert rolling and rolling[0].evidence["metric"] == "sum" and rolling[0].evidence["value"] < 360


def test_co2_most_extreme_one_hour_rule_wins(rules, repo):
    ts = [T0 + timedelta(minutes=10 * i) for i in range(48)]
    repo.add_many([m("cabin_co2", t, 5.0, subject="hab-1") for t in ts])
    st = rules.evaluate_indicator(repo, "hab-1", "cabin_co2", ts[-1])
    assert st.status == Status.ALERT
    rolling = [f for f in st.findings if f.kind == FindingKind.ROLLING]
    assert len(rolling) == 1 and rolling[0].evidence["threshold"] == 4.5


def test_co2_nominal_is_ok(rules, repo):
    ts = [T0 + timedelta(hours=i) for i in range(24 * 8)]
    repo.add_many([m("cabin_co2", t, 2.0, subject="hab-1") for t in ts])
    st = rules.evaluate_indicator(repo, "hab-1", "cabin_co2", ts[-1])
    assert st.status == Status.OK


def test_temperature_personal_baseline_rule(rules, repo):
    # 36.4 for two weeks then 37.5: still inside the OK band, but +1.1 vs own baseline -> CAUTION
    repo.add_many(daily("body_temperature", [36.4] * 14 + [37.5]))
    st = rules.evaluate_indicator(repo, "AST-01", "body_temperature", T0 + timedelta(days=14, hours=9))
    base = [f for f in st.findings if f.kind == FindingKind.BASELINE]
    assert base and base[0].status == Status.CAUTION
    assert base[0].evidence["delta"] == pytest.approx(1.1)
    assert st.status == Status.CAUTION


def test_temperature_baseline_needs_five_readings(rules, repo):
    repo.add_many(daily("body_temperature", [36.4] * 3 + [37.5]))
    st = rules.evaluate_indicator(repo, "AST-01", "body_temperature", T0 + timedelta(days=3, hours=9))
    assert not [f for f in st.findings if f.kind == FindingKind.BASELINE]


def test_evaluate_subject_skips_input_only_indicators(rules, repo, cfg):
    inputs = [i for i, ind in cfg.indicators.items() if ind.evaluation == "input"]
    repo.add(m("bp_systolic", T0, 118))
    for i in inputs:
        repo.add(m(i, T0, 1))
    out = rules.evaluate_subject(repo, "AST-01", T0)
    assert "bp_systolic" in out
    assert not set(inputs) & set(out)
