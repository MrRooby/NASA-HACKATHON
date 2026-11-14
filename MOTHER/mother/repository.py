"""Data access for MOTHER.

The DATABASE module (MariaDB in Docker) is still being designed, so MOTHER talks to storage through
the small `Repository` protocol below. Today we use `InMemoryRepository` (fed by the simulator and the
NASA CSVs); a `MariaDBRepository` will implement the same methods once the schema is agreed.
"""
from __future__ import annotations

import bisect
import threading
from collections import defaultdict
from datetime import datetime
from typing import Iterable, Protocol

from .models import Measurement, utc


class Repository(Protocol):
    def add(self, m: Measurement) -> bool: ...
    def add_many(self, ms: Iterable[Measurement]) -> int: ...
    def series(self, subject_id: str, indicator_id: str,
               start: datetime | None = None, end: datetime | None = None) -> list[Measurement]: ...
    def latest(self, subject_id: str, indicator_id: str, at: datetime | None = None) -> Measurement | None: ...
    def subjects(self) -> list[str]: ...
    def indicators_for(self, subject_id: str) -> list[str]: ...
    def exists(self, subject_id: str, indicator_id: str, ts: datetime) -> bool: ...


class InMemoryRepository:
    """Time-ordered per (subject, indicator) series; thread-safe for the API's background loop."""

    def __init__(self) -> None:
        self._data: dict[tuple[str, str], list[Measurement]] = defaultdict(list)
        self._keys: dict[tuple[str, str], list[datetime]] = defaultdict(list)
        self._lock = threading.RLock()

    def add(self, m: Measurement) -> bool:
        key = (m.subject_id, m.indicator_id)
        ts = utc(m.ts)
        with self._lock:
            keys = self._keys[key]
            i = bisect.bisect_left(keys, ts)
            if i < len(keys) and keys[i] == ts:
                return False  # duplicate timestamp: first write wins
            keys.insert(i, ts)
            self._data[key].insert(i, m)
            return True

    def add_many(self, ms: Iterable[Measurement]) -> int:
        return sum(1 for m in ms if self.add(m))

    def series(self, subject_id: str, indicator_id: str,
               start: datetime | None = None, end: datetime | None = None) -> list[Measurement]:
        key = (subject_id, indicator_id)
        with self._lock:
            keys = self._keys.get(key)
            if not keys:
                return []
            lo = bisect.bisect_left(keys, utc(start)) if start else 0
            hi = bisect.bisect_right(keys, utc(end)) if end else len(keys)
            return list(self._data[key][lo:hi])

    def latest(self, subject_id: str, indicator_id: str, at: datetime | None = None) -> Measurement | None:
        key = (subject_id, indicator_id)
        with self._lock:
            keys = self._keys.get(key)
            if not keys:
                return None
            i = bisect.bisect_right(keys, utc(at)) if at else len(keys)
            return self._data[key][i - 1] if i > 0 else None

    def subjects(self) -> list[str]:
        with self._lock:
            return sorted({s for s, _ in self._data})

    def indicators_for(self, subject_id: str) -> list[str]:
        with self._lock:
            return sorted(i for s, i in self._data if s == subject_id and self._data[(s, i)])

    def exists(self, subject_id: str, indicator_id: str, ts: datetime) -> bool:
        with self._lock:
            keys = self._keys.get((subject_id, indicator_id), [])
            t = utc(ts)
            i = bisect.bisect_left(keys, t)
            return i < len(keys) and keys[i] == t
