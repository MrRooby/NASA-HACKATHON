#!/usr/bin/env python3
"""Idempotent importer for data/synthetic/wearables_demo.

  python DATABASE/etl/load_wearables.py [DIR] [--workers N]

--workers N (default 1 = one transaction for everything, as before): every table except sample_minute is loaded and
committed first, then N processes insert sample_minute in parallel (devices split between them, each with its own
connection, committing every 100k rows, progress printed). Faster on large data sets; if a worker fails, run the
loader again (it deletes this mission's wearables data first).
"""
from __future__ import annotations

import csv
import gzip
import json
import multiprocessing as mp
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from load import connect  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SOURCE = "wearables_sim_v1"


def opener(path):
    return gzip.open(path, "rt", newline="", encoding="utf-8") if path.suffix == ".gz" else path.open(newline="", encoding="utf-8")


def rows(path):
    with opener(path) as f:
        yield from csv.DictReader(f)


MINUTE_SQL = """INSERT INTO astro_wearables.sample_minute
                   (device_id,minute_utc,sol,n_samples,heart_rate_mean,spo2_mean,skin_temperature_mean,
                    perfusion_index_mean,battery_min,n_suspect,n_fault)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)"""


def minute_row(device_ids, r):
    return (device_ids[r["device_code"]], r["minute_utc"], r["sol"], r["n_samples"],
            r["heart_rate_mean"], r["spo2_mean"], r["skin_temperature_mean"],
            r["perfusion_index_mean"], r["battery_min"], r["n_suspect"], r["n_fault"])


def minute_worker(k, workers, path, device_ids, out):
    """Inserts sample_minute rows of the devices assigned to worker k (device order index % workers == k)."""
    mine = {code for i, code in enumerate(device_ids) if i % workers == k}
    con = connect()
    count, batch, t0 = 0, [], time.time()
    try:
        with con.cursor() as cur:
            for r in rows(path):
                if r["device_code"] not in mine:
                    continue
                batch.append(minute_row(device_ids, r))
                if len(batch) >= 5000:
                    cur.executemany(MINUTE_SQL, batch)
                    count += len(batch)
                    batch.clear()
                    if count % 100000 == 0:
                        con.commit()
                    if count % 1000000 == 0:
                        print(f"  worker {k}: {count:,} minute rows ({time.time() - t0:.0f} s)", flush=True)
            if batch:
                cur.executemany(MINUTE_SQL, batch)
                count += len(batch)
        con.commit()
        out.put((k, count, None))
    except Exception as e:  # reported by the parent
        con.rollback()
        out.put((k, count, repr(e)))
    finally:
        con.close()


def parse_args(argv):
    args = list(argv if argv is not None else sys.argv[1:])
    workers = 1
    if "--workers" in args:
        i = args.index("--workers")
        workers = max(1, int(args[i + 1]))
        del args[i:i + 2]
    return Path(args[0] if args else ROOT / "data/synthetic/wearables_demo"), workers


def main(argv=None):
    directory, workers = parse_args(argv)
    meta = json.loads((directory / "meta.json").read_text())
    if meta.get("mission") != "SYN-MARS-HAB-600":
        raise RuntimeError("wearables data must target SYN-MARS-HAB-600")
    con = connect()
    try:
        with con.cursor() as cur:
            cur.execute("SELECT id FROM astro_core.mission WHERE code=%s", (meta["mission"],))
            mission = cur.fetchone()
            if not mission:
                raise RuntimeError("missing Mars mission SYN-MARS-HAB-600; load the Mars demo first")
            mission_id = mission[0]
            cur.execute("""SELECT cr.code, s.id, s.code
                           FROM astro_habitat.crew cr
                           JOIN astro_core.subject s ON s.id=cr.subject_id
                           WHERE cr.habitat_id=(SELECT id FROM astro_habitat.habitat
                                                WHERE code='MARS-LT-ELYSIUM')""")
            links = {r[0]: (r[1], r[2]) for r in cur.fetchall()}
            wanted = {"C1": "SYN-02", "C2": "SYN-01", "C3": "SYN-03", "C4": "SYN-04"}
            missing = [c for c, s in wanted.items() if c not in links or links[c][1] != s]
            if missing:
                raise RuntimeError("missing Mars habitat crew/subject links: " + ", ".join(missing))

            cur.execute("DELETE FROM astro_wearables.scenario WHERE mission_id=%s", (mission_id,))
            cur.execute("DELETE s FROM astro_wearables.sample s JOIN astro_wearables.device d ON d.id=s.device_id WHERE d.mission_id=%s", (mission_id,))
            for table in ("sample_minute", "sample_hour", "device_state", "sleep_session"):
                cur.execute(f"DELETE x FROM astro_wearables.{table} x JOIN astro_wearables.device d ON d.id=x.device_id WHERE d.mission_id=%s", (mission_id,))
            cur.execute("DELETE FROM astro_wearables.device WHERE mission_id=%s", (mission_id,))

            device_ids = {}
            for r in rows(directory / "devices.csv"):
                subject_id, _ = links[r["crew_code"]]
                cur.execute("""INSERT INTO astro_wearables.device
                    (mission_id,subject_id,crew_code,limb,device_code,serial_no,location_code,installed_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (mission_id, subject_id, r["crew_code"], r["limb"], r["device_code"],
                     r["serial_no"], r["location_code"], r["installed_at"]))
                device_ids[r["device_code"]] = cur.lastrowid

            def insert_file(path, sql, transform):
                count = 0
                batch = []
                for r in rows(path):
                    batch.append(transform(r))
                    count += 1
                    if len(batch) >= 5000:
                        cur.executemany(sql, batch)
                        batch.clear()
                if batch:
                    cur.executemany(sql, batch)
                return count

            n = insert_file(directory / "samples.csv.gz",
                """INSERT INTO astro_wearables.sample
                   (device_id,ts_utc,sol,heart_rate_bpm,spo2_pct,skin_temperature_c,
                    perfusion_index,eeg_band,battery_pct,connection_state,quality,source_flag)
                   VALUES (%s,%s,%s,NULLIF(%s,''),NULLIF(%s,''),NULLIF(%s,''),
                           NULLIF(%s,''),NULLIF(%s,''),NULLIF(%s,''),%s,%s,'simulated')""",
                lambda r: (device_ids[r["device_code"]], r["ts_utc"], r["sol"], r["heart_rate_bpm"],
                           r["spo2_pct"], r["skin_temperature_c"], r["perfusion_index"], r["eeg_band"],
                           r["battery_pct"], r["connection_state"], r["quality"]))
            nmin = 0
            if workers == 1:
                nmin = insert_file(directory / "sample_minutes.csv.gz", MINUTE_SQL, lambda r: minute_row(device_ids, r))
            nhour = insert_file(directory / "sample_hours.csv.gz",
                """INSERT INTO astro_wearables.sample_hour
                   (device_id,hour_utc,sol,n_minutes,heart_rate_mean,spo2_mean,skin_temperature_mean,
                    perfusion_index_mean,battery_min,n_suspect,n_fault)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                lambda r: (device_ids[r["device_code"]], r["hour_utc"], r["sol"], r["n_minutes"],
                           r["heart_rate_mean"], r["spo2_mean"], r["skin_temperature_mean"],
                           r["perfusion_index_mean"], r["battery_min"], r["n_suspect"], r["n_fault"]))
            nstate = insert_file(directory / "device_states.csv",
                """INSERT INTO astro_wearables.device_state
                   (device_id,state_ts_utc,state,battery_pct,location_code,detail)
                   VALUES (%s,%s,%s,%s,%s,%s)""",
                lambda r: (device_ids[r["device_code"]], r["state_ts_utc"], r["state"],
                           r["battery_pct"], r["location_code"], r["detail"]))
            nsleep = insert_file(directory / "sleep_sessions.csv.gz",
                """INSERT INTO astro_wearables.sleep_session
                   (device_id,subject_id,sol,start_utc,end_utc,duration_min,sleep_efficiency_pct,
                    deep_sleep_pct,rem_sleep_pct,awakenings,quality)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                lambda r: (device_ids[r["device_code"]], links[r["device_code"].split("-")[1]][0],
                           r["sol"], r["start_utc"], r["end_utc"], r["duration_min"],
                           r["sleep_efficiency_pct"], r["deep_sleep_pct"], r["rem_sleep_pct"],
                           r["awakenings"], r["quality"]))
            for s in json.loads((directory / "scenarios.json").read_text()).values():
                cur.execute("""INSERT INTO astro_wearables.scenario
                    (mission_id,code,name,subject_code,limb,start_sol,end_sol,expected_reaction)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (mission_id, s["code"], s["name"], s["subject_code"], s["limb"],
                     s["start_sol"], s["end_sol"], s["expected_reaction"]))
            con.commit()
            if workers > 1:
                print(f"wearables: samples={n} hours={nhour} states={nstate} sleep={nsleep} committed; "
                      f"sample_minute with {workers} workers...", flush=True)
                out = mp.get_context("spawn").Queue()
                procs = [mp.get_context("spawn").Process(target=minute_worker,
                         args=(k, workers, directory / "sample_minutes.csv.gz", device_ids, out))
                         for k in range(workers)]
                for pr in procs:
                    pr.start()
                results = [out.get() for _ in procs]
                for pr in procs:
                    pr.join()
                errors = [f"worker {k}: {err}" for k, _, err in results if err]
                if errors:
                    raise RuntimeError("sample_minute load failed (run the loader again): " + "; ".join(errors))
                nmin = sum(c for _, c, _ in results)
            print(f"wearables: samples={n} minutes={nmin} hours={nhour} states={nstate} sleep={nsleep}")
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


if __name__ == "__main__":
    main()
