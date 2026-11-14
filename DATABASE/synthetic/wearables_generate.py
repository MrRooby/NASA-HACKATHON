#!/usr/bin/env python3
"""Deterministic wearable telemetry for SYN-MARS-HAB-600."""
from __future__ import annotations

import argparse
import csv
import gzip
import json
import random
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "synthetic" / "wearables_demo"
EPOCH = datetime(2039, 1, 1)
SOL_SECONDS = 88775.244
PROFILES = [("C1", "SYN-02", "module_M1"), ("C2", "SYN-01", "module_M2"),
            ("C3", "SYN-03", "module_M1"), ("C4", "SYN-04", "module_M2")]
LIMBS = ("left_arm", "right_arm", "left_leg", "right_leg", "head_eeg")


def ts(sol: float, seconds: int = 0) -> datetime:
    return EPOCH + timedelta(seconds=sol * SOL_SECONDS + seconds)


def write_csv(path: Path, fields, rows, compressed=False):
    opener = gzip.open if compressed else open
    with opener(path, "wt", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--output", type=Path, default=OUT)
    a = ap.parse_args()
    rng = random.Random(a.seed)
    out = a.output
    out.mkdir(parents=True, exist_ok=True)

    devices, did = [], {}
    n = 1
    for crew, subject, location in PROFILES:
        for limb in LIMBS:
            code = f"W-{crew}-{limb}"
            did[code] = n
            devices.append(dict(device_code=code, crew_code=crew, subject_code=subject,
                                 limb=limb, serial_no=f"SN-{n:04d}", location_code=location,
                                 installed_at=str(ts(0))))
            n += 1
    write_csv(out / "devices.csv", devices[0].keys(), devices)

    scenarios = [
        dict(code="W1", name="C4 left-leg circulation issue", subject_code="SYN-04",
             limb="left_leg", start_sol=142, end_sol=143,
             expected_reaction="flag limb perfusion discrepancy and inspect C4"),
        dict(code="W2", name="low battery and disconnect", subject_code="SYN-01",
             limb="right_arm", start_sol=250, end_sol=251,
             expected_reaction="replace battery and reconnect device"),
        dict(code="W3", name="EVA link loss and buffering", subject_code="SYN-02",
             limb="head_eeg", start_sol=470, end_sol=471,
             expected_reaction="retain buffered samples and restore EVA link"),
        dict(code="W4", name="sensor fault", subject_code="SYN-03",
             limb="right_leg", start_sol=555, end_sol=556,
             expected_reaction="quarantine faulty sensor"),
    ]
    json.dump({x["code"]: x for x in scenarios}, (out / "scenarios.json").open("w"), indent=2)

    sample_fields = ["device_code", "ts_utc", "sol", "heart_rate_bpm", "spo2_pct",
                     "skin_temperature_c", "perfusion_index", "eeg_band", "battery_pct",
                     "connection_state", "quality", "location_code"]
    samples = []
    windows = [(142, 143), (250, 251), (470, 471), (555, 556), (600, 600)]
    for code, ident in did.items():
        crew = code.split("-")[1]
        limb = code[len(f"W-{crew}-"):]
        location = next(p[2] for p in PROFILES if p[0] == crew)
        for start, end in windows:
            if start == end:
                offsets = range(-6 * 3600, 0, 10)
            else:
                offsets = range(0, int(SOL_SECONDS), 10)
            for offset in offsets:
                sol = start + offset / SOL_SECONDS
                hr = 62 + rng.uniform(-5, 5)
                perf = 1.0 + rng.uniform(-.08, .08)
                battery = max(5, 98 - max(0, sol) * .03)
                conn, quality = "connected", "ok"
                if crew == "C2" and limb == "right_arm" and start == 250:
                    battery, conn = 12, "disconnected"
                if crew == "C1" and limb == "head_eeg" and start == 470:
                    conn = "buffering"
                if crew == "C3" and limb == "right_leg" and start == 555:
                    quality, perf = "sensor_fault", None
                if crew == "C4" and limb == "left_leg" and start == 142:
                    perf = .25 + rng.uniform(-.03, .03)
                samples.append(dict(device_code=code, ts_utc=ts(sol).strftime("%Y-%m-%d %H:%M:%S"),
                    sol=int(sol), heart_rate_bpm=f"{hr:.2f}", spo2_pct=f"{97+rng.uniform(-1,1):.2f}",
                    skin_temperature_c=f"{33+rng.uniform(-.5,.5):.2f}",
                    perfusion_index="" if perf is None else f"{perf:.3f}",
                    eeg_band=("deep" if limb == "head_eeg" and int(sol) % 2 == 0 else
                              "wake" if limb == "head_eeg" else ""),
                    battery_pct=f"{battery:.2f}", connection_state=conn, quality=quality,
                    location_code=("airlock_A" if crew == "C1" and start == 470 else location)))
    write_csv(out / "samples.csv.gz", sample_fields, samples, compressed=True)

    state_fields = ["device_code", "state_ts_utc", "state", "battery_pct", "location_code", "detail"]
    states = []
    for code in did:
        crew = code.split("-")[1]
        limb = code[len(f"W-{crew}-"):]
        loc = next(p[2] for p in PROFILES if p[0] == crew)
        states.append(dict(device_code=code, state_ts_utc=ts(600, -1).strftime("%Y-%m-%d %H:%M:%S"),
                           state="connected", battery_pct="80", location_code=loc, detail="nominal"))
    states += [
        dict(device_code="W-C2-right_arm", state_ts_utc=ts(250).strftime("%Y-%m-%d %H:%M:%S"),
             state="low_battery", battery_pct="12", location_code="module_M2", detail="W2"),
        dict(device_code="W-C2-right_arm", state_ts_utc=ts(250, 600).strftime("%Y-%m-%d %H:%M:%S"),
             state="disconnected", battery_pct="11", location_code="module_M2", detail="W2"),
        dict(device_code="W-C1-head_eeg", state_ts_utc=ts(470).strftime("%Y-%m-%d %H:%M:%S"),
             state="buffering", battery_pct="84", location_code="airlock_A", detail="W3 EVA link loss"),
        dict(device_code="W-C3-right_leg", state_ts_utc=ts(555).strftime("%Y-%m-%d %H:%M:%S"),
             state="sensor_fault", battery_pct="82", location_code="module_M1", detail="W4 fault"),
    ]
    write_csv(out / "device_states.csv", state_fields, states)

    hour_fields = ["device_code", "hour_utc", "sol", "n_minutes", "heart_rate_mean",
                    "spo2_mean", "skin_temperature_mean", "perfusion_index_mean", "battery_min",
                    "n_suspect", "n_fault"]
    hours = []
    for code in did:
        crew = code.split("-")[1]
        limb = code[len(f"W-{crew}-"):]
        for sol in range(0, 601):
            for hour in range(24):
                perf = .25 if crew == "C4" and limb == "left_leg" and sol in (142, 143) else 1.0
                fault = 1 if crew == "C3" and limb == "right_leg" and sol in (555, 556) else 0
                hours.append(dict(device_code=code, hour_utc=ts(sol, hour * 3600).strftime("%Y-%m-%d %H:%M:%S"),
                    sol=sol, n_minutes=60, heart_rate_mean="62", spo2_mean="97",
                    skin_temperature_mean="33", perfusion_index_mean=str(perf),
                    battery_min=f"{max(5, 98-sol*.03):.2f}", n_suspect="0", n_fault=str(fault)))
    write_csv(out / "sample_hours.csv.gz", hour_fields, hours, compressed=True)

    minute_fields = ["device_code", "minute_utc", "sol", "n_samples", "heart_rate_mean",
                     "spo2_mean", "skin_temperature_mean", "perfusion_index_mean",
                     "battery_min", "n_suspect", "n_fault"]
    minutes = []
    for code in did:
        crew = code.split("-")[1]
        limb = code[len(f"W-{crew}-"):]
        for sol in range(0, 601):
            for minute in range(24 * 60):
                perf = .25 if crew == "C4" and limb == "left_leg" and sol in (142, 143) else 1.0
                fault = 1 if crew == "C3" and limb == "right_leg" and sol in (555, 556) else 0
                minutes.append(dict(device_code=code,
                    minute_utc=ts(sol, minute * 60).strftime("%Y-%m-%d %H:%M:%S"),
                    sol=sol, n_samples=0, heart_rate_mean="62", spo2_mean="97",
                    skin_temperature_mean="33", perfusion_index_mean=str(perf),
                    battery_min=f"{max(5, 98-sol*.03):.2f}", n_suspect="0", n_fault=str(fault)))
    write_csv(out / "sample_minutes.csv.gz", minute_fields, minutes, compressed=True)

    sleep_fields = ["device_code", "subject_code", "sol", "start_utc", "end_utc",
                    "duration_min", "sleep_efficiency_pct", "deep_sleep_pct", "rem_sleep_pct",
                    "awakenings", "quality"]
    sleeps = []
    for crew, subject, _ in PROFILES:
        code = f"W-{crew}-head_eeg"
        for sol in range(0, 601):
            start = ts(sol, 20 * 3600)
            sleeps.append(dict(device_code=code, subject_code=subject, sol=sol,
                start_utc=start.strftime("%Y-%m-%d %H:%M:%S"), end_utc=(start + timedelta(hours=8)).strftime("%Y-%m-%d %H:%M:%S"),
                duration_min="480", sleep_efficiency_pct=f"{82+rng.random()*10:.2f}",
                deep_sleep_pct=f"{18+rng.random()*6:.2f}", rem_sleep_pct=f"{20+rng.random()*6:.2f}",
                awakenings=str(rng.randrange(1, 5)), quality="ok"))
    write_csv(out / "sleep_sessions.csv.gz", sleep_fields, sleeps, compressed=True)
    json.dump({"generator": "wearables_sim_v1", "seed": a.seed, "mission": "SYN-MARS-HAB-600",
               "samples": len(samples), "devices": len(devices), "minutes": len(minutes), "hours": len(hours),
               "sleep_sessions": len(sleeps)}, (out / "meta.json").open("w"), indent=2)


if __name__ == "__main__":
    main()
