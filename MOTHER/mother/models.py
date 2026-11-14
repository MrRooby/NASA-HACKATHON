"""Core data types shared by every MOTHER layer.

Everything here is plain dataclasses so it serialises cleanly to JSON for the GUI
and maps 1:1 onto future MariaDB tables (measurements, findings, tasks).
"""
from __future__ import annotations

import hashlib
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timedelta, timezone
from enum import Enum
from typing import Any, Iterable


class Status(str, Enum):
    OK = "ok"
    CAUTION = "caution"
    ALERT = "alert"

    @property
    def severity(self) -> int:
        return _SEVERITY[self]

    def __lt__(self, other: "Status") -> bool:  # type: ignore[override]
        return self.severity < other.severity


_SEVERITY = {Status.OK: 0, Status.CAUTION: 1, Status.ALERT: 2}


def worst(statuses: Iterable[Status], default: Status = Status.OK) -> Status:
    out = default
    for s in statuses:
        if s.severity > out.severity:
            out = s
    return out


class FindingKind(str, Enum):
    THRESHOLD = "threshold"        # absolute band from config/thresholds.json
    ROLLING = "rolling"            # rolling-window rule from config/thresholds.json
    BASELINE = "baseline"          # deviation from the astronaut's own baseline
    ANOMALY = "anomaly"            # statistical: EWMA / CUSUM / multivariate envelope
    TREND = "trend"                # slope + projected threshold crossing
    SYNDROME = "syndrome"          # cross-domain correlation (several indicators together)
    FORECAST = "forecast"          # mission-level projection (dose, BMD, mass)
    LAB = "lab"                    # blood panel vs lab reference range
    DATA_QUALITY = "data_quality"  # rejected / suspicious input


def utc(dt: datetime) -> datetime:
    """Normalise to timezone-aware UTC."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


@dataclass(frozen=True)
class Measurement:
    """One observation of one indicator for one subject (astronaut or habitat module)."""

    subject_id: str
    indicator_id: str
    ts: datetime
    value: float
    unit: str | None = None
    source: str = "manual"          # manual | wearable | habitat | lab | live_feed | derived | simulated
    simulated: bool = False
    quality_flags: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["ts"] = self.ts.isoformat()
        d["quality_flags"] = list(self.quality_flags)
        return d


@dataclass
class Finding:
    """A conclusion MOTHER drew, with everything needed to explain *why*."""

    subject_id: str
    kind: FindingKind
    status: Status
    title: str
    rule_id: str
    ts: datetime
    indicator_id: str | None = None
    action: str | None = None
    escalate: bool = False
    basis: str = "source"            # source | team_assumption | statistical
    evidence: dict[str, Any] = field(default_factory=dict)
    sources: list[str] = field(default_factory=list)
    risks: list[str] = field(default_factory=list)
    explanation: str = ""

    @property
    def id(self) -> str:
        raw = f"{self.subject_id}|{self.rule_id}|{self.indicator_id}|{self.ts.isoformat()}"
        return hashlib.sha1(raw.encode()).hexdigest()[:12]

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "subject_id": self.subject_id,
            "kind": self.kind.value,
            "status": self.status.value,
            "title": self.title,
            "rule_id": self.rule_id,
            "ts": self.ts.isoformat(),
            "indicator_id": self.indicator_id,
            "action": self.action,
            "escalate": self.escalate,
            "basis": self.basis,
            "evidence": _jsonable(self.evidence),
            "sources": self.sources,
            "risks": self.risks,
            "explanation": self.explanation,
        }


@dataclass
class Task:
    """Something the astronaut is asked to do (routine measurement or MOTHER follow-up)."""

    subject_id: str
    task_id: str
    title: str
    due: datetime
    kind: str                       # routine | follow_up
    category: str
    priority: Status = Status.OK
    reason: str | None = None
    points: int = 10                # gamification hook for the GUI
    sources: list[str] = field(default_factory=list)
    completes_with: list[str] = field(default_factory=list)   # indicator ids that mark the task done
    done: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "subject_id": self.subject_id,
            "task_id": self.task_id,
            "title": self.title,
            "due": self.due.isoformat(),
            "kind": self.kind,
            "category": self.category,
            "priority": self.priority.value,
            "reason": self.reason,
            "points": self.points,
            "sources": self.sources,
            "completes_with": self.completes_with,
            "done": self.done,
        }


@dataclass
class Astronaut:
    id: str
    name: str
    habitat_id: str
    # Preflight (L-x) values used as the personal reference, e.g. body_mass_kg, vo2max_ml_kg_min.
    preflight: dict[str, float] = field(default_factory=dict)
    prior_career_dose_mSv: float = 0.0
    lab_subject_id: str | None = None   # link to Inspiration4 lab subject (C001..C004) in the demo


@dataclass
class Mission:
    id: str
    environment_id: str
    launch: datetime
    planned_days: int
    crew: list[Astronaut] = field(default_factory=list)

    def flight_day(self, ts: datetime) -> int:
        """FD1 is launch day."""
        return (utc(ts).date() - utc(self.launch).date()).days + 1

    def date_of_flight_day(self, fd: int) -> date:
        return utc(self.launch).date() + timedelta(days=fd - 1)

    @property
    def end(self) -> datetime:
        return utc(self.launch) + timedelta(days=self.planned_days)

    def astronaut(self, astronaut_id: str) -> Astronaut:
        for a in self.crew:
            if a.id == astronaut_id:
                return a
        raise KeyError(astronaut_id)


def _jsonable(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {str(k): _jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_jsonable(v) for v in obj]
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Enum):
        return obj.value
    if isinstance(obj, float):
        return round(obj, 4)
    if hasattr(obj, "item"):  # numpy scalar
        return _jsonable(obj.item())
    return obj
