"""MOTHER orchestrator: ingest -> derive -> rules -> statistics -> syndromes -> forecasts -> risks -> tasks.

`Mother.assess()` returns one JSON-serialisable snapshot per astronaut - the contract with the GUI.
Status authority order: rules engine and syndromes decide ALERT; statistics/forecasts add CAUTION-level
early warnings; nothing is ever raised from data that failed the ingest quality gate.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

from . import analytics, knowledge
from .config import Config, load_config
from .derive import derive_all
from .forecast import forecast_all
from .ingest import IngestReport, check_sensor_health, ingest
from .labs import lab_panel
from .models import Finding, FindingKind, Measurement, Mission, Status, utc, worst
from .repository import Repository
from .rules import IndicatorState, RulesEngine
from .scheduler import follow_up_tasks, routine_tasks

SPACE_WEATHER = "space_weather"

# How long a reading keeps driving status before it is considered stale.
STALE_AFTER: dict[str, timedelta] = {
    "glucose_fasting": timedelta(days=10),
    "body_mass_change_pct": timedelta(days=10),
    "vo2max_pct_baseline": timedelta(days=45),
    "strength_pct_baseline": timedelta(days=45),
    "reaction_time_pct_change": timedelta(days=45),
    "noise_24h": timedelta(days=2),
    "cabin_co2": timedelta(hours=3),
    "cabin_ppo2": timedelta(hours=3),
    "cabin_temperature": timedelta(hours=3),
    "cabin_humidity": timedelta(hours=3),
    "solar_proton_flux_10MeV": timedelta(hours=3),
}
DEFAULT_STALE = timedelta(hours=36)


class Mother:
    def __init__(self, repo: Repository, mission: Mission, cfg: Config | None = None) -> None:
        self.repo = repo
        self.mission = mission
        self.cfg = cfg or load_config()
        self.rules = RulesEngine(self.cfg)
        self._dq: list[Finding] = []
        self._overlay_cache: tuple[datetime, Any] | None = None

    # ------------------------------------------------------------- ingest
    def ingest(self, measurements: Iterable[Measurement], now: datetime | None = None) -> IngestReport:
        report = ingest(self.repo, measurements, now=now)
        self._dq.extend(report.findings)
        self._dq = self._dq[-200:]
        self._overlay_cache = None
        return report

    def _overlay(self, now: datetime):
        if self._overlay_cache and self._overlay_cache[0] == now:
            return self._overlay_cache[1]
        ov = derive_all(self.repo, self.mission, self.cfg, now)
        self._overlay_cache = (now, ov)
        return ov

    # ------------------------------------------------------------- helpers
    @staticmethod
    def _fresh(state: IndicatorState, now: datetime) -> bool:
        if state.latest is None:
            return False
        return now - state.latest.ts <= STALE_AFTER.get(state.indicator_id, DEFAULT_STALE)

    def _active_rule_findings(self, states: dict[str, IndicatorState], now: datetime) -> list[Finding]:
        out = []
        for st in states.values():
            if self._fresh(st, now):
                out.extend(f for f in st.findings if f.status != Status.OK)
        return out

    def _states_dict(self, states: dict[str, IndicatorState], now: datetime) -> dict[str, Any]:
        out = {}
        for k, st in states.items():
            d = st.to_dict()
            d["stale"] = not self._fresh(st, now)
            if d["stale"]:
                d["status"] = Status.OK.value
                d["message"] = "No recent reading."
            out[k] = d
        return out

    # ------------------------------------------------------------- assess
    def assess(self, astronaut_id: str, now: datetime | None = None) -> dict[str, Any]:
        now = utc(now) if now else datetime.now(timezone.utc)
        a = self.mission.astronaut(astronaut_id)
        repo = self._overlay(now)
        env = self.cfg.environments[self.mission.environment_id]

        crew_states = self.rules.evaluate_subject(repo, a.id, now)
        hab_states = self.rules.evaluate_subject(repo, a.habitat_id, now)
        sw_states = self.rules.evaluate_subject(repo, SPACE_WEATHER, now)

        findings: list[Finding] = []
        findings += self._active_rule_findings(crew_states, now)
        findings += self._active_rule_findings(hab_states, now)
        findings += self._active_rule_findings(sw_states, now)

        stats = analytics.analyze_subject(repo, self.cfg, self.mission, a.id, now)
        hab_stats = analytics.analyze_subject(repo, self.cfg, self.mission, a.habitat_id, now)
        findings += stats.findings + hab_stats.findings

        ctx = knowledge.Context(self.cfg, repo, self.mission, a, now, crew_states, hab_states, sw_states)
        findings += knowledge.evaluate_syndromes(ctx)

        forecasts, fc_findings = forecast_all(repo, self.cfg, self.mission, a, now)
        findings += fc_findings

        labs: list[dict] = []
        if a.lab_subject_id:
            labs, lab_findings = lab_panel(self.cfg, a.lab_subject_id, a.id, now)
            findings += lab_findings

        dq = check_sensor_health(repo, a.habitat_id, now) + check_sensor_health(repo, SPACE_WEATHER, now)
        dq += [f for f in self._dq if f.subject_id in (a.id, a.habitat_id, SPACE_WEATHER)
               and now - f.ts <= timedelta(hours=24)]
        findings += dq

        knowledge.attach_risks(self.cfg, findings)
        # Lab panels are pre/post-flight reference data (Inspiration4): shown in their own tab, not in live status.
        health = [f for f in findings if f.kind not in (FindingKind.DATA_QUALITY, FindingKind.LAB)]
        risks = knowledge.risk_summary(self.cfg, health)
        eva = knowledge.eva_readiness(ctx, health)

        today = now.date()
        tasks = routine_tasks(repo, self.cfg, self.mission, a, today) + follow_up_tasks(repo, a, findings, now)

        overall = worst(f.status for f in health)
        findings.sort(key=lambda f: (-f.status.severity, f.kind.value, f.ts), reverse=False)
        escalations = [f for f in health if f.escalate]

        return {
            "astronaut": {"id": a.id, "name": a.name, "habitat_id": a.habitat_id},
            "mission": {"id": self.mission.id, "flight_day": self.mission.flight_day(now),
                        "planned_days": self.mission.planned_days, "environment": env.id,
                        "environment_label": env.label, "comm_delay_one_way_s": list(env.comm_delay_one_way_s)},
            "generated_at": now.isoformat(),
            "overall_status": overall.value,
            "summary": self._summary(a.name, now, overall, health, eva),
            "counts": {s.value: sum(1 for f in health if f.status == s) for s in (Status.ALERT, Status.CAUTION)},
            "indicators": self._states_dict(crew_states, now),
            "habitat": self._states_dict(hab_states, now),
            "space_weather": self._states_dict(sw_states, now),
            "findings": [f.to_dict() for f in findings if f.kind != FindingKind.LAB],
            "lab_findings": [f.to_dict() for f in findings if f.kind == FindingKind.LAB],
            "risks": risks,
            "body_map": knowledge.body_map(self.cfg, risks),
            "eva_readiness": eva,
            "forecasts": [_round(f) for f in forecasts],
            "analytics": {
                "status": stats.status,
                "references": {k: {"mean": v.mean, "sigma": v.sigma, "n": v.n,
                                   "period": [v.period[0].isoformat(), v.period[1].isoformat()]}
                               for k, v in stats.references.items()},
                "envelope": _round(stats.envelope),
                "trends": _round(stats.trends),
            },
            "labs": labs,
            "tasks": [t.to_dict() for t in tasks],
            "escalations": [{"finding_id": f.id, "title": f.title, "status": f.status.value,
                             "comm_delay_one_way_s": list(env.comm_delay_one_way_s)} for f in escalations],
        }

    def assess_crew(self, now: datetime | None = None) -> dict[str, Any]:
        now = utc(now) if now else datetime.now(timezone.utc)
        crew = []
        for a in self.mission.crew:
            s = self.assess(a.id, now)
            crew.append({"astronaut": s["astronaut"], "overall_status": s["overall_status"], "counts": s["counts"],
                         "summary": s["summary"], "eva_readiness": s["eva_readiness"]["status"],
                         "top_findings": s["findings"][:3]})
        return {"generated_at": now.isoformat(), "flight_day": self.mission.flight_day(now),
                "environment": self.mission.environment_id,
                "overall_status": worst(Status(c["overall_status"]) for c in crew).value, "crew": crew}

    def series(self, subject_id: str, indicator_id: str, days: float = 30,
               now: datetime | None = None) -> dict[str, Any]:
        now = utc(now) if now else datetime.now(timezone.utc)
        repo = self._overlay(now)
        pts = repo.series(subject_id, indicator_id, start=now - timedelta(days=days), end=now)
        ind = self.cfg.indicator(indicator_id)
        return {
            "subject_id": subject_id, "indicator_id": indicator_id,
            "label": ind.label if ind else indicator_id, "unit": ind.unit if ind else None,
            "bands": [{"min": b.min, "max": b.max, "status": b.status.value} for b in (ind.bands if ind else ())],
            "points": [{"ts": m.ts.isoformat(), "value": round(m.value, 3), "status":
                        (ind.band_for(m.value).status.value if ind and ind.band_for(m.value) else None),
                        "source": m.source, "simulated": m.simulated} for m in pts],
        }

    # ------------------------------------------------------------- text
    def _summary(self, name: str, now: datetime, overall: Status, findings: list[Finding], eva: dict) -> str:
        fd = self.mission.flight_day(now)
        alerts = [f for f in findings if f.status == Status.ALERT]
        cautions = [f for f in findings if f.status == Status.CAUTION]
        if overall == Status.OK:
            head = f"FD{fd}: {name} - all monitored indicators nominal."
        else:
            head = f"FD{fd}: {name} - {len(alerts)} alert(s), {len(cautions)} caution(s)."
        top = (alerts or cautions)[:2]
        if top:
            head += " Top: " + "; ".join(f.title for f in top) + "."
        head += f" EVA: {eva['status']}."
        return head


def _round(obj: Any) -> Any:
    from .models import _jsonable
    return _jsonable(obj)
