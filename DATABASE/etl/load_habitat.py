#!/usr/bin/env python3
"""load_habitat.py | import wyniku DATABASE/synthetic/habitat_generate.py do astro_habitat.

Domyślnie ZASTĘPUJE dane symulowane habitatu (source_flag='simulated'): kasuje stare odczyty, agregaty,
zdarzenia i lokalizacje tego habitatu, potem ładuje nowe. Walidacja: kanał istnieje, jednostka = channel.unit,
strefa istnieje (FK), osoba istnieje (FK). Każdy plik = osobny wpis w astro_core.import_batch.

  uv run --no-project --with pymysql==1.1.1 python DATABASE/etl/load_habitat.py [data/synthetic/habitat_demo]
"""
from __future__ import annotations

import collections
import csv
import gzip
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from load import ROOT, connect, sha256  # noqa: E402

SOURCE = "habitat_sim_v1"
BATCH = 5000


def opener(p: Path):
    return gzip.open(p, "rt", newline="", encoding="utf-8") if p.suffix == ".gz" else p.open(newline="", encoding="utf-8")


def nz(x):
    return None if x == "" else x


def start_batch(cur, path, adapter):
    cur.execute("INSERT INTO astro_core.import_batch (source_id, adapter, file_name, file_sha256) VALUES (%s,%s,%s,%s)",
                (SOURCE, adapter, str(path.resolve().relative_to(ROOT)), sha256(path)))
    return cur.lastrowid


def finish_batch(cur, bid, read, ok, rej):
    notes = "\n".join(f"{n} x {r}" for r, n in rej.most_common()) or None
    cur.execute("UPDATE astro_core.import_batch SET finished_at=UTC_TIMESTAMP(), status='ok', rows_read=%s,"
                " rows_upserted=%s, rows_rejected=%s, notes=%s WHERE id=%s", (read, ok, sum(rej.values()), notes, bid))


def flush(cur, sql, buf):
    if buf:
        cur.executemany(sql, buf)
        buf.clear()


def main(argv):
    d = Path(argv[0]) if argv else ROOT / "data" / "synthetic" / "habitat_demo"
    meta = json.loads((d / "meta.json").read_text())
    con = connect()
    t0 = time.time()
    try:
        with con.cursor() as cur:
            cur.execute("SELECT id FROM astro_habitat.habitat WHERE code=%s", (meta["habitat"],))
            hab = cur.fetchone()[0]
            cur.execute("SELECT code, unit FROM astro_habitat.channel")
            units = dict(cur.fetchall())
            cur.execute("SELECT code FROM astro_habitat.zone WHERE habitat_id=%s", (hab,))
            zones = {r[0] for r in cur.fetchall()}
            cur.execute("SELECT code FROM astro_habitat.crew WHERE habitat_id=%s", (hab,))
            crew = {r[0] for r in cur.fetchall()}

            # zastąpienie poprzedniej symulacji
            for tbl in ("reading", "reading_hourly", "event", "crew_location"):
                cur.execute(f"DELETE FROM astro_habitat.{tbl} WHERE habitat_id=%s AND source_flag='simulated'", (hab,))
            con.commit()

            def check(z, c, ch, unit, rej):
                if ch not in units:
                    rej[f"nieznany kanał {ch}"] += 1
                elif unit is not None and unit != units[ch]:
                    rej[f"jednostka {unit!r} != {units[ch]!r} ({ch})"] += 1
                elif z not in zones:
                    rej[f"nieznana strefa {z}"] += 1
                elif c and c not in crew:
                    rej[f"nieznana osoba {c}"] += 1
                else:
                    return True
                return False

            # odczyty
            p = d / "readings.csv.gz"
            bid = start_batch(cur, p, "habitat_reading")
            sql = ("INSERT INTO astro_habitat.reading (habitat_id, ts_utc, sol, zone_code, crew_code, channel_code, sensor,"
                   " value_num, value_text, unit, quality, source_flag, import_batch_id)"
                   " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'simulated',%s)")
            read = ok = 0
            rej = collections.Counter()
            buf = []
            with opener(p) as f:
                for r in csv.DictReader(f):
                    read += 1
                    if not check(r["zone_code"], r["crew_code"], r["channel_code"], r["unit"], rej):
                        continue
                    buf.append((hab, r["ts_utc"], nz(r["sol"]), r["zone_code"], nz(r["crew_code"]), r["channel_code"],
                                r["sensor"], nz(r["value_num"]), nz(r["value_text"]), r["unit"], r["quality"], bid))
                    ok += 1
                    if len(buf) >= BATCH:
                        flush(cur, sql, buf)
            flush(cur, sql, buf)
            finish_batch(cur, bid, read, ok, rej)
            con.commit()
            print(f"readings: read={read} loaded={ok} rejected={sum(rej.values())} {dict(rej) if rej else ''}")

            # agregaty godzinowe
            p = d / "hourly.csv.gz"
            bid = start_batch(cur, p, "habitat_hourly")
            sql = ("INSERT INTO astro_habitat.reading_hourly (habitat_id, hour_utc, zone_code, crew_code, channel_code,"
                   " sensor, sol, n_samples, value_mean, value_min, value_max, n_suspect, n_fault, source_flag)"
                   " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'simulated')")
            read = ok = 0
            rej = collections.Counter()
            with opener(p) as f:
                for r in csv.DictReader(f):
                    read += 1
                    if not check(r["zone_code"], r["crew_code"], r["channel_code"], None, rej):
                        continue
                    buf.append((hab, r["hour_utc"], r["zone_code"], r["crew_code"], r["channel_code"], r["sensor"],
                                nz(r["sol"]), r["n_samples"], nz(r["value_mean"]), nz(r["value_min"]),
                                nz(r["value_max"]), r["n_suspect"], r["n_fault"]))
                    ok += 1
                    if len(buf) >= BATCH:
                        flush(cur, sql, buf)
                        if ok % 200000 == 0:
                            con.commit()
            flush(cur, sql, buf)
            finish_batch(cur, bid, read, ok, rej)
            con.commit()
            print(f"hourly: read={read} loaded={ok} rejected={sum(rej.values())} {dict(rej) if rej else ''}")

            # zdarzenia
            p = d / "events.csv"
            bid = start_batch(cur, p, "habitat_event")
            rows = list(csv.DictReader(opener(p)))
            cur.executemany(
                "INSERT INTO astro_habitat.event (habitat_id, event_code, event_type, start_utc, end_utc, sol, zone_code,"
                " crew_code, severity, details, source_flag, import_batch_id)"
                " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'simulated',%s)",
                [(hab, r["event_code"], r["event_type"], r["start_utc"], nz(r["end_utc"]), r["sol"], nz(r["zone_code"]),
                  nz(r["crew_code"]), r["severity"], r["details"], bid) for r in rows])
            finish_batch(cur, bid, len(rows), len(rows), collections.Counter())
            print(f"events: {len(rows)}")

            # lokalizacja załogi
            p = d / "crew_location.csv"
            rows = list(csv.DictReader(opener(p)))
            cur.executemany(
                "INSERT INTO astro_habitat.crew_location (habitat_id, crew_code, from_utc, to_utc, zone_code, source_flag)"
                " VALUES (%s,%s,%s,%s,%s,'simulated')",
                [(hab, r["crew_code"], r["from_utc"], nz(r["to_utc"]), r["zone_code"]) for r in rows])
            print(f"crew_location: {len(rows)}")

            # okna scenariuszy
            sc = json.loads((d / "scenarios.json").read_text())
            for code, v in sc.items():
                cur.execute("UPDATE astro_habitat.scenario SET start_sol=%s, end_sol=%s WHERE habitat_id=%s AND code=%s",
                            (v["start_sol"], v["end_sol"], hab, code))
            con.commit()
            print(f"scenarios: {len(sc)}; total {time.time() - t0:.0f} s")
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


if __name__ == "__main__":
    main(sys.argv[1:])
