#!/usr/bin/env python3
"""Idempotently load data/synthetic/medical_demo into astro_medical."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from load import ROOT, connect  # noqa: E402


def main(argv: list[str]) -> None:
    directory = Path(argv[0]) if argv else ROOT / "data/synthetic/medical_demo"
    meta = json.loads((directory / "meta.json").read_text(encoding="utf-8"))
    con = connect()
    try:
        with con.cursor() as cur:
            cur.execute("SELECT id, start_date FROM astro_core.mission WHERE code=%s", (meta["mission_code"],))
            mission = cur.fetchone()
            if not mission:
                raise RuntimeError(f"Medical import requires mission {meta['mission_code']!r}; load the Mars demo first")
            mid, start = mission
            cur.execute("SELECT id FROM astro_habitat.habitat WHERE code='MARS-LT-ELYSIUM'")
            habitat = cur.fetchone()
            habitat_id = habitat[0] if habitat else None
            # Remove dependent alerts first; event/attachment/transmission cascades
            # then make reruns deterministic while preserving unrelated missions.
            cur.execute("DELETE e FROM astro_medical.escalation e JOIN astro_medical.alert a ON a.id=e.alert_id WHERE a.mission_id=%s", (mid,))
            cur.execute("DELETE FROM astro_medical.alert WHERE mission_id=%s", (mid,))
            cur.execute("DELETE FROM astro_medical.medical_event WHERE mission_id=%s", (mid,))

            subject_ids = {}
            for code in set(meta["crew"].values()):
                cur.execute("SELECT id FROM astro_core.subject WHERE code=%s", (code,))
                row = cur.fetchone()
                if not row:
                    raise RuntimeError(f"Medical import requires subject {code!r}")
                subject_ids[code] = row[0]
            event_ids = {}
            for e in meta["events"]:
                observed = datetime.combine(start, datetime.min.time()) + timedelta(days=e["sol"])
                details = json.dumps(e["details"], separators=(",", ":"))
                cur.execute(
                    """INSERT INTO astro_medical.medical_event
                    (mission_id,subject_id,habitat_id,event_code,event_type,report_kind,observed_at,sol,title,
                     value_num,value_text,unit,severity,status,is_drill,source_flag,details)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'recorded',%s,'simulated',%s)
                    ON DUPLICATE KEY UPDATE title=VALUES(title), details=VALUES(details), status=VALUES(status)""",
                    (mid, subject_ids.get(e["subject_code"]), habitat_id, e["event_code"], e["event_type"],
                     e["report_kind"], observed, e["sol"], e["title"], e["value_num"], e["value_text"], e["unit"],
                     e["severity"], e["is_drill"], details))
                cur.execute("SELECT id FROM astro_medical.medical_event WHERE mission_id=%s AND event_code=%s",
                            (mid, e["event_code"]))
                event_ids[e["event_code"]] = cur.fetchone()[0]

            attachment_ids = {}
            for a in meta["attachments"]:
                p = ROOT / a["relative_path"]
                import hashlib
                digest = hashlib.sha256(p.read_bytes()).hexdigest()
                cur.execute(
                    """INSERT INTO astro_medical.attachment
                    (medical_event_id,attachment_code,file_name,relative_path,mime_type,byte_size,sha256,
                     attachment_type,review_status,created_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,UTC_TIMESTAMP())
                    ON DUPLICATE KEY UPDATE file_name=VALUES(file_name), relative_path=VALUES(relative_path),
                    sha256=VALUES(sha256), byte_size=VALUES(byte_size)""",
                    (event_ids[a["event_code"]], a["attachment_code"], a["file_name"], a["relative_path"],
                     "image/svg+xml" if p.suffix == ".svg" else "image/png", p.stat().st_size, digest,
                     a["attachment_type"], a["review_status"]))
                cur.execute("SELECT id FROM astro_medical.attachment WHERE attachment_code=%s", (a["attachment_code"],))
                aid = cur.fetchone()[0]
                attachment_ids[a["attachment_code"]] = aid
                cur.execute(
                    """INSERT INTO astro_medical.earth_doctor_review
                    (attachment_id,reviewer,status,requested_at) VALUES (%s,%s,%s,UTC_TIMESTAMP())
                    ON DUPLICATE KEY UPDATE reviewer=VALUES(reviewer), status=VALUES(status)""",
                    (aid, a["reviewer"], a["doctor_status"]))

            for t in meta["transmissions"]:
                cur.execute(
                    """INSERT INTO astro_medical.transmission
                    (mission_id,medical_event_id,attachment_id,transmission_code,payload_type,priority,queued_at,
                     blackout_start_sol,blackout_end_sol,status,notes)
                    VALUES (%s,%s,%s,%s,%s,%s,UTC_TIMESTAMP(),%s,%s,%s,%s)
                    ON DUPLICATE KEY UPDATE status=VALUES(status), blackout_start_sol=VALUES(blackout_start_sol),
                    blackout_end_sol=VALUES(blackout_end_sol), notes=VALUES(notes)""",
                    (mid, event_ids.get(t["event_code"]), attachment_ids.get(t["transmission_code"].removeprefix("TX-")),
                     t["transmission_code"], t["payload_type"], t["priority"], t["blackout_start_sol"],
                     t["blackout_end_sol"], t["status"], t["notes"]))

            def habitat_event(ref, sol):
                if not habitat_id:
                    return None
                cur.execute("SELECT id FROM astro_habitat.event WHERE habitat_id=%s AND event_code=%s",
                            (habitat_id, ref))
                row = cur.fetchone()
                if row:
                    return row[0]
                cur.execute("SELECT id FROM astro_habitat.event WHERE habitat_id=%s AND sol=%s LIMIT 1",
                            (habitat_id, sol))
                row = cur.fetchone()
                return row[0] if row else None

            def habitat_reading(ref, sol):
                if not habitat_id or not ref:
                    return None
                cur.execute("""SELECT r.id FROM astro_habitat.reading r
                    WHERE r.habitat_id=%s AND r.channel_code=%s AND r.sol=%s AND r.crew_code=%s
                    ORDER BY r.ts_utc LIMIT 1""",
                            (habitat_id, ref["channel_code"], sol, ref["crew_code"]))
                row = cur.fetchone()
                return row[0] if row else None

            alert_ids = {}
            for a in meta["alerts"]:
                event_id = event_ids.get(a.get("medical_event_code"))
                crew_subject = subject_ids.get(meta["crew"].get(a.get("crew_code")))
                ev_id = habitat_event(a.get("habitat_event_code"), 470 if "H8" in a["alert_code"] else 142)
                rd_id = habitat_reading(a.get("habitat_reading"), a.get("habitat_reading", {}).get("sol", 0))
                cur.execute(
                    """INSERT INTO astro_medical.alert
                    (mission_id,subject_id,alert_code,severity,title,message,source_kind,observation_id,
                     habitat_reading_id,habitat_event_id,medical_event_id,opened_at,status)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,NULL,%s,%s,%s,UTC_TIMESTAMP(),'open')
                    ON DUPLICATE KEY UPDATE message=VALUES(message), status='open'""",
                    (mid, crew_subject, a["alert_code"], a["severity"], a["title"], a["message"], a["source_kind"],
                     rd_id, ev_id, event_id))
                cur.execute("SELECT id FROM astro_medical.alert WHERE alert_code=%s", (a["alert_code"],))
                alert_ids[a["alert_code"]] = cur.fetchone()[0]
            for e in meta["escalations"]:
                cur.execute(
                    """INSERT INTO astro_medical.escalation
                    (alert_id,escalation_code,level,status,opened_at)
                    VALUES (%s,%s,%s,'open',UTC_TIMESTAMP())
                    ON DUPLICATE KEY UPDATE status='open'""",
                    (alert_ids[e["alert_code"]], e["escalation_code"], e["level"]))
        con.commit()
        print(f"medical import: {len(meta['events'])} events, {len(meta['attachments'])} attachments, "
              f"{len(meta['transmissions'])} transmissions, {len(meta['alerts'])} alerts")
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


if __name__ == "__main__":
    main(sys.argv[1:])
