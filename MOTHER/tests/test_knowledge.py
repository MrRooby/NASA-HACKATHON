"""Cross-domain syndromes, EVA GO/NO-GO and the risk -> body-map roll-up."""
from __future__ import annotations

from datetime import timedelta

from mother import knowledge as K
from mother.models import Finding, FindingKind, Status
from mother.rules import RulesEngine
from tests.conftest import T0, daily, m


def ctx_for(cfg, repo, mission, now):
    rules = RulesEngine(cfg)
    a = mission.crew[0]
    return K.Context(cfg, repo, mission, a, now, rules.evaluate_subject(repo, a.id, now),
                     rules.evaluate_subject(repo, a.habitat_id, now), rules.evaluate_subject(repo, "space_weather", now))


def test_eva_blocked_early_in_flight_and_after_short_sleep(cfg, repo, mission):
    repo.add(m("sleep_hours", T0 + timedelta(hours=7), 4.0))
    eva = K.eva_readiness(ctx_for(cfg, repo, mission, T0 + timedelta(hours=8)), [])
    assert eva["status"] == "NO-GO" and len(eva["blockers"]) == 2


def test_eva_go_on_a_quiet_day(cfg, repo, mission):
    now = T0 + timedelta(days=10, hours=8)
    repo.add(m("sleep_hours", now - timedelta(hours=1), 7.5))
    assert K.eva_readiness(ctx_for(cfg, repo, mission, now), [])["go"] is True


def test_eva_blocked_by_solar_particle_event(cfg, repo, mission):
    now = T0 + timedelta(days=10, hours=8)
    repo.add(m("solar_proton_flux_10MeV", now - timedelta(minutes=5), 5000, subject="space_weather"))
    eva = K.eva_readiness(ctx_for(cfg, repo, mission, now), [])
    assert not eva["go"] and "pfu" in eva["blockers"][0]["reason"]


def test_vision_change_is_always_escalated_as_sans(cfg, repo, mission):
    now = T0 + timedelta(days=40, hours=8)
    repo.add(m("symptom_vision_change", now - timedelta(hours=1), 1))
    repo.add_many(daily("symptom_headache", [1, 0, 1], start=now - timedelta(days=3)))
    f = K.sans_pattern(ctx_for(cfg, repo, mission, now))
    assert f.status == Status.ALERT and f.escalate and f.rule_id == "syndrome.sans_pattern"
    assert any("flight day" in x for x in f.evidence["contributing_factors"])


def test_co2_headache_needs_both_signals(cfg, repo, mission):
    now = T0 + timedelta(days=10, hours=8)
    repo.add(m("symptom_headache", now - timedelta(hours=2), 2))
    assert K.co2_headache(ctx_for(cfg, repo, mission, now)) is None      # no CO2 problem
    repo.add_many([m("cabin_co2", now - timedelta(minutes=10 * i), 4.0, subject="hab-1") for i in range(12)])
    f = K.co2_headache(ctx_for(cfg, repo, mission, now))
    assert f is not None and f.status == Status.ALERT and "atmosphere" in f.risks


def test_attach_risks_and_body_map(cfg):
    f = Finding("AST-01", FindingKind.THRESHOLD, Status.ALERT, "BP", "band.bp_systolic", T0, indicator_id="bp_systolic")
    K.attach_risks(cfg, [f])
    assert "cardiovascular" in f.risks
    risks = K.risk_summary(cfg, [f])
    cv = next(r for r in risks if r["id"] == "cardiovascular")
    assert cv["status"] == "alert" and cv["score"] == 70 and cv["finding_ids"] == [f.id]
    bm = K.body_map(cfg, risks)
    assert bm["heart"]["status"] == "alert"
    assert all(v["status"] == "ok" for k, v in bm.items() if not any(r["status"] != "ok" for r in v["risks"]))
