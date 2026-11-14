"""Cross-domain reasoning on top of the knowledge graph (stage 2).

Single-indicator rules cannot see that a headache *and* high cabin CO2 *and* a vision change together point
to SANS, or that the cabin O2 tells you whether low SpO2 is an environment or a crew-member problem. The
syndrome rules below combine physiology, symptoms, environment and space weather, and every one of them
states the evidence it used. Risks and body regions come from MOTHER/config/knowledge_graph.json.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from statistics import median
from typing import Any

from .config import Config
from .models import Astronaut, Finding, FindingKind, Mission, Status, utc, worst
from .rules import IndicatorState


# ------------------------------------------------------------------ context
@dataclass
class Context:
    cfg: Config
    repo: Any
    mission: Mission
    astronaut: Astronaut
    now: datetime
    crew_states: dict[str, IndicatorState]
    habitat_states: dict[str, IndicatorState]
    space_weather_states: dict[str, IndicatorState] = field(default_factory=dict)

    @property
    def flight_day(self) -> int:
        return self.mission.flight_day(self.now)

    @property
    def env(self):
        return self.cfg.environments[self.mission.environment_id]

    def values(self, indicator_id: str, days: float, subject: str | None = None) -> list[float]:
        subj = subject or self.astronaut.id
        return [m.value for m in self.repo.series(subj, indicator_id, start=self.now - timedelta(days=days), end=self.now)]

    def latest(self, indicator_id: str, subject: str | None = None, max_age_days: float = 2) -> float | None:
        m = self.repo.latest(subject or self.astronaut.id, indicator_id, at=self.now)
        if m is None or (self.now - m.ts) > timedelta(days=max_age_days):
            return None
        return m.value

    def mean(self, indicator_id: str, days: float, subject: str | None = None) -> float | None:
        v = self.values(indicator_id, days, subject)
        return sum(v) / len(v) if v else None

    def delta_vs_prev14(self, indicator_id: str) -> float | None:
        last = self.repo.latest(self.astronaut.id, indicator_id, at=self.now)
        if last is None or (self.now - last.ts) > timedelta(days=2):
            return None
        prev = [m.value for m in self.repo.series(self.astronaut.id, indicator_id,
                                                  start=last.ts - timedelta(days=14), end=last.ts - timedelta(hours=12))]
        return last.value - median(prev) if len(prev) >= 5 else None

    def state(self, indicator_id: str) -> IndicatorState | None:
        return (self.crew_states.get(indicator_id) or self.habitat_states.get(indicator_id)
                or self.space_weather_states.get(indicator_id))

    def status_of(self, indicator_id: str) -> Status:
        s = self.state(indicator_id)
        return s.status if s else Status.OK


def _syndrome(ctx: Context, sid: str, status: Status, title: str, risks: list[str], evidence: dict,
              explanation: str, action: str, sources: list[str], escalate: bool | None = None) -> Finding:
    return Finding(
        subject_id=ctx.astronaut.id, kind=FindingKind.SYNDROME, status=status, title=title,
        rule_id=f"syndrome.{sid}", ts=ctx.now, action=action,
        escalate=(status == Status.ALERT) if escalate is None else escalate,
        basis="team_assumption", evidence=evidence, sources=sources, risks=risks, explanation=explanation,
    )


# ---------------------------------------------------------------- syndromes
def co2_headache(ctx: Context) -> Finding | None:
    co2_status = ctx.status_of("cabin_co2")
    headaches = [v for v in ctx.values("symptom_headache", 3) if v >= 1]
    if co2_status == Status.OK or not headaches:
        return None
    co2_1h = ctx.mean("cabin_co2", 1 / 24, ctx.astronaut.habitat_id)
    co2_7d = ctx.mean("cabin_co2", 7, ctx.astronaut.habitat_id)
    return _syndrome(
        ctx, "co2_headache", worst([co2_status, Status.CAUTION]),
        "Headaches are likely linked to elevated cabin CO2",
        ["atmosphere", "sans"],
        {"headache_reports_72h": len(headaches), "cabin_co2_1h_mmHg": co2_1h, "cabin_co2_7d_mmHg": co2_7d,
         "cabin_co2_status": co2_status.value},
        (f"{len(headaches)} headache report(s) in 72 h while cabin CO2 is {co2_status.value} "
         f"(1 h mean {co2_1h or 0:.1f}, 7 d mean {co2_7d or 0:.1f} mmHg). On ISS each +1 mmHg CO2 roughly doubles "
         "the odds of a reported headache (Law 2014), so the environment is the first suspect, not the astronaut."),
        "Improve ventilation (fans at work and sleep stations), check CO2 scrubbing, re-assess headache after 2 h.",
        ["law_2014", "ochmo_tb_co2"],
    )


def sans_pattern(ctx: Context) -> Finding | None:
    vision = [v for v in ctx.values("symptom_vision_change", 7) if v >= 1]
    if not vision:
        return None
    headaches = sum(1 for v in ctx.values("symptom_headache", 14) if v >= 1)
    co2_7d = ctx.mean("cabin_co2", 7, ctx.astronaut.habitat_id)
    factors = []
    if headaches >= 2:
        factors.append(f"{headaches} headaches in 14 days")
    if co2_7d is not None and co2_7d >= 2.5:
        factors.append(f"7-day cabin CO2 {co2_7d:.1f} mmHg")
    if ctx.flight_day >= 30:
        factors.append(f"flight day {ctx.flight_day} (SANS signs usually develop after weeks in microgravity)")
    return _syndrome(
        ctx, "sans_pattern", Status.ALERT, "Vision change with SANS risk factors - eye exam needed",
        ["sans"], {"vision_change_reports_7d": len(vision), "headaches_14d": headaches, "cabin_co2_7d_mmHg": co2_7d,
                   "flight_day": ctx.flight_day, "contributing_factors": factors},
        ("A self-reported vision change is always escalated. Contributing factors: " +
         ("; ".join(factors) if factors else "none found") +
         ". ~70% of long-duration crew show early optic-disc swelling (HRP SANS evidence report)."),
        "Report to flight surgeon; perform ocular exam (OCT / ultrasound / acuity) as directed; keep CO2 low.",
        ["hrr_er_sans", "eye_2026_sans"], escalate=True,
    )


def behavioral_strain(ctx: Context) -> Finding | None:
    signals: list[str] = []
    ev: dict[str, Any] = {}
    sleep7 = ctx.mean("sleep_hours", 7)
    if sleep7 is not None and sleep7 < 6.0:
        signals.append(f"7-day sleep mean {sleep7:.1f} h")
    mood7 = ctx.mean("mood", 7)
    if mood7 is not None and mood7 < 3.0:
        signals.append(f"7-day mood mean {mood7:.1f}/5")
    fat7 = ctx.mean("fatigue", 7)
    if fat7 is not None and fat7 >= 3.8:
        signals.append(f"7-day fatigue mean {fat7:.1f}/5")
    rt = ctx.latest("reaction_time_pct_change", max_age_days=10)
    if rt is not None and rt >= 10:
        signals.append(f"reaction time {rt:.0f}% slower than preflight")
    ev.update({"sleep_7d_mean": sleep7, "mood_7d_mean": mood7, "fatigue_7d_mean": fat7,
               "reaction_time_pct_change": rt, "signals": signals})
    if len(signals) < 2:
        return None
    status = Status.ALERT if len(signals) >= 3 else Status.CAUTION
    return _syndrome(
        ctx, "behavioral_strain", status,
        "Sleep, mood and performance are deteriorating together", ["behavioral", "sleep_circadian"], ev,
        (f"{len(signals)} independent behavioural-health signals at once: {'; '.join(signals)}. "
         "Isolation, confinement and distance from Earth make behavioural health one of NASA's top risks; "
         "the combination matters more than any single score."),
        "Request a Private Psychological Conference; protect the next sleep period; review workload.",
        ["ntrs_bhp_ops", "hrr_er_sleep", "basner_2024"],
    )


def infection_pattern(ctx: Context) -> Finding | None:
    t_delta = ctx.delta_vs_prev14("body_temperature")
    hr_delta = ctx.delta_vs_prev14("heart_rate_resting")
    temp = ctx.latest("body_temperature")
    if t_delta is None or hr_delta is None:
        return None
    if not (t_delta >= 0.7 and hr_delta >= 8):
        return None
    status = Status.ALERT if (temp is not None and temp >= 38.0) or t_delta >= 1.2 else Status.CAUTION
    return _syndrome(
        ctx, "infection_pattern", status, "Temperature and heart rate rising together - possible infection",
        ["immune"], {"temperature_delta_vs_14d": t_delta, "hr_delta_vs_14d": hr_delta, "temperature": temp},
        (f"Body temperature is {t_delta:+.1f} °C and resting heart rate {hr_delta:+.0f} bpm above this astronaut's own "
         "14-day in-flight baseline. Fever raises heart rate (~10 bpm per °C), so the pair is more specific than either alone. "
         "Spaceflight weakens immune function (HRP immune risk)."),
        "Log symptoms (cough, rash, sore throat); re-measure in 1 h; limit close contact; report to flight surgeon.",
        ["stahn_2017", "medlineplus_fever"],
    )


def hypoxia_source(ctx: Context) -> Finding | None:
    spo2 = ctx.latest("spo2")
    if spo2 is None or spo2 >= 95:
        return None
    ppo2 = ctx.latest("cabin_ppo2", ctx.astronaut.habitat_id, max_age_days=0.25)
    if ppo2 is not None and ppo2 < 145:
        title = "Low SpO2 with low cabin O2 - environmental cause likely"
        action = "Check cabin O2 partial pressure and life-support; notify mission control; all crew check SpO2."
        cause = "environment"
    else:
        title = "Low SpO2 with normal cabin O2 - physiological cause"
        action = "Rest and re-measure; if confirmed, report to flight surgeon immediately."
        cause = "physiological"
    status = Status.ALERT if spo2 < 92 or cause == "environment" else Status.CAUTION
    return _syndrome(
        ctx, "hypoxia_source", status, title, ["atmosphere", "immune"],
        {"spo2": spo2, "cabin_ppo2_mmHg": ppo2, "likely_cause": cause},
        (f"SpO2 {spo2:.0f}%. Cabin inspired O2 is {ppo2 if ppo2 is not None else 'unknown'} mmHg "
         "(NASA nominal 145-155 mmHg). Comparing the two tells the crew whether to fix the habitat or treat the person."),
        action, ["nasa_std_3001_v2", "medlineplus_spo2"],
    )


def energy_deficit(ctx: Context) -> Finding | None:
    mass = ctx.latest("body_mass_change_pct", max_age_days=10)
    intake = ctx.mean("energy_intake_pct_target", 7)
    if mass is None or intake is None or not (mass <= -3.0 and intake < 95):
        return None
    status = Status.ALERT if mass <= -7 else Status.CAUTION
    return _syndrome(
        ctx, "energy_deficit", status, "Weight loss explained by eating below energy target", ["nutrition"],
        {"body_mass_change_pct": mass, "energy_intake_7d_pct_target": intake},
        (f"Body mass is {mass:+.1f}% vs preflight while the 7-day energy intake averages {intake:.0f}% of the individual "
         "target (NASA-STD-3001: 100% of calculated needs, +200 kcal per EVA hour). Mass loss in flight worsens bone and "
         "muscle loss."),
        "Add snacks between meals, track intake daily for a week, plan extra kcal on EVA days.",
        ["hrr_er_nutrition", "nasa_std_3001_v2", "zwart_2014"],
    )


def radiation_event(ctx: Context) -> Finding | None:
    flux = ctx.latest("solar_proton_flux_10MeV", "space_weather", max_age_days=0.25)
    ratio = ctx.latest("radiation_daily_vs_environment", max_age_days=1.5)
    protected = ctx.env.magnetosphere_protected
    if flux is None and ratio is None:
        return None
    # Outside the magnetosphere (Moon, transit, Mars) treat each NOAA S-level as one step more severe.
    alert_flux = 1000 if protected else 100
    caution_flux = 10
    status = Status.OK
    if (flux or 0) >= alert_flux or (ratio or 0) >= 5:
        status = Status.ALERT
    elif (flux or 0) >= caution_flux and not protected:
        status = Status.CAUTION
    if status == Status.OK:
        return None
    return _syndrome(
        ctx, "radiation_event", status, "Solar particle event - take shelter, no EVA",
        ["radiation"], {"proton_flux_10MeV_pfu": flux, "daily_dose_vs_environment": ratio,
                        "environment": ctx.env.id, "magnetosphere_protected": protected,
                        "alert_flux_threshold": alert_flux},
        (f"GOES >=10 MeV proton flux {flux if flux is not None else 'n/a'} pfu, daily dose "
         f"{'%.1f' % ratio if ratio is not None else 'n/a'}x the {ctx.env.label} baseline. "
         + ("Within the magnetosphere NOAA S3 (1000 pfu) is the EVA no-go level." if protected else
            "Outside Earth's magnetosphere MOTHER escalates one NOAA level earlier (team assumption).")),
        "Move to the storm shelter / most shielded area; postpone EVA; keep dosimeter on.",
        ["noaa_scales", "nasa_std_3001_v1", "ochmo_tb_radiation"],
    )


def motion_sickness(ctx: Context) -> Finding | None:
    nausea = ctx.latest("symptom_nausea", max_age_days=1)
    if nausea is None or nausea < 1 or ctx.flight_day <= 3:
        return None
    return _syndrome(
        ctx, "motion_sickness_persisting", Status.CAUTION, "Nausea persisting beyond the first 72 h",
        ["sensorimotor"], {"nausea": nausea, "flight_day": ctx.flight_day},
        ("70-90% of crew have space adaptation sickness in the first days; symptoms after 72 h are unusual "
         "and may have another cause."),
        "Report to crew medical officer; consider other causes (infection, CO2, medication).", [],
    )


SYNDROMES = [co2_headache, sans_pattern, behavioral_strain, infection_pattern, hypoxia_source,
             energy_deficit, radiation_event, motion_sickness]


def evaluate_syndromes(ctx: Context) -> list[Finding]:
    return [f for f in (rule(ctx) for rule in SYNDROMES) if f is not None]


# ------------------------------------------------------- EVA readiness
def eva_readiness(ctx: Context, findings: list[Finding]) -> dict[str, Any]:
    blockers: list[dict[str, Any]] = []

    def block(reason: str, source: list[str]):
        blockers.append({"reason": reason, "sources": source})

    if ctx.flight_day <= 3:
        block("Within 72 h of launch (space adaptation sickness).", [])
    flux = ctx.latest("solar_proton_flux_10MeV", "space_weather", max_age_days=0.25)
    limit = 1000 if ctx.env.magnetosphere_protected else 100
    if flux is not None and flux >= limit:
        block(f"Solar proton flux {flux:.0f} pfu >= {limit} pfu.", ["noaa_scales"])
    sleep = ctx.latest("sleep_hours", max_age_days=1.5)
    if sleep is not None and sleep < 6:
        block(f"Last sleep {sleep:.1f} h < 6 h.", ["ochmo_tb_sleep"])
    vo2_pct = ctx.latest("vo2max_pct_baseline", max_age_days=45)
    if vo2_pct is not None and vo2_pct < 80:
        block(f"VO2max {vo2_pct:.0f}% of preflight < 80% (NASA-STD-3001).", ["nasa_std_3001_v1"])
    vo2_abs = ctx.latest("vo2max_ml_kg_min", max_age_days=45)
    floor = 32.9 if ctx.env.gravity_g == 0 else 36.5
    if vo2_abs is not None and vo2_abs < floor:
        block(f"VO2max {vo2_abs:.1f} ml/kg/min below EVA floor {floor}.", ["nasa_std_3001_v1"])
    rt = ctx.latest("reaction_time_pct_change", max_age_days=10)
    if rt is not None and rt >= 20:
        block(f"Reaction time {rt:.0f}% slower than preflight.", ["basner_2024"])
    blocking_risks = {"cardiovascular", "atmosphere", "immune", "sans", "radiation"}
    for f in findings:
        if f.status == Status.ALERT and blocking_risks.intersection(f.risks):
            block(f"Active alert: {f.title}", f.sources)
    return {"go": not blockers, "status": "GO" if not blockers else "NO-GO", "blockers": blockers,
            "flight_day": ctx.flight_day}


# ------------------------------------------------- risks & body map
def attach_risks(cfg: Config, findings: list[Finding]) -> None:
    by_indicator: dict[str, list[str]] = {}
    for r in cfg.knowledge["risks"]:
        for ind in r["indicators"]:
            by_indicator.setdefault(ind, []).append(r["id"])
    for f in findings:
        if f.indicator_id:
            for rid in by_indicator.get(f.indicator_id, []):
                if rid not in f.risks:
                    f.risks.append(rid)


SCORE = {Status.OK: 0, Status.CAUTION: 30, Status.ALERT: 70}


def risk_summary(cfg: Config, findings: list[Finding]) -> list[dict[str, Any]]:
    out = []
    for r in cfg.knowledge["risks"]:
        fs = [f for f in findings if r["id"] in f.risks and f.status != Status.OK]
        status = worst(f.status for f in fs)
        score = min(100, sum(SCORE[f.status] for f in fs))
        out.append({
            "id": r["id"], "label": r["label"], "status": status.value, "score": score,
            "hazards": r["hazards"], "body_regions": r["body_regions"],
            "countermeasures": r["countermeasures"], "sources": r["sources"], "links": r.get("links", []),
            "finding_ids": [f.id for f in fs],
        })
    return out


def body_map(cfg: Config, risks: list[dict[str, Any]]) -> dict[str, Any]:
    regions = {b["id"]: {"label": b["label"], "status": Status.OK, "risks": []} for b in cfg.knowledge["body_regions"]}
    for r in risks:
        for reg in r["body_regions"]:
            if reg in regions:
                st = Status(r["status"])
                regions[reg]["risks"].append({"id": r["id"], "status": r["status"]})
                if st.severity > regions[reg]["status"].severity:
                    regions[reg]["status"] = st
    return {k: {**v, "status": v["status"].value} for k, v in regions.items()}
