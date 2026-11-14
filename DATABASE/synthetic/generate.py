#!/usr/bin/env python3
"""generate.py | generator danych symulacyjnych (DATABASE_PLAN §10), źródło `synthetic_v1`.

Zestaw `demo`: 4 osoby (SYN-01..04) w misji SYN-ISS-180 (ISS, 180 dni, fikcyjny start 2030-01-01),
baseline przed lotem, 30 dni po lądowaniu, scenariusze S1-S12 (§10.5), środowisko kabiny co godzinę.

Wyjście (format kanoniczny §9.2, ładowany przez DATABASE/etl/load_canonical.py):
  data/synthetic/<zestaw>/meta.json                    misje, osoby, udział, nowe wskaźniki
  data/synthetic/<zestaw>/observations.canonical.csv
  data/synthetic/<zestaw>/env_observations.canonical.csv
  data/synthetic/<zestaw>/expected.json                oczekiwane statusy scenariuszy (testy E2E)

Deterministyczny: ten sam --seed i ta sama wersja => identyczne pliki.
  python3 DATABASE/synthetic/generate.py --dataset demo --seed 42 [--until FD68]
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import math
import random
import re
import statistics
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VERSION = "synthetic_v1"
SOURCE = "synthetic_v1"

MISSION = dict(code="SYN-ISS-180", name="Synthetic ISS increment (180 days)", environment_code="iss",
               start_date="2030-01-01", duration_days=180)
LAUNCH = dt.date(2030, 1, 1)
LANDING = LAUNCH + dt.timedelta(days=MISSION["duration_days"])
POST_DAYS = 30
PRE_DAILY_DAYS = 14          # codzienne parametry życiowe od L-14 (baseline)
ISS_ABSORBED_MGY_DAY = 0.30  # ~ średnia RadLab/SRAG w bazie (0.23-0.30 mGy/d)

# §10.3 profile; baseline losowany z zakresów §10.4 (seed)
PROFILES = [
    dict(code="SYN-01", sex="F", age_band="30-39", mass=(58, 66), note="podatna na deficyt snu (S2, S9)"),
    dict(code="SYN-02", sex="M", age_band="40-49", mass=(80, 90), note="ryzyko sercowo-naczyniowe (S1, S8, S11, S12)"),
    dict(code="SYN-03", sex="M", age_band="50-59", mass=(75, 85), note="osoba kontrolna; infekcja (S4), utrata masy (S7)"),
    dict(code="SYN-04", sex="F", age_band="40-49", mass=(60, 70), note="zdrowie behawioralne (S3), przerwa w danych (S10)"),
]

# nowe wskaźniki (wartości surowe; procenty liczą widoki, §10.4)
NEW_INDICATORS = [
    dict(code="body_mass", label="Body mass", category="nutrition", body_system_code="nutrition", canonical_unit="kg",
         baseline_threshold_id="body_mass_change_pct"),
    dict(code="vo2max", label="VO2max (estimated, cycle ergometer)", category="fitness",
         body_system_code="musculoskeletal", canonical_unit="ml/kg/min", baseline_threshold_id="vo2max_pct_baseline"),
    dict(code="strength_knee_extension", label="Knee extension peak torque", category="fitness",
         body_system_code="musculoskeletal", canonical_unit="N·m", baseline_threshold_id="strength_pct_baseline"),
]

# kalibracja (id z config/sources.json albo team_assumption) - zapisywana do meta.json
MODEL = {
    "heart_rate_resting": dict(freq="daily", baseline=(55, 70), sd=3, inflight="no change", source="norsk_2015"),
    "bp_systolic": dict(freq="daily", baseline=(110, 118), sd=5, inflight="-8..10 mmHg over ~14 d", source="norsk_2015"),
    "bp_diastolic": dict(freq="daily", baseline=(70, 77), sd=4, inflight="-5 mmHg over ~14 d", source="norsk_2015"),
    "body_temperature": dict(freq="daily", baseline=(36.4, 36.8), sd=0.15, inflight="no change", source="stahn_2017"),
    "spo2": dict(freq="daily", baseline=(96, 99), sd=0.7, inflight="no change", source="medlineplus_spo2"),
    "glucose_fasting": dict(freq="weekly", baseline=(80, 95), sd=5, inflight="no change", source="ada_diagnosis"),
    "sleep_hours": dict(freq="daily", baseline=(7.5, 8.0), sd=0.5, inflight="mean ~6 h (SD 0.8)",
                        source="ochmo_tb_sleep"),
    "mood": dict(freq="daily", baseline=(4, 4), sd=1, inflight="no trend", source="team_assumption"),
    "exercise_minutes_daily": dict(freq="daily (in flight)", inflight="90-120 min, 6 d/week, 7th day 0",
                                   source="scott_2023"),
    "energy_intake_pct_target": dict(freq="daily (in flight)", inflight="88-105 % of 3035 kcal",
                                     source="nasa_std_3001_v2"),
    "body_mass": dict(freq="weekly", inflight="-2..5 % in first 30 d, then plateau", source="zwart_2014"),
    "vo2max": dict(freq="L-90, FD15, then every 30 d, R+7", inflight="-17 % by FD14, partial recovery",
                   source="hrp_risk_fitness"),
    "strength_knee_extension": dict(freq="L-90, every 30 d, R+7", inflight="-3..6 % with ARED",
                                    source="hrp_risk_fitness"),
    "bmd_total_hip_left": dict(freq="L-180, R+30 (DXA on Earth)", inflight="-0.64 %/month", source="hrr_er_bone"),
    "bmd_lumbar_spine": dict(freq="L-180, R+30 (DXA on Earth)", inflight="-0.47 %/month", source="hrr_er_bone"),
    "labs": dict(freq="L-180, L-45, FD30, R-30, R+0", inflight="small", source="osdr_osd575",
                 note="mean/SD from Inspiration4 pre-flight values per sex"),
    "cabin": dict(freq="hourly", baseline="CO2 2.3 mmHg, 22.6 degC, 43 %RH", source="team_assumption",
                  note="calibrated on OSDR EDA RR missions in this DB (CO2 ~2.2 mmHg, 22.3 degC)"),
    "radiation": dict(freq="daily", baseline=f"{ISS_ABSORBED_MGY_DAY} mGy/d +-20 %", source="artemis1_nature2024"),
}

LAB_ANALYTES = {  # surowa nazwa w plikach I4 -> (code, unit)
    "HEMOGLOBIN": ("hemoglobin", "g/dL"), "HEMOGLOBIN (FEMALE)": ("hemoglobin", "g/dL"),
    "HEMATOCRIT": ("hematocrit", "%"), "HEMATOCRIT (FEMALE)": ("hematocrit", "%"),
    "WHITE BLOOD CELL COUNT": ("wbc", "Thousand/uL"), "PLATELET COUNT": ("platelets", "Thousand/uL"),
    "GLUCOSE": ("glucose", "mg/dL"), "SODIUM": ("sodium", "mmol/L"), "POTASSIUM": ("potassium", "mmol/L"),
    "CALCIUM": ("calcium", "mg/dL"), "CREATININE": ("creatinine", "mg/dL"), "ALBUMIN": ("albumin", "g/dL"),
    "ALT": ("alt", "U/L"), "AST": ("ast", "U/L"),
}
LAB_TIMEPOINTS = [("launch", -180), ("launch", -45), ("launch", 30), ("landing", -30), ("landing", 0)]


# ---------------------------------------------------------------- pomocnicze
def label_for(anchor, off):
    if anchor == "launch":
        return f"L{off}" if off < 0 else f"FD{off}"
    return f"R{off:+d}"


def date_for(anchor, off):
    return (LAUNCH if anchor == "launch" else LANDING) + dt.timedelta(days=off)


def parse_until(s):
    if not s:
        return None
    m = re.fullmatch(r"FD(\d+)", s)
    if m:
        return LAUNCH + dt.timedelta(days=int(m.group(1)))
    m = re.fullmatch(r"R([+-]\d+)", s)
    if m:
        return LANDING + dt.timedelta(days=int(m.group(1)))
    raise SystemExit(f"--until: oczekiwano FDn albo R+n, jest {s!r}")


def lab_calibration():
    """mean/SD wartości przedlotowych Inspiration4 per (analit, płeć)."""
    vals = defaultdict(list)
    for name, tcol in (("osd569_inspiration4_cbc_long.csv", "TEST_DATE"),
                       ("osd575_inspiration4_cmp_long.csv", "timepoint")):
        with (ROOT / "data" / "nasa" / name).open(newline="", encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                if r["ANALYTE"] in LAB_ANALYTES and r[tcol].strip().startswith("L-"):
                    try:
                        vals[(LAB_ANALYTES[r["ANALYTE"]][0], r["SEX"])].append(float(r["VALUE"]))
                    except ValueError:
                        pass
    cal = {}
    for k, v in vals.items():
        sd = statistics.pstdev(v) if len(v) > 1 else abs(v[0]) * 0.05
        cal[k] = (statistics.mean(v), max(sd, abs(statistics.mean(v)) * 0.03))
    return cal


# ---------------------------------------------------------------- generator
class Gen:
    def __init__(self, seed, until):
        self.rng = random.Random(seed)
        self.until = until
        self.obs = []
        self.env = []
        self.expected = []

    def keep(self, d):
        return self.until is None or d <= self.until

    def add(self, subj, ind, unit, anchor, off, value, sample_type, hour=7, minute=0, nd=1):
        d = date_for(anchor, off)
        if not self.keep(d):
            return
        self.obs.append(dict(
            source_id=SOURCE, subject_code=subj, mission_code=MISSION["code"], indicator_code=ind,
            timepoint_label=label_for(anchor, off), anchor=anchor, day_offset=off, time_is_approx=0,
            measured_at=f"{d.isoformat()} {hour:02d}:{minute:02d}:00", replicate=1,
            value=round(value, nd), unit=unit, ref_min="", ref_max="", sample_type=sample_type, is_synthetic=1,
            raw_name="", raw_value="", raw_unit=""))

    def add_env(self, env, loc, ind, unit, when: dt.datetime, agg, value, nd=3):
        if not self.keep(when.date()):
            return
        self.env.append(dict(environment_code=env, location=loc, indicator_code=ind, source_id=SOURCE,
                             measured_at=when.strftime("%Y-%m-%d %H:%M:%S"), aggregation=agg,
                             value=round(value, nd), unit=unit, is_synthetic=1))

    def expect(self, scenario, subject, indicator, day, status, escalate, rule, note=""):
        self.expected.append(dict(scenario=scenario, subject_code=subject, indicator_code=indicator, day=day,
                                  status=status, escalate=escalate, rule=rule, note=note))

    # ------------------------------------------------------------ osoba
    def person(self, p, cal):
        r = self.rng
        s = p["code"]
        u = lambda a, b: r.uniform(a, b)  # noqa: E731
        base = dict(hr=u(55, 70), sbp=u(110, 118), dbp=u(70, 77), temp=u(36.4, 36.8), spo2=u(96.5, 98.5),
                    glu=u(80, 95), sleep=u(7.5, 8.0), mass=u(*p["mass"]),
                    vo2=u(40, 46) if p["sex"] == "M" else u(36, 42),
                    strength=u(180, 230) if p["sex"] == "M" else u(120, 160),
                    hip=u(0.95, 1.05) if p["sex"] == "M" else u(0.88, 0.98),
                    spine=u(1.02, 1.12) if p["sex"] == "M" else u(0.98, 1.08))
        if s == "SYN-02":
            base.update(sbp=118, dbp=77, hr=66)

        days = [("launch", d) for d in range(-PRE_DAILY_DAYS, 0)] + \
               [("launch", d) for d in range(0, MISSION["duration_days"])] + \
               [("landing", d) for d in range(0, POST_DAYS + 1)]
        mass_loss = {"SYN-01": 0.035, "SYN-02": 0.025, "SYN-03": 0.06, "SYN-04": 0.03}[s]

        for anchor, off in days:
            fd = off if anchor == "launch" else None          # dzień misji (None po lądowaniu)
            inflight = fd is not None and fd >= 0
            post = anchor == "landing"
            if s == "SYN-04" and inflight and 20 <= fd <= 25:  # S10: brak danych z wearable
                continue
            adapt = min(fd / 14, 1.0) if inflight else 0.0     # adaptacja BP przez ~14 dni

            # tętno, BP (pomiar poranny)
            hr = base["hr"] + r.gauss(0, 3)
            sbp = base["sbp"] - 9 * adapt + r.gauss(0, 5)
            dbp = base["dbp"] - 5 * adapt + r.gauss(0, 4)
            if post:   # ortostatyka po powrocie, wygasa w ~7 dni
                k = max(0.0, 1 - off / 7)
                hr += 12 * k
                sbp -= 6 * k
            if s == "SYN-02" and inflight and 60 <= fd <= 70:  # S1
                sbp = 125 + (142 - 125) * (fd - 60) / 10 + r.gauss(0, 1)
                dbp = 80 + 6 * (fd - 60) / 10 + r.gauss(0, 1)
            if s == "SYN-02" and post and off <= 3:            # S12
                sbp, hr = 88 + r.uniform(-1, 1), 105 + r.uniform(-2, 2)
            self.add(s, "heart_rate_resting", "bpm", anchor, off, hr, "wearable", 6, 30, 0)
            self.add(s, "bp_systolic", "mmHg", anchor, off, sbp, "manual_device", 7, 0, 0)
            self.add(s, "bp_diastolic", "mmHg", anchor, off, dbp, "manual_device", 7, 0, 0)

            # temperatura, SpO2
            temp = base["temp"] + r.gauss(0, 0.15)
            if s == "SYN-03" and inflight and fd in (120, 121, 122):  # S4
                temp = {120: 38.0, 121: 38.7, 122: 37.9}[fd]
            self.add(s, "body_temperature", "°C", anchor, off, temp, "manual_device", 7, 5, 1)
            self.add(s, "spo2", "%", anchor, off, min(100, base["spo2"] + r.gauss(0, 0.7)), "wearable", 6, 30, 0)

            # sen
            sleep = (6.0 + r.gauss(0, 0.8)) if inflight else (base["sleep"] + r.gauss(0, 0.5))
            if s == "SYN-01" and inflight and 45 <= fd <= 51:   # S2
                sleep = 5.2 + r.uniform(-0.1, 0.1) if fd <= 47 else 4.5 + r.uniform(-0.1, 0.1)
            self.add(s, "sleep_hours", "h", anchor, off, max(2.5, min(10.5, sleep)), "wearable", 6, 0, 1)

            # nastrój (samoocena 1-5)
            mood = r.choices([3, 4, 5], weights=[2, 6, 2])[0]
            if s == "SYN-04" and inflight and 100 <= fd <= 104:  # S3
                mood = 3 if fd == 102 else 2
            self.add(s, "mood", "score 1–5", anchor, off, mood, "self_report", 21, 0, 0)

            if inflight:
                # ćwiczenia: 6 dni/tydz.; dzień odpoczynku = 0
                ex = 0 if fd % 7 == 6 else r.uniform(90, 120)
                if s == "SYN-01" and 130 <= fd <= 136:          # S9: łącznie ~300 min/tydz.
                    ex = 0 if fd % 7 == 6 else 50
                self.add(s, "exercise_minutes_daily", "min", anchor, off, ex, "self_report", 20, 0, 0)
                self.add(s, "energy_intake_pct_target", "% of target", anchor, off, r.uniform(88, 105),
                         "self_report", 21, 30, 0)

            # co tydzień: masa ciała, glukoza na czczo
            day_idx = off if anchor == "launch" else MISSION["duration_days"] + off
            if day_idx % 7 == 0:
                if inflight:
                    lost = mass_loss * min(fd / (90 if s == "SYN-03" else 30), 1.0)
                elif post:
                    lost = mass_loss * max(0.0, 1 - off / 30)
                else:
                    lost = 0.0
                self.add(s, "body_mass", "kg", anchor, off, base["mass"] * (1 - lost) + r.gauss(0, 0.2),
                         "manual_device", 6, 45, 1)
                self.add(s, "glucose_fasting", "mg/dL", anchor, off, base["glu"] + r.gauss(0, 5),
                         "manual_device", 6, 50, 0)
            if s == "SYN-02" and inflight and fd == 33:          # S11 (dodatkowy pomiar)
                self.add(s, "glucose_fasting", "mg/dL", anchor, off, 68, "manual_device", 6, 50, 0)

        # VO2max i siła: L-90, FD15, potem co 30 dni, R+7
        vo2_pts = [("launch", -90), ("launch", 15)] + [("launch", d) for d in range(45, 180, 30)] + [("landing", 7)]
        for anchor, off in vo2_pts:
            if anchor == "launch" and off < 0:
                f = 1.0
            elif anchor == "launch":
                f = 0.85 + 0.08 * min((off - 15) / 120, 1.0)   # -17 % do FD14, potem częściowy powrót
            else:
                f = 0.88
            if s == "SYN-02" and anchor == "launch" and off == 45:   # S8
                f = 0.82
            self.add(s, "vo2max", "ml/kg/min", anchor, off, base["vo2"] * f + r.gauss(0, 0.3),
                     "manual_device", 10, 0, 1)
            if not (anchor == "launch" and off == 15):
                sf = 1.0 if (anchor == "launch" and off < 0) else 0.97 - 0.02 * r.random()
                self.add(s, "strength_knee_extension", "N·m", anchor, off, base["strength"] * sf + r.gauss(0, 2),
                         "manual_device", 10, 30, 0)

        # DXA (tylko na Ziemi): L-180 i R+30; utrata wg miesięcy lotu
        months = MISSION["duration_days"] / 30.4
        for anchor, off, f_hip, f_sp in (("launch", -180, 1, 1),
                                         ("landing", 30, 1 - 0.0064 * months, 1 - 0.0047 * months)):
            self.add(s, "bmd_total_hip_left", "g/cm2", anchor, off, base["hip"] * f_hip, "dxa_scan", 9, 0, 3)
            self.add(s, "bmd_lumbar_spine", "g/cm2", anchor, off, base["spine"] * f_sp, "dxa_scan", 9, 10, 3)

        # krew (CBC/CMP)
        for anchor, off in LAB_TIMEPOINTS:
            for raw, (code, unit) in LAB_ANALYTES.items():
                if "(FEMALE)" in raw:
                    continue
                mu, sd = cal.get((code, p["sex"]), (None, None))
                if mu is None:
                    continue
                st = "lab_whole_blood" if code in ("hemoglobin", "hematocrit", "wbc", "platelets") else "lab_serum"
                nd = 0 if code in ("platelets", "alt", "ast", "glucose", "sodium") else 2
                self.add(s, code, unit, anchor, off, max(0.0, r.gauss(mu, sd)), st, 8, 0, nd)

    # ------------------------------------------------------------ środowisko (kabina, promieniowanie)
    def environment(self):
        r = self.rng
        loc = "SYN-ISS-180 cabin"
        start = dt.datetime.combine(LAUNCH, dt.time())
        for h in range(MISSION["duration_days"] * 24):
            t = start + dt.timedelta(hours=h)
            fd = h // 24
            diurnal = math.sin((t.hour - 8) / 24 * 2 * math.pi)
            co2 = 2.3 + 0.25 * diurnal + r.gauss(0, 0.12)
            if 80 <= fd <= 87:                                   # S5
                co2 = 2.8 + 0.2 * diurnal + r.gauss(0, 0.08)
            self.add_env("iss", loc, "cabin_co2", "mmHg", t, "hourly_mean", co2, 2)
            self.add_env("iss", loc, "cabin_temperature", "°C", t, "hourly_mean",
                         22.6 + 0.4 * diurnal + r.gauss(0, 0.2), 1)
            self.add_env("iss", loc, "cabin_humidity", "%RH", t, "hourly_mean", 43 + 2 * diurnal + r.gauss(0, 1.5), 0)
            pf = 10 ** r.gauss(-0.6, 0.15)                      # tło ~0.25 pfu
            if fd == 150 and 3 <= t.hour:                        # S6: SPE
                pf = 1500 * math.exp(-(t.hour - 3) / 30) + r.uniform(0, 50)
            elif fd == 151:
                pf = 400 * math.exp(-t.hour / 10) + 0.3
            self.add_env("iss", "SYN GOES (GEO)", "solar_proton_flux_10MeV", "pfu", t, "hourly_mean", pf, 3)
        for fd in range(MISSION["duration_days"]):
            t = start + dt.timedelta(days=fd)
            dose = ISS_ABSORBED_MGY_DAY * r.uniform(0.85, 1.15)
            if fd == 150:
                dose = ISS_ABSORBED_MGY_DAY * 6                  # S6
            self.add_env("iss", loc, "absorbed_dose_daily", "mGy/day", t, "daily_sum", dose, 3)
            self.add_env("iss", loc, "radiation_daily_vs_environment", "× baseline", t, "daily_mean",
                         dose / ISS_ABSORBED_MGY_DAY, 2)

    # ------------------------------------------------------------ oczekiwane wyniki (§10.5)
    def expectations(self):
        e = self.expect
        e("S1", "SYN-02", "bp_systolic", "FD62", "caution", False, "absolute", "SBP >= 120")
        e("S1", "SYN-02", "bp_systolic", "FD70", "alert", True, "absolute", "SBP >= 140")
        e("S2", "SYN-01", "sleep_hours", "FD47", "caution", False, "rolling_3d_mean<6")
        e("S2", "SYN-01", "sleep_hours", "FD51", "alert", True, "rolling_7d_mean<5")
        e("S3", "SYN-04", "mood", "FD104", "alert", True, "rolling_5d_count_below_3>=4")
        e("S4", "SYN-03", "body_temperature", "FD120", "caution", False, "absolute", "37.6-38.5")
        e("S4", "SYN-03", "body_temperature", "FD121", "alert", True, "absolute", ">= 38.5")
        e("S5", None, "cabin_co2", "FD86", "caution", False, "rolling_7d_mean>=2.5")
        e("S6", None, "solar_proton_flux_10MeV", "FD150", "alert", True, "absolute", ">= 1000 pfu: no EVA")
        e("S6", None, "radiation_daily_vs_environment", "FD150", "alert", True, "absolute", ">= 5x")
        e("S7", "SYN-03", "body_mass", "FD91", "caution", False, "baseline_percent_change", "< -5 %")
        e("S8", "SYN-02", "vo2max", "FD45", "caution", False, "baseline_percent", "80-85 %")
        e("S9", "SYN-01", "exercise_minutes_daily", "FD136", "caution", False, "rolling_7d_sum<360")
        e("S10", "SYN-04", "heart_rate_resting", "FD25", "ok", False, "gap",
          "no data FD20-FD25; latest as-of FD25 shows FD19")
        e("S11", "SYN-02", "glucose_fasting", "FD33", "alert", True, "absolute", "< 70 mg/dL")
        e("S12", "SYN-02", "bp_systolic", "R+0", "caution", False, "absolute", "SBP < 90")
        e("S12", "SYN-02", "heart_rate_resting", "R+0", "caution", False, "absolute", "HR 101-121")


MARS_MISSION = dict(
    code="SYN-MARS-HAB-600", name="Synthetic Mars habitat mission (600 sols)",
    environment_code="mars_surface", start_date="2039-01-01", duration_days=600,
)
MARS_PROFILES = [
    dict(code="SYN-02", crew="C1", sex="M", age_band="40-49", mass=84.0),
    dict(code="SYN-01", crew="C2", sex="F", age_band="30-39", mass=62.0),
    dict(code="SYN-03", crew="C3", sex="M", age_band="50-59", mass=80.0),
    dict(code="SYN-04", crew="C4", sex="F", age_band="40-49", mass=65.0),
]

MARS_INDICATORS = [
    ("body_mass", "Body mass", "nutrition", "nutrition", "kg"),
    ("vitamin_d_25oh", "Vitamin D, 25-OH", "lab_cmp", "metabolic", "ng/mL"),
    ("vitamin_b12", "Vitamin B12", "lab_cmp", "metabolic", "pg/mL"),
    ("cortisol_am", "Morning cortisol", "lab_cmp", "metabolic", "µg/dL"),
    ("handgrip_strength", "Hand grip strength", "fitness", "musculoskeletal", "kg"),
    ("visual_acuity_logmar", "Visual acuity", "vitals", "cardiovascular", "logMAR"),
    ("intraocular_pressure", "Intraocular pressure", "vitals", "cardiovascular", "mmHg"),
    ("fvc", "Forced vital capacity", "fitness", "respiratory", "L"),
    ("fev1", "Forced expiratory volume in 1 second", "fitness", "respiratory", "L"),
    ("muscle_pct", "Muscle mass", "body_composition", "musculoskeletal", "%"),
    ("fat_pct", "Body fat", "body_composition", "nutrition", "%"),
    ("body_water_pct", "Body water", "body_composition", "nutrition", "%"),
    ("bone_mass", "Bone mass", "body_composition", "musculoskeletal", "kg"),
    ("bmr", "Basal metabolic rate", "nutrition", "nutrition", "kcal/d"),
    ("sleep_efficiency", "Sleep efficiency", "sleep", "sleep", "%"),
    ("deep_sleep_pct", "Deep sleep", "sleep", "sleep", "%"),
    ("rem_sleep_pct", "REM sleep", "sleep", "sleep", "%"),
    ("headache_score", "Headache score", "mood", "behavioral", "score 0-10"),
    ("nausea_score", "Nausea score", "mood", "behavioral", "score 0-10"),
    ("vision_change", "Reported vision change", "mood", "behavioral", "boolean"),
    ("fatigue_score", "Fatigue score", "mood", "behavioral", "score 1-5"),
    ("pvt_reaction_ms", "PVT reaction time", "fitness", "behavioral", "ms"),
]

MARS_LAB_UNITS = {
    "rbc": "Million/uL", "hemoglobin": "g/dL", "hematocrit": "%",
    "mcv": "fL", "mch": "pg", "mchc": "g/dL", "rdw": "%",
    "wbc": "Thousand/uL", "platelets": "Thousand/uL", "neutrophils_pct": "%",
    "lymphocytes_pct": "%", "monocytes_pct": "%", "eosinophils_pct": "%",
    "basophils_pct": "%", "glucose": "mg/dL", "sodium": "mmol/L",
    "potassium": "mmol/L", "chloride": "mmol/L", "bicarbonate": "mmol/L",
    "calcium": "mg/dL", "bun": "mg/dL", "creatinine": "mg/dL",
    "albumin": "g/dL", "total_protein": "g/dL", "bilirubin_total": "mg/dL",
    "alt": "U/L", "ast": "U/L", "alp": "U/L",
}

MARS_LAB_BASE = {
    "rbc": 4.7, "hemoglobin": 14.0, "hematocrit": 42.0, "mcv": 89.0, "mch": 30.0,
    "mchc": 34.0, "rdw": 13.0, "wbc": 5.8, "platelets": 245.0,
    "neutrophils_pct": 56.0, "lymphocytes_pct": 34.0, "monocytes_pct": 7.0,
    "eosinophils_pct": 2.0, "basophils_pct": 1.0, "glucose": 88.0, "sodium": 140.0,
    "potassium": 4.2, "chloride": 103.0, "bicarbonate": 24.0, "calcium": 9.4,
    "bun": 15.0, "creatinine": 0.9, "albumin": 4.4, "total_protein": 7.1,
    "bilirubin_total": 0.7, "alt": 22.0, "ast": 21.0, "alp": 70.0,
}


def _mars_indicator_meta():
    rows = []
    for code, label, category, body, unit in MARS_INDICATORS:
        rows.append(dict(code=code, label=label, category=category, body_system_code=body,
                         canonical_unit=unit, clinical_use="diagnostic"))
    for code, unit in MARS_LAB_UNITS.items():
        if code not in {r["code"] for r in rows}:
            rows.append(dict(code=code, label=code.replace("_", " ").title(), category="lab_cbc",
                             body_system_code="hematologic", canonical_unit=unit, clinical_use="diagnostic"))
    return rows


def generate_mars(seed, out):
    """Generate the shared Mars health dataset without changing the legacy demo."""
    rng = random.Random(seed)
    epoch = dt.datetime(2039, 1, 1)
    sol_seconds = 88775.244
    obs = []
    expected = []

    def add(p, code, unit, sol, value, sample, hour=7, nd=2):
        t = epoch + dt.timedelta(seconds=(sol - 1) * sol_seconds + hour * 3600)
        obs.append(dict(source_id=SOURCE, subject_code=p["code"], mission_code=MARS_MISSION["code"],
                        indicator_code=code, timepoint_label=f"Sol {sol}", anchor="launch",
                        day_offset=sol, time_is_approx=0, measured_at=t.strftime("%Y-%m-%d %H:%M:%S"),
                        replicate=1, value=round(value, nd), unit=unit, ref_min="", ref_max="",
                        sample_type=sample, is_synthetic=1, raw_name="", raw_value="", raw_unit=""))

    for p in MARS_PROFILES:
        for sol in range(0, 601):
            in_flight = sol >= 1
            # Daily vitals and the required daily symptom/sleep streams.
            mass_loss = max(0, sol - 1) / 600 * (0.06 if p["code"] == "SYN-03" else 0.03)
            add(p, "heart_rate_resting", "bpm", sol, 64 + rng.gauss(0, 3) + (2 if sol > 250 else 0), "wearable", 6, 0)
            add(p, "bp_systolic", "mmHg", sol, 115 + rng.gauss(0, 4), "manual_device")
            add(p, "bp_diastolic", "mmHg", sol, 74 + rng.gauss(0, 3), "manual_device")
            add(p, "body_temperature", "°C", sol, 36.6 + rng.gauss(0, .12), "manual_device")
            add(p, "spo2", "%", sol, 97.5 + rng.gauss(0, .5), "wearable", 6, 1)
            headache = 0
            if sol == 142 and p["crew"] in ("C1", "C2"):
                headache = 5
            add(p, "headache_score", "score 0-10", sol, headache, "self_report", 20, 0)
            add(p, "nausea_score", "score 0-10", sol, 1 if headache else 0, "self_report", 20, 0)
            sans = p["crew"] == "C3" and sol >= 200
            add(p, "vision_change", "boolean", sol, 1 if sans else 0, "self_report", 20, 0)
            add(p, "fatigue_score", "score 1-5", sol, 4 if sol in range(250, 256) and p["crew"] == "C2" else 2, "self_report", 20, 0)
            add(p, "sleep_efficiency", "%", sol, 88 + rng.gauss(0, 3), "wearable", 6, 1)
            add(p, "deep_sleep_pct", "%", sol, 20 + rng.gauss(0, 2), "wearable", 6, 1)
            add(p, "rem_sleep_pct", "%", sol, 22 + rng.gauss(0, 2), "wearable", 6, 1)
            add(p, "pvt_reaction_ms", "ms", sol, 280 + rng.gauss(0, 20), "manual_device", 8, 0) if sol % 7 == 0 else None
            if sol % 7 == 0:
                add(p, "body_mass", "kg", sol, p["mass"] * (1 - mass_loss) + rng.gauss(0, .2), "manual_device", 6, 1)
                add(p, "glucose", "mg/dL", sol, 88 + rng.gauss(0, 4), "lab_serum", 7, 0)
                add(p, "cortisol_am", "µg/dL", sol, 14 + rng.gauss(0, 2), "lab_serum", 7, 1)
            for code, unit, value in (
                ("rbc", "Million/uL", 4.7), ("hemoglobin", "g/dL", 14), ("hematocrit", "%", 42),
                ("wbc", "Thousand/uL", 5.8), ("platelets", "Thousand/uL", 245),
                ("neutrophils_pct", "%", 56), ("lymphocytes_pct", "%", 34),
                ("calcium", "mg/dL", 9.4), ("sodium", "mmol/L", 140), ("potassium", "mmol/L", 4.2),
                ("chloride", "mmol/L", 103), ("bicarbonate", "mmol/L", 24),
                ("creatinine", "mg/dL", 0.9), ("bun", "mg/dL", 15),
            ):
                if sol % 7 == 0:
                    value += rng.gauss(0, max(value * .03, .05))
                    if p["crew"] == "C2" and 250 <= sol <= 255 and code in ("bun", "creatinine"):
                        value *= 1.3
                    add(p, code, unit, sol, value, "lab_whole_blood" if code in ("rbc", "hemoglobin", "hematocrit", "wbc", "platelets", "neutrophils_pct", "lymphocytes_pct") else "lab_serum", 7, 2)
            if sol == 0 or sol % 30 == 0:
                for code, unit, value in (
                    ("vitamin_d_25oh", "ng/mL", 32), ("vitamin_b12", "pg/mL", 500),
                    ("handgrip_strength", "kg", 42 if p["sex"] == "M" else 28),
                    ("visual_acuity_logmar", "logMAR", .0 if not sans else .25),
                    ("intraocular_pressure", "mmHg", 15), ("fvc", "L", 4.5 if p["sex"] == "M" else 3.4),
                    ("fev1", "L", 3.7 if p["sex"] == "M" else 2.8), ("muscle_pct", "%", 38 if p["sex"] == "M" else 30),
                    ("fat_pct", "%", 20 if p["sex"] == "M" else 28), ("body_water_pct", "%", 58),
                    ("bone_mass", "kg", 3.2), ("bmr", "kcal/d", 1700 if p["sex"] == "M" else 1400),
                ):
                    if code == "handgrip_strength" and p["crew"] == "C3" and 360 <= sol <= 420:
                        value -= 8
                    add(p, code, unit, sol, value + rng.gauss(0, .1), "manual_device", 9, 2)
    expected.extend([
        dict(scenario="H1", subject_code="SYN-02", indicator_code="headache_score", day="Sol 142", status="alert"),
        dict(scenario="H4", subject_code="SYN-01", indicator_code="bun", day="Sol 250-255", status="caution"),
        dict(scenario="H5", subject_code="SYN-03", indicator_code="handgrip_strength", day="Sol 360-420", status="caution"),
        dict(scenario="H8", subject_code="SYN-02", indicator_code="lymphocytes_pct", day="Sol 470", status="ok",
             note="monitoring działa, wynik prawidłowy"),
        dict(scenario="SANS", subject_code="SYN-03", indicator_code="visual_acuity_logmar", day="Sol 200+", status="alert"),
    ])
    meta = dict(
        generator=VERSION, dataset="mars", seed=seed, source=dict(
            id=SOURCE, title="Synthetic Mars health data generator v1", publisher="NASA-HACKATHON team",
            data_kind="synthetic", access_status="generated"),
        missions=[dict(MARS_MISSION, end_date="2040-08-22", source_id=SOURCE, is_synthetic=True)],
        subjects=[dict(code=p["code"], source_subject_code=p["code"], source_id=SOURCE, sex=p["sex"],
                       age_band_code=p["age_band"], is_synthetic=True) for p in MARS_PROFILES],
        participations=[dict(subject_code=p["code"], mission_code=MARS_MISSION["code"],
                             role="synthetic_crew", group_label=p["crew"]) for p in MARS_PROFILES],
        indicators=_mars_indicator_meta(),
        clinical_schedule={"daily": ["CBC core", "glucose", "electrolytes", "sleep", "symptoms"],
                           "weekly": ["CMP", "cortisol", "PVT"], "sol_30": ["vitamins", "vision", "IOP", "spirometry", "grip", "BIA"]},
    )
    out.mkdir(parents=True, exist_ok=True)
    (out / "meta.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False) + "\n")
    (out / "expected.json").write_text(json.dumps(expected, indent=1, ensure_ascii=False) + "\n")
    with (out / "observations.canonical.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(obs[0]), lineterminator="\n")
        w.writeheader()
        w.writerows(obs)
    print(f"{out}: observations={len(obs)} expected={len(expected)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", default="demo", choices=["demo", "mars"])
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--until", default=None, help="np. FD68 albo R+5: utnij dane po tym dniu (tryb as-of)")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    until = parse_until(a.until)
    out = Path(a.out) if a.out else ROOT / "data" / "synthetic" / (a.dataset + (f"_until_{a.until}" if a.until else ""))
    out.mkdir(parents=True, exist_ok=True)

    if a.dataset == "mars":
        generate_mars(a.seed, out)
        return

    g = Gen(a.seed, until)
    cal = lab_calibration()
    for p in PROFILES:
        g.person(p, cal)
    g.environment()
    g.expectations()

    meta = dict(
        generator=VERSION, dataset=a.dataset, seed=a.seed, until=a.until,
        source=dict(id=SOURCE, title="Synthetic astronaut data generator v1 (seeded, calibrated on published means)",
                    publisher="NASA-HACKATHON team", data_kind="synthetic", access_status="generated",
                    notes="DATABASE/synthetic/generate.py; DATABASE_PLAN §10. NOT real astronaut data."),
        missions=[dict(MISSION, end_date=LANDING.isoformat(), source_id=SOURCE, is_synthetic=True,
                       description="Fictional dates. Scenarios S1-S12 injected (DATABASE_PLAN §10.5).")],
        subjects=[dict(code=p["code"], source_subject_code=p["code"], source_id=SOURCE, sex=p["sex"],
                       age_band_code=p["age_band"], is_synthetic=True, note=p["note"]) for p in PROFILES],
        participations=[dict(subject_code=p["code"], mission_code=MISSION["code"], role="synthetic_crew",
                             group_label=None) for p in PROFILES],
        indicators=NEW_INDICATORS, model=MODEL,
    )
    (out / "meta.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False) + "\n")
    (out / "expected.json").write_text(json.dumps(g.expected, indent=1, ensure_ascii=False) + "\n")
    for name, rows in (("observations.canonical.csv", g.obs), ("env_observations.canonical.csv", g.env)):
        with (out / name).open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0]), lineterminator="\n")
            w.writeheader()
            w.writerows(rows)
    shown_out = out.relative_to(ROOT) if out.is_relative_to(ROOT) else out
    print(f"{shown_out}: observations={len(g.obs)} env={len(g.env)} expected={len(g.expected)}")


if __name__ == "__main__":
    main()
