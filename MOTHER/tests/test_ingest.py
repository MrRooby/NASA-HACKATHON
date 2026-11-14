"""Quality gate: physically impossible values never reach the rules engine."""
from __future__ import annotations

from datetime import timedelta

import pytest

from mother.ingest import PLAUSIBLE, STUCK_RUN, check_sensor_health, ingest
from mother.models import FindingKind, Status
from tests.conftest import T0, m

NOW = T0 + timedelta(days=1)


@pytest.mark.parametrize("ind,value", [
    ("heart_rate_resting", 400), ("heart_rate_resting", 0), ("bp_systolic", 400), ("body_temperature", 50),
    ("body_temperature", 25), ("spo2", 101), ("spo2", 20), ("sleep_hours", 25), ("sleep_hours", -1),
    ("mood", 0), ("mood", 9), ("cabin_co2", 0), ("glucose_fasting", 2000),
])
def test_impossible_values_are_rejected_with_dq_finding(repo, ind, value):
    rep = ingest(repo, [m(ind, T0, value)], now=NOW)
    assert not rep.accepted and len(rep.rejected) == 1
    assert rep.rejected[0][1].startswith("implausible")
    f = rep.findings[0]
    assert f.kind == FindingKind.DATA_QUALITY and f.status == Status.CAUTION
    assert f.rule_id == "dq.implausible"
    assert repo.latest("AST-01", ind) is None, "rejected value must not be stored"


def test_plausible_but_abnormal_values_are_accepted(repo):
    rep = ingest(repo, [m("heart_rate_resting", T0, 150), m("spo2", T0, 85), m("body_temperature", T0, 40.5)], now=NOW)
    assert len(rep.accepted) == 3 and not rep.rejected


def test_plausibility_limits_are_inclusive(repo):
    lo, hi = PLAUSIBLE["mood"]
    rep = ingest(repo, [m("mood", T0, lo), m("mood", T0 + timedelta(hours=1), hi)], now=NOW)
    assert len(rep.accepted) == 2


def test_nan_and_future_timestamps(repo):
    rep = ingest(repo, [m("heart_rate_resting", T0, float("nan")),
                        m("heart_rate_resting", NOW + timedelta(hours=1), 60),
                        m("heart_rate_resting", NOW + timedelta(minutes=4), 61)], now=NOW)
    reasons = sorted(r for _, r in rep.rejected)
    assert reasons == ["not_a_number", "timestamp_in_future"]
    assert len(rep.accepted) == 1  # within the 5 min clock-skew tolerance


def test_diastolic_not_below_systolic_is_rejected(repo):
    rep = ingest(repo, [m("bp_systolic", T0, 110), m("bp_diastolic", T0, 115),
                        m("bp_systolic", NOW, 120), m("bp_diastolic", NOW, 80)], now=NOW)
    assert [r for _, r in rep.rejected] == ["implausible: diastolic >= systolic"]
    assert len(rep.accepted) == 3


def test_duplicates_are_counted_not_stored_twice(repo):
    ingest(repo, [m("mood", T0, 4)], now=NOW)
    rep = ingest(repo, [m("mood", T0, 2)], now=NOW)
    assert rep.duplicates == 1 and repo.latest("AST-01", "mood").value == 4


def test_unknown_indicators_pass_and_naive_timestamps_become_utc(repo):
    from datetime import datetime
    rep = ingest(repo, [m("some_new_sensor", datetime(2026, 9, 1, 6), 12345)], now=NOW)
    assert len(rep.accepted) == 1 and rep.accepted[0].ts.tzinfo is not None
    d = rep.to_dict()
    assert d["accepted"] == 1 and d["rejected"] == [] and d["duplicates"] == 0


def test_sensor_dropout_and_stuck_detection(repo):
    hab = "hab-1"
    # CO2 stuck at one value for STUCK_RUN hours; ppO2 silent for 5 h
    repo.add_many([m("cabin_co2", T0 + timedelta(hours=i), 2.2, subject=hab) for i in range(STUCK_RUN)])
    repo.add(m("cabin_ppo2", T0 + timedelta(hours=STUCK_RUN - 6), 150, subject=hab))
    now = T0 + timedelta(hours=STUCK_RUN - 1, minutes=30)
    rule_ids = {(f.indicator_id, f.rule_id) for f in check_sensor_health(repo, hab, now)}
    assert ("cabin_co2", "dq.stuck") in rule_ids
    assert ("cabin_ppo2", "dq.dropout") in rule_ids


def test_noisy_sensor_is_healthy(repo):
    hab = "hab-1"
    repo.add_many([m("cabin_co2", T0 + timedelta(hours=i), 2.0 + 0.01 * (i % 3), subject=hab) for i in range(24)])
    assert check_sensor_health(repo, hab, T0 + timedelta(hours=23, minutes=30)) == []
