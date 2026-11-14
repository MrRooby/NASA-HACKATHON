"""Task planner: the mission routine plus closed-loop follow-ups.

Routine tasks follow the ISS cadence documented in config/inflight_measurements.json (weekly PMC, PPC every
14 days, WinSCAT every 30 days, fitness evaluation FD15 + every 30 days, eye exams FD30/FD90/R-30 ...).
Follow-up tasks close the loop: when MOTHER sees a suspicious reading it asks for a confirming measurement
instead of alarming on a single value - exactly how a flight surgeon would work.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from .config import Config
from .models import Astronaut, Finding, FindingKind, Mission, Status, Task, utc


def _at(d: date, hh: int, mm: int = 0) -> datetime:
    return datetime.combine(d, time(hh, mm), tzinfo=timezone.utc)


def _mission_day_number(token: str, mission: Mission) -> int | None:
    token = token.strip()
    if token.startswith("FD") and token[2:].isdigit():
        return int(token[2:])
    if token.startswith("R-") and token[2:].isdigit():
        return mission.planned_days + 1 - int(token[2:])
    return None


def _schedule_hits(schedule: dict, fd: int, mission: Mission) -> bool:
    t = schedule.get("type")
    if t == "daily":
        per_week = schedule.get("days_per_week", 7)
        return per_week >= 7 or fd % 7 != 0  # 7th day is the rest day
    if t == "weekly":
        return fd % 7 == 0
    if t == "every_n_days":
        start = schedule.get("start_fd", schedule["every_days"])
        return fd >= start and (fd - start) % schedule["every_days"] == 0
    if t == "mission_days":
        return any(_mission_day_number(tok, mission) == fd for tok in schedule.get("days", []))
    return False


# Which logged indicators complete each routine item.
COMPLETES = {
    "exercise_countermeasures": ["exercise_minutes_daily"],
    "periodic_fitness_evaluation": ["vo2max_ml_kg_min"],
    "winscat": ["reaction_time_ms"],
    "sm_cognition": ["reaction_time_ms"],
    "private_psychological_conference": ["mood"],
    "sm_blood_biochemistry": ["glucose_fasting"],
}
POINTS = {"daily": 10, "weekly": 30, "every_n_days": 50, "mission_days": 50}

MOTHER_DAILY = [
    ("daily_checkin", "Morning check-in: sleep, mood, fatigue, symptoms", "behavioral", 7, 30,
     ["sleep_hours", "mood", "fatigue", "symptom_headache"],
     "MOTHER daily routine (sleep log as in Standard Measures actigraphy + sleep diary)."),
    ("daily_vitals", "Morning vitals: heart rate, blood pressure, temperature, SpO2", "clinical", 7, 45,
     ["heart_rate_resting", "bp_systolic", "body_temperature", "spo2"],
     "MOTHER daily routine (team assumption: routine in-flight BP/ECG cadence is not public)."),
    ("daily_energy_log", "Log today's meals (kcal)", "nutrition", 20, 0, ["energy_intake_kcal"],
     "NASA-STD-3001: meet 100% of calculated energy needs."),
]
MOTHER_WEEKLY = [
    ("weekly_pvt", "3-minute reaction test (PVT) in the cognitive tests module", "behavioral", ["reaction_time_ms"],
     "In-app PVT-B (Basner 2011); compared with your own baseline. A performance indicator, not a diagnosis."),
    ("weekly_body_mass", "Weekly body mass (SLAMMD)", "nutrition", ["body_mass_kg"],
     "Team assumption: in-flight weighing cadence is not public (see not_confirmed)."),
]

FOLLOW_UP_DELAY = {
    "bp_systolic": (timedelta(minutes=10), "Re-measure blood pressure after 5 min seated rest"),
    "bp_diastolic": (timedelta(minutes=10), "Re-measure blood pressure after 5 min seated rest"),
    "heart_rate_resting": (timedelta(minutes=10), "Re-measure resting heart rate after 10 min rest"),
    "glucose_fasting": (timedelta(minutes=15), "Re-check blood glucose"),
    "body_temperature": (timedelta(hours=1), "Re-measure temperature"),
    "spo2": (timedelta(minutes=5), "Re-measure SpO2 at rest"),
    "symptom_headache": (timedelta(hours=2), "Re-assess headache"),
}
SYNDROME_TASKS = {
    "syndrome.behavioral_strain": ("Request a Private Psychological Conference", "behavioral", timedelta(hours=24)),
    "syndrome.sans_pattern": ("Ocular exam (OCT / ultrasound / visual acuity) as directed", "clinical", timedelta(hours=24)),
    "syndrome.infection_pattern": ("Symptom log + temperature in 1 h", "clinical", timedelta(hours=1)),
    "syndrome.co2_headache": ("Check fans / CO2 scrubbing, re-assess headache in 2 h", "environment", timedelta(hours=2)),
    "syndrome.energy_deficit": ("Log every meal for the next 7 days", "nutrition", timedelta(hours=12)),
    "syndrome.radiation_event": ("Go to storm shelter; confirm EVA postponed", "radiation", timedelta(minutes=0)),
    "syndrome.hypoxia_source": ("Re-measure SpO2 and check cabin O2", "environment", timedelta(minutes=5)),
}
# extra confirming measurement asked next to the main task: a quick PVT objectively checks the behavioural-strain signal
SYNDROME_EXTRA_TASKS = {
    "syndrome.behavioral_strain": ("Take a 3-minute reaction test (PVT) within 2 h", "behavioral", timedelta(hours=2),
                                   ["reaction_time_ms"]),
}


def _done(repo, a: Astronaut, indicators: list[str], start: datetime, end: datetime) -> bool:
    return bool(indicators) and bool(repo.series(a.id, indicators[0], start=start, end=end))


def routine_tasks(repo, cfg: Config, mission: Mission, a: Astronaut, day: date) -> list[Task]:
    fd = (day - utc(mission.launch).date()).days + 1
    if fd < 1:
        return []
    day_start, day_end = _at(day, 0), _at(day, 23, 59)
    tasks: list[Task] = []
    for tid, title, cat, hh, mm, comp, reason in MOTHER_DAILY:
        tasks.append(Task(a.id, f"{tid}:{day}", title, _at(day, hh, mm), "routine", cat, reason=reason,
                          points=10, completes_with=comp, done=_done(repo, a, comp, day_start, day_end)))
    if fd % 7 == 0:
        for tid, title, cat, comp, reason in MOTHER_WEEKLY:
            tasks.append(Task(a.id, f"{tid}:{day}", title, _at(day, 8), "routine", cat, reason=reason, points=30,
                              completes_with=comp, done=_done(repo, a, comp, day_start, day_end)))

    im = cfg.inflight_measurements
    items = list(im.get("confirmed", [])) + list(im.get("confirmed_research_standard_measures", {}).get("items", []))
    for item in items:
        sch = item.get("schedule", {})
        if sch.get("type") == "continuous" or not _schedule_hits(sch, fd, mission):
            continue
        comp = COMPLETES.get(item["id"], [])
        tasks.append(Task(
            a.id, f"{item['id']}:{day}", item["name"], _at(day, 10), "routine", item.get("category", "clinical"),
            reason=item.get("app_role") or item.get("what"), points=POINTS.get(sch["type"], 10),
            sources=item.get("sources", []), completes_with=comp,
            done=_done(repo, a, comp, day_start, day_end) if comp else False,
        ))
    return sorted(tasks, key=lambda t: t.due)


def follow_up_tasks(repo, a: Astronaut, findings: list[Finding], now: datetime) -> list[Task]:
    tasks: list[Task] = []
    seen: set[str] = set()
    for f in findings:
        if f.subject_id != a.id or f.status == Status.OK:
            continue
        if f.kind in (FindingKind.THRESHOLD, FindingKind.BASELINE) and f.indicator_id in FOLLOW_UP_DELAY:
            delay, title = FOLLOW_UP_DELAY[f.indicator_id]
            key = f"follow_up:{title}"
            if key in seen:
                continue
            seen.add(key)
            due = f.ts + delay
            done = bool(repo.series(a.id, f.indicator_id, start=f.ts + timedelta(seconds=1), end=now))
            tasks.append(Task(a.id, f"{key}:{f.id}", title, due, "follow_up", "clinical", priority=f.status,
                              reason=f"Confirming: {f.title}", points=20, sources=f.sources,
                              completes_with=[f.indicator_id], done=done))
        elif f.rule_id in SYNDROME_TASKS:
            title, cat, delay = SYNDROME_TASKS[f.rule_id]
            tasks.append(Task(a.id, f"follow_up:{f.rule_id}:{f.id}", title, f.ts + delay, "follow_up", cat,
                              priority=f.status, reason=f.title, points=30, sources=f.sources))
            extra = SYNDROME_EXTRA_TASKS.get(f.rule_id)
            if extra:
                etitle, ecat, edelay, ecomp = extra
                tasks.append(Task(a.id, f"follow_up:{f.rule_id}:pvt:{f.id}", etitle, f.ts + edelay, "follow_up", ecat,
                                  priority=f.status, reason=f"Objective check: {f.title}", points=20, sources=f.sources,
                                  completes_with=ecomp,
                                  done=bool(repo.series(a.id, ecomp[0], start=f.ts + timedelta(seconds=1), end=now))))
    return sorted(tasks, key=lambda t: (-t.priority.severity, t.due))
