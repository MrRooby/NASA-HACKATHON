#!/usr/bin/env python3
"""load.py | import danych, które są już w repo, do astro_core (MariaDB, schemat 0.2).

Ładuje (idempotentnie, INSERT ... ON DUPLICATE KEY UPDATE):
  1. słowniki: age_band, body_system, environment (config/thresholds.json + leo_free_flyer, analog_hdt)
  2. data_source (config/sources.json + zbiory danych)
  3. indicator, indicator_alias, threshold_band (config/thresholds.json + analityty z plików)
  4. mission I4, subject I4-C001..C004, participation
  5. observation: CBC (osd569 long), CMP (osd575 long), panel kardio + cytokiny (osd575 wide, bez *_percent)
  6. reference_range: normy laboratoryjne z plików (tylko gdy jednoznaczne dla płci, patrz DATABASE_PLAN §5.3-5.4)
  7. cohort + cohort_stat: Mendeley BP

Uruchomienie (z katalogu głównego repo; hasła z DATABASE/.env):
  uv run --with pymysql==1.1.1 python DATABASE/etl/load.py
"""
from __future__ import annotations

import collections
import csv
import hashlib
import json
import os
import re
import sys
from pathlib import Path

import pymysql

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "nasa"
CONFIG = ROOT / "config"


# ---------------------------------------------------------------- połączenie
def read_env(path: Path) -> dict[str, str]:
    env = {}
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


def connect():
    env = {**read_env(ROOT / "DATABASE" / ".env"), **os.environ}
    return pymysql.connect(
        host=env.get("DB_HOST", "127.0.0.1"),
        port=int(env.get("DB_PORT", "3306")),
        user="astro_etl",
        password=env["ASTRO_ETL_PASSWORD"],
        database="astro_core",
        charset="utf8mb4",
        autocommit=False,
    )


def upsert(cur, table: str, row: dict, keys_no_update: tuple = ()) -> None:
    cols = list(row)
    upd = [c for c in cols if c not in keys_no_update] or cols[:1]
    sql = (
        f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(cols))}) "
        f"ON DUPLICATE KEY UPDATE {', '.join(f'{c}=VALUES({c})' for c in upd)}"
    )
    cur.execute(sql, [row[c] for c in cols])


def prune_batches(cur) -> int:
    """Usuwa z dziennika starsze wpisy importu tego samego pliku, do których nie odwołuje się już żaden wiersz
    (ponowny import idempotentny przepina wiersze na nowy wpis). Dzięki temu dziennik nie puchnie od powtórzeń."""
    cur.execute("""
        DELETE b FROM astro_core.import_batch b
        WHERE b.status = 'ok'
          AND EXISTS (SELECT 1 FROM (SELECT id, source_id, adapter, file_name FROM astro_core.import_batch) n
                      WHERE n.source_id = b.source_id AND n.adapter = b.adapter AND n.file_name = b.file_name
                        AND n.id > b.id)
          AND NOT EXISTS (SELECT 1 FROM astro_core.observation o WHERE o.import_batch_id = b.id)
          AND NOT EXISTS (SELECT 1 FROM astro_core.env_observation e WHERE e.import_batch_id = b.id)
          AND NOT EXISTS (SELECT 1 FROM astro_core.cohort c WHERE c.import_batch_id = b.id)
          AND NOT EXISTS (SELECT 1 FROM astro_habitat.reading r WHERE r.import_batch_id = b.id)
          AND NOT EXISTS (SELECT 1 FROM astro_habitat.event v WHERE v.import_batch_id = b.id)""")
    return cur.rowcount


def num(s):
    if s is None:
        return None
    s = str(s).strip()
    if s in ("", "NA", "N/A", "np.nan", "nan"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


# ---------------------------------------------------------------- 1. słowniki
AGE_BANDS = [("18-29", 18, 29), ("30-39", 30, 39), ("40-49", 40, 49),
             ("50-59", 50, 59), ("60-69", 60, 69), ("70+", 70, 120)]

BODY_SYSTEMS = [  # code, label, body_region
    ("cardiovascular", "Cardiovascular system", "heart"),
    ("respiratory", "Respiratory system", "lungs"),
    ("hematologic", "Blood", "blood"),
    ("immune", "Immune system & thermoregulation", "immune"),
    ("metabolic", "Metabolism", "abdomen"),
    ("renal", "Kidneys & electrolytes", "kidneys"),
    ("hepatic", "Liver", "liver"),
    ("musculoskeletal", "Bones & muscles", "bones"),
    ("behavioral", "Behavioral health", "head"),
    ("sleep", "Sleep & circadian rhythm", "head"),
    ("nutrition", "Nutrition", "stomach"),
]

EXTRA_ENVIRONMENTS = [
    dict(code="leo_free_flyer", label="Free-flying LEO capsule (Inspiration4, ~585 km)", gravity_g=0.0,
         dose_msv_per_day=None, dose_msv_per_day_min=None, dose_msv_per_day_max=None,
         comm_delay_s_min=0, comm_delay_s_max=1, magnetosphere_protected=True, is_analog=False),
    dict(code="analog_hdt", label="Ground analog: head-down tilt bed rest", gravity_g=1.0,
         dose_msv_per_day=0.001, dose_msv_per_day_min=None, dose_msv_per_day_max=None,
         comm_delay_s_min=0, comm_delay_s_max=0, magnetosphere_protected=True, is_analog=True),
]


def load_dictionaries(cur, thresholds):
    for code, lo, hi in AGE_BANDS:
        upsert(cur, "age_band", dict(code=code, age_min=lo, age_max=hi))
    for i, (code, label, region) in enumerate(BODY_SYSTEMS, 1):
        upsert(cur, "body_system", dict(code=code, label=label, body_region=region, sort_order=i))
    for e in thresholds["environments"]:
        rng = e.get("dose_range_mSv_per_day") or [None, None]
        cd = e.get("comm_delay_one_way_s") or [None, None]
        upsert(cur, "environment", dict(
            code=e["id"], label=e["label"], gravity_g=e.get("gravity_g"),
            dose_msv_per_day=e.get("dose_equivalent_mSv_per_day"),
            dose_msv_per_day_min=rng[0], dose_msv_per_day_max=rng[1],
            comm_delay_s_min=cd[0], comm_delay_s_max=cd[1],
            magnetosphere_protected=e.get("magnetosphere_protected"), is_analog=False))
    for e in EXTRA_ENVIRONMENTS:
        upsert(cur, "environment", e)


# ---------------------------------------------------------------- 2. źródła
DATASETS = {
    "osdr_osd569": dict(title="Inspiration4 whole blood: complete blood count (CBC)", publisher="NASA OSDR",
                        url="https://osdr.nasa.gov/bio/repo/data/studies/OSD-569", data_kind="real_spaceflight",
                        access_status="files_public"),
    "osdr_osd575": dict(title="Inspiration4 serum: CMP, cardiovascular panel, cytokines", publisher="NASA OSDR",
                        url="https://osdr.nasa.gov/bio/repo/data/studies/OSD-575", data_kind="real_spaceflight",
                        access_status="files_public"),
    "mendeley_bp": dict(title="Blood pressure in spaceflight and analogs: 75 studies (mean ± SD)",
                        publisher="Mendeley Data", url="https://data.mendeley.com/datasets/pz6nt4cpxs",
                        doi="10.17632/pz6nt4cpxs.1", data_kind="literature_aggregate", access_status="files_public",
                        notes="Licencja niesprawdzona."),
}


def load_sources(cur, sources):
    for sid, s in sources["sources"].items():
        row = dict(id=sid, title=s["title"][:300], publisher=s.get("publisher"), url=s.get("url"), doi=None,
                   license=None, data_kind="reference_literature",
                   access_status="files_public" if s.get("url") else "unknown",
                   retrieved_at=s.get("checked"), notes=f"type={s.get('type')}")
        row.update(DATASETS.get(sid, {}))
        upsert(cur, "data_source", row)
    for sid, d in DATASETS.items():
        if sid not in sources["sources"]:
            upsert(cur, "data_source", dict(id=sid, retrieved_at="2026-11-14", **d))


# ---------------------------------------------------------------- 3. wskaźniki
# kategoria z thresholds.json -> (indicator.category, body_system, scope)
THRESH_CAT = {
    "cardiovascular": ("vitals", "cardiovascular", "subject"),
    "metabolic": ("vitals", "metabolic", "subject"),
    "immune": ("vitals", "immune", "subject"),
    "respiratory": ("vitals", "respiratory", "subject"),
    "sleep": ("sleep", "sleep", "subject"),
    "behavioral": ("mood", "behavioral", "subject"),
    "environment": ("environment", None, "environment"),
    "radiation": ("radiation", None, "environment"),
    "nutrition": ("nutrition", "nutrition", "subject"),
    "musculoskeletal": ("fitness", "musculoskeletal", "subject"),
}

# analityty CBC/CMP: surowa nazwa -> (code, label, body_system)
LAB_LONG = {
    # CBC
    "WHITE BLOOD CELL COUNT": ("wbc", "White blood cell count", "immune"),
    "RED BLOOD CELL COUNT": ("rbc", "Red blood cell count", "hematologic"),
    "RED BLOOD CELL COUNT (FEMALE)": ("rbc", None, None),
    "HEMOGLOBIN": ("hemoglobin", "Hemoglobin", "hematologic"),
    "HEMOGLOBIN (FEMALE)": ("hemoglobin", None, None),
    "HEMATOCRIT": ("hematocrit", "Hematocrit", "hematologic"),
    "HEMATOCRIT (FEMALE)": ("hematocrit", None, None),
    "MCV": ("mcv", "Mean corpuscular volume", "hematologic"),
    "MCH": ("mch", "Mean corpuscular hemoglobin", "hematologic"),
    "MCHC": ("mchc", "Mean corpuscular hemoglobin concentration", "hematologic"),
    "RDW": ("rdw", "Red cell distribution width", "hematologic"),
    "PLATELET COUNT": ("platelets", "Platelet count", "hematologic"),
    "MPV": ("mpv", "Mean platelet volume", "hematologic"),
    "NEUTROPHILS": ("neutrophils_pct", "Neutrophils (%)", "immune"),
    "LYMPHOCYTES": ("lymphocytes_pct", "Lymphocytes (%)", "immune"),
    "MONOCYTES": ("monocytes_pct", "Monocytes (%)", "immune"),
    "EOSINOPHILS": ("eosinophils_pct", "Eosinophils (%)", "immune"),
    "BASOPHILS": ("basophils_pct", "Basophils (%)", "immune"),
    "ABSOLUTE NEUTROPHILS": ("neutrophils_abs", "Neutrophils (absolute)", "immune"),
    "ABSOLUTE LYMPHOCYTES": ("lymphocytes_abs", "Lymphocytes (absolute)", "immune"),
    "ABSOLUTE MONOCYTES": ("monocytes_abs", "Monocytes (absolute)", "immune"),
    "ABSOLUTE EOSINOPHILS": ("eosinophils_abs", "Eosinophils (absolute)", "immune"),
    "ABSOLUTE BASOPHILS": ("basophils_abs", "Basophils (absolute)", "immune"),
    # CMP
    "GLUCOSE": ("glucose", "Glucose (serum; fasting status unconfirmed)", "metabolic"),
    "SODIUM": ("sodium", "Sodium", "renal"),
    "POTASSIUM": ("potassium", "Potassium", "renal"),
    "CHLORIDE": ("chloride", "Chloride", "renal"),
    "CARBON DIOXIDE": ("bicarbonate", "Carbon dioxide (bicarbonate)", "renal"),
    "CALCIUM": ("calcium", "Calcium", "musculoskeletal"),
    "UREA NITROGEN (BUN)": ("bun", "Blood urea nitrogen", "renal"),
    "CREATININE": ("creatinine", "Creatinine", "renal"),
    "BUN/CREATININE RATIO": ("bun_creatinine_ratio", "BUN/creatinine ratio", "renal"),
    "eGFR NON-AFR. AMERICAN": ("egfr", "eGFR", "renal"),
    "ALBUMIN": ("albumin", "Albumin", "hepatic"),
    "GLOBULIN": ("globulin", "Globulin", "hepatic"),
    "PROTEIN; TOTAL": ("total_protein", "Total protein", "hepatic"),
    "ALBUMIN/GLOBULIN RATIO": ("albumin_globulin_ratio", "Albumin/globulin ratio", "hepatic"),
    "BILIRUBIN; TOTAL": ("bilirubin_total", "Total bilirubin", "hepatic"),
    "ALT": ("alt", "Alanine aminotransferase (ALT)", "hepatic"),
    "AST": ("ast", "Aspartate aminotransferase (AST)", "hepatic"),
    "ALKALINE PHOSPHATASE": ("alp", "Alkaline phosphatase", "hepatic"),
}
UNIT_FIX = {"(calc)": "ratio"}
# Pomijane analityty: eGFR z korektą rasową - od 2021 niezalecany (NKF-ASN), zostaje samo eGFR.
LAB_SKIP = {"eGFR AFRICAN AMERICAN"}

CARDIO = {  # prefiks kolumny -> (code, label, canonical unit, factor)
    "a2_macroglobulin": ("a2_macroglobulin", "Alpha-2-macroglobulin", "ng/mL", 1),
    "agp": ("agp", "Alpha-1-acid glycoprotein", "ng/mL", 1),
    "crp": ("crp", "C-reactive protein", "mg/L", 1e-6),          # pg/mL -> mg/L
    "fetuin_a36": ("fetuin_a", "Fetuin A", "ng/mL", 1),
    "fibrinogen": ("fibrinogen", "Fibrinogen", "ng/mL", 1),
    "haptoglobin": ("haptoglobin", "Haptoglobin", "ng/mL", 1),
    "l_selectin": ("l_selectin", "L-selectin", "pg/mL", 1),
    "pf4": ("pf4", "Platelet factor 4", "ng/mL", 1),
    "sap": ("sap", "Serum amyloid P", "pg/mL", 1),
}
WIDE_UNIT = {"picogram_per_milliliter": "pg/mL", "nanogram_per_milliliter": "ng/mL"}
GREEK = {"α": "alpha", "β": "beta", "γ": "gamma", "δ": "delta"}


def cytokine_code(prefix: str) -> tuple[str, str]:
    code = prefix
    for g, n in GREEK.items():
        code = code.replace(g, "_" + n)
    code = re.sub(r"_+", "_", code).strip("_")
    label = prefix.replace("_per_", "/").replace("_plus_", "+").replace("_", "-").upper()
    for g in GREEK:
        label = label.replace(g.upper(), g)
    return "cyt_" + code, label


DERIVED = {"body_mass_change_pct", "vo2max_pct_baseline", "strength_pct_baseline", "bmd_hip_spine_pct_baseline",
           "bmd_femoral_neck_pct_baseline"}   # id progów liczonych z innych pomiarów (bez własnych pomiarów)


def clinical_use_for(code: str, category: str, scope: str) -> str:
    """Do czego służy wskaźnik (indicator.clinical_use); GUI diagnostyczne pokazuje tylko 'diagnostic'."""
    if category == "lab_cytokine" or (category == "lab_cardio" and code != "crp"):
        return "research"                      # badania naukowe, niewykonalne w locie (CRP zostaje: point-of-care)
    if category == "bone_dxa":
        return "reference"                     # DXA tylko na Ziemi, przed/po misji
    if scope == "environment" or category == "environment":
        return "environment_context"
    return "diagnostic"


class Indicators:
    def __init__(self, cur):
        self.cur = cur
        self.ids: dict[str, int] = {}
        self.units: dict[str, str] = {}

    def add(self, code, label, category, body, unit, scope="subject", threshold_id=None,
            baseline_threshold_id=None, description=None):
        upsert(self.cur, "indicator", dict(
            code=code, label=label, category=category, body_system_code=body, canonical_unit=unit,
            value_type="numeric", scope=scope, threshold_id=threshold_id,
            baseline_threshold_id=baseline_threshold_id, description=description,
            clinical_use=clinical_use_for(code, category, scope), is_derived=code in DERIVED), ("code",))
        self.cur.execute("SELECT id FROM indicator WHERE code=%s", (code,))
        self.ids[code] = self.cur.fetchone()[0]
        self.units[code] = unit
        return self.ids[code]

    def alias(self, source_id, raw_name, raw_unit, code, factor=1.0, inferred=False):
        upsert(self.cur, "indicator_alias", dict(
            source_id=source_id, raw_name=raw_name, raw_unit=raw_unit or "", indicator_id=self.ids[code],
            factor=factor, offset_value=0, unit_is_inferred=inferred))


def load_indicators_and_thresholds(cur, thresholds, ind: Indicators):
    version = thresholds["version"]
    cur.execute("DELETE FROM threshold_band")
    for t in thresholds["indicators"]:
        cat, body, scope = THRESH_CAT[t["category"]]
        tid = t["id"]
        if tid.startswith("bmd_"):
            cat = "bone_dxa"
        if tid == "radiation_career_mSv":
            scope = "subject"
        is_baseline = t["evaluation"] in ("baseline_percent", "baseline_percent_change")
        ind.add(tid, t["label"], cat, body, t["unit"], scope,
                threshold_id=None if is_baseline else tid,
                baseline_threshold_id=tid if is_baseline else None,
                description=t.get("spaceflight_context"))
        for b in t.get("bands", []):
            cur.execute(
                "INSERT INTO threshold_band (threshold_id, config_version, evaluation, min_value, max_value, status,"
                " basis, message, action, escalate) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (tid, version, t["evaluation"], b.get("min"), b.get("max"), b["status"], b["basis"],
                 b.get("message"), b.get("action"), bool(b.get("escalate", False))))
    ind.add("bp_mean_arterial", "Mean arterial pressure", "vitals", "cardiovascular", "mmHg")


# ---------------------------------------------------------------- 4/5. Inspiration4
I4_TIMEPOINTS = re.compile(r"^([LR])([+-]\d+)$")


def parse_tp(label: str):
    m = I4_TIMEPOINTS.match(label.strip())
    if not m:
        raise ValueError(f"nieznany punkt czasowy: {label!r}")
    return ("launch" if m.group(1) == "L" else "landing"), int(m.group(2))


class Batch:
    def __init__(self, cur, source_id, adapter, path: Path):
        self.cur = cur
        cur.execute("INSERT INTO import_batch (source_id, adapter, file_name, file_sha256) VALUES (%s,%s,%s,%s)",
                    (source_id, adapter, str(path.relative_to(ROOT)), sha256(path)))
        self.id = cur.lastrowid
        self.read = self.upserted = self.rejected = 0
        self.notes: list[str] = []

    def finish(self):
        self.cur.execute(
            "UPDATE import_batch SET finished_at=UTC_TIMESTAMP(), status='ok', rows_read=%s, rows_upserted=%s,"
            " rows_rejected=%s, notes=%s WHERE id=%s",
            (self.read, self.upserted, self.rejected, "\n".join(self.notes)[:60000] or None, self.id))


def load_i4_people(cur, sexes: dict[str, str]) -> tuple[int, dict[str, int]]:
    upsert(cur, "mission", dict(
        code="I4", name="Inspiration4", environment_code="leo_free_flyer", source_id="osdr_osd575",
        start_date="2021-09-16", end_date="2021-09-18", duration_days=3, is_synthetic=False,
        description="Komercyjny lot orbitalny SpaceX, 4 osoby, ~3 dni."), ("code",))
    cur.execute("SELECT id FROM mission WHERE code='I4'")
    mission_id = cur.fetchone()[0]
    subj = {}
    for code, sex in sorted(sexes.items()):
        upsert(cur, "subject", dict(code=f"I4-{code}", source_subject_code=code, source_id="osdr_osd575",
                                    sex=sex, age_band_code=None, is_synthetic=False), ("code",))
        cur.execute("SELECT id FROM subject WHERE code=%s", (f"I4-{code}",))
        subj[code] = cur.fetchone()[0]
        upsert(cur, "participation", dict(subject_id=subj[code], mission_id=mission_id, role="crew",
                                          group_label=None), ("subject_id", "mission_id"))
    return mission_id, subj


def obs(cur, b: Batch, **row):
    upsert(cur, "observation", dict(import_batch_id=b.id, time_is_approx=False, measured_at=None, replicate=1,
                                    value_text=None, is_synthetic=False, **row),
           ("subject_id", "mission_id", "indicator_id", "source_id", "anchor", "day_offset", "measured_at",
            "sample_type", "replicate"))
    b.upserted += 1


def lab_ranges(rows, tcol):
    """Normy z plików: per (code, sex) jednoznaczna norma, albo None gdy zależna od osoby (wiek)."""
    rows = [r for r in rows if r["ANALYTE"] not in LAB_SKIP]
    per_subject = collections.defaultdict(collections.Counter)  # (code, subj) -> Counter(range)
    sex_of = {}
    for r in rows:
        code = LAB_LONG[r["ANALYTE"]][0]
        rng = (num(r["RANGE_MIN"]), num(r["RANGE_MAX"]))
        per_subject[(code, r["SUBJECT_ID"])][rng] += 1
        sex_of[r["SUBJECT_ID"]] = r["SEX"]
    modal = {k: c.most_common(1)[0][0] for k, c in per_subject.items()}
    by_sex = collections.defaultdict(set)
    for (code, s), rng in modal.items():
        by_sex[(code, sex_of[s])].add(rng)
    consensus = {k: next(iter(v)) for k, v in by_sex.items() if len(v) == 1}
    return modal, consensus


def load_i4_long(cur, ind: Indicators, mission_id, subj, path: Path, source_id, tcol, sample_type, rr_sink):
    rows = list(csv.DictReader(path.open(newline="", encoding="utf-8-sig")))
    modal, consensus = lab_ranges(rows, tcol)
    b = Batch(cur, source_id, "osdr_long", path)
    for raw, (code, label, body) in LAB_LONG.items():
        if label and any(r["ANALYTE"] == raw for r in rows):
            unit = next(r["UNITS"] for r in rows if r["ANALYTE"] == raw)
            cat = "lab_cbc" if "cbc" in path.name else "lab_cmp"
            ind.add(code, label, cat, body, UNIT_FIX.get(unit, unit))
    skipped = sum(r["ANALYTE"] in LAB_SKIP for r in rows)
    rows = [r for r in rows if r["ANALYTE"] not in LAB_SKIP]
    for raw in {r["ANALYTE"] for r in rows}:
        unit = next(r["UNITS"] for r in rows if r["ANALYTE"] == raw)
        ind.alias(source_id, raw, unit, LAB_LONG[raw][0])
    fixed = 0
    for r in rows:
        b.read += 1
        code = LAB_LONG[r["ANALYTE"]][0]
        s, sex = r["SUBJECT_ID"], r["SEX"]
        value = num(r["VALUE"])
        if value is None:
            b.rejected += 1
            b.notes.append(f"brak wartości: {s} {r['ANALYTE']} {r[tcol].strip()} = {r['VALUE']!r}")
            continue
        anchor, off = parse_tp(r[tcol])
        rmin, rmax = num(r["RANGE_MIN"]), num(r["RANGE_MAX"])
        other = consensus.get((code, "M" if sex == "F" else "F"))
        own = modal[(code, s)]
        if other and (rmin, rmax) == other and (rmin, rmax) != own:   # §5.4: norma przeciwnej płci
            b.notes.append(f"norma przeciwnej płci zastąpiona: {s} {code} {r[tcol].strip()} {other} -> {own}")
            rmin, rmax = own
            fixed += 1
        obs(cur, b, subject_id=subj[s], mission_id=mission_id, indicator_id=ind.ids[code], source_id=source_id,
            anchor=anchor, day_offset=off, timepoint_label=r[tcol].strip(), value_num=value, ref_min=rmin,
            ref_max=rmax, sample_type=sample_type, raw_name=r["ANALYTE"], raw_value=r["VALUE"],
            raw_unit=r["UNITS"])
    b.notes.insert(0, f"zastąpione normy przeciwnej płci: {fixed}")
    if skipped:
        b.read += skipped
        b.rejected += skipped
        b.notes.insert(1, f"pominięte (LAB_SKIP, eGFR z korektą rasową): {skipped}")
    b.finish()
    rr_sink.append((source_id, consensus))
    return b


def load_reference_ranges(cur, ind: Indicators, sinks):
    for source_id, consensus in sinks:
        codes = {c for c, _ in consensus}
        for code in codes:
            m, f = consensus.get((code, "M")), consensus.get((code, "F"))
            if m is not None and m == f:
                targets = [("any", m)]
            else:
                targets = [(sx, rng) for sx, rng in (("M", m), ("F", f)) if rng is not None]
            for sx, (lo, hi) in targets:
                if lo is None and hi is None:
                    continue
                upsert(cur, "reference_range", dict(
                    indicator_id=ind.ids[code], range_kind="reference_interval", class_label="", sex=sx,
                    age_min=18, age_max=120, population="general_adult", environment_code=None,
                    low_value=lo, high_value=hi, low_inclusive=True, high_inclusive=True,
                    critical_low=None, critical_high=None, unit=ind.units[code], condition_note=None,
                    source_id=source_id, basis="source", priority=0,
                    notes="Norma laboratorium z pliku źródłowego (spójna dla wszystkich osób tej płci)."))


def load_i4_wide(cur, ind: Indicators, mission_id, subj, path: Path, kind: str):
    rows = list(csv.DictReader(path.open(newline="", encoding="utf-8-sig")))
    b = Batch(cur, "osdr_osd575", "osdr_wide", path)
    cols = [c for c in rows[0] if c != "Sample Name" and "_concentration_" in c]
    meta = {}
    for c in cols:
        prefix, unit_raw = c.split("_concentration_")
        unit = WIDE_UNIT[unit_raw]
        if kind == "cardio":
            code, label, canon, factor = CARDIO[prefix]
            ind.add(code, label, "lab_cardio", "cardiovascular", canon)
        else:
            code, label = cytokine_code(prefix)
            canon, factor = unit, 1
            ind.add(code, label, "lab_cytokine", "immune", canon)
        ind.alias("osdr_osd575", c, unit, code, factor)
        meta[c] = (code, factor)
    b.notes.append("kolumny *_percent pominięte (znaczenie niezweryfikowane, plan §9.5)")
    for r in rows:
        s, _, tp = r["Sample Name"].split("_", 2)
        anchor, off = parse_tp(tp)
        for c in cols:
            b.read += 1
            v = num(r[c])
            if v is None:
                b.rejected += 1
                continue
            code, factor = meta[c]
            obs(cur, b, subject_id=subj[s], mission_id=mission_id, indicator_id=ind.ids[code],
                source_id="osdr_osd575", anchor=anchor, day_offset=off, timepoint_label=tp, value_num=v * factor,
                ref_min=None, ref_max=None, sample_type="lab_serum", raw_name=c, raw_value=r[c],
                raw_unit=WIDE_UNIT[c.split("_concentration_")[1]])
    b.finish()
    return b


# ---------------------------------------------------------------- 7. Mendeley BP
MENDELEY_ENV = {"ISS": "iss", "HDT": "analog_hdt"}
MENDELEY_STATS = [  # (phase, indicator, mean col, sd col)
    ("pre", "bp_systolic", "pre_sbp", "pre_sbp_sd"), ("pre", "bp_diastolic", "pre_dbp", "pre_dbp_sd"),
    ("pre", "bp_mean_arterial", "pre_map", "premapsd"),
    ("in", "bp_systolic", "in_sbp", "in_sbp_sd"), ("in", "bp_diastolic", "in_dbp", "in_dbp_sd"),
    ("in", "bp_mean_arterial", "in_map", "in_map_sd"),
    ("post", "bp_systolic", "post_sbp", "post_sbp_sd"), ("post", "bp_diastolic", "post_dbp", "post_dbp_sd"),
    ("post", "bp_mean_arterial", "postmap", "postmap_sd"),
]


def clean_text(s):
    s = (s or "").replace("_x0001_", " ").strip()
    return None if s in ("", "np.nan", "nan") else s


def load_mendeley(cur, ind: Indicators):
    path = DATA / "mendeley_bp_in_spaceflight.csv"
    rows = list(csv.DictReader(path.open(newline="", encoding="utf-8-sig")))
    b = Batch(cur, "mendeley_bp", "mendeley_bp", path)
    for i, r in enumerate(rows, start=2):  # numer linii w pliku (nagłówek = 1)
        b.read += 1
        title = clean_text(r["source"])
        if not title:
            b.rejected += 1
            b.notes.append(f"linia {i}: brak tytułu badania")
            continue
        mt = clean_text(r["mission_type"])

        def i_or_none(x):
            v = num(x)
            return int(v) if v is not None else None

        upsert(cur, "cohort", dict(
            source_id="mendeley_bp", source_row=i, study_title=title[:400], mission_type=mt,
            environment_code=MENDELEY_ENV.get(mt or ""), n=i_or_none(r["n"]), n_male=i_or_none(r["sex_male"]),
            n_female=i_or_none(r["sex_female"]), age_mean=num(r["age"]), age_sd=num(r["age_sd"]),
            bmi_mean=num(r["bmi"]), bmi_sd=num(r["bmi_sd"]),
            countermeasure=(clean_text(r["countermeasure"]) or "")[:100] or None, import_batch_id=b.id),
            ("source_id", "source_row"))
        cur.execute("SELECT id FROM cohort WHERE source_id='mendeley_bp' AND source_row=%s", (i,))
        cid = cur.fetchone()[0]
        n_stats = 0
        for phase, code, mcol, sdcol in MENDELEY_STATS:
            m = num(r.get(mcol))
            if m is None:
                continue
            upsert(cur, "cohort_stat", dict(cohort_id=cid, indicator_id=ind.ids[code], phase=phase, mean_value=m,
                                            sd_value=num(r.get(sdcol))), ("cohort_id", "indicator_id", "phase"))
            n_stats += 1
        b.upserted += 1
        if n_stats == 0:
            b.notes.append(f"linia {i}: brak statystyk BP")
    b.finish()
    return b


# ---------------------------------------------------------------- main
def main():
    thresholds = json.loads((CONFIG / "thresholds.json").read_text())
    sources = json.loads((CONFIG / "sources.json").read_text())
    con = connect()
    try:
        with con.cursor() as cur:
            load_dictionaries(cur, thresholds)
            load_sources(cur, sources)
            ind = Indicators(cur)
            load_indicators_and_thresholds(cur, thresholds, ind)
            con.commit()

            cbc = DATA / "osd569_inspiration4_cbc_long.csv"
            cmp_ = DATA / "osd575_inspiration4_cmp_long.csv"
            sexes = {}
            for p in (cbc, cmp_):
                for r in csv.DictReader(p.open(newline="", encoding="utf-8-sig")):
                    sexes[r["SUBJECT_ID"]] = r["SEX"]
            mission_id, subj = load_i4_people(cur, sexes)
            con.commit()

            rr = []
            for path, sid, tcol, st in ((cbc, "osdr_osd569", "TEST_DATE", "lab_whole_blood"),
                                        (cmp_, "osdr_osd575", "timepoint", "lab_serum")):
                b = load_i4_long(cur, ind, mission_id, subj, path, sid, tcol, st, rr)
                con.commit()
                print(f"{path.name}: read={b.read} upserted={b.upserted} rejected={b.rejected}")
            load_reference_ranges(cur, ind, rr)
            con.commit()
            for name, kind in (("osd575_inspiration4_cardio_panel_wide.csv", "cardio"),
                               ("osd575_inspiration4_immune_cytokines_wide.csv", "cytokine")):
                b = load_i4_wide(cur, ind, mission_id, subj, DATA / name, kind)
                con.commit()
                print(f"{name}: read={b.read} upserted={b.upserted} rejected={b.rejected}")
            b = load_mendeley(cur, ind)
            con.commit()
            print(f"mendeley_bp_in_spaceflight.csv: read={b.read} cohorts={b.upserted} rejected={b.rejected}")
            print(f"dziennik importów: usunięto {prune_batches(cur)} starych wpisów")
            con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


if __name__ == "__main__":
    sys.exit(main())
