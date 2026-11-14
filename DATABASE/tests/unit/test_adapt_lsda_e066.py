"""etl/adapt_lsda_e066.py on a small inline copy of the LSDA E066 'Table 2' layout."""
from __future__ import annotations

import csv
import json

from conftest import ETL_DIR, load_script

# Same shape as data/lsda/e066_178066/.../*__Sheet1.csv (header block, condition rows, per-subject rows).
FIXTURE = '''"NASA's Life Sciences Data Archive (http://lsda.jsc.nasa.gov)
Experiment title (ID): Inflight Study of Cardiovascular Deconditioning (178066)
",,,,,,
Table 2. Average resting data by subject,,,,,,
,,"HR,",,"MAP,",,"FRC,"
Subject No,"Q, l/m",beats/min,"BP, mmHg",mmHg,"SV, ml",liters
,,        Preflight erect,,,,
1,5.7,80,112/87,95,73,2.9
2,6.9,74,112/73,86,94,2.7
,,             In flight,,,,
1,7.8,66,127/74,91,117,3.3
,,        Preflight supine,,,,
2,6.1,60,108/70,83,99,3.0
Mean,6.6,70,,89,96,
'''


def run_adapter(tmp_path, monkeypatch):
    mod = load_script(ETL_DIR / "adapt_lsda_e066.py")
    src = tmp_path / "in" / "table2__Sheet1.csv"
    src.parent.mkdir()
    src.write_text(FIXTURE, encoding="utf-8")
    monkeypatch.setattr(mod, "ROOT", tmp_path)
    monkeypatch.setattr(mod, "SRC", str(src))
    monkeypatch.setattr(mod, "OUT", tmp_path / "out")
    mod.main()
    out = tmp_path / "out"
    with (out / "observations.canonical.csv").open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    return mod, json.loads((out / "meta.json").read_text()), rows, out


def test_adapter_emits_six_indicators_per_subject_condition(tmp_path, monkeypatch):
    _, meta, rows, _ = run_adapter(tmp_path, monkeypatch)
    assert len(rows) == 4 * 6                     # 4 subject-condition rows x 6 indicators; 'Mean' row skipped
    assert {r["indicator_code"] for r in rows} == {"heart_rate_resting", "bp_systolic", "bp_diastolic",
                                                   "bp_mean_arterial", "cardiac_output", "stroke_volume"}
    # canonical CSV header is exactly what load_canonical expects
    from test_load_canonical import OBS_HEADER
    assert list(rows[0]) == OBS_HEADER


def test_adapter_values_conditions_and_bp_split(tmp_path, monkeypatch):
    _, _, rows, _ = run_adapter(tmp_path, monkeypatch)
    by = {(r["subject_code"], r["timepoint_label"], r["indicator_code"]): r for r in rows}
    sbp = by[("E066-S01", "PRE erect", "bp_systolic")]
    assert (sbp["value"], sbp["unit"], sbp["raw_value"], sbp["day_offset"]) == ("112", "mmHg", "112/87", "-2")
    assert by[("E066-S01", "PRE erect", "bp_diastolic")]["value"] == "87"
    inflight = by[("E066-S01", "IN flight (day n/a)", "cardiac_output")]
    assert (inflight["value"], inflight["unit"], inflight["raw_unit"], inflight["day_offset"]) == \
        ("7.8", "L/min", "l/m", "5")
    sup = by[("E066-S02", "PRE supine", "heart_rate_resting")]
    assert (sup["value"], sup["day_offset"], sup["raw_value"]) == ("60", "-1", "60")
    assert all(r["anchor"] == "launch" and r["time_is_approx"] == "1" and r["is_synthetic"] == "0" for r in rows)


def test_adapter_meta_is_consistent_with_rows(tmp_path, monkeypatch):
    mod, meta, rows, _ = run_adapter(tmp_path, monkeypatch)
    subjects = {r["subject_code"] for r in rows}
    assert {s["code"] for s in meta["subjects"]} == subjects == {"E066-S01", "E066-S02"}
    assert {(p["subject_code"], p["mission_code"]) for p in meta["participations"]} == \
        {(s, mod.MISSION) for s in subjects}
    assert meta["source"]["id"] == "lsda_e066" and meta["source"]["data_kind"] == "real_spaceflight"
    assert {i["code"] for i in meta["indicators"]} == {"cardiac_output", "stroke_volume"}
    assert all(r["mission_code"] == mod.MISSION and r["source_id"] == "lsda_e066" for r in rows)


def test_adapter_is_deterministic(tmp_path, monkeypatch):
    outs = []
    for sub in ("a", "b"):
        (tmp_path / sub).mkdir()
        outs.append(run_adapter(tmp_path / sub, monkeypatch)[3])
    out1, out2 = outs
    for name in ("meta.json", "observations.canonical.csv"):
        assert (out1 / name).read_bytes() == (out2 / name).read_bytes()
