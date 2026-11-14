#!/usr/bin/env python3
"""load_extra.py | import danych pobranych przez scripts/fetch_data.py (data/env, data/lsda) do astro_core.

Wymaga wcześniejszego uruchomienia load.py (słowniki, źródła, wskaźniki z thresholds.json).
Każde źródło jest opcjonalne: brakujący katalog = pominięcie z komunikatem. Import idempotentny.

  noaa     data/env/noaa_swpc/goes_integral_protons.csv     -> env_observation (earth, GOES), raw 5 min
  eda      data/env/osdr_eda/eda_telemetry_daily.csv         -> env_observation (iss, misje RR = kabina ISS), daily_mean
           data/env/osdr_eda/eda_radiation_daily.csv         -> env_observation (iss), daily_sum
  radlab   data/env/osdr_radlab/monthly_daily/*.csv          -> env_observation (iss, moduł), daily_sum
  cdaweb   data/env/cdaweb_msl_rad/*daily*.csv               -> env_observation (mars_surface, Gale crater), daily_sum
  lsda     data/lsda/mr035g/files/**                         -> mission/subject/participation/observation (DXA)

Uruchomienie (z katalogu głównego repo):
  uv run --no-project --with pymysql==1.1.1 python DATABASE/etl/load_extra.py [noaa eda radlab cdaweb lsda]
"""
from __future__ import annotations

import collections
import csv
import datetime as dt
import glob
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from load import DERIVED, ROOT, clinical_use_for, connect, num, prune_batches, upsert  # noqa: E402

ENV = ROOT / "data" / "env"
LSDA = ROOT / "data" / "lsda" / "mr035g" / "files"

NEW_SOURCES = {
    "noaa_swpc": dict(title="NOAA SWPC: GOES integral proton flux, space weather scales", publisher="NOAA SWPC",
                      url="https://services.swpc.noaa.gov/json/goes/primary/", data_kind="real_environment",
                      access_status="files_public", license="US Government work (public domain)"),
    "osdr_eda": dict(title="OSDR Environmental Data App: ISS habitat telemetry (T, RH, CO2) and SRAG dose",
                     publisher="NASA OSDR", url="https://visualization.osdr.nasa.gov/eda/",
                     data_kind="real_environment", access_status="files_public", license="NASA OSDR open data"),
    "osdr_radlab": dict(title="OSDR RadLab: ISS DOSTEL absorbed dose rate (Columbus)", publisher="NASA OSDR / DLR",
                        url="https://visualization.osdr.nasa.gov/radlab/gui/data-api", data_kind="real_environment",
                        access_status="files_public", license="NASA OSDR open data"),
    "cdaweb_msl_rad": dict(title="Curiosity RAD dosimetry (MSL_RAD_OBS-L2), Gale crater, Mars",
                           publisher="NASA CDAWeb / PDS PPI",
                           url="https://cdaweb.gsfc.nasa.gov/misc/NotesM.html#MSL_RAD_OBS-L2",
                           data_kind="real_environment", access_status="files_public"),
    "lsda_mr035g": dict(title="NASA LSDA MR035G: bone densitometry (DXA) in head-down bed rest",
                        publisher="NASA LSDA", url="https://nlsp.nasa.gov/explore/lsdahome", doi="10.83263/7myc-5j86",
                        data_kind="real_analog", access_status="files_public", license="CC0 1.0"),
    "who_1994_osteoporosis": dict(title="WHO 1994: Assessment of fracture risk and its application to screening "
                                        "for postmenopausal osteoporosis (TRS 843)", publisher="WHO",
                                  url="https://iris.who.int/handle/10665/39142",
                                  data_kind="reference_literature", access_status="files_public"),
    "iscd_official_positions": dict(title="ISCD Official Positions: Adult (Z-score interpretation)",
                                    publisher="International Society for Clinical Densitometry",
                                    url="https://iscd.org/official-positions-2023/",
                                    data_kind="reference_literature", access_status="files_public"),
}


# ---------------------------------------------------------------- wspólne
class Batch:
    def __init__(self, cur, source_id, adapter, files: list[Path]):
        self.cur = cur
        h = hashlib.sha256()
        for f in sorted(files):
            h.update(f.read_bytes())
        name = str(files[0].relative_to(ROOT)) if len(files) == 1 else \
            f"{files[0].parent.relative_to(ROOT)}/ ({len(files)} plików)"
        cur.execute("INSERT INTO import_batch (source_id, adapter, file_name, file_sha256) VALUES (%s,%s,%s,%s)",
                    (source_id, adapter, name[:300], h.hexdigest()))
        self.id = cur.lastrowid
        self.read = self.upserted = self.rejected = 0
        self.notes: list[str] = []

    def finish(self, label):
        self.cur.execute(
            "UPDATE import_batch SET finished_at=UTC_TIMESTAMP(), status='ok', rows_read=%s, rows_upserted=%s,"
            " rows_rejected=%s, notes=%s WHERE id=%s",
            (self.read, self.upserted, self.rejected, "\n".join(self.notes)[:60000] or None, self.id))
        print(f"{label}: read={self.read} upserted={self.upserted} rejected={self.rejected}")


class Ind:
    def __init__(self, cur):
        self.cur = cur
        cur.execute("SELECT code, id FROM indicator")
        self.ids = dict(cur.fetchall())

    def ensure(self, code, label, category, unit, scope, body=None, baseline_threshold_id=None, description=None):
        upsert(self.cur, "indicator", dict(
            code=code, label=label, category=category, body_system_code=body, canonical_unit=unit,
            value_type="numeric", scope=scope, threshold_id=None, baseline_threshold_id=baseline_threshold_id,
            description=description, clinical_use=clinical_use_for(code, category, scope),
            is_derived=code in DERIVED), ("code",))
        self.cur.execute("SELECT id FROM indicator WHERE code=%s", (code,))
        self.ids[code] = self.cur.fetchone()[0]
        return self.ids[code]

    def alias(self, source_id, raw_name, raw_unit, code, factor=1.0, inferred=False):
        upsert(self.cur, "indicator_alias", dict(
            source_id=source_id, raw_name=raw_name[:200], raw_unit=raw_unit or "", indicator_id=self.ids[code],
            factor=factor, offset_value=0, unit_is_inferred=inferred))


def env_obs(cur, b: Batch, env, location, ind_id, source_id, measured_at, aggregation, value):
    upsert(cur, "env_observation", dict(
        environment_code=env, location=location[:60], indicator_id=ind_id, source_id=source_id,
        import_batch_id=b.id, measured_at=measured_at, aggregation=aggregation, value_num=value,
        is_synthetic=False), ("environment_code", "location", "indicator_id", "source_id", "measured_at",
                              "aggregation"))
    b.upserted += 1


def iso(ts: str) -> str:
    return ts.replace("T", " ").replace("Z", "")[:23]


# ---------------------------------------------------------------- NOAA
def load_noaa(cur, ind: Ind):
    path = ENV / "noaa_swpc" / "goes_integral_protons.csv"
    if not path.exists():
        return print("noaa: brak pliku, pomijam")
    rows = list(csv.DictReader(path.open(newline="")))
    b = Batch(cur, "noaa_swpc", "env_noaa", [path])
    codes = {}
    for e in sorted({r["energy"] for r in rows}, key=lambda s: float(s.split()[0].lstrip(">="))):
        mev = e.split()[0].lstrip(">=")
        code = "solar_proton_flux_10MeV" if mev == "10" else f"proton_flux_ge{mev}MeV"
        if code not in ind.ids:
            ind.ensure(code, f"Integral proton flux {e}", "radiation", "pfu", "environment",
                       description="GOES primary, 5-min average. S-scale uses >=10 MeV.")
        ind.alias("noaa_swpc", f"integral-protons {e}", "pfu", code)
        codes[e] = ind.ids[code]
    for r in rows:
        b.read += 1
        v = num(r["flux_pfu"])
        if v is None:
            b.rejected += 1
            continue
        env_obs(cur, b, "earth", f"GOES-{r['satellite']} (GEO)", codes[r["energy"]], "noaa_swpc",
                iso(r["time_tag_utc"]), "raw", v)
    b.finish(path.name)


# ---------------------------------------------------------------- OSDR EDA
PPM_TO_MMHG = 760 / 1e6   # założenie: ciśnienie kabiny ISS ~760 mmHg (14.7 psia)


def load_eda(cur, ind: Ind):
    tel = ENV / "osdr_eda" / "eda_telemetry_daily.csv"
    rad = ENV / "osdr_eda" / "eda_radiation_daily.csv"
    if tel.exists():
        b = Batch(cur, "osdr_eda", "env_eda_telemetry", [tel])
        b.notes += ["Tylko misje RR (Rodent Research): czujniki w kabinie ISS. APEX/VEG (komory roślinne) pominięte.",
                    "Kolumny *_ground (habitat kontrolny na Ziemi) pominięte.",
                    f"CO2 ppm -> mmHg: x{PPM_TO_MMHG} (założenie zespołu: ciśnienie kabiny 760 mmHg)."]
        cols = {"temp_degC_iss_mean": ("cabin_temperature", 1.0, "degC"),
                "rh_percent_iss_mean": ("cabin_humidity", 1.0, "%RH"),
                "co2_ppm_iss_mean": ("cabin_co2", PPM_TO_MMHG, "ppm")}
        for c, (code, f, u) in cols.items():
            ind.alias("osdr_eda", c, u, code, f, inferred=(code == "cabin_co2"))
        for r in csv.DictReader(tel.open(newline="")):
            for c, (code, f, _) in cols.items():
                b.read += 1
                v = num(r.get(c))
                if v is None or not r["mission"].startswith("RR-"):
                    b.rejected += 1
                    continue
                env_obs(cur, b, "iss", f"ISS {r['mission']} habitat area", ind.ids[code], "osdr_eda",
                        r["date_utc"], "daily_mean", v * f)
        b.finish(tel.name)
    if rad.exists():
        b = Batch(cur, "osdr_eda", "env_eda_radiation", [rad])
        b.notes.append("Dawka pochłonięta w wodzie (przeliczona z Si), wstępna analiza SRAG NASA-JSC.")
        spec = {"gcr_mGy_per_day": ("iss_dose_gcr_daily", "ISS absorbed dose: galactic cosmic rays"),
                "saa_mGy_per_day": ("iss_dose_saa_daily", "ISS absorbed dose: South Atlantic Anomaly"),
                "total_mGy_per_day": ("absorbed_dose_daily", "Absorbed dose per day")}
        for c, (code, label) in spec.items():
            if code not in ind.ids:
                ind.ensure(code, label, "radiation", "mGy/day", "environment")
            ind.alias("osdr_eda", c, "mGy/day", code)
        for r in csv.DictReader(rad.open(newline="")):
            for c, (code, _) in spec.items():
                b.read += 1
                v = num(r.get(c))
                if v is None:
                    b.rejected += 1
                    continue
                env_obs(cur, b, "iss", f"ISS {r['mission']} (SRAG)", ind.ids[code], "osdr_eda", r["date"],
                        "daily_sum", v)
        b.finish(rad.name)


# ---------------------------------------------------------------- RadLab
def load_radlab(cur, ind: Ind):
    files = [Path(p) for p in sorted(glob.glob(str(ENV / "osdr_radlab" / "monthly_daily" / "*.csv")))]
    if not files:
        return print("radlab: brak plików, pomijam")
    if "absorbed_dose_daily" not in ind.ids:
        ind.ensure("absorbed_dose_daily", "Absorbed dose per day", "radiation", "mGy/day", "environment")
    ind.alias("osdr_radlab", "absorbed_dose_uGy_per_day_est", "uGy/day", "absorbed_dose_daily", 0.001)
    b = Batch(cur, "osdr_radlab", "env_radlab", files)
    b.notes.append("absorbed_dose_uGy_per_day_est (µGy/d) -> mGy/d; dni z coverage_hours < 20 pominięte.")
    for f in files:
        for r in csv.DictReader(f.open(newline="")):
            b.read += 1
            v, cov = num(r.get("absorbed_dose_uGy_per_day_est")), num(r.get("coverage_hours"))
            if v is None or cov is None or cov < 20:
                b.rejected += 1
                continue
            env_obs(cur, b, "iss", f"ISS {r['module']} ({r['instrument_id']})", ind.ids["absorbed_dose_daily"],
                    "osdr_radlab", r["date_utc"], "daily_sum", v / 1000)
    b.finish("radlab monthly_daily")


# ---------------------------------------------------------------- Curiosity RAD
def load_cdaweb(cur, ind: Ind):
    cands = sorted(glob.glob(str(ENV / "cdaweb_msl_rad" / "*daily*.csv")))
    if not cands:
        return print("cdaweb: brak pliku z dziennymi wartościami (pobieranie trwa?), pomijam")
    path = Path(cands[0])
    rows = list(csv.DictReader(path.open(newline="")))
    # TOTAL_DOSE_E = detektor z tworzywa równoważnego tkance (najbliżej dawki w ciele); B = krzem
    vcol = next((c for c in rows[0] if c.startswith("total_dose_e_") and c.endswith("_mean")), None)
    dcol = next((c for c in rows[0] if c.lower().startswith("date")), None)
    if not vcol or not dcol:
        return print(f"cdaweb: nieznane kolumny {list(rows[0])}, pomijam")
    if "absorbed_dose_daily" not in ind.ids:
        ind.ensure("absorbed_dose_daily", "Absorbed dose per day", "radiation", "mGy/day", "environment")
    ind.alias("cdaweb_msl_rad", vcol, "uGy/day", "absorbed_dose_daily", 0.001)
    b = Batch(cur, "cdaweb_msl_rad", "env_cdaweb", [path])
    for r in rows:
        b.read += 1
        v = num(r[vcol])
        if v is None or v <= 0:
            b.rejected += 1
            continue
        env_obs(cur, b, "mars_surface", "Gale crater (Curiosity RAD)", ind.ids["absorbed_dose_daily"],
                "cdaweb_msl_rad", r[dcol][:10], "daily_sum", v / 1000)
    b.finish(path.name)


# ---------------------------------------------------------------- LSDA MR035G (DXA)
DXA_IND = {  # code: (label, category, unit, baseline_threshold_id)
    "bmd_lumbar_spine": ("BMD lumbar spine (L1-L4)", "bone_dxa", "g/cm2", "bmd_hip_spine_pct_baseline"),
    "tscore_lumbar_spine": ("T-score lumbar spine", "bone_dxa", "SD", None),
    "zscore_lumbar_spine": ("Z-score lumbar spine", "bone_dxa", "SD", None),
    "bmd_total_hip_left": ("BMD total hip (left)", "bone_dxa", "g/cm2", "bmd_hip_spine_pct_baseline"),
    "bmd_total_hip_right": ("BMD total hip (right)", "bone_dxa", "g/cm2", "bmd_hip_spine_pct_baseline"),
    "tscore_total_hip_left": ("T-score total hip (left)", "bone_dxa", "SD", None),
    "zscore_total_hip_left": ("Z-score total hip (left)", "bone_dxa", "SD", None),
    "bmd_femoral_neck_left": ("BMD femoral neck (left)", "bone_dxa", "g/cm2", "bmd_femoral_neck_pct_baseline"),
    "bmd_femoral_neck_right": ("BMD femoral neck (right)", "bone_dxa", "g/cm2", "bmd_femoral_neck_pct_baseline"),
    "tscore_femoral_neck_left": ("T-score femoral neck (left)", "bone_dxa", "SD", None),
    "tscore_femoral_neck_right": ("T-score femoral neck (right)", "bone_dxa", "SD", None),
    "zscore_femoral_neck_left": ("Z-score femoral neck (left)", "bone_dxa", "SD", None),
    "zscore_femoral_neck_right": ("Z-score femoral neck (right)", "bone_dxa", "SD", None),
    "bmd_whole_body": ("BMD whole body", "bone_dxa", "g/cm2", None),
    "tscore_whole_body": ("T-score whole body", "bone_dxa", "SD", None),
    "zscore_whole_body": ("Z-score whole body", "bone_dxa", "SD", None),
    "fat_mass_whole_body": ("Whole-body fat mass", "body_composition", "g", None),
    "lean_mass_whole_body": ("Whole-body lean mass (excl. BMC)", "body_composition", "g", None),
}

C3 = "MR035G_Campaign_3_DXA_{grp}_All_{part}.csv"
# (plik względem LSDA, {kolumna: wskaźnik}); dla C3 {grp} = C3A / C3B
C3_FILES = [
    ("MR035G_Campaign_3_DXA_Spine/" + C3.replace("{part}", "Spine"),
     {"TOT_BMD": "bmd_lumbar_spine", "Spine T": "tscore_lumbar_spine", "Spine Z": "zscore_lumbar_spine"}),
    ("MR035G_Campaign_3_DXA_Hip/" + C3.replace("{part}", "L_Hip"),
     {"NECK_BMD": "bmd_femoral_neck_left", "Neck T": "tscore_femoral_neck_left", "Neck Z": "zscore_femoral_neck_left"}),
    ("MR035G_Campaign_3_DXA_Hip/" + C3.replace("{part}", "R_Hip"),
     {"NECK_BMD": "bmd_femoral_neck_right", "Neck T": "tscore_femoral_neck_right",
      "Neck Z": "zscore_femoral_neck_right"}),
    ("MR035G_Campaign_3_DXA_Hip/" + C3.replace("{part}", "LH_Bone"), {"HTOT_BMD": "bmd_total_hip_left"}),
    ("MR035G_Campaign_3_DXA_Hip/" + C3.replace("{part}", "RH_Bone"), {"HTOT_BMD": "bmd_total_hip_right"}),
    ("MR035G_Campaign_3_DXA_Whole_Body/" + C3.replace("{part}", "WB"),
     {"WBTOT_BMD": "bmd_whole_body", "WB T": "tscore_whole_body", "WB Z": "zscore_whole_body",
      "WBTOT_FAT": "fat_mass_whole_body", "Lean (excluding BMC)": "lean_mass_whole_body"}),
]
MEDES_FILES = [
    ("MR035G_MEDES_DXA/MR035G_MEDES_DXA_Spine_ALL.csv",
     {"Total BMD": "bmd_lumbar_spine", "Spine T-score": "tscore_lumbar_spine", "Spine Z-score": "zscore_lumbar_spine"}),
    ("MR035G_MEDES_DXA/MR035G_MEDES_DXA_Summary_ALL.csv",  # Scan Type = Left Hip (wszystkie wiersze)
     {"Femoral Neck BMD": "bmd_femoral_neck_left", "Femoral Neck T-score": "tscore_femoral_neck_left",
      "Femoral Neck Z-score": "zscore_femoral_neck_left", "Total Hip BMD": "bmd_total_hip_left",
      "Total Hip T-score": "tscore_total_hip_left", "Total Hip Z-score": "zscore_total_hip_left"}),
    ("MR035G_MEDES_DXA/MR035G_MEDES_DXA_WB_ALL.csv",
     {"Whole Body (WB) Total BMD": "bmd_whole_body", "WB T-Score": "tscore_whole_body",
      "WB Z-Score": "zscore_whole_body", "WB Fat Mass (g)": "fat_mass_whole_body",
      "WB Lean Mass (g)": "lean_mass_whole_body"}),
]
SCORE = ("tscore_", "zscore_")


def g(r, *names):
    for n in names:
        if n in r and r[n] is not None:
            return r[n].strip()
    return ""


def mdy(s):
    m, d, y = (int(x) for x in s.split("/"))
    return dt.date(y, m, d)


def age_band(age):
    if age is None:
        return None
    a = int(age)
    for code, lo, hi in (("18-29", 18, 29), ("30-39", 30, 39), ("40-49", 40, 49), ("50-59", 50, 59),
                         ("60-69", 60, 69)):
        if lo <= a <= hi:
            return code
    return "70+" if a >= 70 else None


def load_lsda(cur, ind: Ind):
    if not LSDA.exists():
        return print("lsda: brak katalogu, pomijam")
    for code, (label, cat, unit, bt) in DXA_IND.items():
        ind.ensure(code, label, cat, unit, "subject", body="musculoskeletal", baseline_threshold_id=bt)

    # --- osoby: płeć (C3: *_LH_Bone, MEDES: H_bone), wiek (MEDES Summary), kampania MEDES (IDENTIFIER1)
    people = {}  # subject_code -> dict(mission, src_code, sex, age_band, group)
    for grp in ("C3A", "C3B"):
        p = LSDA / ("MR035G_Campaign_3_DXA_Hip/" + C3.replace("{part}", "LH_Bone").format(grp=grp))
        for r in csv.DictReader(p.open(newline="", encoding="utf-8-sig")):
            people[f"MR035G-{grp}-{r['SUBJECT']}"] = dict(mission=f"MR035G-{grp}", src=f"{grp}-{r['SUBJECT']}",
                                                         sex=r["SEX"] or "U", age=None, group=grp)
    hb = LSDA / "MR035G_MEDES_DXA/MR035G_MEDES_DXA_H_bone_ALL.csv"
    for r in csv.DictReader(hb.open(newline="", encoding="utf-8-sig")):
        people[f"MR035G-MEDES-{r['Subject']}"] = dict(mission="MR035G-MEDES", src=f"MEDES-{r['Subject']}",
                                                      sex=r["SEX"] or "U", age=None, group=r["IDENTIFIER1"])
    summ = LSDA / "MR035G_MEDES_DXA/MR035G_MEDES_DXA_Summary_ALL.csv"
    for r in csv.DictReader(summ.open(newline="", encoding="utf-8-sig")):
        if r.get("Test_Phase") == "PRE_TEST":   # wiek na początku badania
            people[f"MR035G-MEDES-{r['Subject']}"]["age"] = age_band(num(r["Age"]))

    missions = {
        "MR035G-C3A": "MR035G Campaign 3, group A: head-down bed rest (UTMB)",
        "MR035G-C3B": "MR035G Campaign 3, group B: head-down bed rest (UTMB)",
        "MR035G-MEDES": "MR035G MEDES (Toulouse): head-down bed rest, 2 campaigns, women",
    }
    mid = {}
    for code, name in missions.items():
        upsert(cur, "mission", dict(code=code, name=name, environment_code="analog_hdt", source_id="lsda_mr035g",
                                    start_date=None, end_date=None, duration_days=None, is_synthetic=False,
                                    description="Bed rest -6° (analog mikrograwitacji). Dokładnych dat nie zapisujemy."),
               ("code",))
        cur.execute("SELECT id FROM mission WHERE code=%s", (code,))
        mid[code] = cur.fetchone()[0]
    sid = {}
    for code, p in people.items():
        upsert(cur, "subject", dict(code=code, source_subject_code=p["src"], source_id="lsda_mr035g",
                                    sex=p["sex"] if p["sex"] in ("F", "M") else "U", age_band_code=p["age"],
                                    is_synthetic=False), ("code",))
        cur.execute("SELECT id FROM subject WHERE code=%s", (code,))
        sid[code] = cur.fetchone()[0]
        upsert(cur, "participation", dict(subject_id=sid[code], mission_id=mid[p["mission"]],
                                          role="bed_rest_subject", group_label=p["group"]),
               ("subject_id", "mission_id"))

    # --- pomiary
    jobs = [(LSDA / f.format(grp=grp), cols, "c3") for grp in ("C3A", "C3B") for f, cols in C3_FILES] + \
           [(LSDA / f, cols, "medes") for f, cols in MEDES_FILES]
    files = [p for p, _, _ in jobs]
    b = Batch(cur, "lsda_mr035g", "lsda_dxa", files)
    b.notes += ["Jednostki przyjęte wg konwencji eksportu Hologic (BMD g/cm2, masy g, T/Z w SD) - unit_is_inferred.",
                "Wartość 0 dla BMD/mas = brak regionu -> pominięta. 'NA' -> pominięta.",
                "Triplikaty: replicate 1..n wg SCANID w ramach (osoba, wskaźnik, punkt czasowy).",
                "Faza NA (kontrola po bed rest): landing + dni od skanu POST (przybliżone, time_is_approx=1).",
                "Korekta kalibracji UTMB 2006-06-09..2006-08-10 (BMD x1.0120): nie wiadomo, czy już nałożona "
                "- wartości bez zmian.",
                "Campaign 1 pominięta: brak kolumny fazy (wymaga dat bed restu z dokumentacji)."]
    recs = []  # (subject_code, ind_code, anchor, off, approx, label, scanid, value, raw_name, raw_value)
    post_dates = {}
    parsed = []
    for path, cols, kind in jobs:
        for r in csv.DictReader(path.open(newline="", encoding="utf-8-sig")):
            subj = g(r, "SUBJECT", "Subject")
            code = f"MR035G-{g(r, 'CAMPAIGN')}-{subj}" if kind == "c3" else f"MR035G-MEDES-{subj}"
            phase, day, date = g(r, "TEST_PHASE", "Test_Phase"), g(r, "BR_DAY", "BR_Day"), g(r, "SCAN_DATE")
            if phase == "POST_TEST" and date:
                post_dates.setdefault(code, (mdy(date), int(day)))
            parsed.append((path, cols, code, phase, day, date, g(r, "SCANID", "Scan ID"), r))
    for path, cols, code, phase, day, date, scanid, r in parsed:
        for col, icode in cols.items():
            b.read += 1
            raw = (r.get(col) or "").strip()
            v = num(raw)
            if v is None or (v == 0 and not icode.startswith(SCORE)) or code not in sid:
                b.rejected += 1
                continue
            approx = False
            if phase == "PRE_TEST":
                anchor, off, label = "launch", -int(day), f"PRE BR-{int(day)}"
            elif phase == "IN_TEST":
                anchor, off, label = "launch", int(day), f"IN BR+{int(day)}"
            elif phase == "POST_TEST":
                anchor, off, label = "landing", int(day), f"POST R+{int(day)}"
            elif code in post_dates and date:
                pd, pday = post_dates[code]
                anchor, off, approx = "landing", pday + (mdy(date) - pd).days, True
                label = f"FOLLOW-UP ~R+{off}"
            else:
                b.rejected += 1
                b.notes.append(f"{path.name}: {code} bez fazy i bez skanu POST - pominięty")
                continue
            recs.append((code, icode, anchor, off, approx, label, scanid, v, col, raw))
    seen = set()
    for _, cols, kind in jobs:
        for col, icode in cols.items():
            key = (col, icode)
            if key in seen:
                continue
            seen.add(key)
            ind.alias("lsda_mr035g", col, "", icode, 1.0, inferred=True)
    groups = collections.defaultdict(list)
    for rec in recs:
        groups[(rec[0], rec[1], rec[2], rec[3])].append(rec)
    for key, items in groups.items():
        for rep, (code, icode, anchor, off, approx, label, scanid, v, col, raw) in \
                enumerate(sorted(items, key=lambda x: x[6]), 1):
            upsert(cur, "observation", dict(
                subject_id=sid[code], mission_id=mid[people[code]["mission"]], indicator_id=ind.ids[icode],
                source_id="lsda_mr035g", import_batch_id=b.id, anchor=anchor, day_offset=off,
                time_is_approx=approx, timepoint_label=label, measured_at=None, replicate=min(rep, 255),
                value_num=v, value_text=None, ref_min=None, ref_max=None, sample_type="dxa_scan",
                is_synthetic=False, raw_name=col, raw_value=raw[:100], raw_unit=None),
                ("subject_id", "mission_id", "indicator_id", "source_id", "anchor", "day_offset", "measured_at",
                 "sample_type", "replicate"))
            b.upserted += 1
    b.finish("lsda mr035g (C3A, C3B, MEDES)")

    # --- klasyfikacje WHO (T-score) i ISCD (Z-score), DATABASE_PLAN §5.5
    for icode in [c for c in DXA_IND if c.startswith("tscore_")]:
        for sex in ("F", "M"):
            for cls, lo, hi, li, hi_inc in (("normal", -1.0, None, True, True),
                                            ("osteopenia", -2.5, -1.0, False, False),
                                            ("osteoporosis", None, -2.5, True, True)):
                upsert(cur, "reference_range", dict(
                    indicator_id=ind.ids[icode], range_kind="classification", class_label=cls, sex=sex,
                    age_min=50, age_max=120, population="postmenopausal" if sex == "F" else "men_50plus",
                    environment_code=None, low_value=lo, high_value=hi, low_inclusive=li, high_inclusive=hi_inc,
                    critical_low=None, critical_high=None, unit="SD", condition_note=None,
                    source_id="who_1994_osteoporosis", basis="source", priority=0, notes=None))
    for icode in [c for c in DXA_IND if c.startswith("zscore_")]:
        for sex in ("F", "M"):
            for cls, lo, hi, li, hi_inc in (("below_expected_range_for_age", None, -2.0, True, True),
                                            ("within_expected_range_for_age", -2.0, None, False, True)):
                upsert(cur, "reference_range", dict(
                    indicator_id=ind.ids[icode], range_kind="classification", class_label=cls, sex=sex,
                    age_min=18, age_max=49, population="premenopausal" if sex == "F" else "general_adult",
                    environment_code=None, low_value=lo, high_value=hi, low_inclusive=li, high_inclusive=hi_inc,
                    critical_low=None, critical_high=None, unit="SD", condition_note=None,
                    source_id="iscd_official_positions", basis="source", priority=0, notes=None))


# ---------------------------------------------------------------- main
STEPS = {"noaa": load_noaa, "eda": load_eda, "radlab": load_radlab, "cdaweb": load_cdaweb, "lsda": load_lsda}


def main(argv):
    steps = argv or list(STEPS)
    con = connect()
    try:
        with con.cursor() as cur:
            for sid_, d in NEW_SOURCES.items():
                upsert(cur, "data_source", dict(id=sid_, retrieved_at="2026-11-14", **d))
            con.commit()
            ind = Ind(cur)
            for s in steps:
                STEPS[s](cur, ind)
                con.commit()
            print(f"dziennik importów: usunięto {prune_batches(cur)} starych wpisów")
            con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


if __name__ == "__main__":
    main(sys.argv[1:])
