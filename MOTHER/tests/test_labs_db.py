"""Lab classification (CSV + database flavour) and the read-only DB adapters, all against fakes."""
from __future__ import annotations

import dataclasses
from datetime import timedelta

import pytest

from mother import db as dbmod
from mother import labs
from mother.db_mission import database_version, load_mission, pick_mission
from mother.db_source import TeamDatabase
from mother.models import FindingKind, Status
from tests.conftest import T0
from tests.fakes import FakeConn

CSV_HEADER = "SUBJECT_ID,TEST_TYPE,ANALYTE,VALUE,RANGE_MIN,RANGE_MAX,UNITS,timepoint\n"


def test_timepoint_ordering_puts_preflight_before_postflight():
    tps = ["R+45", "L-3", "R+1", "L-92", "junk"]
    assert sorted(tps, key=labs._tp_key) == ["L-92", "L-3", "junk", "R+1", "R+45"]


def test_lab_panel_classifies_against_row_reference_range(tmp_path, cfg):
    f = tmp_path / "cmp.csv"
    f.write_text(CSV_HEADER +
                 "C9,CMP,GLUCOSE,90,70,100,mg/dL,L-3\n"
                 "C9,CMP,GLUCOSE,110,70,100,mg/dL,R+1\n"       # high once -> caution
                 "C9,CMP,SODIUM,150,135,145,mmol/L,L-3\n"
                 "C9,CMP,SODIUM,151,135,145,mmol/L,R+1\n"      # high twice in a row -> alert
                 "C9,CMP,CALCIUM,9.5,8.6,10.3,mg/dL,R+1\n"
                 "C9,CMP,CALCIUM,,8.6,10.3,mg/dL,R+45\n"       # missing value is not abnormal
                 "OTHER,CMP,GLUCOSE,500,70,100,mg/dL,R+1\n", encoding="utf-8")
    c = dataclasses.replace(cfg, lab_panels={"files": [str(f)]})
    panel, findings = labs.lab_panel(c, "C9", "AST-09", T0)
    by = {p["analyte"]: p for p in panel}
    assert set(by) == {"GLUCOSE", "SODIUM", "CALCIUM"}, "other subjects' rows must not leak in"
    assert by["GLUCOSE"]["latest_status"] == "caution"
    assert [p["status"] for p in by["SODIUM"]["points"]] == ["caution", "alert"]
    assert by["CALCIUM"]["latest_status"] == "ok"
    fs = {f.rule_id: f for f in findings}
    assert set(fs) == {"lab.CMP.GLUCOSE", "lab.CMP.SODIUM"}
    assert fs["lab.CMP.SODIUM"].escalate and fs["lab.CMP.SODIUM"].kind == FindingKind.LAB
    assert fs["lab.CMP.GLUCOSE"].evidence["real_data"] is True


def test_lab_panel_with_missing_files_is_empty(cfg, tmp_path):
    c = dataclasses.replace(cfg, lab_panels={"files": [str(tmp_path / "missing.csv")]})
    assert labs.lab_panel(c, "C1", "AST-01", T0) == ([], [])


def test_db_lab_panel_uses_database_flags():
    rows = [
        {"category": "lab_cmp", "indicator_code": "potassium", "indicator_label": "Potassium", "timepoint_label": tp,
         "time_order": i, "value": v, "unit": "mmol/L", "ref_min": 3.5, "ref_max": 5.1, "ref_flag": flag,
         "ref_basis": "sex:F", "ref_conflict": 0, "source_id": "osdr_osd575"}
        for i, (tp, v, flag) in enumerate([("L-3", 4.0, "in_range"), ("R+1", 5.4, "above"), ("R+45", 5.5, "above")])
    ] + [{"category": "lab_cbc", "indicator_code": "wbc", "indicator_label": "WBC", "timepoint_label": "R+1",
          "time_order": 1, "value": 1.0, "unit": "K/uL", "ref_min": 3.8, "ref_max": 10.8, "ref_flag": "critical_low",
          "ref_basis": None, "ref_conflict": 0, "source_id": "osdr_osd569"}]
    db = TeamDatabase(conn=FakeConn([("FROM astro_api.observations", rows)]))
    panel, findings = db.lab_panel("I4-C001", "AST-01", T0)
    by = {p["code"]: p for p in panel}
    assert [p["status"] for p in by["potassium"]["points"]] == ["ok", "caution", "alert"]
    assert by["wbc"]["latest_status"] == "alert" and by["wbc"]["panel"] == "CBC"
    assert {f.status for f in findings} == {Status.ALERT}


def test_settings_requires_credentials(monkeypatch):
    import dotenv
    monkeypatch.setattr(dotenv, "load_dotenv", lambda *a, **k: False)
    for k in ("DB_HOST", "DB_USER", "DB_PASSWORD", "DB_PORT", "DB_NAME"):
        monkeypatch.delenv(k, raising=False)
    with pytest.raises(RuntimeError, match="DB_HOST"):
        dbmod.settings()
    monkeypatch.setenv("DB_HOST", "db.example")
    monkeypatch.setenv("DB_USER", "u")
    monkeypatch.setenv("DB_PASSWORD", "p")
    s = dbmod.settings()
    assert s == {"host": "db.example", "port": 3306, "user": "u", "password": "p", "database": "astro_api"}


def test_pick_mission_and_database_version():
    missions = [{"mission_code": "SHORT", "mission_name": "s", "environment": "iss", "duration_days": 10,
                 "is_synthetic": 1, "n_subjects": 2},
                {"mission_code": "LONG", "mission_name": "l", "environment": "iss", "duration_days": 90,
                 "is_synthetic": 1, "n_subjects": 2}]
    db = TeamDatabase(conn=FakeConn([("FROM astro_api.missions", missions),
                                     ("FROM astro_api.import_log", [{"m": "2026-11-14", "n": 3}])]))
    assert pick_mission(db)["mission_code"] == "LONG"
    with pytest.raises(LookupError):
        pick_mission(db, "SHORT")
    assert database_version(db) == "2026-11-14|3"


def test_load_mission_maps_codes_and_preflight(cfg):
    launch_row = {"subject_code": "S1", "indicator_code": "body_mass", "anchor": "launch", "day_offset": -10,
                  "measured_at": (T0 - timedelta(days=10)).replace(tzinfo=None, hour=8), "value": 70.0, "unit": "kg",
                  "phase": "pre", "sample_type": None, "is_synthetic": 1, "source_id": "synthetic"}
    hr_row = dict(launch_row, indicator_code="heart_rate_resting", day_offset=4, measured_at=None, value=60.0,
                  unit="bpm", phase="in")
    db = TeamDatabase(conn=FakeConn([
        ("FROM astro_api.missions", [{"mission_code": "M1", "mission_name": "Mission 1", "environment": "iss",
                                      "duration_days": 60, "is_synthetic": 1, "n_subjects": 1}]),
        ("FROM astro_api.subjects WHERE mission_code", [{"subject_code": "S1", "sex": "F", "age_band": "30-39"}]),
        ("FROM astro_api.observations", [launch_row, hr_row]),
        ("FROM astro_core.env_observation", [{"ind": "cabin_co2", "t": T0.replace(tzinfo=None, hour=3), "v": 2.1,
                                              "syn": 1, "src": "synthetic"}]),
    ]))
    mission, ms, meta = load_mission(db, cfg)
    assert mission.launch == T0 and mission.planned_days == 60 and mission.environment_id == "iss"
    assert mission.crew[0].preflight == {"body_mass_kg": 70.0}
    ids = {(x.subject_id, x.indicator_id) for x in ms}
    assert ("S1", "body_mass_kg") in ids and ("hab-1", "cabin_co2") in ids
    hr = next(x for x in ms if x.indicator_id == "heart_rate_resting")
    assert hr.ts == T0 + timedelta(days=4, hours=8) and hr.simulated
    assert meta["is_synthetic"] is True


# ---------------------------------------------------------------- B1: PVT from the database feeds MOTHER's reaction-time analytics
def test_pvt_reaction_ms_is_mapped_to_reaction_time_ms():
    from mother.db_mission import DB_TO_MOTHER
    assert DB_TO_MOTHER["pvt_reaction_ms"] == "reaction_time_ms"


def _pvt_db(rows):
    base = {"subject_code": "S1", "indicator_code": "pvt_reaction_ms", "anchor": "launch", "unit": "ms",
            "sample_type": None, "is_synthetic": 1, "source_id": "synthetic"}
    return TeamDatabase(conn=FakeConn([
        ("FROM astro_api.missions", [{"mission_code": "M1", "mission_name": "Mission 1", "environment": "iss",
                                      "duration_days": 60, "is_synthetic": 1, "n_subjects": 1}]),
        ("FROM astro_api.subjects WHERE mission_code", [{"subject_code": "S1", "sex": "F", "age_band": "30-39"}]),
        ("FROM astro_api.observations", [dict(base, **r) for r in rows]),
        ("FROM astro_core.env_observation", []),
    ]))


def test_db_pvt_preflight_gives_baseline_and_reaction_time_pct_change(cfg):
    from mother.derive import derive_all
    from mother.repository import InMemoryRepository
    rows = [{"day_offset": -5, "measured_at": (T0 - timedelta(days=5)).replace(tzinfo=None, hour=8), "value": 280.0, "phase": "pre"},
            {"day_offset": -1, "measured_at": (T0 - timedelta(days=1)).replace(tzinfo=None, hour=8), "value": 280.0, "phase": "pre"},
            {"day_offset": 10, "measured_at": (T0 + timedelta(days=10)).replace(tzinfo=None, hour=8), "value": 336.0, "phase": "in"}]
    mission, ms, _ = load_mission(_pvt_db(rows), cfg)
    assert mission.crew[0].preflight == {"reaction_time_ms": 280.0}
    repo = InMemoryRepository()
    repo.add_many(ms)
    ov = derive_all(repo, mission, cfg, T0 + timedelta(days=11))
    assert ov.latest("S1", "reaction_time_pct_change").value == pytest.approx(20.0)


def test_reaction_time_baseline_falls_back_to_first_three_in_mission_values(cfg):
    from mother.derive import derive_all
    from mother.repository import InMemoryRepository
    days = [(2, 280.0), (4, 282.0), (6, 278.0), (20, 336.0)]
    rows = [{"day_offset": d, "measured_at": (T0 + timedelta(days=d)).replace(tzinfo=None, hour=8), "value": v, "phase": "in"}
            for d, v in days]
    mission, ms, _ = load_mission(_pvt_db(rows), cfg)
    assert "reaction_time_ms" not in mission.crew[0].preflight
    repo = InMemoryRepository()
    repo.add_many(ms)
    ov = derive_all(repo, mission, cfg, T0 + timedelta(days=25))
    assert ov.latest("S1", "reaction_time_pct_change").value == pytest.approx((336 / 280 - 1) * 100)
    # fewer than 3 values: no baseline yet, nothing derived
    mission2, ms2, _ = load_mission(_pvt_db(rows[:2]), cfg)
    repo2 = InMemoryRepository()
    repo2.add_many(ms2)
    assert derive_all(repo2, mission2, cfg, T0 + timedelta(days=25)).latest("S1", "reaction_time_pct_change") is None
