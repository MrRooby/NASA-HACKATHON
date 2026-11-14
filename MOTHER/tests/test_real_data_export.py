"""Real-data report (against a fake database) and the offline static export."""
from __future__ import annotations

from datetime import timedelta

from mother import real_data
from mother.db_source import TeamDatabase
from tests.conftest import T0
from tests.fakes import FakeConn


def test_real_data_report_with_fake_database(monkeypatch, cfg):
    flux = [{"measured_at": (T0 + timedelta(minutes=5 * i)).replace(tzinfo=None), "value_num": v}
            for i, v in enumerate([0.3, 0.4, 2500.0, 0.5])]
    cabin = [{"indicator_code": "cabin_temperature", "unit": "degC", "measured_date": (T0 + timedelta(days=d)).date(),
              "value_mean": v} for d, v in enumerate([22.0, 28.0, 99.0])]          # 99 degC is impossible
    bone = [{"mission_code": "MR035G", "indicator_code": "bmd_hip", "indicator_label": "Hip BMD", "timepoint_label": "BR60",
             "phase": "in", "day_offset": 60, "t": 1, "pct": 98.5, "n": 4}]
    conn = FakeConn([("FROM astro_core.env_observation", flux), ("FROM astro_api.environment_daily", cabin),
                     ("FROM astro_api.change_from_baseline", bone)])
    monkeypatch.setattr(real_data, "TeamDatabase", lambda: TeamDatabase(conn=conn))
    rep = real_data.real_data_report(cfg, None)
    sw = rep["space_weather"]
    assert sw["peak_24h"] == 2500.0
    envs = {e["id"]: e for e in sw["environments"]}
    assert envs["iss"]["eva"] == "NO-GO" and envs["mars_surface"]["eva"] == "NO-GO"
    temp = rep["iss_cabin"]["indicators"]["cabin_temperature"]
    assert temp["n"] == 2 and temp["counts"] == {"ok": 1, "alert": 1}
    assert rep["iss_cabin"]["rejected"][0]["value"] == 99.0
    assert rep["bone"]["rows"][0]["model_pct"] < 100
    assert conn.closed


def test_export_demo_writes_dashboard_json(tmp_path):
    import json
    from mother import export_demo
    out = export_demo.build(tmp_path / "demo.json", days=10)
    data = json.loads(out.read_text(encoding="utf-8"))
    assert "SIMULATED DATA" in json.dumps(data)
