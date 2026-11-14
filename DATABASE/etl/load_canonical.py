#!/usr/bin/env python3
"""load_canonical.py | import katalogu w formacie kanonicznym (DATABASE_PLAN §9.2) do astro_core.

Katalog zawiera:
  meta.json                         źródło, misje, osoby, udział, (opcjonalnie) nowe wskaźniki
  observations.canonical.csv        source_id,subject_code,mission_code,indicator_code,timepoint_label,anchor,
                                    day_offset,time_is_approx,measured_at,replicate,value,unit,ref_min,ref_max,
                                    sample_type,is_synthetic,raw_name,raw_value,raw_unit
  env_observations.canonical.csv    environment_code,location,indicator_code,source_id,measured_at,aggregation,
                                    value,unit,is_synthetic   (opcjonalnie)

Walidacja (§9.4): nieznany wskaźnik, jednostka != canonical_unit, wartość nieliczbowa, zły anchor,
osoba bez udziału w misji -> wiersz odrzucony z powodem w import_batch.notes. Import idempotentny.
Jeden plik = jedna transakcja (§9.4a).

  uv run --no-project --with pymysql==1.1.1 python DATABASE/etl/load_canonical.py data/synthetic/demo
"""
from __future__ import annotations

import collections
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from load import ROOT, connect, num, sha256, upsert  # noqa: E402

BATCH_ROWS = 2000


def ids(cur, sql, *args):
    cur.execute(sql, args)
    return {r[0]: r[1] for r in cur.fetchall()}


def start_batch(cur, source_id, adapter, path: Path):
    file_name = path.resolve().relative_to(ROOT) if path.resolve().is_relative_to(ROOT) else path.resolve()
    cur.execute("INSERT INTO import_batch (source_id, adapter, file_name, file_sha256) VALUES (%s,%s,%s,%s)",
                (source_id, adapter, str(file_name), sha256(path)))
    return cur.lastrowid


def finish_batch(cur, bid, read, ok, rejected, reasons):
    notes = "\n".join(f"{n} x {r}" for r, n in reasons.most_common()) or None
    cur.execute("UPDATE import_batch SET finished_at=UTC_TIMESTAMP(), status='ok', rows_read=%s, rows_upserted=%s,"
                " rows_rejected=%s, notes=%s WHERE id=%s", (read, ok, rejected, notes, bid))


def bulk(cur, table, cols, keys, rows):
    if not rows:
        return
    upd = ", ".join(f"{c}=VALUES({c})" for c in cols if c not in keys)
    cur.executemany(f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(cols))}) "
                    f"ON DUPLICATE KEY UPDATE {upd}", rows)


def load_meta(cur, meta):
    s = meta["source"]
    upsert(cur, "data_source", dict(id=s["id"], title=s["title"], publisher=s.get("publisher"), url=s.get("url"),
                                    doi=None, license=s.get("license"), data_kind=s["data_kind"],
                                    access_status=s["access_status"], retrieved_at=None, notes=s.get("notes")))
    for i in meta.get("indicators", []):
        upsert(cur, "indicator", dict(code=i["code"], label=i["label"], category=i["category"],
                                      body_system_code=i.get("body_system_code"), canonical_unit=i["canonical_unit"],
                                      value_type="numeric", scope=i.get("scope", "subject"),
                                      threshold_id=i.get("threshold_id"),
                                      baseline_threshold_id=i.get("baseline_threshold_id"),
                                      description=i.get("description"),
                                      clinical_use=i.get("clinical_use", "diagnostic"),
                                      is_derived=bool(i.get("is_derived", False))), ("code",))
    for m in meta.get("missions", []):
        upsert(cur, "mission", dict(code=m["code"], name=m["name"], environment_code=m["environment_code"],
                                    source_id=m["source_id"], start_date=m.get("start_date"),
                                    end_date=m.get("end_date"), duration_days=m.get("duration_days"),
                                    is_synthetic=bool(m.get("is_synthetic")), description=m.get("description")),
               ("code",))
    for p in meta.get("subjects", []):
        upsert(cur, "subject", dict(code=p["code"], source_subject_code=p["source_subject_code"],
                                    source_id=p["source_id"], sex=p["sex"], age_band_code=p.get("age_band_code"),
                                    is_synthetic=bool(p.get("is_synthetic"))), ("code",))
    mis = ids(cur, "SELECT code, id FROM mission")
    sub = ids(cur, "SELECT code, id FROM subject")
    for pa in meta.get("participations", []):
        upsert(cur, "participation", dict(subject_id=sub[pa["subject_code"]], mission_id=mis[pa["mission_code"]],
                                          role=pa["role"], group_label=pa.get("group_label")),
               ("subject_id", "mission_id"))


OBS_COLS = ["subject_id", "mission_id", "indicator_id", "source_id", "import_batch_id", "anchor", "day_offset",
            "time_is_approx", "timepoint_label", "measured_at", "replicate", "value_num", "value_text", "ref_min",
            "ref_max", "sample_type", "is_synthetic", "raw_name", "raw_value", "raw_unit"]
OBS_KEYS = {"subject_id", "mission_id", "indicator_id", "source_id", "anchor", "day_offset", "measured_at",
            "sample_type", "replicate"}
ENV_COLS = ["environment_code", "location", "indicator_id", "source_id", "import_batch_id", "measured_at",
            "aggregation", "value_num", "is_synthetic"]
ENV_KEYS = {"environment_code", "location", "indicator_id", "source_id", "measured_at", "aggregation"}


def load_observations(cur, path: Path, source_id):
    ind = {}
    cur.execute("SELECT code, id, canonical_unit FROM indicator")
    for code, iid, unit in cur.fetchall():
        ind[code] = (iid, unit)
    mis = ids(cur, "SELECT code, id FROM mission")
    sub = ids(cur, "SELECT code, id FROM subject")
    cur.execute("SELECT subject_id, mission_id FROM participation")
    part = set(cur.fetchall())
    bid = start_batch(cur, source_id, "canonical", path)
    read = ok = 0
    rej = collections.Counter()
    buf = []
    with path.open(newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            read += 1
            code = r["indicator_code"]
            if code not in ind:
                rej[f"nieznany wskaźnik {code}"] += 1
                continue
            iid, unit = ind[code]
            if r["unit"] != unit:
                rej[f"jednostka {r['unit']!r} != {unit!r} ({code})"] += 1
                continue
            v = num(r["value"])
            if v is None:
                rej[f"wartość nieliczbowa ({code})"] += 1
                continue
            if r["anchor"] not in ("launch", "landing", "none"):
                rej[f"zły anchor {r['anchor']!r}"] += 1
                continue
            s, m = sub.get(r["subject_code"]), mis.get(r["mission_code"])
            if (s, m) not in part:
                rej[f"brak udziału {r['subject_code']} w {r['mission_code']}"] += 1
                continue
            buf.append((s, m, iid, r["source_id"], bid, r["anchor"], int(r["day_offset"]) if r["day_offset"] else None,
                        r["time_is_approx"] in ("1", "true", "True"), r["timepoint_label"] or None,
                        r["measured_at"] or None, int(r["replicate"] or 1), v, None, num(r["ref_min"]),
                        num(r["ref_max"]), r["sample_type"], r["is_synthetic"] in ("1", "true", "True"),
                        r["raw_name"] or None, r["raw_value"] or None, r["raw_unit"] or None))
            if len(buf) >= BATCH_ROWS:
                bulk(cur, "observation", OBS_COLS, OBS_KEYS, buf)
                ok += len(buf)
                buf.clear()
    bulk(cur, "observation", OBS_COLS, OBS_KEYS, buf)
    ok += len(buf)
    finish_batch(cur, bid, read, ok, sum(rej.values()), rej)
    print(f"{path.name}: read={read} upserted={ok} rejected={sum(rej.values())} {dict(rej) if rej else ''}")


def load_env(cur, path: Path, source_id):
    cur.execute("SELECT code, id, canonical_unit FROM indicator")
    ind = {c: (i, u) for c, i, u in cur.fetchall()}
    bid = start_batch(cur, source_id, "canonical_env", path)
    read = ok = 0
    rej = collections.Counter()
    buf = []
    with path.open(newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            read += 1
            if r["indicator_code"] not in ind:
                rej[f"nieznany wskaźnik {r['indicator_code']}"] += 1
                continue
            iid, unit = ind[r["indicator_code"]]
            v = num(r["value"])
            if r["unit"] != unit or v is None:
                rej[f"jednostka/wartość ({r['indicator_code']})"] += 1
                continue
            buf.append((r["environment_code"], r["location"][:60], iid, r["source_id"], bid, r["measured_at"],
                        r["aggregation"], v, r["is_synthetic"] in ("1", "true", "True")))
            if len(buf) >= BATCH_ROWS:
                bulk(cur, "env_observation", ENV_COLS, ENV_KEYS, buf)
                ok += len(buf)
                buf.clear()
    bulk(cur, "env_observation", ENV_COLS, ENV_KEYS, buf)
    ok += len(buf)
    finish_batch(cur, bid, read, ok, sum(rej.values()), rej)
    print(f"{path.name}: read={read} upserted={ok} rejected={sum(rej.values())} {dict(rej) if rej else ''}")


def link_mars_crew(cur):
    """Make the shared Mars health/habitat demo link work after data import."""
    cur.execute("""
        UPDATE astro_habitat.habitat h
        JOIN astro_core.mission m ON m.code = 'SYN-MARS-HAB-600'
        SET h.mission_id = m.id
        WHERE h.code = 'MARS-LT-ELYSIUM'
    """)
    cur.execute("""
        UPDATE astro_habitat.crew c
        JOIN astro_habitat.habitat h ON h.id = c.habitat_id
        JOIN astro_core.subject s ON s.code = CASE c.code
          WHEN 'C1' THEN 'SYN-02' WHEN 'C2' THEN 'SYN-01'
          WHEN 'C3' THEN 'SYN-03' WHEN 'C4' THEN 'SYN-04' END
        SET c.subject_id = s.id
        WHERE h.code = 'MARS-LT-ELYSIUM'
    """)


def main(argv):
    if not argv:
        raise SystemExit("użycie: load_canonical.py <katalog> [<katalog> ...]")
    con = connect()
    try:
        with con.cursor() as cur:
            for d in map(Path, argv):
                meta = json.loads((d / "meta.json").read_text())
                load_meta(cur, meta)
                con.commit()
                src = meta["source"]["id"]
                if (d / "observations.canonical.csv").exists():
                    load_observations(cur, d / "observations.canonical.csv", src)
                    con.commit()
                if (d / "env_observations.canonical.csv").exists():
                    load_env(cur, d / "env_observations.canonical.csv", src)
                    con.commit()
            link_mars_crew(cur)
            con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


if __name__ == "__main__":
    main(sys.argv[1:])
