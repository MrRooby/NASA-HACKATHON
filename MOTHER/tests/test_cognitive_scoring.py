"""cognitive_scoring against the shared fixtures (config/cognitive/fixtures/*.json), the same files the GUI port is checked with."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from mother import cognitive_scoring as S

FIX = Path(__file__).resolve().parents[2] / "config" / "cognitive" / "fixtures"
SCORING_FILES = sorted(p for p in FIX.glob("*.json") if p.name not in ("baseline_z.json", "report_cases.json"))


def _close(a, b):
    if b is None or a is None:
        return a is None and b is None
    return abs(a - b) <= 1e-6


def test_fixtures_exist():
    assert len(SCORING_FILES) >= 9


@pytest.mark.parametrize("path", SCORING_FILES, ids=lambda p: p.stem)
def test_score_matches_fixture(path):
    f = json.loads(path.read_text(encoding="utf-8"))
    out = S.score(f["test_id"], f["trials"], f["duration_s"])
    exp = f["expected"]
    assert set(out["metrics"]) == set(exp["metrics"])
    for k, v in exp["metrics"].items():
        assert _close(out["metrics"][k], v), f"{f['name']}: {k}: {out['metrics'][k]} != {v}"
    assert out["quality"] == exp["quality"]
    assert out["status"] == exp["status"]
    assert out["n_trials"] == exp["n_trials"]


BASELINE_CASES = json.loads((FIX / "baseline_z.json").read_text(encoding="utf-8"))["cases"]


@pytest.mark.parametrize("case", BASELINE_CASES, ids=lambda c: f"{c['metric']}-{c['x']}-n{len(c['baseline_values'])}")
def test_baseline_z_cases(case):
    base = S.baseline(case["baseline_values"])
    if case["baseline"] is None:
        assert base is None
    else:
        assert base["n"] == case["baseline"]["n"]
        assert _close(base["mean"], case["baseline"]["mean"]) and _close(base["sd"], case["baseline"]["sd"])
    assert _close(S.performance_z(case["metric"], case["x"], base), case["z"])
    assert _close(S.pct_change(case["x"], base), case["pct_change"])


@pytest.mark.parametrize("rt,expected", [(None, "lapse"), (99, "false_start"), (99.99, "false_start"), (100, "response"),
                                         (354, "response"), (354.9, "response"), (355, "lapse"), (1000, "lapse"), (0, "false_start")])
def test_classify_pvt_boundaries(rt, expected):
    assert S.classify_pvt(rt) == expected


def test_unknown_test_id_raises():
    with pytest.raises(ValueError):
        S.score("stroop", [])


def test_shared_config_copies_are_identical():
    root = Path(__file__).resolve().parents[2]
    for name in ("thresholds.json", "inflight_measurements.json", "sources.json"):
        assert (root / "config" / name).read_bytes() == (root / "MOTHER" / "config" / "shared" / name).read_bytes(), name


REPORT_CASES = json.loads((FIX / "report_cases.json").read_text(encoding="utf-8"))["cases"]


@pytest.mark.parametrize("case", REPORT_CASES, ids=lambda c: c["name"])
def test_report_block_matches_fixture(case):
    """report_cases.json is the contract for the GUI's offline (self-test) report: it must stay in sync with MOTHER."""
    from datetime import datetime
    from mother import cognitive as C
    sessions = [dict({k: v for k, v in s.items() if k != "metrics"},
                     started_at=datetime.fromisoformat(s["started_at"].replace("Z", "+00:00"))) for s in case["sessions"]]
    metrics = {s["session_id"]: s["metrics"] for s in case["sessions"]}
    block, zkey = C._test_block(case["test_id"], sessions, metrics)
    assert C.clean(block) == case["expected"]
    assert zkey == case["expected_key_z"]
