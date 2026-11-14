"""Derived indicators: turn raw inputs into the quantities NASA standards are written in.

NASA-STD-3001 limits are relative to the astronaut's own preflight values (">= 80 % of preflight VO2max",
">= 95 % of preflight BMD"), radiation limits are cumulative, and bone density cannot be measured in
flight at all. This module computes those quantities into a fresh overlay on every assessment, so a late
or corrected raw reading always propagates.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, time, timedelta, timezone
from typing import Iterable

from .config import Config
from .models import Astronaut, Measurement, Mission, utc
from .repository import InMemoryRepository, Repository

DEFAULT_ENERGY_TARGET_KCAL = 3035.0   # NASA-STD-3001 Vol 2 [7003]
EVA_BONUS_KCAL_PER_H = 200.0           # NASA-STD-3001 Vol 2 [7004]

# Bone loss rate, % of preflight per month (HRP gravity hazard page, Bone evidence report).
BMD_RATE = {
    # indicator: (with full ARED compliance, without countermeasures)
    "bmd_hip_spine_pct_baseline": (0.64, 1.25),
    "bmd_femoral_neck_pct_baseline": (0.32, 1.0),   # 'without' value is a team assumption
}
EXERCISE_PRESCRIPTION_MIN_PER_WEEK = 540.0  # 90 min x 6 days


class OverlayRepository:
    """Read-only view: base measurements + derived ones computed for this assessment."""

    def __init__(self, base: Repository, derived: InMemoryRepository) -> None:
        self.base, self.derived = base, derived

    def series(self, subject_id, indicator_id, start=None, end=None):
        a = self.base.series(subject_id, indicator_id, start, end)
        b = self.derived.series(subject_id, indicator_id, start, end)
        if not b:
            return a
        if not a:
            return b
        return sorted(a + b, key=lambda m: m.ts)

    def latest(self, subject_id, indicator_id, at=None):
        cands = [m for m in (self.base.latest(subject_id, indicator_id, at),
                             self.derived.latest(subject_id, indicator_id, at)) if m]
        return max(cands, key=lambda m: m.ts) if cands else None

    def subjects(self):
        return sorted(set(self.base.subjects()) | set(self.derived.subjects()))

    def indicators_for(self, subject_id):
        return sorted(set(self.base.indicators_for(subject_id)) | set(self.derived.indicators_for(subject_id)))

    def exists(self, subject_id, indicator_id, ts):
        return self.base.exists(subject_id, indicator_id, ts) or self.derived.exists(subject_id, indicator_id, ts)

    def add(self, m):  # pragma: no cover - overlay is read-only
        raise TypeError("OverlayRepository is read-only")


def _derived(a: Astronaut, ind: str, ts: datetime, value: float, unit: str, flags: Iterable[str] = ()) -> Measurement:
    return Measurement(subject_id=a.id, indicator_id=ind, ts=ts, value=value, unit=unit,
                       source="derived", quality_flags=tuple(flags))


def _pct_of_preflight(repo, a, raw_ind, out_ind, now, mode, fallback_first_n: int = 0) -> list[Measurement]:
    pre = a.preflight.get(raw_ind)
    if not pre and fallback_first_n:
        # no preflight value (e.g. a Mars mission): the baseline is the mean of the first N in-mission values
        first = [m.value for m in repo.series(a.id, raw_ind, end=now)[:fallback_first_n]]
        pre = sum(first) / len(first) if len(first) >= fallback_first_n else None
    if not pre:
        return []
    out = []
    for m in repo.series(a.id, raw_ind, end=now):
        if mode == "percent":
            v, unit = m.value / pre * 100.0, "% of baseline"
        else:  # percent change
            v, unit = (m.value / pre - 1.0) * 100.0, "%"
        out.append(_derived(a, out_ind, m.ts, v, unit, m.quality_flags))
    return out


def derive_energy(repo, a: Astronaut, now: datetime) -> list[Measurement]:
    target = a.preflight.get("energy_target_kcal", DEFAULT_ENERGY_TARGET_KCAL)
    eva_by_day: dict = defaultdict(float)
    for m in repo.series(a.id, "eva_hours", end=now):
        eva_by_day[m.ts.date()] += m.value
    out = []
    for m in repo.series(a.id, "energy_intake_kcal", end=now):
        day_target = target + EVA_BONUS_KCAL_PER_H * eva_by_day.get(m.ts.date(), 0.0)
        out.append(_derived(a, "energy_intake_pct_target", m.ts, m.value / day_target * 100.0, "% of target"))
    return out


def derive_radiation(repo, mission: Mission, a: Astronaut, cfg: Config, now: datetime) -> list[Measurement]:
    """Daily dose (personal dosimeter if available, else habitat area monitor, else environment model)."""
    env = cfg.environments[mission.environment_id]
    baseline = env.dose_mSv_per_day
    personal = {m.ts.date(): m for m in repo.series(a.id, "radiation_dose_mSv", end=now)}
    habitat = {m.ts.date(): m for m in repo.series(a.habitat_id, "radiation_dose_mSv", end=now)}

    out: list[Measurement] = []
    cumulative = a.prior_career_dose_mSv
    day = utc(mission.launch).date()
    last_day = min(utc(now).date(), utc(mission.end).date())
    while day <= last_day:
        m = personal.get(day) or habitat.get(day)
        if m is not None:
            dose, flags, ts = m.value, m.quality_flags, m.ts
        elif day < utc(now).date():
            # No reading for a past day: assume the environment's typical rate and say so.
            dose, flags = baseline, ("estimated_from_environment",)
            ts = datetime.combine(day, time(23, 59), tzinfo=timezone.utc)
        else:
            break  # today without a reading yet
        cumulative += dose
        out.append(_derived(a, "radiation_daily_vs_environment", ts, dose / baseline, "x baseline", flags))
        out.append(_derived(a, "radiation_career_mSv", ts, cumulative, "mSv", flags))
        day += timedelta(days=1)
    return out


def exercise_compliance(repo, a: Astronaut, day_end: datetime) -> float:
    """Fraction (0..1) of the weekly exercise prescription done in the 7 days before `day_end`."""
    week = repo.series(a.id, "exercise_minutes_daily", start=day_end - timedelta(days=7), end=day_end)
    return min(1.0, sum(m.value for m in week) / EXERCISE_PRESCRIPTION_MIN_PER_WEEK)


def derive_bmd(repo, mission: Mission, a: Astronaut, now: datetime) -> list[Measurement]:
    """BMD is not measured in flight: project it day by day from exercise compliance (thresholds.json 'projection')."""
    out: list[Measurement] = []
    level = {k: 100.0 for k in BMD_RATE}
    day = utc(mission.launch).date()
    last_day = min(utc(now).date(), utc(mission.end).date())
    while day <= last_day:
        day_end = datetime.combine(day, time(23, 59), tzinfo=timezone.utc)
        c = exercise_compliance(repo, a, day_end) if day > utc(mission.launch).date() else 1.0
        for ind, (with_cm, without_cm) in BMD_RATE.items():
            monthly = with_cm * c + without_cm * (1.0 - c)
            level[ind] -= monthly / 30.44
            out.append(_derived(a, ind, day_end, level[ind], "% of baseline", ("projected",)))
        day += timedelta(days=1)
    return out


def derive_all(repo: Repository, mission: Mission, cfg: Config, now: datetime) -> OverlayRepository:
    now = utc(now)
    derived = InMemoryRepository()
    for a in mission.crew:
        derived.add_many(_pct_of_preflight(repo, a, "body_mass_kg", "body_mass_change_pct", now, "change"))
        derived.add_many(_pct_of_preflight(repo, a, "vo2max_ml_kg_min", "vo2max_pct_baseline", now, "percent"))
        derived.add_many(_pct_of_preflight(repo, a, "strength_index", "strength_pct_baseline", now, "percent"))
        derived.add_many(_pct_of_preflight(repo, a, "reaction_time_ms", "reaction_time_pct_change", now, "change",
                                              fallback_first_n=3))
        derived.add_many(derive_energy(repo, a, now))
        derived.add_many(derive_radiation(repo, mission, a, cfg, now))
        derived.add_many(derive_bmd(repo, mission, a, now))
    return OverlayRepository(repo, derived)
