"""Pure helpers of etl/load_cognitive.py and its SQL flow against a fake cursor."""
from __future__ import annotations

import datetime as dt

import pytest

import load_cognitive as lc
from conftest import FakeConnection, FakeCursor, SYN_DIR, load_script


def test_parse_trial_types_and_defaults():
    t = lc.parse_trial({"idx": "3", "is_practice": "0", "stimulus": "go", "condition": "", "isi_ms": "",
                        "t_onset_ms": "10.5", "t_response_ms": "", "rt_ms": "255.5", "expected": "1", "actual": "1",
                        "event_type": "hit", "timeout": "0", "anticipation": "1", "valid": "1", "focus_lost": "0",
                        "ts_source": "e"})
    assert t["idx"] == 3 and t["isi_ms"] is None and t["rt_ms"] == 255.5 and t["t_response_ms"] is None
    assert t["is_practice"] is False and t["anticipation"] is True and t["valid"] is True
    assert t["condition"] is None and t["event_type"] == "hit"


def test_compute_metrics_matches_scoring_module():
    trials = [lc.parse_trial({"idx": str(i), "is_practice": "0", "stimulus": "counter", "rt_ms": str(rt),
                              "event_type": ev}) for i, (rt, ev) in enumerate([(250, "response"), (270, "response"),
                                                                                (400, "lapse")])]
    r = lc.compute_metrics("pvt", trials, 180)
    assert r["metrics"]["pvt_lapses"] == 1 and r["metrics"]["pvt_median_rt_ms"] == 270
    assert r["quality"] == "low" and r["status"] == "complete" and r["scoring_version"] == lc.cs.SCORING_VERSION


def test_day_offset():
    start = dt.date(2030, 1, 1)
    assert lc.day_offset(dt.datetime(2030, 1, 8, 8, 0), start) == ("launch", 7)
    assert lc.day_offset(dt.datetime(2029, 12, 18, 23, 59), start) == ("launch", -14)
    assert lc.day_offset(dt.datetime(2030, 1, 8), None) == ("none", None)


@pytest.mark.parametrize("practice, status, quality, expected", [
    (0, "complete", "ok", True), (1, "complete", "ok", False), (0, "invalid", "ok", False),
    (0, "complete", "low", False), (0, "interrupted", "ok", False)])
def test_qualifies_for_mirror(practice, status, quality, expected):
    assert lc.qualifies_for_mirror(practice, status, quality) is expected


def test_mirror_values_maps_codes_and_skips_none():
    got = dict(lc.mirror_values({"pvt_median_rt_ms": 281.0, "pvt_lapses": 2, "pvt_mean_rt_ms": 300.0}))
    assert got == {"pvt_reaction_ms": 281.0, "pvt_lapses": 2.0}
    assert lc.mirror_values({"gonogo_commission_rate": None}) == []
    assert dict(lc.mirror_values({"dsst_throughput_per_min": 40.0, "gonogo_commission_rate": 0.1})) == \
        {"dsst_throughput_per_min": 40.0, "gonogo_commission_rate": 0.1}


def test_load_requires_mission(tmp_path):
    gen = load_script(SYN_DIR / "cognitive_generate.py")
    gen.main(["--seed", "1", "--out", str(tmp_path)])
    cur = FakeCursor({})
    with pytest.raises(RuntimeError, match="requires mission"):
        lc.load(FakeConnection(cur), tmp_path)


def test_load_reads_dataset_roundtrip(tmp_path):
    gen = load_script(SYN_DIR / "cognitive_generate.py")
    gen.main(["--seed", "1", "--out", str(tmp_path)])
    meta, sessions, trials = lc.read_dataset(tmp_path)
    assert meta["mission_code"] == "SYN-ISS-180" and len(sessions) == meta["n_sessions"]
    assert sum(len(v) for v in trials.values()) == meta["n_trials"]
    assert all(isinstance(s["started_at"], dt.datetime) for s in sessions)


def test_load_full_flow_with_fake_cursor(tmp_path):
    gen = load_script(SYN_DIR / "cognitive_generate.py")
    gen.main(["--seed", "1", "--out", str(tmp_path)])
    codes = {"SYN-01": 1, "SYN-02": 2, "SYN-03": 3, "SYN-04": 4}
    cur = FakeCursor({
        "SELECT id, start_date FROM astro_core.mission": [(7, dt.date(2030, 1, 1))],
        "SELECT 1 FROM astro_core.data_source": [(1,)],
        "SELECT s.code, s.id": list(codes.items()),
        "SELECT code, id FROM astro_core.indicator": [(c, i) for i, c in enumerate(lc.MIRROR.values(), start=10)],
    }, lastrowid=99)
    con = FakeConnection(cur)
    res = lc.load(con, tmp_path)
    assert con.commits == 1
    assert res["sessions"] == 244 and res["observations"] > 0
    deletes = [s for s, _ in cur.executed if s.startswith("DELETE")]
    assert len(deletes) == 3 and "test_session" in deletes[0] and "is_synthetic = 1" in deletes[0]
    inserted = [s for s, _ in cur.executed if "INSERT INTO astro_cognitive.test_session" in s]
    assert len(inserted) == 244
    obs = [c for c in cur.executemany_calls if "astro_core.observation" in c[0]]
    assert len(obs) == 1 and all(r[5] == "launch" and r[9] == "manual_device" and r[10] == 1 for r in obs[0][1])
    # practice sessions are never mirrored; PVT mirrors 2 indicators, the other tests 1
    n_nonpractice = {"pvt": 25 * 4 + 3 * 4, "gonogo": 12 * 4 + 3 * 4, "dsst": 12 * 4 + 3 * 4}
    assert res["observations"] <= 2 * n_nonpractice["pvt"] + n_nonpractice["gonogo"] + n_nonpractice["dsst"]
    assert res["observations"] >= n_nonpractice["pvt"] * 2 // 2
