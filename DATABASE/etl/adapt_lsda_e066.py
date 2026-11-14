#!/usr/bin/env python3
"""adapt_lsda_e066.py | LSDA E066 (178066, Shykoff 1996, STS-40/STS-58) -> format kanoniczny.

Tabela 2: spoczynkowe HR, BP, MAP, rzut serca, objętość wyrzutowa; 6 osób x 3 warunki.
Plik nie podaje dnia lotu ani przypisania osoby do STS-40 / STS-58, więc:
  - "Preflight erect"  -> launch, day_offset -2, time_is_approx=1, label 'PRE erect'
  - "Preflight supine" -> launch, day_offset -1, time_is_approx=1, label 'PRE supine'
  - "In flight"        -> launch, day_offset  5, time_is_approx=1, label 'IN flight (day n/a)'
(offsety są umowne - tylko rozdzielają warunki i ustawiają fazę pre/in).

  python3 -I DATABASE/etl/adapt_lsda_e066.py && \
  uv run --no-project --with pymysql==1.1.1 python DATABASE/etl/load_canonical.py data/processed/lsda_e066
"""
import csv
import json
import glob
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = sorted(glob.glob(str(ROOT / "data/lsda/e066_178066/files/178066__3141149154/*__Sheet1.csv")))[0]
OUT = ROOT / "data" / "processed" / "lsda_e066"
MISSION = "E066-STS40-STS58"
COND = {"Preflight erect": (-2, "PRE erect"), "Preflight supine": (-1, "PRE supine"),
        "In flight": (5, "IN flight (day n/a)")}
# kolumny po pozycji: 0 subject, 1 Q, 2 HR, 3 BP 'SBP/DBP', 4 MAP, 5 SV, 6 FRC
NEW_IND = [
    dict(code="cardiac_output", label="Cardiac output (resting)", category="vitals",
         body_system_code="cardiovascular", canonical_unit="L/min"),
    dict(code="stroke_volume", label="Stroke volume (resting)", category="vitals",
         body_system_code="cardiovascular", canonical_unit="mL"),
]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rows, cond = [], None
    with open(SRC, newline="", encoding="utf-8-sig") as f:
        for r in csv.reader(f):
            cells = [c.strip() for c in r] + [""] * 7
            label = next((k for k in COND if k in " ".join(cells)), None)
            if label:
                cond = label
                continue
            if not (cond and cells[0].isdigit()):
                continue
            off, tl = COND[cond]
            sbp, dbp = cells[3].split("/")
            subj = f"E066-S{int(cells[0]):02d}"
            for code, unit, raw, rawname, rawunit in (
                    ("heart_rate_resting", "bpm", cells[2], "HR", "beats/min"),
                    ("bp_systolic", "mmHg", sbp, "BP (systolic part)", "mmHg"),
                    ("bp_diastolic", "mmHg", dbp, "BP (diastolic part)", "mmHg"),
                    ("bp_mean_arterial", "mmHg", cells[4], "MAP", "mmHg"),
                    ("cardiac_output", "L/min", cells[1], "Q", "l/m"),
                    ("stroke_volume", "mL", cells[5], "SV", "ml")):
                rows.append(dict(source_id="lsda_e066", subject_code=subj, mission_code=MISSION,
                                 indicator_code=code, timepoint_label=tl, anchor="launch", day_offset=off,
                                 time_is_approx=1, measured_at="", replicate=1, value=raw, unit=unit, ref_min="",
                                 ref_max="", sample_type="manual_device", is_synthetic=0, raw_name=rawname,
                                 raw_value=cells[3] if code.startswith("bp_s") or code.startswith("bp_d") else raw,
                                 raw_unit=rawunit))
    subjects = sorted({r["subject_code"] for r in rows})
    meta = dict(
        source=dict(id="lsda_e066", title="NASA LSDA E066 (178066): Inflight Study of Cardiovascular Deconditioning, "
                    "STS-40/STS-58 - resting data by subject (Shykoff et al. 1996, J Appl Physiol 81:26-32, Table 2)",
                    publisher="NASA LSDA", url="https://nlsp.nasa.gov/explore/lsdahome", data_kind="real_spaceflight",
                    access_status="files_public",
                    notes="Real astronaut data. Flight day and STS-40 vs STS-58 assignment not given; day offsets are "
                          "conventional (approx). Posture erect/supine encoded in timepoint_label."),
        missions=[dict(code=MISSION, name="Spacelab Life Sciences SLS-1 (STS-40, 9 d) and SLS-2 (STS-58, 14 d)",
                       environment_code="leo_free_flyer", source_id="lsda_e066", is_synthetic=False,
                       description="Space Shuttle; subjects pooled across both flights in the source table.")],
        subjects=[dict(code=s, source_subject_code=s.split("-")[1], source_id="lsda_e066", sex="U",
                       age_band_code=None, is_synthetic=False) for s in subjects],
        participations=[dict(subject_code=s, mission_code=MISSION, role="crew") for s in subjects],
        indicators=NEW_IND,
    )
    (OUT / "meta.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False) + "\n")
    with (OUT / "observations.canonical.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]), lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    print(f"{OUT.relative_to(ROOT)}: {len(rows)} rows, {len(subjects)} subjects")


if __name__ == "__main__":
    main()
