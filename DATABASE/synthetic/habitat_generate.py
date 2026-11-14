#!/usr/bin/env python3
"""habitat_generate.py | generator demo HABITAT (habitat w tunelu lawowym na Marsie), źródło `habitat_sim_v1`.

Plan: HABITAT/README.md (gałąź FARTEK-HABITAT); miejsce w bazie: DATABASE/schema/HABITAT.md.
Decyzja o wolumenie (HABITAT.md, "Decyzje"):
  * reading         - dane 1-min (wg kadencji kanału) TYLKO w oknach scenariuszy i dla "teraz" (ostatnie 6 h),
                      plus zawsze kanały zdarzeniowe / dzienne / tygodniowe / rzadsze (mocz, woda, mikroby, śluzy...)
  * reading_hourly  - cała misja (sol -2..600) dla wszystkich kanałów ciągłych; w oknach agregat z danych 1-min
  * scenario        - start_sol / end_sol okien

Wyjście: data/synthetic/habitat_demo/
  readings.csv.gz, hourly.csv.gz, events.csv, crew_location.csv, scenarios.json, meta.json
Ładowanie: DATABASE/etl/load_habitat.py

Deterministyczny (stały --seed). Wartości to SYMULACJA kalibrowana na źródłach z planu HABITAT, nie dane z habitatu.
  python3 DATABASE/synthetic/habitat_generate.py --seed 7
"""
from __future__ import annotations

import argparse
import bisect
import csv
import datetime as dt
import gzip
import io
import json
import math
import random
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VERSION = "habitat_sim_v1"
HABITAT = "MARS-LT-ELYSIUM"
EPOCH = dt.datetime(2039, 1, 1)          # początek sola 1 (= habitat.sol_epoch_utc)
SOL = 88775.244                          # s
FIRST_SOL, LAST_SOL = -2, 600            # sol -2..0 = pre-crew checkout (H14)
MARS_YEAR_SOLS = 668.6
CREW = ["C1", "C2", "C3", "C4"]
SEX = {"C1": "M", "C2": "F", "C3": "M", "C4": "F"}   # [ZAŁ] - potrzebne do progów wapnia w moczu
HOME = {"C1": "module_M1", "C2": "module_M1", "C3": "module_M2", "C4": "module_M2"}
WORK = {"C1": ("lab", "tunnel_common"), "C2": ("farm", "lab"), "C3": ("ambulatory", "farm"),
        "C4": ("tunnel_common", "lab")}
GYM_SLOT = {"C1": 13.5, "C2": 15.0, "C3": 16.5, "C4": 18.0}   # LST, 1.5 h
SHIELD = {"surface": 1.0, "airlock_A": 0.6, "airlock_B": 0.6, "cupola_1": 0.5, "cupola_2": 0.5,
          "cupola_3": 0.5, "cupola_4": 0.5, "tunnel_common": 0.15, "module_M1": 0.05, "module_M2": 0.05,
          "farm": 0.15, "ambulatory": 0.10, "gym": 0.10, "lab": 0.10}      # = zone.dose_shielding_factor [ZAŁ]
SURFACE_UGY_H = 10.0          # ~0.24 mGy/d absorbed (Curiosity RAD w bazie: 0.237 mGy/d)
DOSE_EQ_PER_UGY = 2.8e-3      # mSv per µGy  (0.67 mSv/d / 0.24 mGy/d)
CAREER_START_MSV = {"C1": 45.0, "C2": 12.0, "C3": 80.0, "C4": 25.0}     # [ZAŁ] dawka z wcześniejszych misji

# ---------------------------------------------------------------- czas
def ts_of(sol: float, lst_h: float = 0.0) -> float:
    """sekundy od EPOCH dla (sol, lokalny czas słoneczny w godzinach marsjańskich 0..24)."""
    return (sol - 1 + lst_h / 24.0) * SOL


def sol_of(t: float) -> int:
    return math.floor(t / SOL) + 1


def lst_of(t: float) -> float:
    return (t / SOL) % 1.0 * 24.0


def utc(t: float) -> dt.datetime:
    return EPOCH + dt.timedelta(seconds=t)


def fmt(t: float) -> str:
    return utc(t).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]


def sun(t: float) -> float:
    h = lst_of(t)
    return max(0.0, math.sin(math.pi * (h - 6) / 12)) if 6 <= h <= 18 else 0.0


def season(t: float) -> float:
    return math.sin(2 * math.pi * sol_of(t) / MARS_YEAR_SOLS)


def ramp(x, a, b):
    return 0.0 if x <= a else 1.0 if x >= b else (x - a) / (b - a)


# ---------------------------------------------------------------- scenariusze (sole stałe w demo)
SC = {
    "H14": dict(start=-2, end=0),
    "H1": dict(sol=142, lst=5.0, dur_h=12, start=141, end=143),
    "H6": dict(sol=94, start=94, end=95),
    "H2": dict(sol=210, lst=10.0, dur_h=6, start=209, end=211),
    "H4": dict(start=250, end=255),
    "H13": dict(start=280, end=293),
    "H3": dict(start=300, end=341, window=(321, 323)),
    "H5": dict(start=360, end=420),
    "H11": dict(sol=380, lst=14.0, dur_h=10, start=379, end=381),
    "H7": dict(start=400, end=440),
    "H12": dict(sol=430, lst=3.2, start=429, end=431),
    "H8": dict(sol=470, lst=10.5, start=469, end=472),
    "H9": dict(start=500, end=540, peak=515, window=(514, 516)),
    "H10": dict(sol=555, lst=11.0, dur_h=3, start=554, end=556),
}
T = {k: ts_of(v["sol"], v.get("lst", 0)) for k, v in SC.items() if "sol" in v}
SHELTER = (ts_of(SC["H8"]["sol"], 11.75), ts_of(SC["H8"]["sol"], 11.75) + 36 * 3600)   # schron po przerwanym EVA


def hours_since(t, key):
    return (t - T[key]) / 3600.0


def dust_tau(t):
    s = sol_of(t) + lst_of(t) / 24
    base = 0.6 + 0.2 * season(t)
    a, b, pk = SC["H9"]["start"], SC["H9"]["end"], SC["H9"]["peak"]
    if a <= s <= b:
        storm = 7.4 * (ramp(s, a, pk) if s <= pk else 1 - ramp(s, pk, b))
        return base + storm
    return base


# ---------------------------------------------------------------- serie ciągłe: (strefa, kanał, sensor)
# kanał: (jednostka, kadencja s, sd szumu)
CH = {
    "pressure_total": ("kPa", 60, 0.03), "ppo2_inspired": ("mmHg", 60, 0.2), "o2_fraction": ("%", 60, 0.05),
    "ppco2": ("mmHg", 60, 0.08), "temperature_air": ("°C", 60, 0.15), "rh": ("%RH", 60, 1.0),
    "pm10": ("mg/m3", 60, 0.002), "pm2_5": ("mg/m3", 60, 0.0015), "ultrafine_count": ("particles/cm3", 60, 120),
    "noise_leq": ("dBA", 60, 1.2), "illuminance": ("lux", 60, 8), "cct": ("K", 60, 30),
    "zone_occupancy": ("persons", 60, 0.0), "dose_rate": ("µGy/h", 60, 0.6), "heating_power": ("W", 60, 25),
    "water_tank_level": ("L", 600, 0.5), "water_recovery": ("%", 3600, 0.15), "strain": ("µε", 60, 1.5),
    "wall_convergence": ("mm", 600, 0.005), "wall_temperature": ("°C", 600, 0.03),
    "pressure_decay_rate": ("kPa/h", 600, 0.0008), "ext_pressure": ("Pa", 300, 3), "ext_temperature": ("°C", 300, 1.0),
    "dust_opacity_tau": ("", 3600, 0.02), "uv_flux": ("W/m2", 300, 0.3), "wind_speed": ("m/s", 300, 1.5),
    "power_fission": ("kW", 60, 0.15), "power_solar": ("kW", 60, 0.1), "moxie_o2_rate": ("g/h", 60, 0.8),
    "power_hvac": ("kW", 60, 0.1), "power_eclss": ("kW", 60, 0.15), "power_lighting": ("kW", 60, 0.05),
    "power_farm": ("kW", 60, 0.1), "solar_proton_flux_10MeV": ("pfu", 300, 0.0),
}
ATM_AB = [("pressure_total", "A"), ("pressure_total", "B"), ("ppo2_inspired", "A"), ("ppo2_inspired", "B"),
          ("ppco2", "A"), ("ppco2", "B")]
SERIES = []
for z in ("module_M1", "module_M2"):
    SERIES += [(z, c, s) for c, s in ATM_AB] + [(z, c, "") for c in (
        "o2_fraction", "temperature_air", "rh", "pm2_5", "noise_leq", "illuminance", "cct", "zone_occupancy",
        "heating_power", "water_tank_level", "water_recovery")] + [(z, "dose_rate", "A")]
SERIES += [("tunnel_common", c, s) for c, s in ATM_AB] + [("tunnel_common", c, "") for c in (
    "o2_fraction", "temperature_air", "rh", "pm10", "pm2_5", "ultrafine_count", "noise_leq", "illuminance",
    "zone_occupancy", "strain", "wall_convergence", "wall_temperature", "pressure_decay_rate")] + \
    [("tunnel_common", "dose_rate", "A"), ("tunnel_common", "dose_rate", "B")]
for z in ("cupola_1", "cupola_2", "cupola_3", "cupola_4"):
    SERIES += [(z, c, "") for c in ("temperature_air", "illuminance", "pressure_decay_rate")] + [(z, "dose_rate", "A")]
SERIES += [("cupola_2", "pressure_total", "A")]
for z in ("airlock_A", "airlock_B"):
    SERIES += [(z, "pressure_total", "A")] + [(z, c, "") for c in ("pm10", "pm2_5", "ultrafine_count", "zone_occupancy")]
SERIES += [("farm", "ppco2", "A"), ("farm", "ppo2_inspired", "A")] + [("farm", c, "") for c in (
    "o2_fraction", "temperature_air", "rh", "illuminance", "zone_occupancy", "power_farm")]
for z in ("ambulatory", "lab", "gym"):
    SERIES += [(z, "ppco2", "A")] + [(z, c, "") for c in ("temperature_air", "rh", "noise_leq", "illuminance",
                                                          "zone_occupancy")]
SERIES += [("lab", "pm2_5", "")]
SERIES += [("surface", c, "") for c in ("ext_pressure", "ext_temperature", "dust_opacity_tau", "uv_flux", "wind_speed",
                                        "power_fission", "power_solar", "moxie_o2_rate", "power_hvac", "power_eclss",
                                        "power_lighting", "solar_proton_flux_10MeV")] + \
          [("surface", "dose_rate", "A"), ("surface", "dose_rate", "B")]


# ---------------------------------------------------------------- załoga: harmonogram i lokalizacja
def eva_plan():
    """sol -> (para załogi). Co 7 soli od sola 10; nie w burzy pyłowej; H8 wymuszone na solu 470."""
    pairs = [("C1", "C4"), ("C2", "C3"), ("C1", "C2"), ("C3", "C4")]
    out = {}
    k = 0
    for s in range(10, LAST_SOL + 1, 7):
        if SC["H9"]["start"] <= s <= SC["H9"]["end"]:
            continue
        out[s] = pairs[k % len(pairs)]
        k += 1
    out[SC["H8"]["sol"]] = ("C1", "C4")
    return out


EVA = eva_plan()


def build_locations(rng):
    """lista przedziałów (crew, from_t, to_t, zone), posortowana."""
    segs = []
    for s in range(1, LAST_SOL + 1):
        for c in CREW:
            wa, wb = WORK[c]
            if rng.random() < 0.2:
                wa, wb = wb, wa
            day = []
            if s in EVA and c in EVA[s]:
                day = [(0, 8.5, HOME[c]), (8.5, 9.5, "airlock_A"), (9.5, 13.5, "surface"), (13.5, 14.5, "airlock_A"),
                       (14.5, 15.5, HOME[c]), (15.5, 21.5, wb), (21.5, 24.0, HOME[c])]
                if s == SC["H8"]["sol"]:      # SPE: przerwane EVA, potem schron
                    day = [(0, 8.5, HOME[c]), (8.5, 9.5, "airlock_A"), (9.5, 11.0, "surface"),
                           (11.0, 11.75, "airlock_A"), (11.75, 24.0, HOME[c])]
            else:
                g = GYM_SLOT[c]
                day = [(0, 8.5, HOME[c]), (8.5, 12.5, wa), (12.5, 13.5, "tunnel_common")]
                day += [(13.5, g, wb)] if g > 13.5 else []
                day += [(g, g + 1.5, "gym"), (g + 1.5, 21.5, wb), (21.5, 24.0, HOME[c])]
            for a, b, z in day:
                if b > a:
                    segs.append([c, ts_of(s, a), ts_of(s, b), z])
    # schron H8: wszyscy w modułach domowych
    out = []
    for c, a, b, z in segs:
        if b <= SHELTER[0] or a >= SHELTER[1]:
            out.append([c, a, b, z])
            continue
        if a < SHELTER[0]:
            out.append([c, a, SHELTER[0], z])
        if b > SHELTER[1]:
            out.append([c, SHELTER[1], b, z])
    for c in CREW:
        out.append([c, SHELTER[0], SHELTER[1], HOME[c]])
    # pre-crew: brak załogi przed solem 1
    out.sort(key=lambda x: (x[0], x[1]))
    merged = []
    for seg in out:
        if merged and merged[-1][0] == seg[0] and merged[-1][3] == seg[3] and abs(merged[-1][2] - seg[1]) < 1e-6:
            merged[-1][2] = seg[2]
        else:
            merged.append(seg)
    return merged


class Where:
    def __init__(self, segs):
        self.by = defaultdict(list)
        for c, a, b, z in segs:
            self.by[c].append((a, b, z))
        self.starts = {c: [x[0] for x in v] for c, v in self.by.items()}
        self.occ = defaultdict(float)             # (zone, hour_index) -> osobo-godziny
        for c, a, b, z in segs:
            h = math.floor(a / 3600)
            while h * 3600 < b:
                lo, hi = max(a, h * 3600), min(b, (h + 1) * 3600)
                if hi > lo:
                    self.occ[(z, h)] += (hi - lo) / 3600
                h += 1

    def zone(self, c, t):
        i = bisect.bisect_right(self.starts[c], t) - 1
        if i >= 0:
            a, b, z = self.by[c][i]
            if a <= t < b:
                return z
        return None

    def count(self, z, t):
        return sum(1 for c in CREW if self.zone(c, t) == z)


# ---------------------------------------------------------------- model kanałów
class Model:
    def __init__(self, where: Where, rng):
        self.w = where
        self.rng = rng
        self.eva_ends = sorted(ts_of(s, 14.5 if s != SC["H8"]["sol"] else 11.75) for s in EVA)

    def occupancy(self, z, t, minute):
        return float(self.w.count(z, t)) if minute else self.w.occ.get((z, math.floor(t / 3600)), 0.0)

    def since_eva(self, t):
        i = bisect.bisect_right(self.eva_ends, t) - 1
        return (t - self.eva_ends[i]) / 3600 if i >= 0 else 1e9

    def ppo2_offset(self, t):
        s = sol_of(t) + lst_of(t) / 24
        off = 0.0
        a, b = SC["H3"]["start"], SC["H3"]["end"]
        if a <= s < b + 1:                                   # H3: powolny spadek ~0.07 mmHg/sol, naprawa sol 341
            off -= 0.07 * (min(s, b) - a)
            if s >= b:
                off *= math.exp(-(s - b) * 24 / 3)
        h = hours_since(t, "H2")                              # H2: awaria generatora O2
        if 0 <= h < 10:
            dur = SC["H2"]["dur_h"]
            off -= 5.0 * (1 - math.exp(-h / 1.5)) if h < dur else 5.0 * (1 - math.exp(-dur / 1.5)) * math.exp(-(h - dur) / 0.8)
        return off

    def value(self, z, ch, sensor, t, minute=False):
        """wartość bez szumu (szum dodaje wywołujący) + jakość."""
        occ = self.occupancy(z, t, minute)
        sn, h = sun(t), lst_of(t)
        q = "ok"
        crewed = t >= 0
        if ch == "pressure_total":
            v = 56.5
            hl = hours_since(t, "H11")
            if z in ("cupola_2", "tunnel_common") and 0 <= hl < SC["H11"]["dur_h"] + 3:
                v -= 0.25 * ramp(hl, 0, 2) if hl < SC["H11"]["dur_h"] else 0.25 * math.exp(-(hl - SC["H11"]["dur_h"]))
            if t < 0:                                          # H14: test szczelności (mały skok ciśnienia)
                v += 0.4 if 6 <= h < 10 else 0.0
            v += 0.02 if sensor == "B" else 0.0
        elif ch == "ppo2_inspired":
            v = 128.4 + self.ppo2_offset(t) + (1.2 * sn if z == "farm" else 0) + (0.1 if sensor == "B" else 0)
        elif ch == "o2_fraction":
            v = 33.8 + 0.27 * self.ppo2_offset(t) + (0.3 * sn if z == "farm" else 0)
        elif ch == "ppco2":
            base = {"module_M1": 1.8, "module_M2": 1.8, "tunnel_common": 1.7, "farm": 1.6 - 0.4 * sn,
                    "gym": 1.8, "lab": 1.8, "ambulatory": 1.7}[z]
            v = base + (0.6 if z == "gym" else 0.22) * occ
            hh = hours_since(t, "H1")                          # H1: awaria scrubbera w M1
            if z == "module_M1" and 0 <= hh < SC["H1"]["dur_h"] + 5:
                dur = SC["H1"]["dur_h"]
                peak = min(7.5, 2.2 + 0.45 * min(hh, dur))
                v = max(v, peak if hh < dur else 2.0 + (peak - 2.0) * math.exp(-(hh - dur) / 1.0))
            v += 0.05 if sensor == "B" else 0.0
        elif ch == "temperature_air":
            v = {"cupola": 19.5 + 2.5 * sn, "airlock": 19.0, "farm": 24.0, "gym": 21.5 + 1.2 * occ}.get(
                z.split("_")[0], 22.4 + 0.4 * sn)
        elif ch == "rh":
            v = {"farm": 68.0, "gym": 46 + 5 * occ}.get(z, 44 + 2 * math.sin(2 * math.pi * h / 24))
        elif ch in ("pm10", "pm2_5", "ultrafine_count"):
            base = {"pm10": 0.012, "pm2_5": 0.008, "ultrafine_count": 1500.0}[ch]
            spike = {"pm10": 0.035, "pm2_5": 0.02, "ultrafine_count": 9000.0}[ch]
            v = base
            if z.startswith("airlock") or z == "tunnel_common":
                k = 1.0 if z == "airlock_A" else 0.3 if z == "tunnel_common" else 0.1
                se = self.since_eva(t)
                v += k * spike * math.exp(-se / 1.5) if se < 12 else 0
                if sol_of(t) == SC["H6"]["sol"]:                # H6: dużo pyłu po EVA
                    se6 = (t - ts_of(SC["H6"]["sol"], 14.5)) / 3600
                    big = {"pm10": 0.24, "pm2_5": 0.14, "ultrafine_count": 60000.0}[ch]
                    v += k * big * math.exp(-se6 / 2.0) if 0 <= se6 < 24 else 0
        elif ch == "noise_leq":
            sleep = h < 7.5 or h > 22.5
            v = {"gym": 52 + 10 * min(occ, 1)}.get(z, 44.0 if sleep and z.startswith("module") else 56.0 + 2 * min(occ, 2))
        elif ch == "illuminance":
            if z.startswith("module"):
                v = 5.0 if (h < 7.0 or h > 22.5) else 420.0 if h < 18 else 250.0
            elif z.startswith("cupola"):
                v = 2500 * sn * math.exp(-(dust_tau(t) - 0.6) * 0.35) + 20
            elif z == "tunnel_common":
                v = 120 * sn * math.exp(-(dust_tau(t) - 0.6) * 0.35) + (150 if 7 <= h <= 22 else 10)
            elif z == "farm":
                v = 600.0 if 5 <= h < 21 else 0.0
            else:
                v = 500.0 if 7 <= h <= 22 and occ > 0 else 50.0
        elif ch == "cct":
            v = 2700.0 if (h < 7 or h > 22.5) else 5000.0 if h < 18 else 3200.0
        elif ch == "zone_occupancy":
            v = occ
        elif ch == "dose_rate":
            v = SURFACE_UGY_H * (1 - 0.08 * season(t)) * SHIELD[z]
            hs = hours_since(t, "H8")                          # H8: SPE
            if 0 <= hs < 48:
                boost = 60 * (ramp(hs, 0, 1.5) if hs < 1.5 else math.exp(-(hs - 1.5) / 8))
                v *= 1 + boost
                if sensor == "B" and hs < 6 and z == "surface":
                    q = "suspect"                              # zakłócenia EM wrażliwej elektroniki
        elif ch == "heating_power":
            v = 1800 + 600 * math.cos(2 * math.pi * (h - 4) / 24) - 300 * season(t)
        elif ch == "water_tank_level":
            v = 1650 + 300 * (1 - (sol_of(t) % 7 + h / 24) / 7)
        elif ch == "water_recovery":
            v = 98.2
        elif ch == "strain":
            v = 120 + 2 * math.sin(2 * math.pi * h / 24) + (25 if t >= T["H12"] else 0)
            hq = hours_since(t, "H12")
            v += 40 * math.exp(-hq / 0.2) if 0 <= hq < 2 else 0
        elif ch == "wall_convergence":
            v = 0.002 * max(sol_of(t), 0) + (0.8 if t >= T["H12"] else 0)
        elif ch == "wall_temperature":
            v = -45.0 + 0.3 * season(t)
        elif ch == "pressure_decay_rate":
            v = 0.002
            hl = hours_since(t, "H11")
            if z == "cupola_2" and 0 <= hl < SC["H11"]["dur_h"]:
                v = 0.45
        elif ch == "ext_pressure":
            v = (760 + 60 * season(t)) * (1 - 0.08 * math.cos(2 * math.pi * (h - 6) / 24)) + 15 * (dust_tau(t) > 3)
        elif ch == "ext_temperature":
            damp = math.exp(-(dust_tau(t) - 0.6) * 0.15)
            v = -60 - 10 * season(t) + 50 * sn * damp - 10 * (1 - damp)
        elif ch == "dust_opacity_tau":
            v = dust_tau(t)
        elif ch == "uv_flux":
            v = 20 * sn * math.exp(-(dust_tau(t) - 0.6) * 0.4)
        elif ch == "wind_speed":
            v = 5 + 4 * sn + (10 if dust_tau(t) > 3 else 0)
        elif ch == "power_fission":
            v = 40.0
        elif ch == "power_solar":
            v = 12 * sn * math.exp(-(dust_tau(t) - 0.6) * 0.4)
        elif ch == "moxie_o2_rate":
            v = 40.0
        elif ch == "power_hvac":
            v = 6.0 + 0.6 * (1 + math.cos(2 * math.pi * (h - 4) / 24))
        elif ch == "power_eclss":
            v = 8.0 if crewed else 5.0
        elif ch == "power_lighting":
            v = 3.0 + (1.5 if (h < 7 or h > 19) else 0.5)
        elif ch == "power_farm":
            v = 6.0 if 5 <= h < 21 else 1.0
        elif ch == "solar_proton_flux_10MeV":
            v = 0.3
            hs = hours_since(t, "H8")
            if 0 <= hs < 48:
                v += 2500 * (ramp(hs, -0.5, 2) if hs < 2 else math.exp(-(hs - 2) / 9))
        else:
            raise KeyError(ch)
        return v, q


def noisy(rng, ch, v, minute):
    unit, cad, sd = CH[ch]
    if ch == "zone_occupancy":
        return v
    if ch == "solar_proton_flux_10MeV":
        return max(0.05, v * (1 + rng.gauss(0, 0.1)))
    x = v + rng.gauss(0, sd if minute else sd / math.sqrt(max(1, 3600 // cad)))
    if ch in ("pm10", "pm2_5", "ultrafine_count", "illuminance", "pressure_decay_rate", "uv_flux", "power_solar",
              "dose_rate", "wind_speed", "ppco2"):
        x = max(0.0, x)
    return x


ROUND = {"pressure_total": 3, "ppo2_inspired": 2, "o2_fraction": 2, "ppco2": 3, "pm10": 4, "pm2_5": 4,
         "ultrafine_count": 0, "illuminance": 0, "cct": 0, "heating_power": 0, "ext_pressure": 1,
         "dust_opacity_tau": 3, "pressure_decay_rate": 4, "wall_convergence": 3, "solar_proton_flux_10MeV": 3,
         "zone_occupancy": 2, "dose_rate": 3, "wall_temperature": 2}


def rnd(ch, x):
    return round(x, ROUND.get(ch, 2))


# ---------------------------------------------------------------- okna 1-min
def windows():
    """[(kod, from_t, to_t, filtr serii)] - okna wyrównane do pełnych godzin."""
    def w(code, a, b, pred):
        lo = math.floor(ts_of(a) / 3600) * 3600
        hi = math.ceil(ts_of(b + 1) / 3600) * 3600
        return (code, lo, hi, pred)
    pz = {"module_M1", "module_M2", "tunnel_common"}
    last = math.floor(ts_of(LAST_SOL + 1) / 3600) * 3600
    return [
        w("H14", -2, 0, lambda z, c: c in ("pressure_total", "pressure_decay_rate") and (z in pz or z.startswith("cupola"))),
        w("H6", 94, 94, lambda z, c: c in ("pm10", "pm2_5", "ultrafine_count") and z in ("airlock_A", "tunnel_common")),
        w("H1", 141, 143, lambda z, c: z == "module_M1" and c in ("ppco2", "zone_occupancy")),
        w("H2", 209, 211, lambda z, c: c in ("ppo2_inspired", "o2_fraction") and z in pz | {"farm"}),
        w("H3", 321, 323, lambda z, c: c == "ppo2_inspired" and z in pz),
        w("H11", 379, 381, lambda z, c: z in ("cupola_2", "tunnel_common") and c in ("pressure_total", "pressure_decay_rate")),
        w("H12", 429, 431, lambda z, c: z == "tunnel_common" and c in ("strain", "wall_convergence")),
        w("H8", 469, 472, lambda z, c: c in ("dose_rate", "solar_proton_flux_10MeV")),
        w("H9", 514, 516, lambda z, c: z == "surface" and c in ("dust_opacity_tau", "power_solar", "uv_flux",
                                                                 "ext_temperature", "wind_speed")),
        ("NOW", last - 6 * 3600, last, lambda z, c: True),
    ]


# ---------------------------------------------------------------- generator
class Gen:
    def __init__(self, seed):
        self.rng = random.Random(seed)
        self.readings = []
        self.hourly = {}
        self.events = []
        self.evn = 0

    def reading(self, t, z, ch, unit, v=None, text=None, crew=None, sensor="", q="ok"):
        self.readings.append((fmt(t), sol_of(t), z, crew or "", ch, sensor, "" if v is None else v,
                              text or "", unit, q))

    def event(self, etype, a, b=None, z=None, crew=None, severity="info", details=None):
        self.evn += 1
        self.events.append(dict(event_code=f"evt-{self.evn:06d}", event_type=etype, start_utc=fmt(a),
                                end_utc=fmt(b) if b is not None else "", sol=sol_of(a), zone_code=z or "",
                                crew_code=crew or "", severity=severity,
                                details=json.dumps(details or {}, ensure_ascii=False)))

    # -- serie ciągłe: 1-min w oknach, godzinowe wszędzie
    def continuous(self, model: Model):
        rng = self.rng
        t0 = math.floor(ts_of(FIRST_SOL) / 3600) * 3600
        t1 = math.ceil(ts_of(LAST_SOL + 1) / 3600) * 3600
        wins = windows()
        covered = set()
        for code, a, b, pred in wins:
            for z, ch, sensor in SERIES:
                if not pred(z, ch):
                    continue
                unit, cad, _ = CH[ch]
                acc = defaultdict(list)
                t = a
                while t < b:
                    v, q = model.value(z, ch, sensor, t, minute=True)
                    x = rnd(ch, noisy(rng, ch, v, True))
                    if rng.random() < 2e-4:
                        q = "suspect"
                    self.reading(t, z, ch, unit, x, sensor=sensor, q=q)
                    acc[math.floor(t / 3600)].append((x, q))
                    t += cad
                for hidx, vals in acc.items():
                    xs = [x for x, _ in vals]
                    self.hourly[(z, "", ch, sensor, hidx)] = (len(xs), sum(xs) / len(xs), min(xs), max(xs),
                                                              sum(q == "suspect" for _, q in vals),
                                                              sum(q == "sensor_fault" for _, q in vals))
                    covered.add((z, ch, sensor, hidx))
        for hidx in range(int(t0 // 3600), int(t1 // 3600)):
            tm = hidx * 3600 + 1800
            for z, ch, sensor in SERIES:
                if (z, ch, sensor, hidx) in covered:
                    continue
                unit, cad, sd = CH[ch]
                v, q = model.value(z, ch, sensor, tm)
                m = rnd(ch, noisy(rng, ch, v, False))
                spread = 2 * sd + abs(v) * 0.002
                n = max(1, 3600 // cad)
                lo, hi = (m, m) if ch == "zone_occupancy" else (rnd(ch, m - spread * rng.uniform(0.5, 1)),
                                                                rnd(ch, m + spread * rng.uniform(0.5, 1)))
                if ch == "solar_proton_flux_10MeV" or ch.startswith("pm") or ch == "dose_rate":
                    lo = max(0.0, lo)
                self.hourly[(z, "", ch, sensor, hidx)] = (n, m, lo, hi, n if q == "suspect" else 0, 0)

    # -- dawka osobista (godzinowo per osoba)
    def personal_dose(self, model: Model, where: Where):
        cum = dict(CAREER_START_MSV)
        t0 = math.floor(ts_of(1) / 3600)
        t1 = math.ceil(ts_of(LAST_SOL + 1) / 3600)
        for hidx in range(t0, t1):
            for c in CREW:
                d = 0.0
                for k in range(4):                         # 4 próbki / godzinę
                    t = hidx * 3600 + 450 + 900 * k
                    z = where.zone(c, t)
                    if z:
                        d += model.value(z, "dose_rate", "A", t)[0] * 0.25 * DOSE_EQ_PER_UGY
                cum[c] += d
                self.hourly[(HOME[c], c, "dose_personal_cum", "", hidx)] = (60, round(cum[c], 4), round(cum[c] - d, 4),
                                                                           round(cum[c], 4), 0, 0)
        last = ts_of(LAST_SOL + 1) - 60
        for c in CREW:
            self.reading(last, HOME[c], "dose_personal_cum", "mSv", round(cum[c], 4), crew=c)

    # -- lokalizacja załogi
    def locations(self, segs):
        rows = []
        for c, a, b, z in segs:
            rows.append(dict(crew_code=c, from_utc=fmt(a), to_utc=fmt(b), zone_code=z))
            self.reading(a, z, "crew_location", "", text=z, crew=c)
        return rows

    # -- osobowe: woda, mocz, kał
    def personal(self):
        rng = self.rng
        for s in range(1, LAST_SOL + 1):
            for c in CREW:
                home = HOME[c]
                eva_h = 4.0 if (s in EVA and c in EVA[s]) else 0.0
                early = math.exp(-s / 15)                  # pierwsze ~30 soli: mniej moczu, niższe pH, mniej cytrynianu
                intake = rng.gauss(2.7, 0.25) + 0.24 * eva_h
                h4 = c == "C2" and SC["H4"]["start"] <= s <= SC["H4"]["end"]
                if h4:
                    intake = rng.uniform(1.0, 1.3)
                draws = 6
                for k in range(draws):
                    self.reading(ts_of(s, 7.8 + 2.4 * k + rng.uniform(-0.3, 0.3)), home, "water_intake", "mL",
                                 round(intake * 1000 / draws + rng.gauss(0, 30)), crew=c)
                vol = max(0.4, intake * 0.62 * (1 - 0.35 * early) + rng.gauss(0, 0.12))
                if h4:
                    vol = rng.uniform(0.55, 0.75)
                n_void = 3 if h4 else rng.choice([5, 6, 6, 7])
                sg_base = 1.010 + max(0.0, 2.0 - vol) * 0.012
                for k in range(n_void):
                    tv = ts_of(s, 7.4 + k * (14.5 / n_void) + rng.uniform(-0.3, 0.3))
                    self.reading(tv, home, "urine_void_volume", "mL", round(vol * 1000 / n_void + rng.gauss(0, 25)), crew=c)
                    self.reading(tv, home, "urine_specific_gravity", "", round(sg_base + rng.gauss(0, 0.002), 3), crew=c)
                    self.reading(tv, home, "urine_ph", "pH", round(6.1 - 0.5 * early + rng.gauss(0, 0.35), 1), crew=c)
                tm = ts_of(s, 7.4)                           # pierwszy poranny mocz: paski
                for an in ("glucose", "ketones", "protein", "blood", "nitrite", "leukocytes", "bilirubin"):
                    pos = an == "ketones" and h4 and s >= SC["H4"]["start"] + 2
                    self.reading(tm, home, f"urine_dipstick_{an}", "", text="positive" if pos else "negative", crew=c)
                td = ts_of(s, 23.5)
                ca = (200 if SEX[c] == "M" else 170) + 40 * (1 - early) + rng.gauss(0, 18)
                if c == "C3" and SC["H5"]["start"] <= s <= SC["H5"]["end"]:   # H5: wapń rośnie, pominięte ćwiczenia
                    ca += 130 * ramp(s, SC["H5"]["start"], SC["H5"]["end"])
                elif c == "C3" and SC["H5"]["end"] < s <= SC["H5"]["end"] + 30:
                    ca += 130 * (1 - ramp(s, SC["H5"]["end"], SC["H5"]["end"] + 30))
                for ch, unit, v in (("water_intake_24h", "L/d", round(intake, 2)),
                                    ("urine_volume_24h", "L/d", round(vol, 2)),
                                    ("void_count_24h", "count/d", n_void),
                                    ("urine_calcium_24h", "mg/d", round(ca)),
                                    ("urine_oxalate_24h", "mg/d", round(30 + rng.gauss(0, 6))),
                                    ("urine_citrate_24h", "mg/d",
                                     round((600 if SEX[c] == "M" else 700) * (1 - 0.25 * early) + rng.gauss(0, 80)))):
                    self.reading(td, home, ch, unit, v, crew=c)
                tf = ts_of(s, 8.0 + rng.uniform(-0.5, 1.5))
                self.reading(tf, home, "feces_event", "", 1, crew=c)
                self.reading(tf, home, "feces_mass", "g", round(max(40, rng.gauss(123, 30))), crew=c)
                self.reading(tf, home, "feces_bristol", "score 1–7", rng.choice([3, 3, 4, 4, 4, 2, 5]), crew=c)
                if s % 7 == 0:
                    self.reading(ts_of(s, 9.0), home, "urine_albumin_creatinine", "mg/g",
                                 round(max(2, rng.gauss(10, 4)), 1), crew=c)
                if s in (30, 570):
                    self.reading(ts_of(s, 9.5), home, "microbiome_swab", "", 1, crew=c)
        # pojemniki na kał per moduł (~13 użyć na pojemnik)
        for m in ("module_M1", "module_M2"):
            fill = 0.0
            for s in range(1, LAST_SOL + 1):
                for _ in range(2):
                    fill += 100 / 13
                    if fill > 100:
                        fill = 100 / 13
                    self.reading(ts_of(s, 8.5 + _), m, "fecal_canister_fill", "%", round(fill, 1))

    # -- woda, VOC, mikroby (rzadkie)
    def periodic(self):
        rng = self.rng
        mods = ("module_M1", "module_M2")
        for s in range(1, LAST_SOL + 1):
            if s % 7 == 0:
                for m in mods:
                    toc = 0.3 + rng.gauss(0, 0.06)
                    if m == "module_M2" and SC["H7"]["start"] <= s <= SC["H7"]["end"]:   # H7: TOC rośnie
                        toc += 1.5 * ramp(s, SC["H7"]["start"], SC["H7"]["end"])
                    self.reading(ts_of(s, 9.0), m, "water_toc", "mg/L", round(max(0.05, toc), 2))
                    self.reading(ts_of(s, 9.1), m, "water_silver", "µg/L", round(rng.gauss(300, 35)))
            if s % 30 == 0:
                for m in mods:
                    self.reading(ts_of(s, 9.2), m, "water_coliform", "", text="not_detected")
            if s % 90 == 0:
                for m in mods:
                    self.reading(ts_of(s, 9.3), m, "water_bacteria", "CFU/mL", round(rng.uniform(1, 15)))
                for z in ("module_M1", "module_M2", "tunnel_common", "farm", "ambulatory", "gym", "lab"):
                    self.reading(ts_of(s, 10), z, "air_bacteria", "CFU/m3", round(rng.uniform(50, 400)))
                    self.reading(ts_of(s, 10), z, "air_fungi", "CFU/m3", round(rng.uniform(2, 40)))
                    self.reading(ts_of(s, 10), z, "surface_bacteria", "CFU/100cm2",
                                 round(rng.uniform(200, 3000) * (2.5 if z == "farm" else 1)))
                    self.reading(ts_of(s, 10), z, "surface_fungi", "CFU/100cm2", round(rng.uniform(1, 30)))
        # VOC co 6 h (realnie AQM co 73 h)
        t = math.ceil(ts_of(1) / 21600) * 21600
        while t < ts_of(LAST_SOL + 1):
            for z in ("module_M1", "module_M2", "tunnel_common", "lab"):
                self.reading(t, z, "voc_formaldehyde", "ppm", round(max(0.005, rng.gauss(0.025, 0.008)), 4))
                self.reading(t, z, "voc_benzene", "ppm", round(max(0.0, rng.gauss(0.002, 0.001)), 4))
            t += 21600

    # -- zdarzenia, śluzy, statusy, scenariusze zdarzeniowe
    def happenings(self, model: Model):
        rng = self.rng
        e, r = self.event, self.reading
        e("mode_change", ts_of(-2), ts_of(1), "tunnel_common", details={"mode": "pre_crew_checkout"})
        r(ts_of(-2), "tunnel_common", "habitat_mode", "", text="pre_crew_checkout")
        r(ts_of(1), "tunnel_common", "habitat_mode", "", text="nominal")
        e("mode_change", ts_of(1), None, "tunnel_common", details={"mode": "nominal"})
        for z in ("cupola_1", "cupola_2", "cupola_3", "cupola_4", "airlock_A", "airlock_B", "tunnel_common"):
            r(ts_of(-2), z, "leak_detector", "", text="ok")
        for z in ("lab", "airlock_A", "airlock_B"):
            r(ts_of(-2), z, "pp_barrier_status", "", text="ok")
        for s, pair in sorted(EVA.items()):
            h8 = s == SC["H8"]["sol"]
            a, b = ts_of(s, 9.5), ts_of(s, 11.0 if h8 else 13.5)
            for c in pair:
                e("eva_start", a, None, "surface", c, details={"airlock": "airlock_A"})
                e("eva_end", b, None, "surface", c, "major" if h8 else "info",
                  {"aborted": True, "reason": "SPE"} if h8 else {})
            for tc, kind in ((a - 600, "egress"), (b + 600, "ingress")):
                e("airlock_cycle", tc, tc + 900, "airlock_A", details={"direction": kind, "crew": list(pair)})
                r(tc, "airlock_A", "airlock_cycle", "", 1)
                r(tc, "airlock_A", "airlock_gas_loss", "kg/cycle", round(rng.gauss(0.30, 0.04), 3))
        # H1
        t1 = T["H1"]
        e("scrubber_fault", t1, t1 + SC["H1"]["dur_h"] * 3600, "module_M1", severity="major",
          details={"subsystem": "CO2_removal_M1", "scenario": "H1"})
        r(t1, "module_M1", "subsystem_status", "", text="fault")
        r(t1 + SC["H1"]["dur_h"] * 3600, "module_M1", "subsystem_status", "", text="ok")
        # H2
        t2 = T["H2"]
        e("o2_gen_fault", t2, t2 + SC["H2"]["dur_h"] * 3600, "tunnel_common", severity="major",
          details={"subsystem": "O2_generation", "scenario": "H2"})
        r(t2, "tunnel_common", "subsystem_status", "", text="fault")
        r(t2 + SC["H2"]["dur_h"] * 3600, "tunnel_common", "subsystem_status", "", text="ok")
        # H3 naprawa po powolnym spadku O2
        e("maintenance", ts_of(SC["H3"]["end"], 9), ts_of(SC["H3"]["end"], 13), "tunnel_common",
          details={"subsystem": "O2_generation", "action": "recalibration / membrane swap", "scenario": "H3"})
        # H6
        e("eva_end", ts_of(SC["H6"]["sol"], 13.6), None, "airlock_A", severity="minor",
          details={"note": "heavy dust carry-in", "scenario": "H6"})
        # H8
        t8 = T["H8"]
        e("spe_onset", t8, t8 + 36 * 3600, "surface", severity="critical",
          details={"peak_pfu": 2500, "noaa_scale": "S3", "scenario": "H8"})
        e("mode_change", SHELTER[0], SHELTER[1], "tunnel_common", severity="major", details={"mode": "shelter"})
        r(SHELTER[0], "tunnel_common", "habitat_mode", "", text="shelter")
        r(SHELTER[1], "tunnel_common", "habitat_mode", "", text="nominal")
        # H9
        e("dust_storm", ts_of(SC["H9"]["start"]), ts_of(SC["H9"]["end"] + 1), "surface", severity="major",
          details={"type": "global", "peak_tau": round(dust_tau(ts_of(SC["H9"]["peak"], 12)), 1), "scenario": "H9"})
        # H10: wyciek NH3 w laboratorium (odczyty 1-min)
        t10 = T["H10"]
        e("nh3_leak", t10, t10 + SC["H10"]["dur_h"] * 3600, "lab", severity="critical",
          details={"source": "lab refrigeration loop", "scenario": "H10"})
        tt = math.floor(ts_of(SC["H10"]["start"]) / 3600) * 3600
        while tt < ts_of(SC["H10"]["end"] + 1):
            hh = (tt - t10) / 3600
            v = 0.05 + (38 * ramp(hh, 0, 0.3) if 0 <= hh < SC["H10"]["dur_h"] else
                        38 * math.exp(-(hh - SC["H10"]["dur_h"]) / 0.5) if hh >= SC["H10"]["dur_h"] else 0)
            r(tt, "lab", "nh3", "ppm", round(max(0, v + rng.gauss(0, 0.03)), 2))
            tt += 60
        # H11: wyciek na złączu kopuła-skała (cupola_2)
        t11 = T["H11"]
        e("leak", t11, t11 + SC["H11"]["dur_h"] * 3600, "cupola_2", severity="major",
          details={"joint": "cupola_2 / rock seal", "scenario": "H11"})
        tt = math.floor(ts_of(SC["H11"]["start"]) / 3600) * 3600
        while tt < ts_of(SC["H11"]["end"] + 1):
            hl = (tt - t11) / 3600
            r(tt, "cupola_2", "leak_detector", "", text="leak" if 0 <= hl < SC["H11"]["dur_h"] else "ok")
            tt += 60
        e("maintenance", t11 + SC["H11"]["dur_h"] * 3600 - 2 * 3600, t11 + SC["H11"]["dur_h"] * 3600, "cupola_2",
          details={"action": "seal repair", "scenario": "H11"})
        # H12 + małe tła sejsmiczne
        for s, lst, mag, sev in ((SC["H12"]["sol"], SC["H12"]["lst"], 3.1, "major"), (77, 2.0, 1.4, "info"),
                                 (233, 15.0, 1.8, "info"), (512, 6.5, 1.2, "info")):
            ts = ts_of(s, lst)
            e("seismic", ts, ts + 120, "tunnel_common", severity=sev, details={"magnitude": mag})
            r(ts, "tunnel_common", "seismic_event", "magnitude", mag)
        # H13
        e("comm_blackout", ts_of(SC["H13"]["start"]), ts_of(SC["H13"]["end"] + 1), None, severity="major",
          details={"reason": "solar conjunction", "scenario": "H13"})
        # okresowa konserwacja / zrzut odpadów
        for s in range(20, LAST_SOL + 1, 30):
            e("waste_dump", ts_of(s, 16), ts_of(s, 16.5), "airlock_B")
            r(ts_of(s, 16), "airlock_B", "waste_dump_event", "", 1)


def gz_text(path: Path):
    """gzip z mtime=0 -> identyczne bajty przy tym samym seedzie."""
    raw = open(path, "wb")
    return io.TextIOWrapper(gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0), encoding="utf-8",
                            newline=""), raw


def scenarios_out():
    out = {}
    for code, v in SC.items():
        a, b = v.get("window", (v["start"], v["end"]))
        out[code] = dict(start_sol=v["start"], end_sol=v["end"], window_1min=[a, b] if code not in ("H4", "H5", "H7", "H13") else None)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", default=str(ROOT / "data" / "synthetic" / "habitat_demo"))
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    g = Gen(a.seed)
    segs = build_locations(g.rng)
    where = Where(segs)
    model = Model(where, g.rng)
    loc_rows = g.locations(segs)
    g.happenings(model)
    g.personal()
    g.periodic()
    g.continuous(model)
    g.personal_dose(model, where)

    g.readings.sort(key=lambda r: (r[0], r[2], r[4], r[3], r[5]))
    f, raw = gz_text(out / "readings.csv.gz")
    with raw, f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["ts_utc", "sol", "zone_code", "crew_code", "channel_code", "sensor", "value_num", "value_text",
                    "unit", "quality"])
        w.writerows(g.readings)
    f, raw = gz_text(out / "hourly.csv.gz")
    with raw, f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["hour_utc", "sol", "zone_code", "crew_code", "channel_code", "sensor", "n_samples", "value_mean",
                    "value_min", "value_max", "n_suspect", "n_fault"])
        for (z, c, ch, s, hidx), (n, m, lo, hi, ns, nf) in sorted(g.hourly.items(), key=lambda kv: (kv[0][4], kv[0][:4])):
            w.writerow([fmt(hidx * 3600)[:19], sol_of(hidx * 3600 + 1800), z, c, ch, s, n, rnd(ch, m), rnd(ch, lo),
                        rnd(ch, hi), ns, nf])
    for name, rows in (("events.csv", g.events), ("crew_location.csv", loc_rows)):
        with (out / name).open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0]), lineterminator="\n")
            w.writeheader()
            w.writerows(rows)
    (out / "scenarios.json").write_text(json.dumps(scenarios_out(), indent=1) + "\n")
    meta = dict(generator=VERSION, habitat=HABITAT, seed=a.seed, sol_epoch_utc=EPOCH.isoformat(), sol_length_s=SOL,
                sols=[FIRST_SOL, LAST_SOL], crew_sex_assumption=SEX, career_start_msv=CAREER_START_MSV,
                counts=dict(readings=len(g.readings), hourly=len(g.hourly), events=len(g.events),
                            crew_location=len(loc_rows), series=len(SERIES)),
                note="SIMULATED data (source_flag=simulated). Calibration: HABITAT/README.md sources; "
                     "surface dose from Curiosity RAD in this DB.")
    (out / "meta.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False) + "\n")
    print(json.dumps(meta["counts"]))


if __name__ == "__main__":
    main()
