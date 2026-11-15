#!/usr/bin/env python3
"""cognitive_generate.py | deterministic synthetic trial-level data for the cognitive tests (PVT-B, Go/No-Go, DSST).

Contract: config/cognitive/CONTRACT.md (protocols in section 1, trial object in section 2).
Crew SYN-01..SYN-04 of mission SYN-ISS-180 (generate.py, fictional start 2030-01-01, 180 days), source `synthetic_v1`.

Schedule per subject and test: session 1 is practice (L-14), sessions 2-4 are the baseline (L-10, L-7, L-3), then
PVT every 7 days and Go/No-Go + DSST every 14 days through the mission. A learning effect applies to sessions 1-4.
Scenario (mirrors the mood scenario S3 of generate.py): SYN-04 degrades in the second half of the mission
(ramp FD90..FD120: PVT median about +15 %, lapses >= 6 per session, Go/No-Go commission errors up, DSST down).

Model notes (team assumptions, not clinical data):
  * PVT reaction = mu + N(0, 25) + Exp(tau): mu ~ N(238, 10) per person (the plan's 245 +- 15 produced 5-10 lapses
    per session for healthy people with the 355 ms threshold), tau = 40 ms growing up to +30 % within a session
    (time-on-task fatigue). The exponential tail is truncated at 1.5 tau; lapses (>= 355 ms or timeout) are
    injected explicitly as attention lapses (2 % healthy, 12 % degraded) so that a healthy person stays at ~0-3.
  * Every reaction is classified with cognitive_scoring.classify_pvt.

Output (data/synthetic/cognitive_demo by default): meta.json, sessions.csv, trials.csv.
Same --seed => byte-identical files.
  python3 DATABASE/synthetic/cognitive_generate.py --seed 42 [--out DIR]
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import math
import random
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "MOTHER" / "mother"))
import cognitive_scoring as cs  # noqa: E402  (stdlib-only module, source of truth for classification/scoring)
sys.path.insert(0, str(Path(__file__).resolve().parent))
from crew_ext import NEW_SUBJECT_CODES, stream_seed  # noqa: E402

VERSION = "cognitive_synthetic_v1"
SOURCE = "synthetic_v1"
MISSION_CODE = "SYN-ISS-180"
LAUNCH = dt.date(2030, 1, 1)
DURATION_DAYS = 180
SUBJECTS = ["SYN-01", "SYN-02", "SYN-03", "SYN-04"]
DEGRADED_SUBJECT = "SYN-04"
DEGRADE_START, DEGRADE_FULL = 90, 120          # mission days: ramp of the SYN-04 scenario
APP_VERSION = "0.2.0-synthetic"
TESTS = ("pvt", "gonogo", "dsst")
BASELINE_DAYS = [-14, -10, -7, -3]             # session 1 = practice, sessions 2-4 = baseline
# --dataset mars: the whole 10-person crew (SYN-01..SYN-10) in SYN-MARS-HAB-600; day = sol (88775.244 s), sol 1 starts
# at 2039-01-01 00:00 UTC (habitat.sol_epoch_utc). One added person, drawn from the seed, degrades over sols 300-360.
# SYN-01..04 keep their person parameters from the ISS data set but get own session streams and UUIDs (salted with
# the mission), so their Mars sessions neither repeat nor collide with the ISS ones. The default dataset (iss) is unchanged.
MARS_MISSION_CODE = "SYN-MARS-HAB-600"
MARS_EPOCH = dt.datetime(2039, 1, 1)
MARS_SOL_S = 88775.244
MARS_DURATION = 600
MARS_DEGRADE_START, MARS_DEGRADE_FULL = 300, 360
LEARNING = {"pvt": [1.10, 1.05, 1.02, 1.0], "gonogo": [1.30, 1.15, 1.05, 1.0], "dsst": [0.85, 0.92, 0.97, 1.0]}

SESSION_FIELDS = ["session_uuid", "subject_code", "mission_code", "test_id", "protocol_version", "app_version",
                  "stimulus_set", "seed", "session_no", "is_practice", "started_at", "completed_at", "tz_offset_min",
                  "duration_s", "day_offset", "device_class", "user_agent", "screen_w", "screen_h", "dpr",
                  "refresh_hz", "frame_jitter_ms", "timer_resolution_ms", "focus_lost_ms", "sleep_h",
                  "sleep_quality", "fatigue", "kss", "stress", "caffeine_3h", "n_trials"]
TRIAL_FIELDS = ["session_uuid", "idx", "is_practice", "stimulus", "condition", "isi_ms", "t_onset_ms",
                "t_response_ms", "rt_ms", "expected", "actual", "event_type", "timeout", "anticipation", "valid",
                "focus_lost", "ts_source"]


def fnv1a32(text: str) -> int:
    h = 0x811C9DC5
    for b in text.encode("utf-8"):
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    return h


def stimulus_set(session_no: int) -> str:
    return "ABCD"[(session_no - 1) % 4]


def degradation(subject: str, day: int, cfg=None) -> float:
    """0 = healthy, 1 = fully degraded (SYN-04 only, ramp over the second half of the mission)."""
    deg_subject, a, b = (cfg["degraded"], cfg["degrade_start"], cfg["degrade_full"]) if cfg else \
        (DEGRADED_SUBJECT, DEGRADE_START, DEGRADE_FULL)
    if subject != deg_subject or day < a:
        return 0.0
    return min(1.0, (day - a) / (b - a))


def schedule(test: str, duration: int = DURATION_DAYS) -> list[int]:
    step = 7 if test == "pvt" else 14
    return BASELINE_DAYS + list(range(step, duration, step))


def dataset_config(name: str, seed: int) -> dict:
    if name == "iss":
        return dict(mission=MISSION_CODE, start=LAUNCH.isoformat(), duration=DURATION_DAYS, subjects=SUBJECTS,
                    degraded=DEGRADED_SUBJECT, degrade_start=DEGRADE_START, degrade_full=DEGRADE_FULL, mars=False)
    degraded = random.Random(stream_seed(seed, "MARS", "cognitive_degraded")).choice(NEW_SUBJECT_CODES)
    return dict(mission=MARS_MISSION_CODE, start=MARS_EPOCH.date().isoformat(), duration=MARS_DURATION,
                subjects=SUBJECTS + NEW_SUBJECT_CODES, degraded=degraded, degrade_start=MARS_DEGRADE_START,
                degrade_full=MARS_DEGRADE_FULL, mars=True)


def person_params(seed: int, subject: str) -> dict:
    r = random.Random(f"{seed}|{subject}|person")
    return {
        "pvt_mu": min(max(r.gauss(238, 10), 220), 256),
        "gonogo_mu": r.gauss(300, 20),
        "commission": min(max(r.gauss(0.08, 0.02), 0.03), 0.13),
        "dsst_rt": min(max(r.gauss(1450, 150), 1150), 1800),
        "minute": r.randrange(0, 60),
    }


def r2(x):
    return None if x is None else round(x, 2)


def trial(idx, practice, stimulus, event, *, isi=None, onset=None, response=None, rt=None, expected=None,
          actual=None, timeout=False, anticipation=False):
    return {"idx": idx, "is_practice": practice, "stimulus": stimulus, "condition": None, "isi_ms": isi,
            "t_onset_ms": r2(onset), "t_response_ms": r2(response), "rt_ms": r2(rt), "expected": expected,
            "actual": actual, "event_type": event, "timeout": timeout, "anticipation": anticipation,
            "valid": True, "focus_lost": False, "ts_source": "e"}


# ------------------------------------------------------------------ PVT-B
def pvt_reaction(r: random.Random, mu: float, frac: float, p_lapse: float):
    """One PVT reaction in ms (None = timeout). frac = elapsed fraction of the session (fatigue)."""
    u = r.random()
    if u < 0.012:
        return "false_start_early"
    if u < 0.012 + p_lapse:
        return None if r.random() < 0.1 else r.uniform(360, 760)
    tau = 40.0 * (1 + 0.30 * frac)
    return mu + r.gauss(0, 25) + min(r.expovariate(1 / tau), 1.5 * tau)


def gen_pvt(r, person, session_no, deg):
    mu = person["pvt_mu"] * LEARNING["pvt"][min(session_no, 4) - 1] * (1 + 0.15 * deg)
    p_lapse = 0.02 + 0.10 * deg
    trials, idx = [], 0
    for _ in range(3):                                           # practice trials
        isi = r.randint(1000, 4000)
        rt = max(100.0, mu * 1.1 + r.gauss(0, 25) + r.expovariate(1 / 40.0))
        trials.append(trial(idx, True, "counter", cs.classify_pvt(rt), isi=isi, rt=rt))
        idx += 1
    t = 0.0
    while True:
        isi = r.randint(1000, 4000)
        if t + isi >= 180000:
            break
        frac = t / 180000
        rt = pvt_reaction(r, mu, frac, p_lapse)
        onset = t + isi
        if rt == "false_start_early":
            trials.append(trial(idx, False, "counter", "false_start", isi=isi, onset=onset))
            t = onset + 500
        elif rt is None:
            trials.append(trial(idx, False, "counter", "lapse", isi=isi, onset=onset, rt=None, timeout=True))
            t = onset + 4000                                     # synthetic timeout shortened (real: 30 s)
        else:
            trials.append(trial(idx, False, "counter", cs.classify_pvt(rt), isi=isi, onset=onset,
                                response=onset + rt, rt=rt))
            t = onset + rt                                       # next ISI counts from the response and includes the
                                                                 # 1000 ms RT feedback (Basner 2011 PVT-B)
        idx += 1
    return trials


# ------------------------------------------------------------------ Go/No-Go
def gonogo_sequence(r: random.Random, n_go: int, n_nogo: int, quarters: list[int] | None) -> list[str]:
    """Sequence of 'go'/'nogo': first 3 GO, <= 2 NO-GO in a row, NO-GO counts per quarter as given."""
    n = n_go + n_nogo
    for _ in range(10000):
        counts = quarters or [n_nogo]
        size = n // len(counts)
        seq: list[str] = []
        for q, k in enumerate(counts):
            block = ["nogo"] * k + ["go"] * (size - k)
            r.shuffle(block)
            seq.extend(block)
        ok = all(s == "go" for s in seq[:3])
        ok = ok and all(not (seq[i] == seq[i + 1] == seq[i + 2] == "nogo") for i in range(n - 2))
        if ok:
            return seq
    raise RuntimeError("no valid Go/No-Go sequence found")


def gen_gonogo(r, person, session_no, deg):
    learn = LEARNING["gonogo"][min(session_no, 4) - 1]
    p_comm = min(0.6, (person["commission"] + 0.19 * deg) * learn)
    p_omit = 0.02 + 0.03 * deg
    mu = person["gonogo_mu"] * (1 + 0.08 * deg) * (1.06 if session_no == 1 else 1.0)
    quarters = [7, 8, 7, 8]
    practice = gonogo_sequence(r, 8, 2, None)
    main = gonogo_sequence(r, 90, 30, quarters)
    trials, t = [], 0.0
    for idx, (is_practice, stim) in enumerate([(True, s) for s in practice] + [(False, s) for s in main]):
        t += 500 + 1000 + r.uniform(-250, 250)
        if stim == "go":
            if r.random() < p_omit:
                trials.append(trial(idx, is_practice, "go", "omission", onset=t, expected="1"))
                continue
            rt = mu - 40 + r.gauss(0, 25) + min(r.expovariate(1 / 40.0), 120)
            if r.random() < 0.01:
                rt = r.uniform(110, 149)
            if rt >= 800:
                trials.append(trial(idx, is_practice, "go", "omission", onset=t, expected="1"))
                continue
            trials.append(trial(idx, is_practice, "go", "hit", onset=t, response=t + rt, rt=rt,
                                expected="1", actual="1", anticipation=rt < cs.GONOGO_ANTICIPATION_MS))
        else:
            if r.random() < p_comm:
                rt = mu - 20 + r.gauss(0, 30)
                trials.append(trial(idx, is_practice, "nogo", "commission", onset=t, response=t + rt, rt=rt,
                                    expected="0", actual="1"))
            else:
                trials.append(trial(idx, is_practice, "nogo", "correct_rejection", onset=t, expected="0"))
    return trials


# ------------------------------------------------------------------ DSST
def dsst_blocks(r: random.Random, n_blocks: int, first_forbidden: int | None = None) -> list[int]:
    """Concatenated permutations of digits 1..9; never the same symbol twice in a row (also across blocks)."""
    out: list[int] = []
    for _ in range(n_blocks):
        while True:
            b = list(range(1, 10))
            r.shuffle(b)
            prev = out[-1] if out else first_forbidden
            if b[0] != prev:
                break
        out.extend(b)
    return out


def gen_dsst(r, person, session_no, deg):
    speed = person["dsst_rt"] / LEARNING["dsst"][min(session_no, 4) - 1] * (1 + 0.18 * deg)
    p_err = 0.04 + 0.04 * deg
    sset = stimulus_set(session_no)
    trials, idx = [], 0

    def one(digit, practice, t):
        rt = max(450.0, r.lognormvariate(math.log(speed) - 0.045, 0.30))
        wrong = r.random() < p_err
        actual = str(r.choice([d for d in range(1, 10) if d != digit])) if wrong else str(digit)
        return rt, trial(idx, practice, f"{sset}{digit}", "error" if wrong else "correct", onset=t,
                         response=t + rt, rt=rt, expected=str(digit), actual=actual)

    for digit in dsst_blocks(r, 1):                              # 9 practice trials
        rt, tr = one(digit, True, 0.0)
        trials.append(tr)
        idx += 1
    t = 0.0
    digits = dsst_blocks(r, 12)                                  # 108 symbols are more than 90 s can use
    for digit in digits:
        rt, tr = one(digit, False, t)
        if t + rt > 90000:                                       # answers after 90 s are not recorded
            break
        trials.append(tr)
        idx += 1
        t += rt
    return trials


GENERATORS = {"pvt": gen_pvt, "gonogo": gen_gonogo, "dsst": gen_dsst}
DURATION_S = {"pvt": 180, "gonogo": 150, "dsst": 90}


# ------------------------------------------------------------------ sessions
def build(seed: int, cfg=None):
    cfg = cfg or dataset_config("iss", seed)
    sessions, trials_out = [], []
    for subject in cfg["subjects"]:
        person = person_params(seed, subject)
        for test in TESTS:
            for session_no, day in enumerate(schedule(test, cfg["duration"]), start=1):
                deg = degradation(subject, day, cfg)
                salt = f"|{cfg['mission']}" if cfg["mars"] and subject in SUBJECTS else ""
                rng = random.Random(f"{seed}|{subject}|{test}|{session_no}{salt}")
                sset = stimulus_set(session_no)
                trials = GENERATORS[test](rng, person, session_no, deg)
                key = f"{subject}|{test}|{sset}|{session_no}"
                suid = str(uuid.uuid5(uuid.NAMESPACE_URL, f"awernasa-cognitive:{seed}:{key}{salt}"))
                if cfg["mars"]:                                  # 08:mm local sol time of that sol
                    start = MARS_EPOCH + dt.timedelta(seconds=(day - 1 + 8 / 24) * MARS_SOL_S) + dt.timedelta(
                        minutes=person["minute"] % 60, seconds=rng.randrange(0, 60), microseconds=rng.randrange(0, 1000) * 1000)
                    start = start.replace(microsecond=start.microsecond // 1000 * 1000)
                else:
                    start = dt.datetime.combine(LAUNCH + dt.timedelta(days=day), dt.time(8 + TESTS.index(test) * 0,
                            person["minute"] % 60, rng.randrange(0, 60), rng.randrange(0, 1000) * 1000))
                start += dt.timedelta(minutes=10 * TESTS.index(test))
                dur = DURATION_S[test]
                sleep = min(9.0, max(4.5, rng.gauss(7.2 - 1.2 * deg, 0.6)))
                fatigue = int(min(10, max(1, round(rng.gauss(3 + 3 * deg, 1.0)))))
                sessions.append({
                    "session_uuid": suid, "subject_code": subject, "mission_code": cfg["mission"], "test_id": test,
                    "protocol_version": cs.PROTOCOLS[test], "app_version": APP_VERSION, "stimulus_set": sset,
                    "seed": fnv1a32(key), "session_no": session_no, "is_practice": int(session_no == 1),
                    "started_at": start.isoformat(timespec="milliseconds"),
                    "completed_at": (start + dt.timedelta(seconds=dur + 20)).isoformat(timespec="milliseconds"),
                    "tz_offset_min": 0, "duration_s": dur, "day_offset": day, "device_class": "keyboard",
                    "user_agent": "synthetic-generator", "screen_w": 1920, "screen_h": 1080, "dpr": 1.0,
                    "refresh_hz": 60.0, "frame_jitter_ms": round(rng.uniform(0.5, 2.0), 2),
                    "timer_resolution_ms": 0.1, "focus_lost_ms": 0, "sleep_h": round(sleep, 1),
                    "sleep_quality": int(min(10, max(1, round(rng.gauss(7 - 2 * deg, 1.2))))),
                    "fatigue": fatigue, "kss": int(min(9, max(1, round(rng.gauss(3 + 2.5 * deg, 1.0))))),
                    "stress": int(min(10, max(1, round(rng.gauss(3 + 2 * deg, 1.2))))),
                    "caffeine_3h": int(rng.random() < 0.3), "n_trials": len(trials)})
                for tr in trials:
                    trials_out.append({"session_uuid": suid, **tr})
    return sessions, trials_out


def write_csv(path: Path, fields, rows):
    def cell(v):
        if v is None:
            return ""
        if isinstance(v, bool):
            return int(v)
        return v
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(fields)
        for row in rows:
            w.writerow([cell(row[k]) for k in fields])


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", choices=["iss", "mars"], default="iss",
                    help="iss = SYN-01..04 in SYN-ISS-180 (default); mars = added crew SYN-05..10 in SYN-MARS-HAB-600")
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args(argv)
    cfg = dataset_config(args.dataset, args.seed)
    args.out = args.out or ROOT / "data" / "synthetic" / ("cognitive_demo" if args.dataset == "iss" else "cognitive_mars_demo")
    sessions, trials = build(args.seed, cfg)
    args.out.mkdir(parents=True, exist_ok=True)
    meta = {
        "generator": VERSION, "seed": args.seed, "source_id": SOURCE, "mission_code": cfg["mission"],
        "mission_start_date": cfg["start"], "subjects": cfg["subjects"], "scoring_version": cs.SCORING_VERSION,
        "protocols": cs.PROTOCOLS, "schedule_days": {t: schedule(t, cfg["duration"]) for t in TESTS},
        "scenario": {"subject": cfg["degraded"], "degrade_start_day": cfg["degrade_start"], "degrade_full_day": cfg["degrade_full"],
                     "description": "PVT median +15 %, lapses >= 6, commission rate up, DSST throughput down"},
        "n_sessions": len(sessions), "n_trials": len(trials),
        "note": "SYNTHETIC data, not real astronaut measurements.",
    }
    (args.out / "meta.json").write_text(json.dumps(meta, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    write_csv(args.out / "sessions.csv", SESSION_FIELDS, sessions)
    write_csv(args.out / "trials.csv", TRIAL_FIELDS, trials)
    print(f"{args.out}: sessions={len(sessions)} trials={len(trials)}")


if __name__ == "__main__":
    main()
