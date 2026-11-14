"""Published clinical formulas: values checked against hand calculations / reference examples."""
from __future__ import annotations

import pytest

from mother import clinical as C


def test_egfr_ckd_epi_2021_reference_values():
    # Male, 50 y, Scr 1.0 mg/dL -> ~92 (Inker 2021 calculator); female, 50 y, Scr 0.7 -> 142 x 0.9938^50 x 1.012 = ~105.3
    assert C.egfr_ckd_epi_2021(1.0, 50, female=False) == pytest.approx(92.0, abs=0.6)
    assert C.egfr_ckd_epi_2021(0.7, 50, female=True) == pytest.approx(105.3, abs=0.2)
    # monotonic: higher creatinine -> lower filtration
    assert C.egfr_ckd_epi_2021(2.0, 50, False) < C.egfr_ckd_epi_2021(1.0, 50, False)


@pytest.mark.parametrize("scr,status", [(1.0, C.OK), (1.6, C.CAUTION), (3.0, C.ALERT)])
def test_check_egfr_staging(scr, status):
    c = C.check_egfr(scr, 50, False)
    assert c.status == status and c.organ == "kidneys"
    assert (c.action is None) == (status == C.OK)


def test_check_egfr_falls_back_to_lab_value_or_none():
    c = C.check_egfr(1.0, None, None, lab_egfr=55)
    assert c.value == 55 and c.status == C.CAUTION and "lab" in c.inputs["how"]
    assert C.check_egfr(1.0, None, None) is None


@pytest.mark.parametrize("base,cur,rise,stage,status", [
    (1.0, 1.1, None, 0, C.OK),
    (1.0, 1.1, 0.3, 1, C.CAUTION),     # +0.3 mg/dL in 48 h
    (1.0, 1.5, None, 1, C.CAUTION),
    (1.0, 2.0, None, 2, C.ALERT),
    (1.0, 3.0, None, 3, C.ALERT),
    (1.5, 4.0, None, 3, C.ALERT),      # absolute >= 4.0 mg/dL
])
def test_aki_kdigo(base, cur, rise, stage, status):
    c = C.check_aki_kdigo(base, cur, rise)
    assert (c.value, c.status) == (stage, status)


def test_corrected_calcium_payne():
    assert C.corrected_calcium(8.0, 2.0) == pytest.approx(9.6)
    assert C.check_calcium(8.0, 2.0).status == C.OK
    assert C.check_calcium(8.0, None).value == 8.0          # no albumin -> uncorrected
    assert C.check_calcium(12.5, 4.0).status == C.ALERT


def test_anion_gap_and_map_and_shock_index():
    ag = C.check_anion_gap(140, 100, 24)
    assert ag.value == 16 and ag.status == C.OK
    assert C.check_anion_gap(140, 95, 20).status == C.CAUTION
    mp = C.check_map(120, 80)
    assert mp.value == pytest.approx(93.333, abs=1e-3) and mp.status == C.OK
    assert C.check_map(80, 55).status == C.ALERT              # MAP 63
    assert C.check_shock_index(60, 120).value == pytest.approx(0.5)
    assert C.check_shock_index(95, 100).status == C.CAUTION
    assert C.check_shock_index(120, 100).status == C.ALERT
    assert C.check_shock_index(80, 0).value == 0              # no division by zero


@pytest.mark.parametrize("k,status", [(4.2, C.OK), (5.6, C.CAUTION), (6.1, C.ALERT), (6.8, C.ALERT),
                                      (3.3, C.CAUTION), (2.8, C.ALERT)])
def test_potassium_erc_grades(k, status):
    assert C.check_potassium(k).status == status


@pytest.mark.parametrize("fn,args,status", [
    (C.check_sodium, (140,), C.OK), (C.check_sodium, (130,), C.CAUTION), (C.check_sodium, (160,), C.ALERT),
    (C.check_anemia, (12.5, True), C.OK), (C.check_anemia, (12.5, False), C.CAUTION), (C.check_anemia, (7.5, None), C.ALERT),
    (C.check_lymphocytes, (1500,), C.OK), (C.check_lymphocytes, (800,), C.CAUTION), (C.check_lymphocytes, (400,), C.ALERT),
    (C.check_wbc, (6.0,), C.OK), (C.check_wbc, (12.0,), C.CAUTION), (C.check_wbc, (1.5,), C.ALERT),
    (C.check_glucose, (90,), C.OK), (C.check_glucose, (110,), C.CAUTION), (C.check_glucose, (65,), C.ALERT),
    (C.check_glucose, (130,), C.ALERT),
    (C.check_spo2, (97,), C.OK), (C.check_spo2, (93,), C.CAUTION), (C.check_spo2, (88,), C.ALERT),
    (C.check_albumin_creatinine, (10,), C.OK), (C.check_albumin_creatinine, (30,), C.CAUTION),
    (C.check_albumin_creatinine, (301,), C.ALERT),
    (C.check_co2_exposure, (2.0,), C.OK), (C.check_co2_exposure, (2.5,), C.CAUTION), (C.check_co2_exposure, (3.5,), C.ALERT),
    (C.check_sleep_eeg, (90, 7.5, 20, 7), C.OK), (C.check_sleep_eeg, (80, 6.5, 15, 7), C.CAUTION),
    (C.check_sleep_eeg, (70, 5.0, 10, 7), C.ALERT),
])
def test_simple_threshold_checks(fn, args, status):
    c = fn(*args)
    assert c.status == status
    assert c.message and c.reference
    assert (c.action is None) == (status == C.OK)


def test_glucose_clinical_check_agrees_with_thresholds_config(cfg):
    ind = cfg.indicator("glucose_fasting")
    for g in (60, 69.9, 70, 99, 100, 125, 126, 200):
        assert C.check_glucose(g).status == ind.band_for(g).status.value, g


def test_personal_dose_against_career_limit():
    assert C.check_personal_dose(100).status == C.OK
    c = C.check_personal_dose(250, prior=60)
    assert c.value == 310 and c.status == C.CAUTION
    assert C.check_personal_dose(560).status == C.ALERT


def test_stone_risk_counts_factors():
    assert C.check_stone_risk(None, None, None, None, None) is None
    assert C.check_stone_risk(200, 30, 400, 2.8, False).status == C.OK
    c = C.check_stone_risk(280, 45, 300, 2.0, True)
    assert c.value == 4 and c.status == C.ALERT
    # sex-specific calcium limit: 280 mg/d is a risk factor for women only
    assert C.check_stone_risk(280, None, None, None, True).value == 1
    assert C.check_stone_risk(280, None, None, None, False).value == 0


def test_hydration():
    assert C.check_hydration(None, None) is None
    assert C.check_hydration(1.010, 3.0).status == C.OK
    assert C.check_hydration(1.025, None).status == C.CAUTION
    assert C.check_hydration(1.032, 3.0).status == C.ALERT
    c = C.check_hydration(None, 1.5)
    assert c.status == C.CAUTION and c.unit == "L/d"


def test_dipstick_interpretation():
    out = {c.code: c for c in C.check_dipstick({"nitrite": "positive", "leukocytes": "pos", "blood": "neg",
                                                "ketones": "positive", "glucose": "negative", "protein": "positive"})}
    assert out["uti"].status == C.ALERT
    assert out["urine_blood"].status == C.OK
    assert out["ketones"].status == C.CAUTION and out["ketones"].organ == "gut"
    assert out["urine_glucose"].status == C.OK
    assert out["urine_protein"].status == C.CAUTION
    one = {c.code: c for c in C.check_dipstick({"nitrite": "negative", "leukocytes": "positive"})}
    assert one["uti"].status == C.CAUTION
    assert C.check_dipstick({}) == []


def test_liver_and_bristol():
    assert C.check_liver(None, None, True) is None
    assert C.check_liver(20, 25, True).status == C.OK
    assert C.check_liver(35, 25, True).status == C.CAUTION       # female ALT limit 29
    assert C.check_liver(35, 25, False).status == C.OK           # male ALT limit 46
    assert C.check_liver(200, 25, False).status == C.ALERT       # > 3x
    assert C.check_bristol(4).status == C.OK
    assert C.check_bristol(1, days_abnormal=1).status == C.CAUTION
    assert C.check_bristol(7, days_abnormal=3).status == C.ALERT


def test_limb_perfusion_detects_the_one_bad_limb():
    limbs = {
        "left_arm": {"hr": 70, "spo2": 98, "pi": 4.0},
        "right_arm": {"hr": 70, "spo2": 97, "pi": 4.2},
        "left_leg": {"hr": 70, "spo2": 97, "pi": 1.0},     # 25% of others -> alert
        "right_leg": {"hr": 70, "spo2": 98, "pi": 3.8},
    }
    out = {c.code: c for c in C.check_limb_perfusion(limbs)}
    assert out["perfusion_left_leg"].status == C.ALERT
    assert out["perfusion_left_leg"].value == 25
    assert all(out[f"perfusion_{n}"].status == C.OK for n in ("left_arm", "right_arm", "right_leg"))


def test_limb_perfusion_no_pulse_and_spo2_drop():
    limbs = {"a": {"hr": 0, "spo2": None, "pi": None}, "b": {"hr": 72, "spo2": 98, "pi": None},
             "c": {"hr": 71, "spo2": 90, "pi": None}, "d": {"hr": 70, "spo2": 98, "pi": None}}
    out = {c.code: c for c in C.check_limb_perfusion(limbs)}
    assert out["perfusion_a"].status == C.ALERT and "no pulse" in out["perfusion_a"].message
    assert out["perfusion_c"].status == C.CAUTION
    assert C.check_limb_perfusion({"only": {"hr": 70}}) == []


def test_crush_syndrome():
    assert C.check_crush_syndrome(False, 4.0, False, 0) is None
    assert C.check_crush_syndrome(True, 4.0, False, 0).status == C.CAUTION
    c = C.check_crush_syndrome(True, 6.0, True, 1)
    assert c.status == C.ALERT and c.value == 4


def test_worst_and_to_dict_rounding():
    assert C.worst([C.OK, C.ALERT, C.CAUTION]) == C.ALERT
    assert C.worst([]) == C.OK
    d = C.check_map(121, 80).to_dict()
    assert d["value"] == round(d["value"], 3) and set(d) >= {"organ", "code", "status", "message", "formula", "reference"}
