#!/usr/bin/env python3
"""Generate deterministic, explicitly synthetic medical operations data for the Mars demo."""
from __future__ import annotations

import argparse
import hashlib
import json
import random
import struct
import sys
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from crew_ext import NEW_CREW, stream_seed  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
MISSION = "SYN-MARS-HAB-600"
CREW = {"C1": "SYN-02", "C2": "SYN-01", "C3": "SYN-03", "C4": "SYN-04"}
CREW.update({p["crew"]: p["code"] for p in NEW_CREW})          # C5..C10 (crew_ext.py)

# Medical episodes of the added crew: one drawn per person (own stream), sol and severity drawn too.
# Everything is appended after the original events/transmissions, so the original records stay identical.
NEW_EPISODES = [
    ("procedure", "Minor hand laceration during maintenance", "minor", "laceration 2 cm, closed with strips"),
    ("symptom", "Insomnia: sleep onset > 60 min for 5 sols", "minor", "sleep onset latency 60-90 min"),
    ("symptom", "Contact dermatitis on forearms", "minor", "itchy erythema, suspected glove material"),
    ("symptom", "Lower back pain after EVA", "major", "pain 6/10, limited trunk flexion"),
    ("symptom", "Dental pain, suspected cracked filling", "major", "pain on chewing, tooth 36"),
    ("symptom", "Nasal congestion and sinus pressure", "minor", "fluid shift symptoms, no fever"),
    ("diagnosis", "Kidney stone risk: low urine volume trend", "major", "urine volume < 1.5 L/d for 7 sols"),
    ("symptom", "Muscle strain, right calf, treadmill session", "minor", "pain 4/10, no swelling"),
]


def png(path: Path, label: str) -> None:
    # A tiny valid RGB PNG, generated without image dependencies.
    raw = b"\x00" + bytes((30, 80, 120)) * 32
    raw = b"".join(b"\x00" + bytes((30 + i % 80, 80, 120)) * 32 for i in range(32))
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 32, 32, 8, 2, 0, 0, 0))
                    + chunk(b"tEXt", b"Description\x00" + label.encode()) + chunk(b"IDAT", zlib.compress(raw))
                    + chunk(b"IEND", b""))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=ROOT / "data/synthetic/medical_demo")
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    out = args.out
    att = out / "attachments"
    att.mkdir(parents=True, exist_ok=True)

    events = []
    def add(code, typ, sol, title, crew=None, severity="info", report="none", value=None,
            unit=None, text=None, drill=False, details=None):
        events.append({"event_code": code, "event_type": typ, "sol": sol, "subject_code": CREW.get(crew) if crew else None,
                       "crew_code": crew, "title": title, "severity": severity, "report_kind": report,
                       "value_num": value, "value_text": text, "unit": unit, "is_drill": drill,
                       "details": details or {}})

    # Weekly private medical conference reports, including the H13 communication hold.
    for week in range(1, 87):
        sol = week * 7
        add(f"PMC-W{week:02d}", "report", sol, f"Weekly private medical conference report — sol {sol}",
            report="pmc_weekly", severity="info", details={"recipients": "flight_surgeon", "week": week})
    add("H1-CO2-ESC", "diagnosis", 142, "CO2 exposure assessment for C1/C2", "C1", "major",
        details={"habitat_event_code": "evt-H1-scrubber-fault"})
    add("H4-DEHYDRATION-C2", "diagnosis", 252, "Dehydration pattern: low urine volume", "C2", "major",
        details={"habitat_reading": {"channel_code": "urine_volume_24h", "sol": 252, "crew_code": "C2"}})
    add("H5-HYPERCALCIURIA-C3", "diagnosis", 390, "Hypercalciuria trend requires renal review", "C3", "major",
        details={"habitat_reading": {"channel_code": "urine_calcium_24h", "sol": 390, "crew_code": "C3"}})
    add("H8-SPE-ALERT", "diagnosis", 470, "SPE exposure during EVA; shelter protocol", "C1", "critical",
        details={"habitat_event_code": "evt-H8-spe"})
    add("H8-SPE-ALERT-C4", "diagnosis", 470, "SPE exposure during EVA; shelter protocol", "C4", "critical",
        details={"habitat_event_code": "evt-H8-spe"})
    add("AED-DRILL-420", "drill", 420, "AED response exercise (DRILL — NOT a real cardiac arrest)", "C2",
        severity="info", drill=True, details={"clearly_marked": True, "outcome": "pass"})
    # SANS episode for C3 around sol 200; both attachments need Earth review.
    add("SANS-C3-SYMPTOMS", "symptom", 200, "SANS: transient visual change and headache", "C3", "major",
        text="visual change; headache score 6/10", details={"risk": "SANS"})
    add("SANS-C3-IMAGING", "imaging", 201, "SANS ocular ultrasound and fundus photo", "C3", "major",
        details={"risk": "SANS", "requested_review": True})

    new_events = []
    for p in NEW_CREW:
        r = random.Random(stream_seed(args.seed, p["crew"], "medical"))
        typ, title, sev, text = r.choice(NEW_EPISODES)
        sol = r.randrange(30, 590)
        n_before = len(events)
        add(f"MED-{p['crew']}-SOL{sol}", typ, sol, f"{title} ({p['crew']})", p["crew"], sev, text=text,
            details={"episode": "random_draw", "role": p["role"]})
        new_events += events[n_before:]
        del events[n_before:]

    attachments = []
    for code, filename, kind, event_code, ext in [
        ("ATT-SANS-C3-US", "sans_c3_sol201_ultrasound.svg", "ultrasound", "SANS-C3-IMAGING", "svg"),
        ("ATT-SANS-C3-PHOTO", "sans_c3_sol201_photo.png", "photo", "SANS-C3-IMAGING", "png"),
    ]:
        p = att / filename
        if ext == "png":
            png(p, code)
        else:
            p.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100">'
                         f'<text x="5" y="52">{code} SYNTHETIC PLACEHOLDER</text></svg>\n', encoding="utf-8")
        attachments.append({"attachment_code": code, "event_code": event_code, "file_name": filename,
                            "relative_path": str(p.relative_to(ROOT)), "attachment_type": kind,
                            "reviewer": "earth-doctor-01", "review_status": "pending",
                            "doctor_status": "requested"})

    transmissions = []
    for e in events:
        code = e["event_code"]
        blackout = 280 <= e["sol"] <= 293
        transmissions.append({"transmission_code": f"TX-{code}", "event_code": code,
                              "payload_type": "report" if e["event_type"] == "report" else "event",
                              "priority": "routine" if e["severity"] == "info" else "urgent",
                              "status": "held_blackout" if blackout else "queued",
                              "blackout_start_sol": 280 if blackout else None,
                              "blackout_end_sol": 294 if blackout else None,
                              "notes": "H13 solar-conjunction blackout; queued for first available window" if blackout else None})
    original_attachment_tx = [{"transmission_code": f"TX-{a['attachment_code']}", "event_code": a["event_code"],
                       "payload_type": "attachment", "priority": "urgent", "status": "queued",
                       "blackout_start_sol": None, "blackout_end_sol": None, "notes": None} for a in attachments]
    transmissions += original_attachment_tx
    for e in new_events:                                        # added crew: after every original record
        blackout = 280 <= e["sol"] <= 293
        transmissions.append({"transmission_code": f"TX-{e['event_code']}", "event_code": e["event_code"],
                              "payload_type": "event", "priority": "routine" if e["severity"] == "minor" else "urgent",
                              "status": "held_blackout" if blackout else "queued",
                              "blackout_start_sol": 280 if blackout else None,
                              "blackout_end_sol": 294 if blackout else None,
                              "notes": "H13 solar-conjunction blackout; queued for first available window" if blackout else None})
    events += new_events

    alerts = [
        {"alert_code": "ALT-H1-C1", "severity": "alert", "title": "H1 CO2 exposure", "message": "C1 exposure linked to habitat scrubber fault.", "crew_code": "C1", "source_kind": "habitat_event", "habitat_event_code": "evt-H1-scrubber-fault", "medical_event_code": "H1-CO2-ESC"},
        {"alert_code": "ALT-H4-C2", "severity": "alert", "title": "H4 dehydration", "message": "C2 low urine volume linked to habitat hydration reading.", "crew_code": "C2", "source_kind": "habitat_reading", "medical_event_code": "H4-DEHYDRATION-C2", "habitat_reading": {"channel_code": "urine_volume_24h", "sol": 252, "crew_code": "C2"}},
        {"alert_code": "ALT-H5-C3", "severity": "alert", "title": "H5 hypercalciuria", "message": "C3 calcium trend linked to urine reading.", "crew_code": "C3", "source_kind": "habitat_reading", "medical_event_code": "H5-HYPERCALCIURIA-C3", "habitat_reading": {"channel_code": "urine_calcium_24h", "sol": 390, "crew_code": "C3"}},
        {"alert_code": "ALT-H8-SPE", "severity": "critical", "title": "H8 SPE during EVA", "message": "SPE event linked to C1/C4 EVA and shelter response.", "crew_code": "C1", "source_kind": "habitat_event", "habitat_event_code": "evt-H8-spe", "medical_event_code": "H8-SPE-ALERT"},
    ]
    escalations = [{"alert_code": a["alert_code"], "escalation_code": f"ESC-{a['alert_code']}",
                    "level": "emergency" if a["severity"] == "critical" else "flight_surgeon"} for a in alerts]
    payload = {"generator": "medical_sim_v1", "seed": args.seed, "mission_code": MISSION,
               "crew": CREW, "events": events, "attachments": attachments,
               "transmissions": transmissions, "alerts": alerts, "escalations": escalations}
    (out / "events.json").write_text(json.dumps(events, indent=2), encoding="utf-8")
    (out / "attachments.json").write_text(json.dumps(attachments, indent=2), encoding="utf-8")
    (out / "transmissions.json").write_text(json.dumps(transmissions, indent=2), encoding="utf-8")
    (out / "alerts.json").write_text(json.dumps({"alerts": alerts, "escalations": escalations}, indent=2), encoding="utf-8")
    (out / "meta.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
