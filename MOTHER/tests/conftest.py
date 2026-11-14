"""Shared fixtures. Every test runs offline: any attempt to open a database connection fails loudly."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from mother.config import load_config
from mother.engine import Mother
from mother.models import Astronaut, Measurement, Mission
from mother.repository import InMemoryRepository
from mother.simulator import MissionSimulator, Scenario

T0 = datetime(2026, 9, 1, tzinfo=timezone.utc)


class NetworkBlocked(RuntimeError):
    pass


def _blocked(*_a, **_k):
    raise NetworkBlocked("database access is disabled in tests")


@pytest.fixture(autouse=True)
def no_database(monkeypatch):
    """Make every code path that would reach the team MariaDB raise instead."""
    import pymysql

    import mother.data_map
    import mother.db
    import mother.db_source

    monkeypatch.setattr(pymysql, "connect", _blocked)
    monkeypatch.setattr(mother.db, "connect", _blocked)
    monkeypatch.setattr(mother.db_source, "connect", _blocked)
    monkeypatch.setattr(mother.data_map, "connect", _blocked)


@pytest.fixture(scope="session")
def cfg():
    return load_config()


def m(ind: str, ts: datetime, value: float, subject: str = "AST-01", **kw) -> Measurement:
    return Measurement(subject, ind, ts, float(value), **kw)


def daily(ind: str, values, start: datetime = T0, subject: str = "AST-01", hour: int = 8) -> list[Measurement]:
    return [m(ind, start + timedelta(days=i, hours=hour), v, subject) for i, v in enumerate(values)]


@pytest.fixture
def repo():
    return InMemoryRepository()


@pytest.fixture
def astronaut():
    return Astronaut("AST-01", "Test Astronaut", "hab-1",
                     {"body_mass_kg": 70.0, "vo2max_ml_kg_min": 45.0, "strength_index": 100.0,
                      "reaction_time_ms": 280.0}, prior_career_dose_mSv=50.0)


@pytest.fixture
def mission(astronaut):
    return Mission("TEST", "iss", T0, 60, [astronaut])


SIM_DAYS = 40
SIM_SCENARIOS = [
    Scenario("insomnia", 30, 8, "AST-02"),
    Scenario("co2_scrubber_failure", 35, 3),
    Scenario("sensor_fault", 36, 1),
    Scenario("infection", 33, 4, "AST-04"),
]


@pytest.fixture(scope="session")
def sim_run(cfg):
    """A seeded 40-day simulated ISS mission ingested into MOTHER (shared, read-only)."""
    sim = MissionSimulator(days=SIM_DAYS, seed=42, scenarios=SIM_SCENARIOS, cfg=cfg)
    measurements = sim.generate()
    mother = Mother(InMemoryRepository(), sim.mission, cfg)
    report = mother.ingest(measurements, now=sim.time_of(SIM_DAYS + 1))
    return sim, mother, report, measurements
