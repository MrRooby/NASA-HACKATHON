"""FastAPI smoke tests: the app must answer (not crash) whether the database is reachable or not."""
from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from mother import server
from mother.db_source import TeamDatabase
from tests.fakes import person_db


@pytest.fixture
def fresh_live(monkeypatch):
    """Fresh cache objects per test so state never leaks between tests."""
    monkeypatch.setattr(server, "DASHBOARD", server.Live("dashboard", server.compute_dashboard))
    monkeypatch.setattr(server, "DATA_MAP", server.Live("data-map", server.compute_data_map))


@pytest.fixture
def client(fresh_live):
    return TestClient(server.create_app())


@pytest.fixture
def fake_db(monkeypatch):
    import mother.db_source
    monkeypatch.setattr(mother.db_source, "TeamDatabase", lambda: TeamDatabase(conn=person_db()))


def test_status_when_database_unreachable(client):
    r = client.get("/api/status")
    assert r.status_code == 200
    body = r.json()
    assert body["database"]["reachable"] is False
    assert body["database"]["error"] and body["database"]["hint"]
    assert body["dashboard"]["ready"] is False


def test_status_when_database_reachable(client, fake_db):
    body = client.get("/api/status").json()
    assert body["database"] == {"reachable": True, "version": "2026-11-14 10:00:00|7", "error": None, "hint": None}


@pytest.mark.parametrize("path", ["/api/subjects", "/api/organs", "/api/organs/CREW-1"])
def test_ui_contract_endpoints_return_503_without_database(client, path):
    r = client.get(path)
    assert r.status_code == 503
    assert "Cannot reach the team database" in r.json()["error"]


def test_dashboard_and_data_map_report_error_without_database(client):
    for path in ("/api/dashboard", "/api/data-map"):
        r = client.get(path)
        assert r.status_code == 200
        assert r.json()["status"] == "error" and r.json()["hint"]
        assert r.headers["cache-control"] == "no-store"


def test_organs_endpoints_with_fake_database(client, fake_db):
    r = client.get("/api/organs/CREW-1")
    assert r.status_code == 200
    card = r.json()
    assert card["schema_version"] == "1.1" and len(card["organs"]) == 10
    assert client.get("/api/organs/NOBODY").status_code == 404
    subjects = client.get("/api/subjects").json()
    assert subjects[0]["code"] == "CREW-1"
    grid = client.get("/api/organs").json()
    assert grid[0]["subject"]["code"] == "CREW-1" and len(grid[0]["organs"]) == 10


@pytest.mark.parametrize("path", ["/", "/dashboard", "/data-map", "/organs"])
def test_static_pages_are_served(client, path):
    r = client.get(path)
    assert r.status_code == 200 and "<html" in r.text.lower()


def test_openapi_docs_available(client):
    assert client.get("/api/docs").status_code == 200


def _wait(live, cond, timeout=5.0):
    end = time.time() + timeout
    while time.time() < end:
        if cond(live.response()):
            return live.response()
        live.checked = 0.0
        time.sleep(0.02)
    raise AssertionError(f"timed out: {live.response()}")


def test_live_cache_computes_once_per_version(monkeypatch):
    calls = []
    monkeypatch.setattr(server, "db_version", lambda: "v1")
    live = server.Live("t", lambda v, progress: (calls.append(v), progress(0.5, "half"), {"v": v})[-1])
    r = _wait(live, lambda r: r["status"] == "ready")
    assert r["data"] == {"v": "v1"} and r["version"] == "v1"
    live.checked = 0.0
    live.response()
    time.sleep(0.05)
    assert calls == ["v1"], "same database version must not be recomputed"


def test_live_cache_keeps_error_and_does_not_retry_immediately(monkeypatch):
    calls = []
    monkeypatch.setattr(server, "db_version", lambda: "v1")

    def boom(v, progress):
        calls.append(v)
        raise ValueError("bad data")

    live = server.Live("t", boom)
    r = _wait(live, lambda r: r["status"] == "error")
    assert "ValueError" in r["message"]
    live.checked = 0.0
    live.response()
    time.sleep(0.05)
    assert calls == ["v1"]


def test_free_port_returns_a_port():
    assert 8000 <= server.free_port(8000) < 8020
