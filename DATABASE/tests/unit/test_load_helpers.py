"""Pure helpers from etl/load.py: read_env, num, sha256, upsert (SQL generation)."""
from __future__ import annotations

import hashlib
import math

import pytest

import load
from conftest import FakeCursor


# ------------------------------------------------------------------ read_env
def test_read_env_parses_key_values_comments_and_blanks(tmp_path):
    p = tmp_path / ".env"
    p.write_text(
        "# comment\n"
        "\n"
        "DB_HOST = 10.0.0.1\n"
        "ASTRO_ETL_PASSWORD=p@ss=word\n"   # only the first '=' splits
        "   # indented comment\n"
        "NO_EQUALS_LINE\n"
        "EMPTY=\n"
    )
    env = load.read_env(p)
    assert env == {"DB_HOST": "10.0.0.1", "ASTRO_ETL_PASSWORD": "p@ss=word", "EMPTY": ""}


def test_read_env_missing_file_returns_empty(tmp_path):
    assert load.read_env(tmp_path / "does-not-exist.env") == {}


# ------------------------------------------------------------------ num
@pytest.mark.parametrize("raw, expected", [
    ("1", 1.0), (" 2.5 ", 2.5), ("-3e2", -300.0), (7, 7.0), (0.25, 0.25), ("0", 0.0),
])
def test_num_parses_numbers(raw, expected):
    assert load.num(raw) == expected


@pytest.mark.parametrize("raw", [None, "", "   ", "NA", "N/A", "nan", "np.nan", "abc", "1,5", "12/80"])
def test_num_returns_none_for_missing_or_non_numeric(raw):
    assert load.num(raw) is None


@pytest.mark.parametrize("raw", ["NaN", "inf"])
@pytest.mark.xfail(strict=True, reason="BUG: etl/load.py:86-95 num() only filters lowercase 'nan'; float() accepts "
                                       "'NaN'/'inf', so such rows pass load_canonical validation instead of being "
                                       "rejected; pymysql then raises 'nan can not be used with MySQL' and the "
                                       "whole file import is rolled back")
def test_num_rejects_non_finite(raw):
    v = load.num(raw)
    assert v is None or math.isfinite(v)


# ------------------------------------------------------------------ sha256
def test_sha256_matches_hashlib(tmp_path):
    p = tmp_path / "f.bin"
    data = b"astro\x00data\n" * 100
    p.write_bytes(data)
    assert load.sha256(p) == hashlib.sha256(data).hexdigest()
    assert len(load.sha256(p)) == 64


# ------------------------------------------------------------------ upsert
def test_upsert_generates_insert_on_duplicate_key_update():
    cur = FakeCursor()
    load.upsert(cur, "mission", {"code": "M1", "name": "Mission 1", "duration_days": 10}, ("code",))
    [(sql, params)] = cur.executed
    assert sql == ("INSERT INTO mission (code, name, duration_days) VALUES (%s, %s, %s) "
                   "ON DUPLICATE KEY UPDATE name=VALUES(name), duration_days=VALUES(duration_days)")
    assert params == ["M1", "Mission 1", 10]


def test_upsert_without_keys_updates_every_column():
    cur = FakeCursor()
    load.upsert(cur, "t", {"a": 1, "b": None})
    sql, params = cur.executed[0]
    assert sql.endswith("ON DUPLICATE KEY UPDATE a=VALUES(a), b=VALUES(b)")
    assert params == [1, None]


def test_upsert_all_columns_are_keys_falls_back_to_first_column():
    # ON DUPLICATE KEY UPDATE needs at least one assignment; upsert reuses the first column (a no-op update).
    cur = FakeCursor()
    load.upsert(cur, "participation_like", {"subject_id": 1, "mission_id": 2}, ("subject_id", "mission_id"))
    sql, params = cur.executed[0]
    assert sql.endswith("ON DUPLICATE KEY UPDATE subject_id=VALUES(subject_id)")
    assert params == [1, 2]


def test_upsert_values_are_parameterised_not_interpolated():
    cur = FakeCursor()
    evil = "x'); DROP TABLE subject; --"
    load.upsert(cur, "subject", {"code": evil}, ("code",))
    sql, params = cur.executed[0]
    assert evil not in sql
    assert params == [evil]
