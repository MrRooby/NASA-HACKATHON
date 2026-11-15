"""The six crew members added to the Mars mission (DATABASE/synthetic/crew_ext.py, C5..C10 = SYN-05..SYN-10).

Main guarantee: the original crew C1..C4 (SYN-01..SYN-04) gets exactly the data it had before the extension.
The frozen hashes below were taken from the generators before crew_ext.py existed (same seeds as the defaults).
"""
from __future__ import annotations

import csv
import hashlib
import json
import random
import re
import subprocess
import sys

import pytest

from conftest import REPO_ROOT as ROOT, SYN_DIR, load_script

ORIGINAL = {"SYN-01", "SYN-02", "SYN-03", "SYN-04"}
ORIGINAL_CREW = {"C1", "C2", "C3", "C4"}
# generate.py --dataset mars --seed 42: sha256 of the data rows (header excluded) before the extension
MARS_ORIGINAL_ROWS_SHA256 = "852ca45775f8986c5bdd2c27e25f7a02e3f5821a343300bfe950964b0b02e0c4"
# medical_generate.py --seed 7: sha256 of json.dumps(events, sort_keys=True) before the extension
MEDICAL_ORIGINAL_EVENTS_SHA256 = "6dd4c711e99b9a2469188679a44a624844521d006ac558ea3c218b762f1f1732"


@pytest.fixture(scope="module")
def ext():
    return load_script(SYN_DIR / "crew_ext.py")


def test_roster_is_consistent(ext):
    assert [p["crew"] for p in ext.NEW_CREW] == ["C5", "C6", "C7", "C8", "C9", "C10"]
    assert [p["code"] for p in ext.NEW_CREW] == [f"SYN-{n:02d}" for n in range(5, 11)]
    for p in ext.NEW_CREW:
        assert p["sex"] in ("F", "M")
        lo, hi = map(int, p["age_band"].split("-"))
        assert lo <= p["age"] <= hi
        assert p["home"] in ("module_M1", "module_M2")
        assert len(p["work"]) == 2 and 13.5 <= p["gym"] <= 18.0
        assert p["name"] and p["role"] and p["callsign"]
    pairs = {c for pair in ext.NEW_EVA_PAIRS for c in pair}
    assert pairs <= set(ext.NEW_CREW_CODES)
    assert ext.stream_seed(7, "C5", "x") == ext.stream_seed(7, "C5", "x") != ext.stream_seed(7, "C6", "x")


def test_schema_017_matches_roster(ext):
    sql = (ROOT / "DATABASE" / "schema" / "017_mars_crew_ext.sql").read_text()
    homes = dict(re.findall(r"\(@hab, '(C\d+)',\s*'(module_M\d)'", sql))
    links = dict(re.findall(r"WHEN '(C\d+)'\s+THEN '(SYN-\d+)'", sql))
    assert homes == {p["crew"]: p["home"] for p in ext.NEW_CREW}
    assert links == {p["crew"]: p["code"] for p in ext.NEW_CREW}


def test_mars_original_crew_unchanged_and_new_crew_complete(tmp_path):
    out = tmp_path / "mars"
    subprocess.run([sys.executable, "-I", str(SYN_DIR / "generate.py"), "--dataset", "mars", "--seed", "42",
                    "--out", str(out)], check=True, capture_output=True, text=True, timeout=120)
    with (out / "observations.canonical.csv").open(newline="", encoding="utf-8") as f:
        rows = list(csv.reader(f))
    header, data = rows[0], rows[1:]
    subj = header.index("subject_code")
    original = [r for r in data if r[subj] in ORIGINAL]
    assert hashlib.sha256("\n".join(",".join(r) for r in original).encode()).hexdigest() == MARS_ORIGINAL_ROWS_SHA256
    per_person = {}
    for r in data:
        per_person[r[subj]] = per_person.get(r[subj], 0) + 1
    assert len(per_person) == 10 and len(set(per_person.values())) == 1     # everybody has the full series
    meta = json.loads((out / "meta.json").read_text())
    assert [p["group_label"] for p in meta["participations"]] == [f"C{n}" for n in range(1, 11)]


def test_habitat_original_crew_locations_unchanged():
    hab = load_script(SYN_DIR / "habitat_generate.py")
    segs = hab.build_locations(random.Random(7), 7)
    original = [s for s in segs if s[0] in ORIGINAL_CREW]
    hab.CREW = hab.BASE_CREW                       # what the generator did before the extension
    try:
        before = hab.build_locations(random.Random(7), 7)
    finally:
        hab.CREW = hab.BASE_CREW + hab.NEW_CREW_CODES
    assert original == before
    assert {s[0] for s in segs} == set(hab.CREW)
    assert hab.eva_plan() == load_script(SYN_DIR / "habitat_generate.py").eva_plan()   # original EVA plan intact
    new = hab.new_eva_plan()
    assert new and not set(new) & set(hab.EVA)
    assert not any(hab.SC["H9"]["start"] <= s <= hab.SC["H9"]["end"] for s in new)


def test_medical_original_events_unchanged(tmp_path):
    out = ROOT / "data" / "synthetic" / f"_pytest_medical_{tmp_path.name}"
    try:
        subprocess.run([sys.executable, "-I", str(SYN_DIR / "medical_generate.py"), "--seed", "7", "--out", str(out)],
                       check=True, capture_output=True, text=True, timeout=120)
        events = json.loads((out / "events.json").read_text())
    finally:
        import shutil
        shutil.rmtree(out, ignore_errors=True)
    added_crew = {f"C{n}" for n in range(5, 11)}
    original = [e for e in events if e["crew_code"] not in added_crew]
    assert hashlib.sha256(json.dumps(original, sort_keys=True).encode()).hexdigest() == MEDICAL_ORIGINAL_EVENTS_SHA256
    added = [e for e in events if e not in original]
    assert sorted(e["crew_code"] for e in added) == sorted(f"C{n}" for n in range(5, 11))


def test_cognitive_mars_dataset_covers_added_crew():
    cog = load_script(SYN_DIR / "cognitive_generate.py")
    cfg = cog.dataset_config("mars", 42)
    sessions, _ = cog.build(42, cfg)
    assert {s["subject_code"] for s in sessions} == {f"SYN-{n:02d}" for n in range(5, 11)}
    assert {s["mission_code"] for s in sessions} == {"SYN-MARS-HAB-600"}
    assert cfg["degraded"] in {s["subject_code"] for s in sessions}
    iss = cog.dataset_config("iss", 42)
    assert iss["subjects"] == ["SYN-01", "SYN-02", "SYN-03", "SYN-04"] and iss["mission"] == "SYN-ISS-180"
