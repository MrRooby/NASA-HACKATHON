"""Engine-level tests on a seeded 40-day simulated mission (offline, deterministic)."""
from __future__ import annotations

import json


from mother.models import Status
from mother.payload import CHART_INDICATORS, build_payload, detected_events
from mother.scheduler import _schedule_hits, follow_up_tasks, routine_tasks
from mother.simulator import MissionSimulator
from tests.conftest import SIM_SCENARIOS

SNAPSHOT_KEYS = {"astronaut", "mission", "generated_at", "overall_status", "summary", "counts", "indicators", "habitat",
                 "space_weather", "findings", "lab_findings", "risks", "body_map", "eva_readiness", "forecasts",
                 "analytics", "labs", "tasks", "escalations"}


def test_simulator_is_deterministic(cfg):
    a = MissionSimulator(days=5, seed=7, cfg=cfg).generate()
    b = MissionSimulator(days=5, seed=7, cfg=cfg).generate()
    assert [(x.subject_id, x.indicator_id, x.ts, x.value) for x in a] == \
           [(x.subject_id, x.indicator_id, x.ts, x.value) for x in b]
    assert all(x.simulated for x in a)


def test_sensor_fault_value_is_rejected_by_the_gate(sim_run):
    sim, mother, report, _ = sim_run
    rejected = [(m.indicator_id, m.value) for m, _ in report.rejected]
    assert ("heart_rate_resting", 400.0) in rejected
    # the impossible reading never becomes a medical alert
    snap = mother.assess("AST-01", sim.time_of(36.55))
    hr = snap["indicators"]["heart_rate_resting"]
    assert hr["value"] < 200 and hr["status"] != "alert"
    assert any(f["kind"] == "data_quality" for f in snap["findings"])
    assert snap["overall_status"] in ("ok", "caution", "alert")


def test_nominal_day_snapshot_shape_and_json(sim_run):
    sim, mother, _, _ = sim_run
    snap = mother.assess("AST-01", sim.time_of(20.875))
    assert SNAPSHOT_KEYS <= set(snap)
    json.dumps(snap)
    assert snap["mission"]["flight_day"] == 20 and snap["mission"]["environment"] == "iss"
    assert snap["analytics"]["status"] == "collecting_baseline"
    # DATA_QUALITY / LAB findings never drive overall status
    worst = max((Status(f["status"]).severity for f in snap["findings"]
                 if f["kind"] not in ("data_quality", "lab")), default=0)
    assert Status(snap["overall_status"]).severity == worst
    assert set(snap["body_map"]) >= {"heart", "brain", "eyes"}
    assert snap["eva_readiness"]["status"] in ("GO", "NO-GO")


def test_insomnia_scenario_raises_behavioural_alert_and_blocks_eva(sim_run):
    sim, mother, _, _ = sim_run
    snap = mother.assess("AST-02", sim.time_of(37.875))
    ids = {f["rule_id"] for f in snap["findings"]}
    assert "rolling.sleep_hours.7-day.mean" in ids
    assert "syndrome.behavioral_strain" in ids
    assert snap["overall_status"] == "alert"
    assert snap["eva_readiness"]["go"] is False
    assert snap["escalations"] and all("comm_delay_one_way_s" in e for e in snap["escalations"])
    risks = {r["id"]: r for r in snap["risks"]}
    assert risks["sleep_circadian"]["status"] == "alert"
    assert snap["body_map"]["brain"]["status"] == "alert"
    # closed loop: a syndrome produces a follow-up task
    assert any(t["kind"] == "follow_up" for t in snap["tasks"])


def test_co2_scrubber_failure_is_seen_by_every_crew_member(sim_run):
    sim, mother, _, _ = sim_run
    crew = mother.assess_crew(sim.time_of(36.5))
    assert crew["overall_status"] == "alert" and len(crew["crew"]) == 4
    snap = mother.assess("AST-03", sim.time_of(36.5))
    co2 = snap["habitat"]["cabin_co2"]
    assert co2["status"] == "alert" and not co2["stale"]


def test_infection_scenario_flags_temperature(sim_run):
    sim, mother, _, _ = sim_run
    snap = mother.assess("AST-04", sim.time_of(35.5))
    assert Status(snap["indicators"]["body_temperature"]["status"]).severity >= Status.CAUTION.severity
    assert "syndrome.infection_pattern" in {f["rule_id"] for f in snap["findings"]}


def test_stale_readings_do_not_drive_status(sim_run):
    sim, mother, _, _ = sim_run
    snap = mother.assess("AST-01", sim.time_of(45))   # 5 days after the last data
    assert all(v["stale"] and v["status"] == "ok" for k, v in snap["indicators"].items()
               if k in ("heart_rate_resting", "bp_systolic", "sleep_hours"))


def test_series_endpoint_shape(sim_run):
    sim, mother, _, _ = sim_run
    s = mother.series("AST-01", "bp_systolic", days=7, now=sim.time_of(20))
    assert s["unit"] == "mmHg" and s["bands"] and 5 <= len(s["points"]) <= 8
    assert all(p["status"] in ("ok", "caution", "alert") and p["simulated"] for p in s["points"])


def test_routine_and_follow_up_tasks(sim_run, cfg):
    sim, mother, _, _ = sim_run
    a = sim.mission.crew[0]
    day14 = sim.mission.date_of_flight_day(14)
    tasks = routine_tasks(mother.repo, cfg, sim.mission, a, day14)
    ids = {t.task_id.split(":")[0] for t in tasks}
    assert {"daily_checkin", "daily_vitals", "daily_energy_log", "weekly_body_mass"} <= ids
    assert next(t for t in tasks if t.task_id.startswith("daily_checkin")).done
    assert routine_tasks(mother.repo, cfg, sim.mission, a, sim.mission.date_of_flight_day(0)) == []
    assert _schedule_hits({"type": "every_n_days", "every_days": 30, "start_fd": 15}, 45, sim.mission)
    assert _schedule_hits({"type": "mission_days", "days": ["R-30"]}, sim.mission.planned_days - 29, sim.mission)
    assert not _schedule_hits({"type": "weekly"}, 8, sim.mission)

    from mother.models import Finding, FindingKind
    f = Finding(a.id, FindingKind.THRESHOLD, Status.ALERT, "BP high", "band.bp_systolic", sim.time_of(10),
                indicator_id="bp_systolic")
    g = Finding(a.id, FindingKind.THRESHOLD, Status.CAUTION, "BP dia", "band.bp_diastolic", sim.time_of(10),
                indicator_id="bp_diastolic")
    fu = follow_up_tasks(mother.repo, a, [f, g], sim.time_of(12))
    assert len(fu) == 1, "same re-measurement task is not duplicated"
    assert fu[0].priority == Status.ALERT and fu[0].done   # a later BP reading exists


def test_compact_and_payload(cfg):
    from mother.engine import Mother
    from mother.repository import InMemoryRepository
    sim = MissionSimulator(days=12, seed=3, scenarios=SIM_SCENARIOS[:1], cfg=cfg)
    mother = Mother(InMemoryRepository(), sim.mission, cfg)
    mother.ingest(sim.generate(), now=sim.time_of(13))
    msgs = []
    data = build_payload(mother, sim.mission, cfg, labs={a.id: [] for a in sim.mission.crew},
                         progress=lambda p, msg: msgs.append(p))
    assert set(data) == {"meta", "snap", "series", "hab", "labs", "real"}
    assert msgs and msgs[-1] == 1.0
    assert set(data["snap"]) == {a.id for a in sim.mission.crew}
    assert all(len(v) == 12 for v in data["snap"].values())
    assert set(data["series"]["AST-01"]) == set(CHART_INDICATORS)
    assert data["meta"]["days"] == 12 and data["meta"]["scenarios_title"] == "Detected by MOTHER:"
    day = data["snap"]["AST-01"][-1]
    assert set(day) >= {"o", "sum", "c", "i", "h", "f", "r", "b", "eva", "t", "esc"}
    assert len(day["f"]) <= 30 and len(day["t"]) <= 16
    json.dumps(data, default=str)


def test_detected_events_merges_crew_wide_events():
    def snap(*rules):
        return {"f": [{"rule_id": r, "status": "alert", "kind": "rolling", "title": r} for r in rules]}
    days = {"A": [snap(), snap("rolling.x"), snap("rolling.x"), snap()],
            "B": [snap(), snap("rolling.x"), snap(), snap()]}
    ev = detected_events(days)
    assert len(ev) == 1 and ev[0]["who"] is None and ev[0]["fd"] == 2
    assert "_rid" not in ev[0]


def test_weekly_pvt_task_and_behavioral_strain_pvt_followup(sim_run, cfg):
    from mother.models import Finding, FindingKind
    sim, mother, _, _ = sim_run
    a = sim.mission.crew[0]
    tasks = routine_tasks(mother.repo, cfg, sim.mission, a, sim.mission.date_of_flight_day(14))
    pvt = next(t for t in tasks if t.task_id.startswith("weekly_pvt"))
    assert pvt.completes_with == ["reaction_time_ms"] and pvt.category == "behavioral"
    assert not any(t.task_id.startswith("weekly_pvt") for t in
                   routine_tasks(mother.repo, cfg, sim.mission, a, sim.mission.date_of_flight_day(13)))
    f = Finding(a.id, FindingKind.SYNDROME, Status.CAUTION, "Sleep, mood and performance are deteriorating together",
                "syndrome.behavioral_strain", sim.time_of(30))
    titles = [t.title for t in follow_up_tasks(mother.repo, a, [f], sim.time_of(30))]
    assert "Request a Private Psychological Conference" in titles
    assert any("reaction test (PVT)" in t for t in titles)
    # winscat / sm_cognition are closed by the same indicator the database mapping produces
    from mother.scheduler import COMPLETES
    from mother.db_mission import DB_TO_MOTHER
    assert COMPLETES["winscat"] == COMPLETES["sm_cognition"] == [DB_TO_MOTHER["pvt_reaction_ms"]]
