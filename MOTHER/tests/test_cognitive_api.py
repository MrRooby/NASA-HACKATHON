"""POST/GET /api/cognitive/*: validation, idempotency, transaction, report shapes (fake writer + fake views, no database)."""
from __future__ import annotations

import copy
import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from mother import cognitive as cog
from mother import cognitive_scoring as S
from mother import db_writer, server
from mother.db_source import TeamDatabase
from tests.cognitive_fakes import FakeWriter, report_db, sess

HDR = {"X-Requested-With": "awernasa"}


# ------------------------------------------------------------------ payload builders
def _now_iso(minutes_ago=1):
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat().replace("+00:00", "Z")


def pvt_trials(n=40, lapses=2):
    out = []
    for i in range(n):
        lapse = i < lapses
        out.append({"idx": i, "stimulus": "counter", "isi_ms": 2000, "rt_ms": 400.0 if lapse else 250.0 + i,
                    "event_type": "lapse" if lapse else "response", "ts_source": "e"})
    return out


def gonogo_trials():
    out = []
    for i in range(120):
        if i % 4 == 3:
            out.append({"idx": i, "stimulus": "nogo", "event_type": "correct_rejection" if i % 8 else "commission",
                        "rt_ms": None if i % 8 else 300.0})
        else:
            out.append({"idx": i, "stimulus": "go", "event_type": "hit", "rt_ms": 300.0 + i})
    return out


def dsst_trials():
    return [{"idx": i, "stimulus": f"A{i % 9 + 1}", "expected": str(i % 9 + 1), "actual": str(i % 9 + 1),
             "event_type": "correct" if i % 10 else "error", "rt_ms": 1500.0} for i in range(60)]


def payload(test="pvt", **kw):
    p = {"client_session_uuid": str(uuid.uuid4()), "subject_code": "SYN-01", "mission_code": "SYN-ISS-180",
         "test_id": test, "protocol_version": S.PROTOCOLS[test], "app_version": "0.2.0", "stimulus_set": "A",
         "seed": 123456789, "session_no": 2, "is_practice": False, "status": "complete",
         "started_at": _now_iso(3), "completed_at": _now_iso(0), "tz_offset_min": 60,
         "duration_s": 90 if test == "dsst" else 180,
         "device": {"device_class": "keyboard", "user_agent": "UA", "screen_w": 1920, "screen_h": 1080, "dpr": 1,
                    "refresh_hz": 60.0, "frame_jitter_ms": 1.2, "timer_resolution_ms": 0.1, "focus_lost_ms": 0},
         "context": {"sleep_h": 7.5, "sleep_quality": 7, "fatigue": 3, "kss": 3, "stress": 2, "caffeine_3h": False},
         "client_metrics": {}, "events": [{"seq": 0, "t_ms": 1234.5, "kind": "blur", "detail": None}],
         "trials": {"pvt": pvt_trials, "gonogo": gonogo_trials, "dsst": dsst_trials}[test]()}
    p.update(kw)
    return p


# ------------------------------------------------------------------ fixtures
@pytest.fixture
def writer(monkeypatch):
    w = FakeWriter()
    # the first session of a person+test is practice: seed one complete earlier session so tests see a real one
    monkeypatch.setattr(db_writer, "connect", lambda: w)
    return w


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(server, "DASHBOARD", server.Live("dashboard", server.compute_dashboard))
    monkeypatch.setattr(server, "DATA_MAP", server.Live("data-map", server.compute_data_map))
    return TestClient(server.create_app())


def post(client, body, headers=HDR):
    return client.post("/api/cognitive/sessions", content=json.dumps(body) if not isinstance(body, (bytes, str)) else body,
                       headers={"Content-Type": "application/json", **headers})


def seed_complete(w, test="pvt", n=1):
    """Pretend `n` complete sessions exist already, so the next one is not the forced first practice session."""
    for i in range(n):
        w.committed["sessions"].append({"id": 900 + i, "client_session_uuid": f"old-{test}-{i}", "subject_id": 1,
                                        "test_id": test, "session_no": i + 1, "status": "complete"})


# ------------------------------------------------------------------ POST: success
@pytest.mark.parametrize("test,keys", [("pvt", {"pvt_median_rt_ms", "pvt_lapses"}),
                                        ("gonogo", {"gonogo_commission_rate", "gonogo_dprime"}),
                                        ("dsst", {"dsst_throughput_per_min", "dsst_accuracy"})])
def test_valid_post_creates_session_for_each_test(client, writer, test, keys):
    seed_complete(writer, test)
    body = payload(test)
    r = post(client, body)
    assert r.status_code == 201, r.text
    out = r.json()
    assert out["duplicate"] is False and out["test_id"] == test and out["status"] == "complete"
    assert out["quality"] == "ok" and out["is_practice"] is False and out["scoring_version"] == "1.0"
    assert keys <= set(out["metrics"])
    # server scored it itself
    expected = S.score(test, body["trials"], body["duration_s"])["metrics"]
    for k, v in expected.items():
        assert out["metrics"][k] == pytest.approx(v, abs=1e-6) if v is not None else out["metrics"][k] is None
    # stored in one transaction: session + trials + events + metrics + batch + observation mirror
    assert writer.commits == 1 and writer.rollbacks == 0 and writer.closed
    assert len(writer.committed["sessions"]) == 2 and len(writer.committed["trials"]) == len(body["trials"])
    assert len(writer.committed["metrics"]) == len(expected)
    assert writer.committed["batches"][0]["file_name"] == f"session:{body['client_session_uuid']}"
    row = writer.committed["sessions"][-1]
    assert row["anchor"] == "launch" and row["day_offset"] >= 0 and row["source_id"] == "mother_app_cognitive"
    assert row["started_at"].tzinfo is None, "stored as naive UTC"
    assert writer.committed["obs"], "complete non-practice session is mirrored into astro_core.observation"
    assert all(o["import_batch_id"] == writer.committed["batches"][0]["id"] for o in writer.committed["obs"])


def test_first_session_is_forced_to_practice_and_not_mirrored(client, writer):
    r = post(client, payload("pvt", is_practice=False))
    assert r.status_code == 201 and r.json()["is_practice"] is True
    assert writer.committed["obs"] == [] and writer.committed["sessions"][0]["is_practice"] == 1


def test_session_no_is_computed_when_missing(client, writer):
    seed_complete(writer, "pvt", 3)
    body = payload("pvt")
    del body["session_no"]
    assert post(client, body).status_code == 201
    assert writer.committed["sessions"][-1]["session_no"] == 4


def test_pvt_mirror_values_and_indicator_codes(client, writer):
    seed_complete(writer, "pvt")
    out = post(client, payload("pvt")).json()
    by_ind = {o["indicator_id"]: o["value_num"] for o in writer.committed["obs"]}
    assert by_ind[11] == pytest.approx(out["metrics"]["pvt_median_rt_ms"])      # pvt_reaction_ms
    assert by_ind[12] == out["metrics"]["pvt_lapses"]                           # pvt_lapses
    assert all(o["sample_type"] == "manual_device" for o in writer.committed["obs"])


def test_duplicate_uuid_returns_200_same_body_and_no_second_insert(client, writer):
    seed_complete(writer, "pvt")
    body = payload("pvt")
    first = post(client, body)
    sessions, trials = len(writer.committed["sessions"]), len(writer.committed["trials"])
    second = post(client, body)
    assert first.status_code == 201 and second.status_code == 200
    a, b = first.json(), second.json()
    assert b.pop("duplicate") is True and a.pop("duplicate") is False
    assert a == b
    assert len(writer.committed["sessions"]) == sessions and len(writer.committed["trials"]) == trials
    assert len(writer.committed["batches"]) == 1


def test_scoring_mismatch_is_logged_as_event_not_stored_as_metric(client, writer):
    seed_complete(writer, "pvt")
    body = payload("pvt", client_metrics={"pvt_median_rt_ms": 100.0, "pvt_lapses": 2})
    out = post(client, body).json()
    assert out["metrics"]["pvt_median_rt_ms"] != 100.0
    kinds = [e["kind"] for e in writer.committed["events"]]
    assert kinds.count("scoring_mismatch") == 1 and "blur" in kinds
    ok = payload("pvt", client_metrics={"pvt_lapses": 2})
    post(client, ok)
    assert [e["kind"] for e in writer.committed["events"]].count("scoring_mismatch") == 1


def test_dsst_random_answers_session_is_invalid(client, writer):
    seed_complete(writer, "dsst")
    trials = [{"idx": i, "stimulus": "A1", "event_type": "error" if i % 3 else "correct", "rt_ms": 800.0} for i in range(30)]
    out = post(client, payload("dsst", trials=trials)).json()
    assert out["status"] == "invalid"
    assert writer.committed["obs"] == []


def test_coarse_timer_marks_quality_low(client, writer):
    seed_complete(writer, "pvt")
    body = payload("pvt")
    body["device"]["timer_resolution_ms"] = 100
    out = post(client, body).json()
    assert out["quality"] == "low" and writer.committed["obs"] == []


# ------------------------------------------------------------------ POST: rejected
def test_missing_header_is_403(client, writer):
    assert post(client, payload("pvt"), headers={}).status_code == 403
    assert post(client, payload("pvt"), headers={"X-Requested-With": "XMLHttpRequest"}).status_code == 403
    assert writer.committed["sessions"] == []


def test_body_over_1mb_is_413(client, writer):
    body = payload("pvt", status_reason="x" * 10)
    big = json.dumps(body) + " " * (1_100_000)
    assert post(client, big).status_code == 413


def test_chunked_body_over_1mb_is_413(client, writer):
    def gen():
        yield b'{"a": "'
        for _ in range(12):
            yield b"x" * 100_000
        yield b'"}'
    r = client.post("/api/cognitive/sessions", content=gen(), headers={**HDR, "Content-Type": "application/json"})
    assert r.status_code == 413


@pytest.mark.parametrize("mutate,field", [
    (lambda p: p["trials"].__setitem__(0, {**p["trials"][0], "event_type": "hit"}), "event_type"),
    (lambda p: p.update(test_id="stroop"), "test_id"),
    (lambda p: p.update(protocol_version="pvtb-9.9"), "protocol_version"),
    (lambda p: p["trials"][0].update(rt_ms=-5), "rt_ms"),
    (lambda p: p["trials"][0].update(rt_ms=30001), "rt_ms"),
    (lambda p: p["trials"].append(dict(p["trials"][0])), "idx"),
    (lambda p: p.update(trials=[{"idx": i, "stimulus": "counter", "rt_ms": 250, "event_type": "response"} for i in range(401)]), "trials"),
    (lambda p: p.update(events=[{"seq": i, "t_ms": 1, "kind": "blur"} for i in range(501)]), "events"),
    (lambda p: p.update(started_at=_now_iso(-30)), "started_at"),
    (lambda p: p.update(started_at=(datetime.now(timezone.utc) - timedelta(days=31)).isoformat()), "started_at"),
    (lambda p: p["context"].update(fatigue=11), "fatigue"),
    (lambda p: p["context"].update(kss=10), "kss"),
    (lambda p: p["context"].update(sleep_h=25), "sleep_h"),
    (lambda p: p["context"].update(sleep_quality=0), "sleep_quality"),
    (lambda p: p.update(client_session_uuid="not-a-uuid"), "client_session_uuid"),
    (lambda p: p.update(status="invalid"), "status"),
])
def test_invalid_payload_is_422(client, writer, mutate, field):
    p = payload("pvt")
    mutate(p)
    r = post(client, p)
    assert r.status_code == 422, r.text
    assert field in json.dumps(r.json()["detail"])
    assert writer.committed["sessions"] == [] and writer.commits == 0


def test_invalid_json_is_422(client, writer):
    assert post(client, "{not json").status_code == 422


def test_unknown_subject_is_404(client, writer):
    r = post(client, payload("pvt", subject_code="NOBODY"))
    assert r.status_code == 404 and "NOBODY" in r.json()["error"]
    assert writer.rollbacks >= 1 and writer.committed["batches"] == []


def test_subject_without_that_mission_is_404(client, writer):
    assert post(client, payload("pvt", mission_code="OTHER")).status_code == 404


def test_mission_defaults_to_newest_participation(client, writer):
    body = payload("pvt")
    del body["mission_code"]
    assert post(client, body).status_code == 201
    assert writer.committed["sessions"][0]["mission_id"] == 5


def test_missing_writer_credentials_is_503_with_hint(client, monkeypatch):
    for k in ("COGNITIVE_DB_USER", "COGNITIVE_DB_PASSWORD"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setattr(db_writer, "writer_settings", lambda: (_ for _ in ()).throw(db_writer.WriterNotConfigured("Missing X")))
    r = post(client, payload("pvt"))
    assert r.status_code == 503 and "COGNITIVE_DB_PASSWORD" in r.json()["hint"]


def test_database_down_is_503(client, monkeypatch):
    def boom():
        raise OSError("down")
    monkeypatch.setattr(db_writer, "connect", boom)
    r = post(client, payload("pvt"))
    assert r.status_code == 503 and r.json()["hint"]


def test_future_started_at_within_tolerance_is_accepted(client, writer):
    assert post(client, payload("pvt", started_at=_now_iso(-4))).status_code == 201


def test_exception_during_trial_insert_rolls_everything_back(client, writer):
    writer.fail_on = "INTO astro_cognitive.test_trial"
    r = post(client, payload("pvt"))
    assert r.status_code == 503
    assert writer.rollbacks >= 1 and writer.commits == 0
    for k in writer.committed:
        assert writer.committed[k] == [], k
    assert all(not v for v in writer.pending.values())
    assert writer.closed


# ------------------------------------------------------------------ save_session unit
def test_save_session_converts_timezone_to_utc():
    w = FakeWriter()
    seed_complete(w, "pvt")
    p = cog.CognitiveSession.model_validate(payload("pvt", started_at=(datetime.now(timezone.utc) - timedelta(minutes=5))
                                                    .astimezone(timezone(timedelta(hours=5))).isoformat()))
    cog.save_session(w, p)
    stored = w.committed["sessions"][-1]["started_at"]
    assert stored.tzinfo is None and abs((datetime.now(timezone.utc).replace(tzinfo=None) - stored).total_seconds() - 300) < 30


# ------------------------------------------------------------------ GET report
@pytest.fixture
def fake_report(monkeypatch):
    holder = {}

    def make(sessions, metrics):
        holder["db"] = report_db(sessions, metrics)
    import mother.db_source
    monkeypatch.setattr(mother.db_source, "TeamDatabase", lambda: TeamDatabase(conn=holder["db"]))
    return make


def _pvt(sid, rt, lapses=0, day=None, **kw):
    return sess(sid, "pvt", day=day if day is not None else sid, **kw), {"pvt_median_rt_ms": rt, "pvt_lapses": lapses}


def _dsst(sid, throughput, **kw):
    return sess(sid, "dsst", day=sid, **kw), {"dsst_throughput_per_min": throughput}


def _build(items):
    return [s for s, _ in items], {s["session_id"]: m for s, m in items}


def test_report_no_data_building_baseline(client, fake_report):
    items = [_pvt(1, 300, practice=True), _pvt(2, 280), _pvt(3, 282)]
    fake_report(*_build(items))
    r = client.get("/api/cognitive/SYN-01")
    assert r.status_code == 200 and r.headers["cache-control"] == "no-store"
    d = r.json()
    assert d["schema_version"] == "cog-1.0" and d["subject"] == {"code": "SYN-01", "data_kind": "synthetic"}
    assert [t["test_id"] for t in d["tests"]] == ["pvt", "gonogo", "dsst"]
    pvt = d["tests"][0]
    # baseline = sessions BEFORE the latest one: only session 2 qualifies (1 is practice, 3 is the latest)
    assert pvt["status"] == "no_data" and "(1/3)" in pvt["headline"]
    assert pvt["baseline"] == {"n": 1, "needed": 3, "ready": False}
    assert pvt["latest"]["z"] == {} and pvt["latest"]["pct_change"] == {}
    assert pvt["next"] == {"session_no": 4, "stimulus_set": "D"}
    assert d["tests"][1]["latest"] is None and d["tests"][1]["trend"] == [] and d["tests"][1]["next"]["session_no"] == 1
    assert d["composite_z"] is None
    assert {"session_id", "started_at", "session_no", "quality", "metrics", "z", "pct_change"} <= set(pvt["latest"])


def test_report_ok_with_small_change(client, fake_report):
    items = [_pvt(1, 300, practice=True), _pvt(2, 280), _pvt(3, 282), _pvt(4, 278), _pvt(5, 291)]
    fake_report(*_build(items))
    pvt = client.get("/api/cognitive/SYN-01").json()["tests"][0]
    assert pvt["status"] == "ok" and pvt["baseline"]["ready"] and pvt["baseline"]["n"] == 3   # 2-4; 5 is the latest
    assert pvt["headline"].startswith("Reaction time +") and pvt["headline"].endswith("vs your baseline.")
    assert [t["value"] for t in pvt["trend"]] == [280, 282, 278, 291]


@pytest.mark.parametrize("rt,lapses,status", [(335, 0, "caution"), (336, 0, "alert"), (350, 0, "alert"), (281, 4, "caution"), (281, 6, "alert"),
                                              (281, 2, "ok"), (332, 7, "alert")])
def test_report_pvt_status_rules_worst_wins(client, fake_report, rt, lapses, status):
    # practice + 5 baseline sessions (the baseline is fixed at the first 5), then the session under test
    items = [_pvt(1, 280, practice=True)] + [_pvt(i, 280) for i in range(2, 7)] + [_pvt(7, rt, lapses)]
    fake_report(*_build(items))
    pvt = client.get("/api/cognitive/SYN-01").json()["tests"][0]
    assert pvt["status"] == status, pvt["headline"]
    assert pvt["baseline"] == {"n": 5, "needed": 3, "ready": True}
    pct = pvt["latest"]["pct_change"]["pvt_median_rt_ms"]
    assert pct == pytest.approx((rt - 280) / 280 * 100)


def test_report_alert_when_z_and_composite(client, fake_report):
    pvt = [_pvt(1, 280, practice=True), _pvt(2, 280), _pvt(3, 282), _pvt(4, 278), _pvt(5, 281), _pvt(6, 280), _pvt(7, 281)]
    gng = [(sess(10 + i, "gonogo", day=i + 1, practice=i == 0), {"gonogo_commission_rate": r}) for i, r in
           enumerate([0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.12])]
    dsst = [(sess(20 + i, "dsst", day=i + 1, practice=i == 0), {"dsst_throughput_per_min": v}) for i, v in
            enumerate([30, 30, 32, 31, 33, 32, 22])]
    fake_report(*_build(pvt + gng + dsst))
    d = client.get("/api/cognitive/SYN-01").json()
    by = {t["test_id"]: t for t in d["tests"]}
    assert by["dsst"]["status"] == "alert" and by["dsst"]["latest"]["z"]["dsst_throughput_per_min"] <= -2
    assert by["gonogo"]["status"] == "ok" and by["pvt"]["status"] == "ok"
    assert d["composite_z"] is not None and d["composite_z"] < 0
    json.dumps(d, allow_nan=False)


def test_report_gonogo_commission_thresholds(client, fake_report):
    base = [(sess(i, "gonogo", day=i, practice=i == 1), {"gonogo_commission_rate": 0.1}) for i in range(1, 6)]
    for rate, status in [(0.14, "ok"), (0.15, "caution"), (0.29, "caution"), (0.30, "alert")]:
        items = base[:4] + [(sess(6, "gonogo", day=6), {"gonogo_commission_rate": rate})]
        fake_report(*_build(items))
        assert client.get("/api/cognitive/SYN-01").json()["tests"][1]["status"] == status


def test_report_baseline_is_per_device_class(client, fake_report):
    items = [_pvt(1, 280, practice=True), _pvt(2, 280), _pvt(3, 280), _pvt(4, 280), _pvt(5, 300, device="touch")]
    fake_report(*_build(items))
    pvt = client.get("/api/cognitive/SYN-01").json()["tests"][0]
    assert pvt["status"] == "no_data" and pvt["baseline"]["n"] == 0   # keyboard history is not used for a touch session


def test_report_ignores_low_quality_and_incomplete_sessions_for_baseline(client, fake_report):
    items = [_pvt(1, 280, practice=True), _pvt(2, 280), _pvt(3, 280, quality="low"), _pvt(4, 280, status="interrupted"),
             _pvt(5, 281)]
    fake_report(*_build(items))
    assert client.get("/api/cognitive/SYN-01").json()["tests"][0]["baseline"]["n"] == 1   # only session 2 (5 is the latest)


def test_report_trend_keeps_last_12(client, fake_report):
    items = [_pvt(1, 280, practice=True)] + [_pvt(i, 280 + i) for i in range(2, 20)]
    fake_report(*_build(items))
    trend = client.get("/api/cognitive/SYN-01").json()["tests"][0]["trend"]
    assert len(trend) == 12 and trend[-1]["value"] == 299 and trend[-1]["started_at"].endswith("Z")


def test_report_nan_metric_becomes_null(client, fake_report):
    items = [_pvt(1, 280, practice=True), _pvt(2, 280), _pvt(3, 280), _pvt(4, 280), _pvt(5, float("nan"), 0)]
    fake_report(*_build(items))
    r = client.get("/api/cognitive/SYN-01")
    assert r.status_code == 200
    assert r.json()["tests"][0]["latest"]["metrics"]["pvt_median_rt_ms"] is None


def test_report_unknown_subject_404(client, fake_report):
    fake_report([], {})
    assert client.get("/api/cognitive/NOBODY").status_code == 404


def test_report_503_without_database(client):
    assert client.get("/api/cognitive/SYN-01").status_code == 503


def test_protocols_endpoint_is_not_captured_by_subject_route(client):
    r = client.get("/api/cognitive/protocols")   # no database needed: it must not hit the {subject} route
    assert r.status_code == 200 and r.headers["cache-control"] == "no-store"
    d = r.json()
    assert [t["test_id"] for t in d["tests"]] == ["pvt", "gonogo", "dsst"]
    assert {t["test_id"]: t["protocol_version"] for t in d["tests"]} == S.PROTOCOLS
    assert d["tests"][0]["params"]["lapse_from_ms"] == 355 and d["scoring_version"] == "1.0"
    assert d["baseline"]["min_sessions"] == 3


def test_get_on_sessions_path_is_not_a_report(client):
    assert client.get("/api/cognitive/sessions").status_code in (404, 405, 503)


def test_root_lists_cognitive_endpoints(client):
    assert "/api/cognitive/protocols" in client.get("/").json()["endpoints"]


@pytest.mark.parametrize("test,dur,ok", [("dsst", 1, False), ("dsst", 84, False), ("dsst", 90, True), ("dsst", 95, True),
                                          ("pvt", 10, False), ("pvt", 300, False), ("pvt", 180, True), ("gonogo", 1, True)])
def test_duration_s_is_range_checked(client, writer, test, dur, ok):
    seed_complete(writer, test)
    r = post(client, payload(test, duration_s=dur))
    assert r.status_code == (201 if ok else 422)
    if not ok:
        assert "duration_s" in json.dumps(r.json()["detail"])


def test_rt_ms_is_stored_exactly_and_duration_saved(client, writer):
    seed_complete(writer, "pvt")
    body = payload("pvt")
    body["trials"][5]["rt_ms"] = 251.23456
    post(client, body)
    assert any(t["rt_ms"] == 251.23456 for t in writer.committed["trials"])
    assert writer.committed["sessions"][-1]["duration_s"] == 180


def test_report_latest_session_is_not_in_its_own_baseline(client, fake_report):
    """Regression: a sharp drop must be compared with the earlier sessions only. With the latest session inside its own
    baseline, 30/32/31/33 -> 22 DSST symbols/min gave z -1.7 (caution) instead of a clear alert."""
    items = [_dsst(i, v) for i, v in [(1, 30), (2, 32), (3, 31), (4, 33), (5, 22)]]
    fake_report(*_build(items))
    d = client.get("/api/cognitive/SYN-01").json()["tests"][2]
    assert d["baseline"]["n"] == 4 and d["status"] == "alert"
    assert d["latest"]["z"]["dsst_throughput_per_min"] < -3
