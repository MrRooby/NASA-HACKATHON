"""Organ cards: the UI contract (MOTHER/UI_CONTRACT.md v1.1)."""
from __future__ import annotations

import json

import pytest

from mother import clinical as C
from mother import organs as O
from mother.db_source import TeamDatabase
from tests.fakes import PERSON_ROWS, person_db

ORGAN_CODES = ["brain", "eyes", "heart", "lungs", "blood", "kidneys", "gut", "musculoskeletal", "limbs", "exposure"]
TOP_KEYS = {"schema_version", "subject", "as_of", "devices", "overall_status", "top_message", "organs"}
CARD_KEYS = {"organ", "label", "status", "headline", "metrics", "why", "action"}


def assert_contract(card: dict) -> None:
    assert TOP_KEYS <= set(card)
    assert card["schema_version"] == "1.1"
    assert [o["organ"] for o in card["organs"]] == ORGAN_CODES, "always 10 cards in a fixed order"
    for o in card["organs"]:
        assert CARD_KEYS <= set(o)
        assert o["status"] in ("ok", "caution", "alert", "no_data")
        assert len(o["metrics"]) <= 3
        for mt in o["metrics"]:
            assert set(mt) == {"name", "value", "unit", "status"}
        if o["status"] in ("ok", "no_data"):
            assert o["action"] is None
    assert card["overall_status"] in ("ok", "caution", "alert", "no_data")
    json.dumps(card)


def test_build_cards_with_mixed_checks():
    checks = [C.check_potassium(6.2), C.check_map(120, 80), C.check_shock_index(60, 120), C.check_spo2(97),
              C.check_stone_risk(280, 45, 300, 2.0, True), C.check_hydration(1.025, None),
              C.check_albumin_creatinine(10), C.check_egfr(1.0, 40, True)]
    card = O.build_cards(checks, {"subject": {"code": "X"}, "as_of": {"sol": 1},
                                  "devices": [{"limb": "left_arm", "status": "alert"}]})
    assert_contract(card)
    by = {o["organ"]: o for o in card["organs"]}
    assert by["heart"]["status"] == "alert" and by["heart"]["headline"].startswith("Moderate high potassium")
    assert by["heart"]["metrics"][0]["name"].startswith("Potassium"), "worst check first"
    assert by["heart"]["action"] and by["heart"]["why"]
    assert by["lungs"]["status"] == "ok" and by["lungs"]["headline"] == "All 1 check normal."
    assert by["kidneys"]["status"] == "alert" and len(by["kidneys"]["metrics"]) == 3
    assert by["eyes"]["status"] == "no_data" and "needs" in by["eyes"]["headline"]
    assert card["overall_status"] == "alert"
    assert card["top_message"] == by["heart"]["headline"]
    assert card["devices"] == [{"limb": "left_arm", "status": "alert"}]
    assert "devices" not in card["subject"]


def test_device_problem_never_colours_the_limbs_card():
    card = O.build_cards([], {"devices": [{"limb": "right_arm", "state": "disconnected", "status": "alert"}]})
    assert {o["status"] for o in card["organs"]} == {"no_data"}
    assert card["devices"][0]["status"] == "alert"


def test_no_data_card_does_not_claim_all_checks_normal():
    card = O.build_cards([], {})
    assert card["overall_status"] == "no_data"
    assert card["top_message"].startswith("No data yet")


def test_eeg_sleep_replaces_sleep_log_on_brain_card():
    sleep_log = C.Check("brain", "sleep_7d", "Sleep (7-day average)", 7.0, "h", C.OK, "ok")
    card = O.build_cards([sleep_log, C.check_sleep_eeg(80, 6.5, 15, 7)], {})
    brain = card["organs"][0]
    assert [c["code"] for c in brain["checks"]] == ["sleep_eeg"]
    assert brain["status"] == "caution"


def test_person_checks_from_observation_rows():
    series = {}
    for r in PERSON_ROWS:
        series.setdefault(r["c"], []).append(r)
    checks = {c.code: c for c in O.person_checks({"series": series, "sex": "F", "age": 35.0})}
    assert checks["potassium"].status == C.ALERT
    assert checks["egfr"].status == C.OK
    assert checks["aki_kdigo"].value == 0
    assert checks["sleep_7d"].value == pytest.approx(7.5)
    assert checks["vo2max_pct"].value == pytest.approx(34 / 45 * 100)
    assert checks["vo2max_pct"].status == C.ALERT       # < 80 % of preflight
    assert checks["map"].status == C.OK and checks["shock_index"].status == C.OK


def test_habitat_checks_and_cross_checks_detect_crush_pattern():
    def r(v=None, t=None):
        return {"v": v, "t": t}
    h = {"series": {"urine_volume_24h": [r(1.8)], "urine_specific_gravity": [r(1.031)],
                    "urine_dipstick_blood": [r(t="positive")], "feces_bristol": [r(1), r(1), r(2)]},
         "dose": {"v": 120.0}, "co2": 3.4}
    checks = O.habitat_checks(h, female=False)
    by = {c.code: c for c in checks}
    assert by["hydration"].status == C.ALERT and by["urine_blood"].status == C.CAUTION
    assert by["bristol"].status == C.ALERT                # 3 abnormal days in a row
    assert by["dose_career"].status == C.OK and by["co2"].status == C.ALERT
    limbs = {"left_arm": {"hr": 70, "spo2": 98, "pi": 4}, "right_arm": {"hr": 70, "spo2": 98, "pi": 4},
             "left_leg": {"hr": 0, "spo2": None, "pi": 0.2}, "right_leg": {"hr": 70, "spo2": 98, "pi": 4}}
    cross = {c.code: c for c in O.cross_checks(checks + [C.check_potassium(6.1)], limbs)}
    assert cross["perfusion_left_leg"].status == C.ALERT
    assert cross["crush_syndrome"].status == C.ALERT


def test_wearable_checks_average_sleep_sessions():
    w = {"sleep": [{"eff": 80, "duration_min": 360, "deep": 15}, {"eff": 90, "duration_min": 420, "deep": None},
                   {"eff": None, "duration_min": 0, "deep": None}]}
    (c,) = O.wearable_checks(w)
    assert c.value == pytest.approx(85) and c.inputs["nights"] == 2 and c.status == C.OK
    assert O.wearable_checks(None) == []


def test_organ_report_against_fake_database():
    db = TeamDatabase(conn=person_db())
    card = O.organ_report(db, "CREW-1")
    assert_contract(card)
    assert card["subject"]["code"] == "CREW-1" and card["subject"]["data_kind"] == "synthetic"
    by = {o["organ"]: o for o in card["organs"]}
    assert by["heart"]["status"] == "alert"
    assert by["eyes"]["status"] == "no_data"
    with pytest.raises(KeyError):
        O.organ_report(db, "NOBODY")


def test_overview_lists_every_subject():
    rows = O.overview(TeamDatabase(conn=person_db(known=("CREW-1", "CREW-2"))))
    assert [r["subject"]["code"] for r in rows] == ["CREW-1", "CREW-2"]
    assert set(rows[0]["organs"]) == set(ORGAN_CODES)
