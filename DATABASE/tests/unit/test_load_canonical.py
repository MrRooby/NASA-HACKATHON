"""etl/load_canonical.py validation and SQL shape, with a fake cursor (no database)."""
from __future__ import annotations

import csv
import json

import pytest

import load_canonical as lc
from conftest import FakeConnection, FakeCursor

OBS_HEADER = ["source_id", "subject_code", "mission_code", "indicator_code", "timepoint_label", "anchor",
              "day_offset", "time_is_approx", "measured_at", "replicate", "value", "unit", "ref_min", "ref_max",
              "sample_type", "is_synthetic", "raw_name", "raw_value", "raw_unit"]
ENV_HEADER = ["environment_code", "location", "indicator_code", "source_id", "measured_at", "aggregation", "value",
              "unit", "is_synthetic"]

# indicator code -> (id, canonical_unit); mission M1=10; subjects S1=100 (in M1), S2=101 (NOT in M1)
DB = {
    "SELECT code, id, canonical_unit FROM indicator": [("heart_rate_resting", 1, "bpm"), ("glucose", 2, "mg/dL"),
                                                        ("cabin_co2", 3, "mmHg")],
    "SELECT code, id FROM mission": [("M1", 10)],
    "SELECT code, id FROM subject": [("S1", 100), ("S2", 101)],
    "SELECT subject_id, mission_id FROM participation": [(100, 10)],
}


def obs_row(**kw):
    row = dict(source_id="src", subject_code="S1", mission_code="M1", indicator_code="heart_rate_resting",
               timepoint_label="FD1", anchor="launch", day_offset="1", time_is_approx="0", measured_at="",
               replicate="1", value="60", unit="bpm", ref_min="", ref_max="", sample_type="wearable",
               is_synthetic="1", raw_name="", raw_value="", raw_unit="")
    row.update(kw)
    return row


def write_csv(path, header, rows):
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=header, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    return path


def finish_params(cur):
    [(sql, params)] = cur.sql_matching("UPDATE import_batch")
    read, ok, rejected, notes, bid = params
    return read, ok, rejected, notes, bid


# ------------------------------------------------------------------ observations: validation
def test_valid_rows_are_upserted_and_logged(tmp_path):
    cur = FakeCursor(DB, lastrowid=77)
    p = write_csv(tmp_path / "observations.canonical.csv", OBS_HEADER, [
        obs_row(), obs_row(day_offset="2", value="61.5", ref_min="50", ref_max="100", time_is_approx="true"),
        obs_row(indicator_code="glucose", unit="mg/dL", value="90", anchor="landing", day_offset="-3",
                is_synthetic="0", raw_name="GLU", raw_value="90", raw_unit="mg/dL", timepoint_label=""),
    ])
    lc.load_observations(cur, p, "src")

    [(sql, rows)] = cur.executemany_calls
    assert sql.startswith("INSERT INTO observation (" + ", ".join(lc.OBS_COLS) + ")")
    assert len(rows) == 3
    first = dict(zip(lc.OBS_COLS, rows[0]))
    assert first["subject_id"] == 100 and first["mission_id"] == 10 and first["indicator_id"] == 1
    assert first["import_batch_id"] == 77
    assert first["value_num"] == 60.0 and first["value_text"] is None
    assert first["day_offset"] == 1 and first["replicate"] == 1
    assert first["time_is_approx"] is False and first["is_synthetic"] is True
    assert first["measured_at"] is None and first["raw_name"] is None
    second = dict(zip(lc.OBS_COLS, rows[1]))
    assert second["time_is_approx"] is True and second["ref_min"] == 50.0 and second["ref_max"] == 100.0
    third = dict(zip(lc.OBS_COLS, rows[2]))
    assert third["indicator_id"] == 2 and third["anchor"] == "landing" and third["day_offset"] == -3
    assert third["is_synthetic"] is False and third["timepoint_label"] is None and third["raw_name"] == "GLU"

    # import_batch opened with sha256 of the file, then closed with counters
    [(ins_sql, ins_params)] = cur.sql_matching("INSERT INTO import_batch")
    assert ins_params[0] == "src" and ins_params[1] == "canonical" and len(ins_params[3]) == 64
    assert finish_params(cur) == (3, 3, 0, None, 77)


@pytest.mark.parametrize("bad, reason", [
    (dict(indicator_code="unobtainium"), "nieznany wskaźnik unobtainium"),
    (dict(unit="beats/min"), "jednostka 'beats/min' != 'bpm' (heart_rate_resting)"),
    (dict(value="high"), "wartość nieliczbowa (heart_rate_resting)"),
    (dict(value=""), "wartość nieliczbowa (heart_rate_resting)"),
    (dict(anchor="docking"), "zły anchor 'docking'"),
    (dict(subject_code="S2"), "brak udziału S2 w M1"),          # subject exists, no participation
    (dict(subject_code="NOPE"), "brak udziału NOPE w M1"),      # unknown subject
    (dict(mission_code="M9"), "brak udziału S1 w M9"),          # unknown mission
])
def test_invalid_row_is_rejected_with_reason(tmp_path, bad, reason):
    cur = FakeCursor(DB, lastrowid=5)
    p = write_csv(tmp_path / "obs.csv", OBS_HEADER, [obs_row(), obs_row(day_offset="9", **bad)])
    lc.load_observations(cur, p, "src")
    [(_, rows)] = cur.executemany_calls
    assert len(rows) == 1                                  # only the good row survives
    read, ok, rejected, notes, _ = finish_params(cur)
    assert (read, ok, rejected) == (2, 1, 1)
    assert notes == f"1 x {reason}"


def test_rejection_reasons_are_counted_and_sorted_by_frequency(tmp_path):
    cur = FakeCursor(DB)
    p = write_csv(tmp_path / "obs.csv", OBS_HEADER, [
        obs_row(anchor="x"), obs_row(anchor="x"), obs_row(anchor="x"), obs_row(indicator_code="zzz"),
    ])
    lc.load_observations(cur, p, "src")
    assert cur.executemany_calls == []                     # nothing valid -> no INSERT at all
    read, ok, rejected, notes, _ = finish_params(cur)
    assert (read, ok, rejected) == (4, 0, 4)
    assert notes.splitlines() == ["3 x zły anchor 'x'", "1 x nieznany wskaźnik zzz"]


def test_observation_upsert_is_idempotent_shape(tmp_path):
    """ON DUPLICATE KEY UPDATE must never overwrite natural-key columns (they define the row identity)."""
    cur = FakeCursor(DB)
    lc.load_observations(cur, write_csv(tmp_path / "o.csv", OBS_HEADER, [obs_row()]), "src")
    sql, _ = cur.executemany_calls[0]
    head, upd = sql.split(" ON DUPLICATE KEY UPDATE ")
    assert head.count("%s") == len(lc.OBS_COLS)
    updated = [a.split("=")[0] for a in upd.split(", ")]
    assert set(updated) == set(lc.OBS_COLS) - lc.OBS_KEYS
    assert "import_batch_id" in updated and "value_num" in updated
    for k in lc.OBS_KEYS:
        assert f"{k}=VALUES" not in upd


def test_running_twice_produces_identical_upserts(tmp_path):
    p = write_csv(tmp_path / "o.csv", OBS_HEADER, [obs_row(), obs_row(day_offset="2"), obs_row(anchor="bad")])
    runs = []
    for _ in range(2):
        cur = FakeCursor(DB, lastrowid=1)
        lc.load_observations(cur, p, "src")
        runs.append(cur.executemany_calls)
    assert runs[0] == runs[1]


def test_large_file_is_flushed_in_batches(tmp_path, monkeypatch):
    monkeypatch.setattr(lc, "BATCH_ROWS", 2)
    cur = FakeCursor(DB)
    rows = [obs_row(day_offset=str(i)) for i in range(5)]
    lc.load_observations(cur, write_csv(tmp_path / "o.csv", OBS_HEADER, rows), "src")
    assert [len(r) for _, r in cur.executemany_calls] == [2, 2, 1]
    assert finish_params(cur)[:3] == (5, 5, 0)


def test_utf8_bom_header_is_accepted(tmp_path):
    p = tmp_path / "bom.csv"
    write_csv(p, OBS_HEADER, [obs_row()])
    p.write_bytes(b"\xef\xbb\xbf" + p.read_bytes())
    cur = FakeCursor(DB)
    lc.load_observations(cur, p, "src")
    assert len(cur.executemany_calls[0][1]) == 1


# ------------------------------------------------------------------ env observations
def test_env_rows_validated_and_upserted(tmp_path):
    cur = FakeCursor(DB, lastrowid=9)
    base = dict(environment_code="iss", location="US Lab", indicator_code="cabin_co2", source_id="src",
                measured_at="2030-01-01 00:00:00", aggregation="hourly_mean", value="2.5", unit="mmHg",
                is_synthetic="1")
    p = write_csv(tmp_path / "env.csv", ENV_HEADER, [
        base, dict(base, location="X" * 80), dict(base, indicator_code="nope"), dict(base, unit="kPa"),
        dict(base, value="n/a"),
    ])
    lc.load_env(cur, p, "src")
    [(sql, rows)] = cur.executemany_calls
    assert sql.startswith("INSERT INTO env_observation (" + ", ".join(lc.ENV_COLS) + ")")
    assert len(rows) == 2
    assert rows[0] == ("iss", "US Lab", 3, "src", 9, "2030-01-01 00:00:00", "hourly_mean", 2.5, True)
    assert rows[1][1] == "X" * 60                           # location truncated to column width
    upd = sql.split(" ON DUPLICATE KEY UPDATE ")[1]
    for k in lc.ENV_KEYS:
        assert f"{k}=VALUES" not in upd
    read, ok, rejected, notes, _ = finish_params(cur)
    assert (read, ok, rejected) == (5, 2, 3)
    assert "nieznany wskaźnik nope" in notes and "jednostka/wartość (cabin_co2)" in notes


# ------------------------------------------------------------------ meta + main
META = dict(
    source=dict(id="src", title="Test", data_kind="synthetic", access_status="generated"),
    indicators=[dict(code="new_ind", label="New", category="vitals", canonical_unit="u")],
    missions=[dict(code="M1", name="Mission", environment_code="iss", source_id="src")],
    subjects=[dict(code="S1", source_subject_code="1", source_id="src", sex="F")],
    participations=[dict(subject_code="S1", mission_code="M1", role="crew")],
)


def test_load_meta_upserts_in_fk_order():
    cur = FakeCursor(DB)
    lc.load_meta(cur, META)
    tables = [s.split()[2] for s, _ in cur.executed if s.startswith("INSERT INTO")]
    assert tables == ["data_source", "indicator", "mission", "subject", "participation"]
    part_sql, part_params = cur.sql_matching("INSERT INTO participation")[0]
    assert part_params[:2] == [100, 10]                    # codes resolved to ids
    ind_sql, ind_params = cur.sql_matching("INSERT INTO indicator")[0]
    assert "code=VALUES(code)" not in ind_sql              # natural key never updated


def test_load_meta_unknown_participation_subject_raises():
    cur = FakeCursor(DB)
    meta = dict(META, participations=[dict(subject_code="GHOST", mission_code="M1", role="crew")])
    with pytest.raises(KeyError):
        lc.load_meta(cur, meta)


def test_main_commits_per_file_and_closes(tmp_path, monkeypatch):
    d = tmp_path / "ds"
    d.mkdir()
    (d / "meta.json").write_text(json.dumps(META))
    write_csv(d / "observations.canonical.csv", OBS_HEADER, [obs_row()])
    cur = FakeCursor(DB)
    con = FakeConnection(cur)
    monkeypatch.setattr(lc, "connect", lambda: con)
    lc.main([str(d)])
    assert con.commits == 3          # meta, observations, mars-crew link
    assert con.rollbacks == 0 and con.closed
    assert cur.sql_matching("UPDATE astro_habitat.habitat")


def test_main_rolls_back_on_error(tmp_path, monkeypatch):
    d = tmp_path / "ds"
    d.mkdir()
    (d / "meta.json").write_text(json.dumps(dict(META, participations=[
        dict(subject_code="GHOST", mission_code="M1", role="crew")])))
    con = FakeConnection(FakeCursor(DB))
    monkeypatch.setattr(lc, "connect", lambda: con)
    with pytest.raises(KeyError):
        lc.main([str(d)])
    assert con.rollbacks == 1 and con.closed


def test_main_without_args_exits():
    with pytest.raises(SystemExit):
        lc.main([])
