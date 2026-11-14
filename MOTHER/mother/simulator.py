"""Synthetic mission generator with scenario injection.

Per-astronaut vital signs are not public (DATA_SOURCES.md s.2), so MOTHER is tested on seeded synthetic
series calibrated to the published values below. Everything generated is marked `simulated=True` and the
GUI must label it as such.

Calibration (see DATA_SOURCES.md / config/sources.json):
* 24-h BP falls 8-10 mmHg in flight, resting HR unchanged (norsk_2015)
* core temperature drifts up over ~2.5 months (stahn_2017) - we use a smaller oral drift
* body mass -2..5 % mostly in the first 30 days (zwart_2014)
* VO2max -17 % around FD14 then partial recovery (aerobic evidence report)
* headache odds double per +1 mmHg CO2 (law_2014); ISS CO2 median ~2.4 mmHg (OSDR EDA)
* dose rates per environment from thresholds.json (artemis1_nature2024 and others)
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, time, timedelta, timezone
from typing import Any

import numpy as np

from .config import Config, load_config
from .models import Astronaut, Measurement, Mission

HABITAT_ID = "hab-1"
SPACE_WEATHER_ID = "space_weather"


@dataclass
class Scenario:
    kind: str
    start_fd: int
    duration_days: float = 1.0
    subject: str | None = None      # astronaut id for crew scenarios
    params: dict[str, Any] = field(default_factory=dict)

    def active(self, fd_float: float) -> bool:
        return self.start_fd <= fd_float < self.start_fd + self.duration_days

    def progress(self, fd_float: float) -> float:
        return min(1.0, max(0.0, (fd_float - self.start_fd) / max(self.duration_days, 1e-9)))


SCENARIO_KINDS = {
    "co2_scrubber_failure": "Cabin CO2 rises to ~5.5 mmHg (habitat); headaches follow",
    "solar_particle_event": "Solar proton flux >S3 for ~12 h, dose spike for all crew",
    "insomnia": "Short sleep, low mood, high fatigue, slower reactions (one astronaut)",
    "infection": "Temperature and heart rate rise together (one astronaut)",
    "exercise_noncompliance": "Exercise ~25 min/day (one astronaut) -> bone forecast",
    "hypertension_drift": "Systolic/diastolic slowly drift up (one astronaut) -> SPC catches it early",
    "sans_onset": "Vision change + headaches (one astronaut)",
    "energy_deficit": "Eating ~78 % of target, losing mass (one astronaut)",
    "cabin_o2_leak": "Cabin O2 partial pressure falls to ~132 mmHg; crew SpO2 drops",
    "sensor_fault": "CO2 sensor freezes for a day + implausible HR reading injected",
}

DEMO_SCENARIOS = [
    Scenario("insomnia", 50, 10, "AST-02"),
    Scenario("hypertension_drift", 70, 40, "AST-03"),
    Scenario("co2_scrubber_failure", 92, 3),
    Scenario("solar_particle_event", 101, 0.6),
    Scenario("infection", 120, 4, "AST-04"),
    Scenario("exercise_noncompliance", 125, 40, "AST-01"),
]


def default_crew() -> list[Astronaut]:
    # Fictional crew. lab_subject_id links each to one real Inspiration4 lab subject for the lab tab.
    return [
        Astronaut("AST-01", "Ada Nowak", HABITAT_ID, {"body_mass_kg": 64.0, "vo2max_ml_kg_min": 44.0,
                  "strength_index": 95.0, "reaction_time_ms": 275.0}, 0.0, "C001"),
        Astronaut("AST-02", "Leo Martin", HABITAT_ID, {"body_mass_kg": 82.0, "vo2max_ml_kg_min": 47.0,
                  "strength_index": 140.0, "reaction_time_ms": 290.0}, 120.0, "C002"),
        Astronaut("AST-03", "Sana Okafor", HABITAT_ID, {"body_mass_kg": 70.0, "vo2max_ml_kg_min": 45.0,
                  "strength_index": 115.0, "reaction_time_ms": 268.0}, 45.0, "C003"),
        Astronaut("AST-04", "Tom Ito", HABITAT_ID, {"body_mass_kg": 76.0, "vo2max_ml_kg_min": 49.0,
                  "strength_index": 130.0, "reaction_time_ms": 282.0}, 0.0, "C004"),
    ]


class MissionSimulator:
    def __init__(self, environment: str = "iss", days: int = 180, seed: int = 42,
                 launch: datetime | None = None, scenarios: list[Scenario] | None = None,
                 cfg: Config | None = None) -> None:
        self.cfg = cfg or load_config()
        self.env = self.cfg.environments[environment]
        self.days = days
        self.rng = np.random.default_rng(seed)
        self.launch = launch or datetime(2026, 9, 1, tzinfo=timezone.utc)
        self.scenarios = list(scenarios or [])
        self.mission = Mission("SIM-" + environment.upper(), environment, self.launch, days, default_crew())
        # personal physiology (fixed per astronaut, seeded)
        self.person: dict[str, dict[str, float]] = {}
        for a in self.mission.crew:
            self.person[a.id] = {
                "hr": float(self.rng.uniform(52, 64)), "sbp": float(self.rng.uniform(112, 121)),
                "dbp": float(self.rng.uniform(70, 77)), "temp": float(self.rng.uniform(36.45, 36.7)),
                "sleep": float(self.rng.uniform(6.9, 7.4)),
            }

    # ------------------------------------------------------------ helpers
    def _scen(self, kind: str, fd: float, subject: str | None = None) -> Scenario | None:
        for s in self.scenarios:
            if s.kind == kind and s.active(fd) and (s.subject is None or s.subject == subject):
                return s
        return None

    def _since(self, kind: str, fd: float, subject: str) -> float:
        """Days since a (possibly long) drift scenario began; 0 if not started."""
        for s in self.scenarios:
            if s.kind == kind and s.subject == subject and fd >= s.start_fd:
                return min(fd, s.start_fd + s.duration_days) - s.start_fd
        return 0.0

    def _ts(self, fd: int, hh: int, mm: int = 0) -> datetime:
        return datetime.combine(self.mission.date_of_flight_day(fd), time(hh, mm), tzinfo=timezone.utc)

    def _m(self, subject: str, ind: str, ts: datetime, value: float, unit: str, source: str) -> Measurement:
        return Measurement(subject, ind, ts, float(value), unit, source=source, simulated=True)

    def co2_at(self, fd_float: float) -> float:
        hour = (fd_float % 1) * 24
        v = 2.1 + 0.25 * math.sin((hour - 8) / 24 * 2 * math.pi) + self.rng.normal(0, 0.12)
        s = self._scen("co2_scrubber_failure", fd_float)
        if s:
            v += 3.4 * min(1.0, s.progress(fd_float) * 3)  # reaches +3.4 mmHg within the first third
        return max(0.3, v)

    # ------------------------------------------------------------ habitat
    def _habitat(self, fd: int) -> tuple[list[Measurement], float]:
        out: list[Measurement] = []
        co2_vals = []
        stuck_value = None
        for h in range(24):
            fdf = fd + h / 24
            ts = self._ts(fd, h)
            co2 = self.co2_at(fdf)
            if self._scen("sensor_fault", fdf):
                stuck_value = stuck_value or round(co2, 2)
                co2 = stuck_value
            co2_vals.append(co2)
            ppo2 = 150 + self.rng.normal(0, 1.5)
            leak = self._scen("cabin_o2_leak", fdf)
            if leak:
                ppo2 -= 18 * min(1.0, leak.progress(fdf) * 4)
            out += [
                self._m(HABITAT_ID, "cabin_co2", ts, round(co2, 2), "mmHg", "habitat"),
                self._m(HABITAT_ID, "cabin_ppo2", ts, round(ppo2, 1), "mmHg", "habitat"),
                self._m(HABITAT_ID, "cabin_temperature", ts, round(22.6 + self.rng.normal(0, 0.4), 2), "°C", "habitat"),
                self._m(HABITAT_ID, "cabin_humidity", ts, round(43 + self.rng.normal(0, 3), 1), "%RH", "habitat"),
            ]
            flux = 0.3 * math.exp(self.rng.normal(0, 0.4))
            spe = self._scen("solar_particle_event", fdf)
            if spe:
                p = spe.progress(fdf)
                flux = max(flux, 10 ** (1 + 2.8 * math.sin(math.pi * p)))  # peaks ~6300 pfu (S3)
            out.append(self._m(SPACE_WEATHER_ID, "solar_proton_flux_10MeV", ts, round(flux, 3), "pfu", "live_feed"))
        out.append(self._m(HABITAT_ID, "noise_24h", self._ts(fd, 23, 30), round(64 + self.rng.normal(0, 1.5), 1),
                           "dBA", "habitat"))
        dose = self.env.dose_mSv_per_day * math.exp(self.rng.normal(0, 0.08))
        if any(s.kind == "solar_particle_event" and int(s.start_fd) == fd for s in self.scenarios):
            dose *= 8
        out.append(self._m(HABITAT_ID, "radiation_dose_mSv", self._ts(fd, 23, 45), round(dose, 4), "mSv", "habitat"))
        return out, float(np.mean(co2_vals))

    # ------------------------------------------------------------ crew
    def _crew_day(self, a: Astronaut, fd: int, co2_day: float) -> list[Measurement]:
        r, p, pre = self.rng, self.person[a.id], a.preflight
        out: list[Measurement] = []
        fdf = fd + 0.5
        ins = self._scen("insomnia", fdf, a.id)
        inf = self._scen("infection", fdf, a.id)
        sans = self._scen("sans_onset", fdf, a.id)
        o2 = self._scen("cabin_o2_leak", fdf)

        # --- morning check-in 07:30
        sleep = p["sleep"] + r.normal(0, 0.45) - (2.4 if ins else 0) - (0.8 if inf else 0)
        mood_probs = [0.0, 0.03, 0.17, 0.5, 0.3]
        if ins:
            mood_probs = [0.1, 0.45, 0.35, 0.1, 0.0]
        mood = int(r.choice([1, 2, 3, 4, 5], p=mood_probs))
        fat_probs = [0.25, 0.45, 0.22, 0.07, 0.01]
        if ins or inf:
            fat_probs = [0.0, 0.05, 0.2, 0.45, 0.3]
        fatigue = int(r.choice([1, 2, 3, 4, 5], p=fat_probs))
        p_head = min(0.9, 0.03 * 2 ** (co2_day - 2.0)) + (0.5 if sans else 0)
        headache = 0 if r.random() > p_head else int(r.choice([1, 2], p=[0.75, 0.25]))
        p_naus = 0.7 * math.exp(-(fd - 1) / 1.5) + 0.005
        nausea = 1 if r.random() < p_naus else 0
        t = self._ts(fd, 7, 30)
        out += [self._m(a.id, "sleep_hours", t, round(max(0.5, sleep), 2), "h", "manual"),
                self._m(a.id, "mood", t, mood, "score 1–5", "manual"),
                self._m(a.id, "fatigue", t, fatigue, "score 1–5", "manual"),
                self._m(a.id, "symptom_headache", t, headache, "score 0-3", "manual"),
                self._m(a.id, "symptom_nausea", t, nausea, "score 0-3", "manual")]
        if sans:
            out.append(self._m(a.id, "symptom_vision_change", t, 1 if r.random() < 0.7 else 0, "flag", "manual"))

        # --- morning vitals 07:45
        inflight = 1.0 if fd > 3 else fd / 3
        drift = self._since("hypertension_drift", fdf, a.id)
        sbp = p["sbp"] - 8 * inflight + 0.8 * drift + r.normal(0, 4)
        dbp = p["dbp"] - 5 * inflight + 0.5 * drift + r.normal(0, 3)
        hr = p["hr"] + r.normal(0, 2.5)
        temp = p["temp"] + 0.3 * min(1.0, fd / 75) + r.normal(0, 0.12)
        if inf:
            k = min(1.0, inf.progress(fdf) * 2.5)
            temp += 1.5 * k
            hr += 16 * k
        if ins:
            hr += 3
        spo2 = min(100.0, 97.6 + r.normal(0, 0.6) - (4.0 if o2 else 0))
        t = self._ts(fd, 7, 45)
        out += [self._m(a.id, "heart_rate_resting", t, round(hr), "bpm", "wearable"),
                self._m(a.id, "bp_systolic", t, round(sbp), "mmHg", "wearable"),
                self._m(a.id, "bp_diastolic", t, round(min(dbp, sbp - 15)), "mmHg", "wearable"),
                self._m(a.id, "body_temperature", t, round(temp, 2), "°C", "wearable"),
                self._m(a.id, "spo2", t, round(spo2), "%", "wearable")]
        if self._scen("sensor_fault", fdf) and a.id == "AST-01":
            out.append(self._m(a.id, "heart_rate_resting", self._ts(fd, 12), 400, "bpm", "wearable"))

        # --- exercise 17:00 (rest day every 7th day, none on FD1-2)
        if fd > 2 and fd % 7 != 0:
            mins = r.normal(95, 15)
            if self._scen("exercise_noncompliance", fdf, a.id):
                mins = r.normal(25, 10)
            if ins:
                mins *= 0.7
            if inf:
                mins = r.normal(15, 5)
            out.append(self._m(a.id, "exercise_minutes_daily", self._ts(fd, 17), round(max(0, mins)), "min", "manual"))

        # --- EVA days
        eva_h = 0.0
        if fd in (60, 61) and a.id in ("AST-01", "AST-03"):
            eva_h = 6.5
            out.append(self._m(a.id, "eva_hours", self._ts(fd, 15), eva_h, "h", "manual"))

        # --- food 20:00
        kcal = r.normal(3100, 150) + 200 * eva_h
        if self._scen("energy_deficit", fdf, a.id):
            kcal = r.normal(2380, 150)
        if inf:
            kcal *= 0.8
        out.append(self._m(a.id, "energy_intake_kcal", self._ts(fd, 20), round(kcal), "kcal", "manual"))

        # --- weekly: body mass + fasting glucose (FD1 = first in-flight reference)
        if fd == 1 or fd % 7 == 0:
            loss = 0.03 * min(1.0, fd / 30)
            loss += 0.0015 * self._since("energy_deficit", fdf, a.id)
            mass = pre["body_mass_kg"] * (1 - loss) + r.normal(0, 0.3)
            out.append(self._m(a.id, "body_mass_kg", self._ts(fd, 7, 15), round(mass, 2), "kg", "manual"))
            out.append(self._m(a.id, "glucose_fasting", self._ts(fd, 7, 20), round(r.normal(86, 6)), "mg/dL", "manual"))

        # --- PVT-like reaction test weekly
        if fd % 7 == 3:
            rt = pre["reaction_time_ms"] * (1.02 + (0.2 if ins else 0)) * math.exp(r.normal(0, 0.03))
            out.append(self._m(a.id, "reaction_time_ms", self._ts(fd, 9), round(rt), "ms", "manual"))

        # --- Periodic Fitness Evaluation FD15 + every 30 days
        if fd >= 15 and (fd - 15) % 30 == 0:
            rec = 0.88 + 0.05 * min(1.0, (fd - 15) / 60)
            out.append(self._m(a.id, "vo2max_ml_kg_min", self._ts(fd, 10), round(pre["vo2max_ml_kg_min"] * rec + r.normal(0, 0.8), 1),
                               "ml/kg/min", "manual"))
            out.append(self._m(a.id, "strength_index", self._ts(fd, 10, 30),
                               round(pre["strength_index"] * (0.95 + r.normal(0, 0.015)), 1), "kg", "manual"))
        return out

    # ------------------------------------------------------------ public
    def generate(self, until_fd: int | None = None) -> list[Measurement]:
        last = min(self.days, until_fd or self.days)
        out: list[Measurement] = []
        for fd in range(1, last + 1):
            hab, co2_day = self._habitat(fd)
            out += hab
            for a in self.mission.crew:
                out += self._crew_day(a, fd, co2_day)
        out.sort(key=lambda m: m.ts)
        return out

    def time_of(self, fd: float) -> datetime:
        return self.launch + timedelta(days=fd - 1)
