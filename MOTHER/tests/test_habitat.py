"""GET /api/habitat: zones with latest readings, sol extremes and statuses, on a fake database."""
from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from mother import server
from mother.db_source import TeamDatabase
from mother.habitat import habitat_report, outside_normal, rate, sol_window
from tests.fakes import FakeConn

EPOCH = datetime(2039, 1, 1)
SOL_S = 88775.244
HAB = {"id": 1, "code": "HAB-T", "name": "Test habitat", "atm_pressure_kpa": 56.5, "atm_o2_fraction_pct": 34.0,
       "atm_ppo2_inspired_mmhg": 128.0, "sol_epoch_utc": EPOCH, "sol_length_s": SOL_S, "mission_sols": 600,
       "crew_capacity": 4, "is_synthetic": 1}
SOL = 10
T0 = EPOCH + timedelta(seconds=(SOL - 1) * SOL_S)
H0 = T0.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)

ZONES = [
    {"code": "module_M1", "label": "Module M1", "zone_type": "module", "module_id": "M1", "pressurized": 1, "dose_shielding_factor": 0.05},
    {"code": "lab", "label": "Lab", "zone_type": "lab", "module_id": None, "pressurized": 1, "dose_shielding_factor": 0.1},
    {"code": "surface", "label": "Surface", "zone_type": "surface", "module_id": None, "pressurized": 0, "dose_shielding_factor": 1.0},
    {"code": "gym", "label": "Gym", "zone_type": "gym", "module_id": None, "pressurized": 1, "dose_shielding_factor": 0.1},
]
CHANNELS = [
    {"code": "ppco2", "label": "CO2 partial pressure", "category": "air", "unit": "mmHg", "value_type": "numeric", "normal_min": 1.5, "normal_max": 2.5},
    {"code": "temperature_air", "label": "Air temperature", "category": "air", "unit": "°C", "value_type": "numeric", "normal_min": 20.0, "normal_max": 25.0},
    {"code": "illuminance", "label": "Illuminance", "category": "noise_light", "unit": "lux", "value_type": "numeric", "normal_min": 150.0, "normal_max": 750.0},
    {"code": "leak_detector", "label": "Leak detector", "category": "integrity", "unit": "", "value_type": "categorical", "normal_min": None, "normal_max": None},
    {"code": "wall_temperature", "label": "Rock wall temperature", "category": "structure_thermal", "unit": "°C", "value_type": "numeric", "normal_min": None, "normal_max": None},
    {"code": "nh3", "label": "Ammonia", "category": "air", "unit": "ppm", "value_type": "numeric", "normal_min": None, "normal_max": None},
]
LIMITS = [
    {"channel_code": "ppco2", "level": "alert", "min_value": 4.5, "max_value": None, "window_hours": None, "metric": "value"},
    {"channel_code": "nh3", "level": "emergency", "min_value": 30.0, "max_value": None, "window_hours": 1.0, "metric": "mean"},
    {"channel_code": "nh3", "level": "caution", "min_value": 3.0, "max_value": None, "window_hours": 168.0, "metric": "mean"},
]


def hourly(zone, channel, hour, mean, lo=None, hi=None, sensor="", suspect=0, fault=0):
    return {"zone_code": zone, "channel_code": channel, "sensor": sensor, "hour_utc": H0 + timedelta(hours=hour),
            "value_mean": mean, "value_min": mean if lo is None else lo, "value_max": mean if hi is None else hi,
            "n_suspect": suspect, "n_fault": fault, "source_flag": "simulated"}


def raw(zone, channel, minutes, num=None, text=None, quality="ok", sensor=""):
    return {"zone_code": zone, "channel_code": channel, "sensor": sensor, "ts_utc": H0 + timedelta(minutes=minutes),
            "value_num": num, "value_text": text, "quality": quality, "source_flag": "simulated"}


HOURLY = [
    # scrubber fault mid-sol in M1, recovered by the end; redundant sensors A/B
    hourly("module_M1", "ppco2", 1, 2.0, sensor="A"), hourly("module_M1", "ppco2", 1, 2.2, sensor="B"),
    hourly("module_M1", "ppco2", 5, 6.0, hi=7.5, sensor="A"), hourly("module_M1", "ppco2", 5, 6.2, hi=7.7, sensor="B"),
    hourly("module_M1", "ppco2", 9, 2.2, sensor="A"), hourly("module_M1", "ppco2", 9, 2.4, sensor="B"),
    hourly("module_M1", "temperature_air", 9, 22.0, lo=19.0, hi=26.0),      # one noisy sample outside the band
    hourly("module_M1", "illuminance", 9, 5.0),                             # dark at night: informative only
    hourly("lab", "temperature_air", 9, 27.5, suspect=3),                   # latest value outside the band
    hourly("lab", "wall_temperature", 9, -3.0),                             # no limits, no band
    hourly("surface", "illuminance", 9, 9000.0),
    hourly("module_M1", "per_crew_thing", 9, 1.0),                          # unknown channel: ignored
]
RAW = [
    raw("lab", "nh3", 200, num=38.0), raw("lab", "nh3", 400, num=0.01),      # leak, then cleared
    raw("lab", "leak_detector", 100, text="leak"), raw("lab", "leak_detector", 500, text="ok"),
    raw("module_M1", "temperature_air", 30, num=21.0, quality="sensor_fault"),
]
LOCATIONS = [   # newest first, as the query orders them
    {"crew_code": "C1", "zone_code": "lab", "from_utc": H0 + timedelta(hours=8)},
    {"crew_code": "C2", "zone_code": "module_M1", "from_utc": H0 + timedelta(hours=7)},
    {"crew_code": "C1", "zone_code": "module_M1", "from_utc": H0 + timedelta(hours=2)},
]
EVENTS = [{"event_code": "evt-1", "event_type": "scrubber_fault", "start_utc": H0 + timedelta(hours=4),
           "end_utc": H0 + timedelta(hours=8), "sol": SOL, "zone_code": "module_M1", "crew_code": None,
           "severity": "major", "source_flag": "simulated"}]


def habitat_db(hab=(HAB,), last_hour=H0 + timedelta(hours=9)):
    return FakeConn([
        ("FROM astro_habitat.habitat ORDER BY id", list(hab)),
        ("SELECT MAX(hour_utc)", [{"t": last_hour}]),
        ("FROM astro_habitat.zone", ZONES),
        ("FROM astro_habitat.channel_limit", LIMITS),
        ("FROM astro_habitat.channel WHERE per_crew = 0", CHANNELS),
        ("FROM astro_habitat.reading_hourly WHERE habitat_id = %s AND hour_utc >=", HOURLY),
        ("FROM astro_habitat.reading WHERE habitat_id", RAW),
        ("FROM astro_habitat.crew_location", LOCATIONS),
        ("FROM astro_habitat.event", EVENTS),
    ])


@pytest.fixture
def report():
    return habitat_report(TeamDatabase(conn=habitat_db()))


def zone(report, code):
    return next(z for z in report["zones"] if z["code"] == code)


def reading(report, zone_code, channel):
    return next(r for r in zone(report, zone_code)["readings"] if r["channel"] == channel)


# ------------------------------------------------------------------ pure helpers
def test_rate_applies_instant_limits_and_ignores_long_windows():
    nh3 = CHANNELS[5]
    lims = [l for l in LIMITS if l["channel_code"] == "nh3"]
    assert rate(38.0, nh3, lims) == "alert"            # 'emergency' level maps to alert
    assert rate(5.0, nh3, lims) == "ok"                # 7-day mean limit is not applied to one value
    assert rate(None, nh3, lims) == "unrated"


def test_rate_normal_band_is_caution_only_for_health_channels():
    co2, light, wall = CHANNELS[0], CHANNELS[2], CHANNELS[4]
    co2_lims = [l for l in LIMITS if l["channel_code"] == "ppco2"]
    assert rate(2.0, co2, co2_lims) == "ok"
    assert rate(3.0, co2, co2_lims) == "caution"
    assert rate(5.0, co2, co2_lims) == "alert"
    assert rate(3.0, co2, co2_lims, use_normal=False) == "ok"
    assert rate(5.0, light, []) == "ok" and outside_normal(5.0, light)
    assert rate(-3.0, wall, []) == "unrated"


def test_sol_window_starts_at_epoch_for_sol_1():
    start, end = sol_window(HAB, 1)
    assert start == EPOCH and (end - start).total_seconds() == pytest.approx(SOL_S)


# ------------------------------------------------------------------ report
def test_report_header_and_default_sol(report):
    assert report["schema_version"] == "1.0"
    assert report["habitat"]["code"] == "HAB-T" and report["habitat"]["data_kind"] == "synthetic"
    assert report["as_of"]["sol"] == SOL and report["as_of"]["latest_sol"] == SOL
    assert report["as_of"]["from_utc"].endswith("Z")
    assert [z["code"] for z in report["zones"]] == ["module_M1", "lab", "surface", "gym"]


def test_explicit_sol_is_used_for_the_time_window():
    conn = habitat_db()
    r = habitat_report(TeamDatabase(conn=conn), sol=3)
    assert r["as_of"]["sol"] == 3 and r["as_of"]["latest_sol"] == SOL
    hourly_args = next(args for sql, args in conn.queries if "reading_hourly WHERE habitat_id = %s AND hour_utc >=" in sql)
    start, end = sol_window(HAB, 3)
    assert hourly_args[2] == end and hourly_args[1] <= start


def test_redundant_sensors_are_averaged_and_listed(report):
    co2 = reading(report, "module_M1", "ppco2")
    assert co2["value"] == pytest.approx(2.3)
    assert co2["sensors"] == {"A": 2.2, "B": 2.4}
    assert co2["max"] == 7.7 and co2["unit"] == "mmHg"


def test_fault_earlier_in_the_sol_flags_the_zone_but_not_the_latest_value(report):
    co2 = reading(report, "module_M1", "ppco2")
    assert co2["status"] == "ok" and co2["worst_status"] == "alert"
    m1 = zone(report, "module_M1")
    assert m1["status"] == "alert" and m1["now_status"] == "ok"
    assert report["overall_status"] == "alert"


def test_single_noisy_sample_does_not_raise_a_caution(report):
    temp = reading(report, "module_M1", "temperature_air")
    assert temp["min"] == 19.0 and temp["max"] == 26.0
    assert temp["status"] == "ok" and temp["worst_status"] == "ok"
    assert temp["quality"] == "sensor_fault"            # raw reading flagged it


def test_informative_channels_report_outside_normal_without_caution(report):
    light = reading(report, "module_M1", "illuminance")
    assert light["outside_normal"] is True and light["status"] == "ok"


def test_latest_value_outside_band_is_caution_and_suspect_quality_is_kept(report):
    temp = reading(report, "lab", "temperature_air")
    assert temp["status"] == "caution" and temp["quality"] == "suspect"


def test_raw_only_and_text_channels(report):
    nh3 = reading(report, "lab", "nh3")
    assert nh3["value"] == 0.01 and nh3["status"] == "ok" and nh3["worst_status"] == "alert"
    leak = reading(report, "lab", "leak_detector")
    assert leak["text"] == "ok" and leak["value"] is None
    assert leak["status"] == "ok" and leak["worst_status"] == "alert"
    assert reading(report, "lab", "wall_temperature")["status"] == "unrated"
    assert zone(report, "lab")["status"] == "alert"


def test_unknown_channels_are_ignored_and_empty_zone_has_no_data(report):
    assert all(r["channel"] != "per_crew_thing" for r in zone(report, "module_M1")["readings"])
    gym = zone(report, "gym")
    assert gym["readings"] == [] and gym["status"] == "no_data" and gym["now_status"] == "no_data"


def test_occupants_use_each_crew_members_latest_location(report):
    assert zone(report, "lab")["occupants"] == ["C1"]
    assert zone(report, "module_M1")["occupants"] == ["C2"]


def test_events_are_listed(report):
    assert report["events"][0]["type"] == "scrubber_fault" and report["events"][0]["zone"] == "module_M1"
    assert report["events"][0]["start_utc"].endswith("Z")


def test_missing_habitat_raises_key_error():
    with pytest.raises(KeyError):
        habitat_report(TeamDatabase(conn=habitat_db(hab=())))


# ------------------------------------------------------------------ HTTP
@pytest.fixture
def client(monkeypatch):
    return TestClient(server.create_app())


def test_endpoint_returns_503_without_database(client):
    r = client.get("/api/habitat")
    assert r.status_code == 503 and "Cannot reach the team database" in r.json()["error"]


def test_endpoint_with_fake_database(client, monkeypatch):
    import mother.db_source
    monkeypatch.setattr(mother.db_source, "TeamDatabase", lambda: TeamDatabase(conn=habitat_db()))
    r = client.get("/api/habitat", params={"sol": 10})
    assert r.status_code == 200 and r.headers["cache-control"] == "no-store"
    body = r.json()
    assert body["as_of"]["sol"] == 10 and len(body["zones"]) == 4
    assert "/api/habitat" in client.get("/").json()["endpoints"]
