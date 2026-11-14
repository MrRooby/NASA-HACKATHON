"""Ingest + data-quality gate.

Nothing reaches the reasoning layers without passing here. Physically impossible values are rejected
(a sensor error must never become a medical alert), suspicious ones are accepted with a quality flag,
and every rejection becomes a DATA_QUALITY finding so the crew sees that a sensor needs attention.
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta, timezone
from typing import Iterable

from .models import Finding, FindingKind, Measurement, Status, utc
from .repository import Repository

# Hard plausibility limits: outside = sensor / entry error, not physiology.
PLAUSIBLE: dict[str, tuple[float, float]] = {
    "bp_systolic": (50, 260),
    "bp_diastolic": (25, 160),
    "heart_rate_resting": (25, 230),
    "glucose_fasting": (20, 600),
    "body_temperature": (30, 44),
    "spo2": (50, 100),
    "sleep_hours": (0, 24),
    "mood": (1, 5),
    "fatigue": (1, 5),
    "symptom_headache": (0, 3),
    "symptom_nausea": (0, 3),
    "symptom_vision_change": (0, 1),
    "cabin_co2": (0.1, 30),          # a crewed cabin can never read 0 mmHg CO2
    "cabin_ppo2": (50, 800),
    "cabin_temperature": (0, 50),
    "cabin_humidity": (1, 100),
    "noise_24h": (20, 140),
    "solar_proton_flux_10MeV": (0, 1e6),
    "radiation_dose_mSv": (0, 5000),
    "body_mass_kg": (30, 200),
    "vo2max_ml_kg_min": (10, 90),
    "strength_index": (1, 1000),
    "energy_intake_kcal": (0, 8000),
    "eva_hours": (0, 12),
    "exercise_minutes_daily": (0, 600),
    "reaction_time_ms": (100, 2000),
    "pvt_lapses": (0, 100),
    "gonogo_commission_rate": (0, 1),
    "gonogo_omission_rate": (0, 1),
    "dsst_correct": (0, 150),
    "dsst_throughput_per_min": (0, 150),
}

# Expected cadence of continuous habitat streams -> staleness check.
CONTINUOUS_MAX_GAP = {
    "cabin_co2": timedelta(hours=3),
    "cabin_ppo2": timedelta(hours=3),
    "cabin_temperature": timedelta(hours=3),
    "cabin_humidity": timedelta(hours=3),
    "solar_proton_flux_10MeV": timedelta(hours=3),
}
STUCK_RUN = 12  # identical consecutive values from a continuous sensor => probably stuck


@dataclass
class IngestReport:
    accepted: list[Measurement] = field(default_factory=list)
    rejected: list[tuple[Measurement, str]] = field(default_factory=list)
    duplicates: int = 0
    findings: list[Finding] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "accepted": len(self.accepted),
            "rejected": [{"measurement": m.to_dict(), "reason": r} for m, r in self.rejected],
            "duplicates": self.duplicates,
            "findings": [f.to_dict() for f in self.findings],
        }


def _dq_finding(m: Measurement, reason: str, status: Status = Status.CAUTION) -> Finding:
    return Finding(
        subject_id=m.subject_id,
        kind=FindingKind.DATA_QUALITY,
        status=status,
        title=f"Data quality: {m.indicator_id} reading not used",
        rule_id=f"dq.{reason.split(':')[0]}",
        ts=utc(m.ts),
        indicator_id=m.indicator_id,
        action="Re-take the measurement and check the sensor / entry.",
        basis="team_assumption",
        evidence={"value": m.value, "unit": m.unit, "source": m.source, "reason": reason},
        explanation=f"The value {m.value} for {m.indicator_id} was rejected ({reason}). "
                    "MOTHER never raises medical alerts from data that fails the plausibility gate.",
    )


def ingest(repo: Repository, measurements: Iterable[Measurement],
           now: datetime | None = None) -> IngestReport:
    now = utc(now) if now else datetime.now(timezone.utc)
    report = IngestReport()
    batch = [replace(m, ts=utc(m.ts)) for m in measurements]

    # Paired blood-pressure check (diastolic must be below systolic for the same reading).
    sys_by_key = {(m.subject_id, m.ts): m.value for m in batch if m.indicator_id == "bp_systolic"}

    for m in batch:
        reason = None
        if m.value != m.value:  # NaN
            reason = "not_a_number"
        elif m.ts > now + timedelta(minutes=5):
            reason = "timestamp_in_future"
        elif m.indicator_id in PLAUSIBLE:
            lo, hi = PLAUSIBLE[m.indicator_id]
            if not lo <= m.value <= hi:
                reason = f"implausible: outside [{lo}, {hi}]"
        if reason is None and m.indicator_id == "bp_diastolic":
            sbp = sys_by_key.get((m.subject_id, m.ts))
            if sbp is not None and m.value >= sbp:
                reason = "implausible: diastolic >= systolic"

        if reason:
            report.rejected.append((m, reason))
            report.findings.append(_dq_finding(m, reason))
            continue
        if repo.add(m):
            report.accepted.append(m)
        else:
            report.duplicates += 1
    return report


def check_sensor_health(repo: Repository, subject_id: str, now: datetime) -> list[Finding]:
    """Detect dropped-out and stuck continuous sensors for one subject (usually a habitat module)."""
    now = utc(now)
    findings: list[Finding] = []
    for ind, max_gap in CONTINUOUS_MAX_GAP.items():
        last = repo.latest(subject_id, ind, at=now)
        if last is None:
            continue
        gap = now - last.ts
        if gap > max_gap:
            findings.append(Finding(
                subject_id=subject_id, kind=FindingKind.DATA_QUALITY, status=Status.CAUTION,
                title=f"Sensor dropout: no {ind} data for {gap.total_seconds() / 3600:.1f} h",
                rule_id="dq.dropout", ts=now, indicator_id=ind, basis="team_assumption",
                action="Check the sensor and its data link.",
                evidence={"last_reading": last.ts, "gap_hours": gap.total_seconds() / 3600},
                explanation="A continuous stream went silent; MOTHER cannot assess this indicator until it resumes.",
            ))
            continue
        recent = repo.series(subject_id, ind, start=now - timedelta(hours=24), end=now)
        tail = [m.value for m in recent[-STUCK_RUN:]]
        if len(tail) == STUCK_RUN and len(set(tail)) == 1:
            findings.append(Finding(
                subject_id=subject_id, kind=FindingKind.DATA_QUALITY, status=Status.CAUTION,
                title=f"Possible stuck sensor: {ind} reported {tail[0]} {STUCK_RUN} times in a row",
                rule_id="dq.stuck", ts=now, indicator_id=ind, basis="team_assumption",
                action="Cross-check with a portable monitor.",
                evidence={"value": tail[0], "run_length": STUCK_RUN},
                explanation="Real cabin sensors always show small noise; a perfectly flat signal usually means a frozen sensor.",
            ))
    return findings
