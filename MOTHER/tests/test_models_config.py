from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest

from mother.config import MOTHER_DIR, Band, load_config
from mother.models import Finding, FindingKind, Mission, Status, utc, worst
from mother.repository import InMemoryRepository
from tests.conftest import T0, m


def test_status_severity_order_and_worst():
    assert Status.OK.severity < Status.CAUTION.severity < Status.ALERT.severity
    assert Status.OK < Status.ALERT
    assert worst([Status.OK, Status.ALERT, Status.CAUTION]) == Status.ALERT
    assert worst([]) == Status.OK
    assert sorted([Status.ALERT, Status.OK, Status.CAUTION]) == [Status.OK, Status.CAUTION, Status.ALERT]


@pytest.mark.xfail(reason="BUG: Status subclasses str and only overrides __lt__; '>' and max() fall back to "
                          "alphabetical str comparison, so Status.ALERT > Status.OK is False (models.py:24)",
                   strict=True)
def test_status_greater_than_is_consistent_with_severity():
    assert Status.ALERT > Status.OK
    assert max([Status.OK, Status.ALERT]) == Status.ALERT


def test_utc_normalises_naive_and_aware():
    naive = datetime(2026, 1, 1, 12, 0)
    assert utc(naive).tzinfo == timezone.utc
    plus2 = datetime(2026, 1, 1, 14, 0, tzinfo=timezone(timedelta(hours=2)))
    assert utc(plus2) == datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)


def test_mission_flight_day_and_dates():
    ms = Mission("X", "iss", T0, 10)
    assert ms.flight_day(T0) == 1
    assert ms.flight_day(T0 + timedelta(days=4, hours=23)) == 5
    assert ms.date_of_flight_day(1) == T0.date()
    assert ms.end == T0 + timedelta(days=10)
    with pytest.raises(KeyError):
        ms.astronaut("nobody")


def test_finding_id_is_stable_and_to_dict_is_json_serialisable():
    f = Finding("AST-01", FindingKind.THRESHOLD, Status.ALERT, "t", "band.x", T0, indicator_id="x",
                evidence={"when": T0, "v": 1.234567, "st": Status.OK, "tup": (1, 2)})
    g = Finding("AST-01", FindingKind.THRESHOLD, Status.CAUTION, "other", "band.x", T0, indicator_id="x")
    assert f.id == g.id and len(f.id) == 12
    d = f.to_dict()
    json.dumps(d)
    assert d["kind"] == "threshold" and d["status"] == "alert"
    assert d["evidence"] == {"when": T0.isoformat(), "v": 1.2346, "st": "ok", "tup": [1, 2]}


def test_band_contains_min_inclusive_max_exclusive():
    b = Band(Status.OK, "source", "", min=90, max=120)
    assert b.contains(90) and b.contains(119.99)
    assert not b.contains(120) and not b.contains(89.9)
    assert Band(Status.ALERT, "source", "", min=None, max=None).contains(-1e9)


def test_config_loads_and_bands_are_contiguous(cfg):
    for core in ("bp_systolic", "bp_diastolic", "heart_rate_resting", "glucose_fasting", "body_temperature",
                 "sleep_hours", "mood", "spo2"):
        assert core in cfg.indicators, core
    for ind in cfg.indicators.values():
        if not ind.bands:
            continue
        assert ind.bands[0].min is None, f"{ind.id}: lowest band must be open-ended"
        for a, b in zip(ind.bands, ind.bands[1:]):
            assert a.max == b.min, f"gap/overlap in {ind.id}"
        for b in ind.bands:
            assert b.basis in ("source", "team_assumption"), ind.id
    assert {"iss", "mars_surface", "lunar_surface"} <= set(cfg.environments)
    # MOTHER auxiliary indicators extend but never override the shared ones
    aux = {d["id"] for d in cfg.knowledge.get("auxiliary_indicators", [])}
    assert aux, "knowledge graph should define auxiliary indicators"


def test_bundled_shared_config_copy_loads():
    """MOTHER/config/shared is used when only the MOTHER folder is downloaded; it must stay loadable."""
    c = load_config(str(MOTHER_DIR / "config" / "shared"), str(MOTHER_DIR / "config"))
    assert "bp_systolic" in c.indicators and "iss" in c.environments


def test_indicator_band_for(cfg):
    sbp = cfg.indicator("bp_systolic")
    assert sbp.band_for(115).status == Status.OK
    assert sbp.band_for(125).status == Status.CAUTION
    assert sbp.band_for(185).status == Status.ALERT
    assert sbp.band_for(80).status == Status.CAUTION


def test_repository_ordering_dedup_and_windows(repo):
    t = T0
    assert repo.add(m("hr", t + timedelta(hours=2), 2))
    assert repo.add(m("hr", t, 0))
    assert repo.add(m("hr", t + timedelta(hours=1), 1))
    assert not repo.add(m("hr", t, 99)), "duplicate timestamp must be rejected (first write wins)"
    assert [x.value for x in repo.series("AST-01", "hr")] == [0, 1, 2]
    assert [x.value for x in repo.series("AST-01", "hr", start=t + timedelta(hours=1))] == [1, 2]
    assert [x.value for x in repo.series("AST-01", "hr", end=t + timedelta(hours=1))] == [0, 1]
    assert repo.latest("AST-01", "hr").value == 2
    assert repo.latest("AST-01", "hr", at=t + timedelta(minutes=90)).value == 1
    assert repo.latest("AST-01", "hr", at=t - timedelta(hours=1)) is None
    assert repo.exists("AST-01", "hr", t) and not repo.exists("AST-01", "hr", t + timedelta(minutes=1))
    assert repo.subjects() == ["AST-01"] and repo.indicators_for("AST-01") == ["hr"]
    assert repo.series("nobody", "hr") == [] and repo.latest("nobody", "hr") is None
