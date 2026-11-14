"""Shared test helpers for DATABASE/ (unit + integration).

The ETL and generator scripts are plain scripts, not a package, so their directories are put on sys.path here.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

DB_DIR = Path(__file__).resolve().parents[1]          # DATABASE/
REPO_ROOT = DB_DIR.parent
ETL_DIR = DB_DIR / "etl"
SYN_DIR = DB_DIR / "synthetic"
SCHEMA_DIR = DB_DIR / "schema"

for p in (ETL_DIR, SYN_DIR):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))


def load_script(path: Path, name: str | None = None):
    """Import a script file as a fresh module (no caching between tests)."""
    name = name or f"_test_{path.stem}"
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class FakeCursor:
    """Records every execute/executemany; answers SELECTs from a prefix -> rows map."""

    def __init__(self, responses: dict[str, list] | None = None, lastrowid: int = 1):
        self.responses = responses or {}
        self.executed: list[tuple[str, object]] = []
        self.executemany_calls: list[tuple[str, list]] = []
        self.lastrowid = lastrowid
        self._last = []
        self.rowcount = 0

    def execute(self, sql, params=None):
        self.executed.append((sql, params))
        norm = " ".join(sql.split())
        self._last = []
        for prefix, rows in self.responses.items():
            if norm.startswith(prefix):
                self._last = list(rows)
                break
        return 0

    def executemany(self, sql, rows):
        rows = list(rows)
        self.executemany_calls.append((sql, rows))
        self.rowcount = len(rows)
        return len(rows)

    def fetchall(self):
        return self._last

    def fetchone(self):
        return self._last[0] if self._last else None

    # helpers
    def sql_matching(self, needle: str):
        return [(s, p) for s, p in self.executed if needle in s]

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class FakeConnection:
    def __init__(self, cursor: FakeCursor):
        self._cursor = cursor
        self.commits = 0
        self.rollbacks = 0
        self.closed = False

    def cursor(self):
        return self._cursor

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def close(self):
        self.closed = True


@pytest.fixture
def fake_cursor_factory():
    return FakeCursor
