"""Determinism and output sanity of DATABASE/synthetic/*.py.

generate.py (demo, mars) and medical_generate.py run fully (< 1 s each).
habitat_generate.py (~35 s) and wearables_generate.py (minutes, ~17M minute rows) are too heavy for unit tests,
so only their pure helpers and seeded sub-steps are tested here.
"""
from __future__ import annotations

import csv
import datetime as dt
import gzip
import json
import random
import subprocess
import sys

import pytest

from conftest import SYN_DIR, load_script

VALID_ANCHORS = {"launch", "landing", "none"}


def tree_bytes(d):
    return {p.relative_to(d).as_posix(): p.read_bytes() for p in sorted(d.rglob("*")) if p.is_file()}


def run_generate(out, *args):
    subprocess.run([sys.executable, "-I", str(SYN_DIR / "generate.py"), *args, "--out", str(out)],
                   check=True, capture_output=True, text=True, timeout=120)
    return out


# ------------------------------------------------------------------ generate.py (demo / mars)
@pytest.fixture(scope="module")
def generated(tmp_path_factory):
    base = tmp_path_factory.mktemp("gen")
    return {
        ("demo", 42, "a"): run_generate(base / "demo42a", "--dataset", "demo", "--seed", "42"),
        ("demo", 42, "b"): run_generate(base / "demo42b", "--dataset", "demo", "--seed", "42"),
        ("demo", 43, "a"): run_generate(base / "demo43", "--dataset", "demo", "--seed", "43"),
        ("mars", 42, "a"): run_generate(base / "mars42a", "--dataset", "mars", "--seed", "42"),
        ("mars", 42, "b"): run_generate(base / "mars42b", "--dataset", "mars", "--seed", "42"),
    }


@pytest.mark.parametrize("dataset", ["demo", "mars"])
def test_generate_same_seed_identical_bytes(generated, dataset):
    a, b = tree_bytes(generated[(dataset, 42, "a")]), tree_bytes(generated[(dataset, 42, "b")])
    assert {"meta.json", "expected.json", "observations.canonical.csv"} <= set(a)
    assert a == b


def test_generate_different_seed_differs(generated):
    a = tree_bytes(generated[("demo", 42, "a")])
    c = tree_bytes(generated[("demo", 43, "a")])
    assert a["observations.canonical.csv"] != c["observations.canonical.csv"]
    assert json.loads(c["meta.json"])["seed"] == 43


@pytest.mark.parametrize("dataset", ["demo", "mars"])
def test_generate_output_passes_load_canonical_row_checks(generated, dataset):
    """Rows must survive load_canonical's offline checks: participation, anchor, numeric value, synthetic flag."""
    from test_load_canonical import OBS_HEADER
    d = generated[(dataset, 42, "a")]
    meta = json.loads((d / "meta.json").read_text())
    part = {(p["subject_code"], p["mission_code"]) for p in meta["participations"]}
    assert meta["source"]["data_kind"] == "synthetic"
    with (d / "observations.canonical.csv").open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        assert reader.fieldnames == OBS_HEADER
        n = 0
        units = {}
        for r in reader:
            n += 1
            assert (r["subject_code"], r["mission_code"]) in part
            assert r["anchor"] in VALID_ANCHORS
            float(r["value"])
            assert r["is_synthetic"] in ("1", "True", "true")
            assert r["source_id"] == meta["source"]["id"]
            units.setdefault(r["indicator_code"], set()).add(r["unit"])
    assert n > 1000
    # one indicator -> one canonical unit (load_canonical rejects anything else)
    assert {k: v for k, v in units.items() if len(v) > 1} == {}


def test_generate_until_truncates_series(tmp_path):
    full = run_generate(tmp_path / "full", "--dataset", "demo", "--seed", "42")
    cut = run_generate(tmp_path / "cut", "--dataset", "demo", "--seed", "42", "--until", "FD10")
    n_full = sum(1 for _ in (full / "observations.canonical.csv").open())
    n_cut = sum(1 for _ in (cut / "observations.canonical.csv").open())
    assert 1 < n_cut < n_full


def test_generate_helpers():
    gen = load_script(SYN_DIR / "generate.py")
    assert gen.label_for("launch", -45) == "L-45"
    assert gen.label_for("launch", 30) == "FD30"
    assert gen.label_for("landing", 0) == "R+0"
    assert gen.label_for("landing", -30) == "R-30"
    assert gen.date_for("launch", 1) == gen.LAUNCH + dt.timedelta(days=1)
    assert gen.parse_until(None) is None
    assert gen.parse_until("FD68") == gen.LAUNCH + dt.timedelta(days=68)
    assert gen.parse_until("R+5") == gen.LANDING + dt.timedelta(days=5)
    with pytest.raises(SystemExit):
        gen.parse_until("tomorrow")


# ------------------------------------------------------------------ habitat_generate.py (helpers only)
@pytest.fixture(scope="module")
def hab():
    return load_script(SYN_DIR / "habitat_generate.py")


def test_habitat_time_helpers_roundtrip(hab):
    for sol in (-2, 1, 142, 600):
        for lst in (0.0, 6.5, 23.9):
            t = hab.ts_of(sol, lst)
            assert hab.sol_of(t) == sol
            assert hab.lst_of(t) == pytest.approx(lst, abs=1e-6)
    assert hab.ts_of(1) == 0.0 and hab.utc(0) == hab.EPOCH
    assert hab.fmt(0) == "2039-01-01 00:00:00.000"
    assert hab.sun(hab.ts_of(5, 12)) == pytest.approx(1.0) and hab.sun(hab.ts_of(5, 2)) == 0.0
    assert hab.ramp(0, 1, 3) == 0.0 and hab.ramp(2, 1, 3) == 0.5 and hab.ramp(5, 1, 3) == 1.0


def test_habitat_eva_plan_respects_dust_storm_and_spe(hab):
    plan = hab.eva_plan()
    a, b = hab.SC["H9"]["start"], hab.SC["H9"]["end"]
    assert not any(a <= s <= b for s in plan)
    assert plan[hab.SC["H8"]["sol"]] == ("C1", "C4")
    assert plan == hab.eva_plan()


def test_habitat_build_locations_seeded(hab):
    a = hab.build_locations(random.Random(7))
    b = hab.build_locations(random.Random(7))
    c = hab.build_locations(random.Random(8))
    assert a == b and a != c
    assert all(seg[1] < seg[2] for seg in a)


def test_habitat_gz_text_is_byte_deterministic(hab, tmp_path):
    outs = []
    for name in ("a.csv.gz", "b.csv.gz"):
        f, raw = hab.gz_text(tmp_path / name)
        with raw, f:
            f.write("x,y\n1,2\n")
        outs.append((tmp_path / name).read_bytes())
    assert outs[0] == outs[1]
    assert gzip.decompress(outs[0]) == b"x,y\n1,2\n"


# ------------------------------------------------------------------ medical_generate.py
def run_medical(tmp_path, monkeypatch, out, seed="7"):
    mod = load_script(SYN_DIR / "medical_generate.py")
    monkeypatch.setattr(mod, "ROOT", tmp_path)
    monkeypatch.setattr(sys, "argv", ["medical_generate.py", "--out", str(out), "--seed", seed])
    mod.main()
    return out


def test_medical_same_seed_identical_bytes(tmp_path, monkeypatch):
    a = tree_bytes(run_medical(tmp_path, monkeypatch, tmp_path / "a"))
    b = tree_bytes(run_medical(tmp_path, monkeypatch, tmp_path / "b"))
    assert {"meta.json", "events.json", "alerts.json", "transmissions.json", "attachments.json"} <= set(a)
    # attachments.json holds a path relative to ROOT ('a/...' vs 'b/...'); compare everything else byte-for-byte
    for k in a:
        if k in ("attachments.json", "meta.json"):
            continue
        assert a[k] == b[k], k
    att_a = json.loads(a["attachments.json"])
    att_b = json.loads(b["attachments.json"])
    for x, y in zip(att_a, att_b):
        assert x.pop("relative_path").split("/", 1)[1] == y.pop("relative_path").split("/", 1)[1]
        assert x == y
    assert a["attachments/sans_c3_sol201_photo.png"].startswith(b"\x89PNG\r\n\x1a\n")


def test_medical_events_reference_known_crew_and_drill_marked(tmp_path, monkeypatch):
    out = run_medical(tmp_path, monkeypatch, tmp_path / "m")
    meta = json.loads((out / "meta.json").read_text())
    subjects = set(meta["crew"].values())
    codes = {e["event_code"] for e in meta["events"]}
    assert all(e["subject_code"] in subjects | {None} for e in meta["events"])
    assert all(a["event_code"] in codes for a in meta["attachments"])
    assert all(t["event_code"] in codes for t in meta["transmissions"])
    assert {e["alert_code"] for e in meta["escalations"]} == {a["alert_code"] for a in meta["alerts"]}
    drills = [e for e in meta["events"] if e["event_type"] == "drill"]
    assert drills and all("DRILL" in e["title"] for e in drills)


@pytest.mark.xfail(strict=True, raises=ValueError,
                   reason="BUG: synthetic/medical_generate.py:80 uses p.relative_to(ROOT); "
                          "--out outside the repo (e.g. a temp dir) crashes with ValueError")
def test_medical_out_outside_repo(tmp_path, monkeypatch):
    mod = load_script(SYN_DIR / "medical_generate.py")
    monkeypatch.setattr(sys, "argv", ["medical_generate.py", "--out", str(tmp_path / "x")])
    mod.main()


# ------------------------------------------------------------------ wearables_generate.py (helpers only)
@pytest.fixture(scope="module")
def wear():
    return load_script(SYN_DIR / "wearables_generate.py")


def test_wearables_ts(wear):
    assert wear.ts(0) == wear.EPOCH
    assert wear.ts(1, 10) == wear.EPOCH + dt.timedelta(seconds=wear.SOL_SECONDS + 10)


def test_wearables_write_csv_content_deterministic(wear, tmp_path):
    rows = [dict(a=1, b="x"), dict(a=2, b="y")]
    for name, comp in (("p.csv", False), ("q.csv", False), ("p.csv.gz", True), ("q.csv.gz", True)):
        wear.write_csv(tmp_path / name, ["a", "b"], rows, compressed=comp)
    assert (tmp_path / "p.csv").read_bytes() == (tmp_path / "q.csv").read_bytes()
    assert gzip.decompress((tmp_path / "p.csv.gz").read_bytes()) == (tmp_path / "p.csv").read_bytes()


@pytest.mark.xfail(strict=True, reason="BUG: synthetic/wearables_generate.py:27 gzip.open() stores the current time "
                                       "in the gzip header, so *.csv.gz differ between runs with the same --seed "
                                       "(habitat_generate.gz_text uses mtime=0 for exactly this reason)")
def test_wearables_gzip_bytes_deterministic(wear, tmp_path, monkeypatch):
    for name, now in (("a.csv.gz", 1_000_000_000.0), ("b.csv.gz", 1_000_000_100.0)):
        with monkeypatch.context() as m:       # simulate two runs at different wall-clock times
            m.setattr(gzip.time, "time", lambda now=now: now)
            wear.write_csv(tmp_path / name, ["a"], [dict(a=1)], compressed=True)
    assert (tmp_path / "a.csv.gz").read_bytes() == (tmp_path / "b.csv.gz").read_bytes()
