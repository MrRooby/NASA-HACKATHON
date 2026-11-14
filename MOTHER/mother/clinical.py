"""Clinical calculations with published formulas (pure functions, no database access).

Every check returns a `Check` that names the organ it informs, the value, the status, the formula and the
reference, so a UI can show *what* was concluded and *why*. Thresholds are the published ones; where a value
is a team choice it says `basis="team_assumption"`. Educational demo, not medical advice.
"""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field
from typing import Any

OK, CAUTION, ALERT = "ok", "caution", "alert"
_RANK = {OK: 0, CAUTION: 1, ALERT: 2}


@dataclass
class Check:
    organ: str                 # heart | lungs | blood | kidneys | gut | brain | eyes | musculoskeletal | limbs | exposure
    code: str                  # stable id, e.g. "egfr"
    label: str
    value: Any
    unit: str
    status: str                # ok | caution | alert
    message: str               # one plain sentence for the crew
    action: str | None = None
    formula: str | None = None
    reference: str | None = None
    basis: str = "source"      # source | team_assumption
    inputs: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        if isinstance(d["value"], float):
            d["value"] = round(d["value"], 3)
        return d


def worst(statuses) -> str:
    return max(statuses, key=lambda s: _RANK.get(s, -1), default=OK)


# ------------------------------------------------------------------ kidneys
def egfr_ckd_epi_2021(scr_mg_dl: float, age: float, female: bool) -> float:
    """CKD-EPI 2021 creatinine equation (race-free). Inker et al., N Engl J Med 2021."""
    k, a = (0.7, -0.241) if female else (0.9, -0.302)
    r = scr_mg_dl / k
    return 142 * min(r, 1) ** a * max(r, 1) ** -1.200 * 0.9938 ** age * (1.012 if female else 1.0)


def check_egfr(scr: float, age: float | None, female: bool | None, lab_egfr: float | None = None) -> Check | None:
    if age is not None and female is not None:
        v, how = egfr_ckd_epi_2021(scr, age, female), "computed (CKD-EPI 2021)"
    elif lab_egfr is not None:
        v, how = lab_egfr, "reported by the lab (age unknown)"
    else:
        return None
    st = ALERT if v < 30 else CAUTION if v < 60 else OK
    stage = "G1-G2" if v >= 60 else "G3a" if v >= 45 else "G3b" if v >= 30 else "G4" if v >= 15 else "G5"
    return Check("kidneys", "egfr", "Kidney filtration (eGFR)", v, "mL/min/1.73m²", st,
                 f"Kidney filtration {v:.0f} mL/min ({stage}).",
                 None if st == OK else "Repeat creatinine, check hydration; report to flight surgeon.",
                 "142 × min(Scr/κ,1)^α × max(Scr/κ,1)^-1.2 × 0.9938^age × 1.012[F]", "CKD-EPI 2021; KDIGO 2012 CKD stages",
                 inputs={"creatinine_mg_dl": scr, "age": age, "female": female, "how": how})


def check_aki_kdigo(baseline_scr: float, current_scr: float, rise_48h: float | None = None) -> Check:
    """KDIGO 2012 acute kidney injury staging by serum creatinine."""
    ratio = current_scr / baseline_scr if baseline_scr else 1.0
    stage = 0
    if ratio >= 3.0 or current_scr >= 4.0:
        stage = 3
    elif ratio >= 2.0:
        stage = 2
    elif ratio >= 1.5 or (rise_48h is not None and rise_48h >= 0.3):
        stage = 1
    st = ALERT if stage >= 2 else CAUTION if stage == 1 else OK
    return Check("kidneys", "aki_kdigo", "Acute kidney injury (KDIGO)", stage, "stage", st,
                 "No sign of acute kidney injury." if stage == 0 else f"Acute kidney injury stage {stage}: creatinine ×{ratio:.1f} vs baseline.",
                 None if stage == 0 else "Fluids per protocol, avoid nephrotoxic drugs, recheck in 12–24 h, escalate.",
                 "stage 1: ×1.5–1.9 or +0.3 mg/dL in 48 h · stage 2: ×2.0–2.9 · stage 3: ≥×3 or ≥4.0 mg/dL", "KDIGO 2012 AKI guideline",
                 inputs={"baseline_mg_dl": baseline_scr, "current_mg_dl": current_scr, "ratio": round(ratio, 2)})


def check_bun_creatinine(bun: float, scr: float) -> Check:
    r = bun / scr if scr else 0
    st = CAUTION if r > 20 else OK
    return Check("kidneys", "bun_cr_ratio", "BUN / creatinine ratio", r, "ratio", st,
                 "Ratio suggests low fluid volume (pre-renal pattern)." if st != OK else "Ratio normal.",
                 "Increase fluid intake; recheck." if st != OK else None, "BUN ÷ creatinine (>20 = pre-renal pattern)",
                 "Standard clinical interpretation", inputs={"bun": bun, "creatinine": scr})


def check_stone_risk(ca24: float | None, ox24: float | None, cit24: float | None, vol24: float | None,
                     female: bool | None) -> Check | None:
    """Kidney-stone risk from 24-h urine (AUA 2014 guideline targets). Bone loss in space raises urine calcium."""
    if all(v is None for v in (ca24, ox24, cit24, vol24)):
        return None
    factors = []
    ca_lim = 250 if female or female is None else 300
    if ca24 is not None and ca24 > ca_lim:
        factors.append(f"high urine calcium {ca24:.0f} mg/d")
    if ox24 is not None and ox24 > 40:
        factors.append(f"high oxalate {ox24:.0f} mg/d")
    if cit24 is not None and cit24 < 320:
        factors.append(f"low citrate {cit24:.0f} mg/d")
    if vol24 is not None and vol24 < 2.5:
        factors.append(f"urine volume {vol24:.2f} L/d (< 2.5)")
    n = len(factors)
    st = ALERT if n >= 3 else CAUTION if n >= 1 else OK
    return Check("kidneys", "stone_risk", "Kidney stone risk (24-h urine)", n, "risk factors", st,
                 "No kidney-stone risk factors." if n == 0 else "Stone risk: " + ", ".join(factors) + ".",
                 None if n == 0 else "Drink to ≥2.5 L urine/day; keep resistive exercise (limits bone calcium loss).",
                 f"count of: Ca >{ca_lim} mg/d, oxalate >40 mg/d, citrate <320 mg/d, volume <2.5 L/d",
                 "AUA 2014 kidney stone guideline; NASA HRP renal stone risk",
                 inputs={"calcium_mg_d": ca24, "oxalate_mg_d": ox24, "citrate_mg_d": cit24, "volume_l_d": vol24})


def check_hydration(sg: float | None, intake_l: float | None) -> Check | None:
    if sg is None and intake_l is None:
        return None
    st, bits = OK, []
    if sg is not None:
        if sg >= 1.030:
            st = ALERT
            bits.append(f"urine very concentrated (SG {sg:.3f})")
        elif sg > 1.020:
            st = CAUTION
            bits.append(f"urine concentrated (SG {sg:.3f})")
    if intake_l is not None and intake_l < 2.5:
        st = worst([st, CAUTION])
        bits.append(f"drank {intake_l:.1f} L (target ≥2.5 L)")
    return Check("kidneys", "hydration", "Hydration", sg if sg is not None else intake_l, "SG" if sg is not None else "L/d", st,
                 "Well hydrated." if st == OK else "Dehydration signs: " + ", ".join(bits) + ".",
                 None if st == OK else "Drink 0.5 L now and spread fluids over the day; recheck urine.",
                 "urine specific gravity >1.020 concentrated, ≥1.030 dehydrated; intake target ≥2.5 L/d",
                 "Clinical urinalysis interpretation; NASA water intake target", inputs={"specific_gravity": sg, "intake_l_d": intake_l})


def check_albumin_creatinine(acr: float) -> Check:
    st = ALERT if acr > 300 else CAUTION if acr >= 30 else OK
    cat = "A3" if acr > 300 else "A2" if acr >= 30 else "A1"
    return Check("kidneys", "uacr", "Urine albumin/creatinine", acr, "mg/g", st, f"Albuminuria category {cat}.",
                 None if st == OK else "Repeat on a morning sample; report.", "A1 <30 · A2 30–300 · A3 >300 mg/g",
                 "KDIGO 2012 albuminuria categories", inputs={"acr_mg_g": acr})


def check_dipstick(strip: dict[str, str]) -> list[Check]:
    pos = {k for k, v in strip.items() if str(v).lower().startswith("pos")}
    out = []
    if "nitrite" in strip or "leukocytes" in strip:
        both = {"nitrite", "leukocytes"} <= pos
        any_ = bool({"nitrite", "leukocytes"} & pos)
        out.append(Check("kidneys", "uti", "Urinary infection screen", "positive" if any_ else "negative", "dipstick",
                         ALERT if both else CAUTION if any_ else OK,
                         "Nitrite and leukocytes positive: probable urinary infection." if both else
                         "One infection marker positive: possible urinary infection." if any_ else "No infection markers.",
                         "Repeat strip, drink fluids, consult flight surgeon about antibiotics." if any_ else None,
                         "nitrite+ AND leukocyte esterase+ → probable UTI", "Clinical urinalysis interpretation",
                         inputs={k: strip.get(k) for k in ("nitrite", "leukocytes")}))
    if "blood" in strip:
        out.append(Check("kidneys", "urine_blood", "Blood / myoglobin in urine", strip["blood"], "dipstick",
                         CAUTION if "blood" in pos else OK,
                         "Strip positive for blood: haematuria or myoglobin (muscle breakdown)." if "blood" in pos else "No blood in urine.",
                         "Check for trauma, kidney stone or muscle injury; microscopy when possible." if "blood" in pos else None,
                         "heme-positive strip = red cells OR myoglobin", "Clinical urinalysis interpretation"))
    if "ketones" in strip:
        out.append(Check("gut", "ketones", "Ketones in urine", strip["ketones"], "dipstick", CAUTION if "ketones" in pos else OK,
                         "Ketones present: body is burning fat (eating too little?)." if "ketones" in pos else "No ketones.",
                         "Check energy intake against target." if "ketones" in pos else None,
                         "ketonuria = energy deficit / fasting", "Clinical urinalysis interpretation"))
    if "glucose" in strip:
        out.append(Check("gut", "urine_glucose", "Glucose in urine", strip["glucose"], "dipstick", CAUTION if "glucose" in pos else OK,
                         "Glucose in urine: check blood sugar." if "glucose" in pos else "No glucose in urine.",
                         "Measure fasting blood glucose." if "glucose" in pos else None, "glycosuria above renal threshold (~180 mg/dL)",
                         "Clinical urinalysis interpretation"))
    if "protein" in strip and "protein" in pos:
        out.append(Check("kidneys", "urine_protein", "Protein in urine", strip["protein"], "dipstick", CAUTION,
                         "Protein in urine.", "Repeat; measure albumin/creatinine ratio.", None, "Clinical urinalysis interpretation"))
    return out


# ------------------------------------------------------------------ blood chemistry / heart
def check_potassium(k: float) -> Check:
    """European Resuscitation Council 2021 hyperkalaemia grading."""
    if k >= 6.5:
        st, msg = ALERT, f"Severe high potassium {k:.1f} mmol/L: risk of dangerous heart rhythm."
    elif k >= 6.0:
        st, msg = ALERT, f"Moderate high potassium {k:.1f} mmol/L: arrhythmia risk."
    elif k >= 5.5:
        st, msg = CAUTION, f"Mild high potassium {k:.1f} mmol/L."
    elif k < 3.0:
        st, msg = ALERT, f"Very low potassium {k:.1f} mmol/L: arrhythmia risk."
    elif k < 3.5:
        st, msg = CAUTION, f"Low potassium {k:.1f} mmol/L."
    else:
        st, msg = OK, f"Potassium normal ({k:.1f} mmol/L)."
    return Check("heart", "potassium", "Potassium (heart rhythm risk)", k, "mmol/L", st, msg,
                 None if st == OK else "ECG/monitor, repeat sample; AED within reach if ≥6.0; escalate.",
                 "mild 5.5–5.9 · moderate 6.0–6.4 · severe ≥6.5 · low <3.5", "ERC Guidelines 2021 (hyperkalaemia)")


def check_sodium(na: float) -> Check:
    st = ALERT if na < 125 or na > 155 else CAUTION if na < 135 or na > 145 else OK
    msg = (f"Sodium normal ({na:.0f} mmol/L)." if st == OK else
           f"{'Low' if na < 135 else 'High'} sodium {na:.0f} mmol/L ({'over-hydration / hormone' if na < 135 else 'dehydration'} pattern).")
    return Check("blood", "sodium", "Sodium", na, "mmol/L", st, msg, None if st == OK else "Review fluids; repeat; escalate if confused.",
                 "normal 135–145; severe <125 or >155", "Standard clinical ranges")


def corrected_calcium(ca: float, albumin: float) -> float:
    """Payne formula: Ca_corr = Ca + 0.8 × (4.0 − albumin)."""
    return ca + 0.8 * (4.0 - albumin)


def check_calcium(ca: float, albumin: float | None) -> Check:
    v = corrected_calcium(ca, albumin) if albumin else ca
    st = ALERT if v < 7.5 or v > 12 else CAUTION if v < 8.6 or v > 10.3 else OK
    return Check("blood", "calcium_corrected", "Calcium (albumin-corrected)", v, "mg/dL", st,
                 f"Corrected calcium {v:.1f} mg/dL." + ("" if st == OK else " Bone loss in space can raise calcium."),
                 None if st == OK else "Repeat; check urine calcium and exercise.", "Ca + 0.8 × (4.0 − albumin)",
                 "Payne 1973", inputs={"calcium": ca, "albumin": albumin})


def check_anion_gap(na: float, cl: float, hco3: float) -> Check:
    ag = na - (cl + hco3)
    st = CAUTION if ag > 16 or ag < 3 else OK
    return Check("blood", "anion_gap", "Anion gap", ag, "mmol/L", st,
                 f"Anion gap {ag:.0f} mmol/L." + (" Possible metabolic acidosis (e.g. ketones, lactate)." if ag > 16 else ""),
                 None if st == OK else "Check ketones, hydration and kidney function.", "Na − (Cl + HCO3)",
                 "Standard acid-base interpretation", inputs={"sodium": na, "chloride": cl, "bicarbonate": hco3})


def check_anemia(hb: float, female: bool | None) -> Check:
    lim = 12.0 if female or female is None else 13.0
    st = ALERT if hb < 8 else CAUTION if hb < lim else OK
    return Check("blood", "hemoglobin", "Haemoglobin (anaemia)", hb, "g/dL", st,
                 f"Haemoglobin {hb:.1f} g/dL" + (" - anaemia (space anaemia is common)." if st != OK else " - normal."),
                 None if st == OK else "Repeat CBC; check iron intake; report.",
                 f"WHO: anaemia if Hb < {lim:.0f} g/dL ({'women' if lim == 12 else 'men'})", "WHO 2011 haemoglobin thresholds")


def check_lymphocytes(alc: float) -> Check:
    """Absolute lymphocyte count; falls first after significant radiation (REMM / AFRRI triage)."""
    st = ALERT if alc < 500 else CAUTION if alc < 1000 else OK
    return Check("blood", "lymphocytes", "Lymphocytes (radiation-sensitive)", alc, "cells/µL", st,
                 f"Lymphocytes {alc:.0f}/µL" + (" - low; after radiation exposure this suggests significant dose." if st != OK else " - normal."),
                 None if st == OK else "Repeat in 24–48 h and compare with personal dose; escalate.",
                 "ALC <1000 caution, <500 alert", "REMM / AFRRI acute radiation syndrome triage")


def check_wbc(wbc_k: float) -> Check:
    st = ALERT if wbc_k < 2.0 or wbc_k > 20 else CAUTION if wbc_k < 3.8 or wbc_k > 10.8 else OK
    return Check("blood", "wbc", "White blood cells", wbc_k, "×10³/µL", st,
                 f"White cells {wbc_k:.1f}×10³/µL" + (" - outside normal (infection or immune change)." if st != OK else " - normal."),
                 None if st == OK else "Check temperature and symptoms; repeat.", "normal 3.8–10.8", "Inspiration4 lab reference range")


def check_liver(alt: float | None, ast: float | None, female: bool | None) -> Check | None:
    if alt is None and ast is None:
        return None
    alt_lim = 29 if female else 46
    hi = [n for n, v, lim in (("ALT", alt, alt_lim), ("AST", ast, 40)) if v is not None and v > lim]
    x3 = [n for n, v, lim in (("ALT", alt, alt_lim), ("AST", ast, 40)) if v is not None and v > 3 * lim]
    st = ALERT if x3 else CAUTION if hi else OK
    return Check("gut", "liver_enzymes", "Liver enzymes", alt if alt is not None else ast, "U/L", st,
                 "Liver enzymes normal." if st == OK else f"Raised {', '.join(hi)}" + (" (>3× normal)." if x3 else "."),
                 None if st == OK else "Review medication and alcohol-free diet; repeat.", "ALT/AST above upper reference (×3 = significant)",
                 "Lab reference ranges (sex-specific ALT)", inputs={"alt": alt, "ast": ast})


def check_glucose(g: float) -> Check:
    st = ALERT if g < 70 or g >= 126 else CAUTION if g >= 100 else OK
    return Check("gut", "glucose", "Fasting glucose", g, "mg/dL", st,
                 f"Fasting glucose {g:.0f} mg/dL" + (" - low." if g < 70 else " - high." if g >= 100 else " - normal."),
                 None if st == OK else ("15 g fast carbs, recheck in 15 min." if g < 70 else "Repeat fasting test."),
                 "<70 hypo · 100–125 raised · ≥126 diabetic range", "ADA Standards of Care")


def check_bristol(score: float, days_abnormal: int = 1) -> Check:
    s = round(score)
    st = OK if 3 <= s <= 5 else (ALERT if days_abnormal >= 3 else CAUTION)
    what = "constipation" if s <= 2 else "diarrhoea" if s >= 6 else "normal"
    return Check("gut", "bristol", "Stool form (Bristol)", s, "type 1–7", st,
                 f"Bristol type {s}: {what}." + (f" ({days_abnormal} days)" if st != OK else ""),
                 None if st == OK else ("More fluid and fibre." if s <= 2 else "Fluids + electrolytes; report if >2 days or fever."),
                 "types 3–5 normal; 1–2 constipation; 6–7 diarrhoea", "Lewis & Heaton 1997 (Bristol Stool Form Scale)")


# ------------------------------------------------------------------ vitals
def check_shock_index(hr: float, sbp: float) -> Check:
    si = hr / sbp if sbp else 0
    st = ALERT if si >= 1.0 else CAUTION if si > 0.9 else OK
    return Check("heart", "shock_index", "Shock index (HR ÷ systolic BP)", si, "ratio", st,
                 f"Shock index {si:.2f}" + (" - circulation under strain (bleeding, dehydration, sepsis?)." if st != OK else " - normal."),
                 None if st == OK else "Lie flat, IV fluids per protocol, escalate.", "HR / SBP (normal 0.5–0.7; >0.9 abnormal)",
                 "Allgöwer & Burri 1967; trauma triage literature", inputs={"hr": hr, "sbp": sbp})


def check_map(sbp: float, dbp: float) -> Check:
    m = dbp + (sbp - dbp) / 3
    st = ALERT if m < 65 else CAUTION if m < 70 or m > 110 else OK
    return Check("heart", "map", "Mean arterial pressure", m, "mmHg", st,
                 f"Mean arterial pressure {m:.0f} mmHg" + (" - organs may be under-perfused." if m < 65 else "."),
                 None if st == OK else "Recheck; fluids if low; escalate if <65.", "DBP + (SBP − DBP) / 3",
                 "Standard haemodynamics; Surviving Sepsis target ≥65", inputs={"sbp": sbp, "dbp": dbp})


def check_spo2(spo2: float) -> Check:
    st = ALERT if spo2 < 90 else CAUTION if spo2 < 95 else OK
    return Check("lungs", "spo2", "Blood oxygen (SpO2)", spo2, "%", st, f"SpO2 {spo2:.0f}%.",
                 None if st == OK else "Check cabin O2; rest and re-measure; escalate if <90.", "normal ≥95%", "MedlinePlus; clinical practice")


# ------------------------------------------------------------------ limbs (4 wearable bands)
def check_limb_perfusion(limbs: dict[str, dict[str, float | None]]) -> list[Check]:
    """Compare each limb band with the median of the other limbs. Local loss of circulation (compression, crush,
    tourniquet, clot) shows as a perfusion index far below the other limbs, a missing pulse, or a lower SpO2,
    while the rest of the body is normal."""
    out = []
    names = [n for n, v in limbs.items() if v]
    for n in names:
        others = [limbs[o] for o in names if o != n]
        if not others:
            continue

        def med(key):
            vals = sorted(x[key] for x in others if x.get(key) is not None)
            return vals[len(vals) // 2] if vals else None
        m_spo2, m_hr, m_pi = med("spo2"), med("hr"), med("pi")
        me = limbs[n]
        no_pulse = me.get("hr") in (None, 0) and bool(m_hr and m_hr > 30)
        pi_ratio = (me["pi"] / m_pi) if me.get("pi") is not None and m_pi else None
        spo2_drop = me.get("spo2") is not None and m_spo2 is not None and m_spo2 - me["spo2"] >= 6
        if no_pulse or (pi_ratio is not None and pi_ratio < 0.3):
            st = ALERT
        elif spo2_drop or (pi_ratio is not None and pi_ratio < 0.5):
            st = CAUTION
        else:
            st = OK
        name = n.replace("_", " ")
        if no_pulse:
            msg = f"{name.capitalize()}: no pulse while the other limbs are normal - circulation lost."
        elif pi_ratio is not None and pi_ratio < 0.5:
            msg = f"{name.capitalize()}: blood flow (perfusion) {pi_ratio:.0%} of the other limbs - check this limb now."
        elif spo2_drop:
            msg = f"{name.capitalize()}: SpO2 {me['spo2']:.0f}% vs {m_spo2:.0f}% in the other limbs."
        else:
            msg = f"{name.capitalize()}: circulation normal."
        out.append(Check("limbs", f"perfusion_{n}", f"Circulation: {name}",
                         round(pi_ratio * 100) if pi_ratio is not None else me.get("spo2"),
                         "% of other limbs" if pi_ratio is not None else "% SpO2", st, msg,
                         "Inspect the limb (pressure, swelling, colour, cold); free it; if compressed >1 h start IV fluids BEFORE release."
                         if st != OK else None,
                         "limb vs median of the other limbs: perfusion index <50% caution, <30% or no pulse alert; SpO2 drop >=6 points caution",
                         "Peripheral perfusion index monitoring (pulse oximetry); team rule", basis="team_assumption",
                         inputs={"limb": me, "others_median": {"spo2": m_spo2, "hr": m_hr, "pi": m_pi}}))
    return out


def check_sleep_eeg(efficiency_pct: float, hours: float | None, deep_pct: float | None, nights: int) -> Check:
    st = ALERT if efficiency_pct < 75 else CAUTION if efficiency_pct < 85 else OK
    extra = f", {hours:.1f} h a night" if hours is not None else ""
    return Check("brain", "sleep_eeg", f"Sleep quality (EEG, {nights} nights)", efficiency_pct, "% efficiency", st,
                 f"Sleep efficiency {efficiency_pct:.0f}%{extra}" + (" - poor sleep." if st != OK else " - good."),
                 None if st == OK else "Check noise, light, CO2 and workload in the sleep period.",
                 "time asleep / time in bed (normal >=85%)", "AASM sleep scoring conventions",
                 inputs={"hours": hours, "deep_sleep_pct": deep_pct, "nights": nights})


def check_crush_syndrome(limb_lost: bool, k: float | None, urine_blood_pos: bool, aki_stage: int) -> Check | None:
    """Crush syndrome / rhabdomyolysis pattern: compressed limb + potassium rise + heme-positive urine + kidney injury."""
    signs = [s for s, on in (("limb circulation lost", limb_lost), (f"potassium {k:.1f}" if k else "", bool(k and k >= 5.5)),
                             ("myoglobin/blood in urine", urine_blood_pos), (f"AKI stage {aki_stage}", aki_stage >= 1)) if on]
    if not signs:
        return None
    st = ALERT if len(signs) >= 2 else CAUTION
    return Check("limbs", "crush_syndrome", "Crush syndrome / muscle breakdown", len(signs), "signs", st,
                 ("Crush-syndrome pattern: " if st == ALERT else "Possible muscle injury: ") + ", ".join(signs) + ".",
                 "IV fluids, ECG monitoring, AED pads ready, repeat potassium hourly, escalate to Earth.",
                 "≥2 of: limb compression, K⁺ ≥5.5, heme+ urine, AKI", "Clinical crush-syndrome management (rhabdomyolysis)",
                 basis="team_assumption")


# ------------------------------------------------------------------ radiation & air
def check_personal_dose(cum_msv: float, career_limit: float = 600.0, prior: float = 0.0) -> Check:
    total = cum_msv + prior
    pct = total / career_limit * 100
    st = ALERT if pct >= 90 else CAUTION if pct >= 50 else OK
    return Check("exposure", "dose_career", "Radiation dose (personal dosimeter)", total, "mSv", st,
                 f"{total:.0f} mSv = {pct:.0f}% of the NASA career limit.", None if st == OK else "Minimise EVA time; flight surgeon review.",
                 "cumulative effective dose ÷ 600 mSv", "NASA-STD-3001 Vol 1 [4030]", inputs={"mission_msv": cum_msv, "prior_msv": prior})


def check_co2_exposure(mmhg: float) -> Check:
    st = ALERT if mmhg > 3.0 else CAUTION if mmhg >= 2.5 else OK
    return Check("exposure", "co2", "CO2 where this person lives", mmhg, "mmHg", st,
                 f"CO2 {mmhg:.1f} mmHg in the home zone." + (" Headaches likely." if st != OK else ""),
                 None if st == OK else "Ventilate the zone; check the scrubber.", "1-h average ≤3 mmHg; 7-day <2.5", "NASA-STD-3001 Vol 2 [6004]")
