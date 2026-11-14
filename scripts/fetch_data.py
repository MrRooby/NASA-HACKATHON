#!/usr/bin/env python3
"""Fetch public environment / analog datasets into data/.

Sources (see DATA_SOURCES.md sec. 2-3 and DATABASE/DATABASE_PLAN.md sec. 6):

  noaa    NOAA SWPC: GOES integral protons (6 h, 7 days), NOAA scales, alerts
          -> data/env/noaa_swpc/
  cdaweb  Curiosity RAD (CDAWeb dataset MSL_RAD_OBS-L2), yearly raw text files
          + daily means -> data/env/cdaweb_msl_rad/
  radlab  ISS RadLab (OSDR) DosTel absorbed dose rate, fetched month by month
          and aggregated to daily values -> data/env/osdr_radlab/
  eda     OSDR Environmental Data App: ISS cabin / ground CO2, T, RH and
          mission radiation doses (JSON embedded in dashboard pages)
          -> data/env/osdr_eda/
  lsda    NASA LSDA MR035G (DXA in bed rest), only the aggregate
          ("All"/"ALL"/whole-campaign) files -> data/lsda/mr035g/
  lsda_vitals  NASA LSDA human cardiovascular / sleep experiments (E066,
          DSO 467, DSO 503S, ...; see LSDA_VITALS) -> data/lsda/<slug>/;
          Excel sheets are also written as CSV when xlrd/openpyxl are
          importable (run under `uv run --no-project --with xlrd==2.0.1
          --with openpyxl==3.1.5 python -I scripts/fetch_data.py ...`)

Usage:
  python3 -I scripts/fetch_data.py --source all
  python3 -I scripts/fetch_data.py --source cdaweb --force

Only the Python 3 standard library is used. The script is idempotent: files
for closed periods (past CDAWeb years, past RadLab months) and already
downloaded LSDA files are reused unless --force is given; "live" products
(NOAA, current CDAWeb year) are re-fetched. Every source writes MANIFEST.json.

Downloaded content is treated as untrusted data: it is only parsed
(json/csv/regex), never executed.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import html
import gzip
import io
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(REPO, "data")
USER_AGENT = "open-data-fetch/1.0 (python-urllib; research hackathon)"
PAUSE_S = 2.0  # pause between consecutive requests to the same server


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def iso(t: dt.datetime) -> str:
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def log(msg: str) -> None:
    print(f"[{utcnow().strftime('%H:%M:%S')}] {msg}", flush=True)


def http_get(url: str, accept: str | None = None, timeout: float = 300,
             retries: int = 3) -> tuple[bytes, str]:
    """GET url, return (body, content_type). Retries with backoff."""
    headers = {"User-Agent": USER_AGENT}
    if accept:
        headers["Accept"] = accept
    last = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read(), r.headers.get("Content-Type", "")
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last = e
            if isinstance(e, urllib.error.HTTPError) and e.code in (400, 401, 403, 404):
                raise
            wait = 5 * attempt
            log(f"  retry {attempt}/{retries} after error: {e} (sleep {wait}s)")
            time.sleep(wait)
    raise RuntimeError(f"GET failed: {url}: {last}")


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def write_bytes(path: str, data: bytes) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".part"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, path)


def write_csv(path: str, header: list[str], rows: list[list]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".part"
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)
    os.replace(tmp, path)


def csv_rows(path: str) -> int:
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        return max(0, sum(1 for _ in csv.reader(f)) - 1)


def fmt(x: float | None, nd: int = 4) -> str:
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return ""
    return f"{x:.{nd}f}"


def file_entry(path: str, base: str, rows: int | None = None,
               columns: list[dict] | None = None, note: str | None = None) -> dict:
    e = {
        "path": os.path.relpath(path, base),
        "bytes": os.path.getsize(path),
        "sha256": sha256_file(path),
    }
    if rows is not None:
        e["rows"] = rows
    if columns:
        e["columns"] = columns
    if note:
        e["note"] = note
    return e


def write_manifest(base: str, manifest: dict) -> None:
    manifest.setdefault("fetched_at_utc", iso(utcnow()))
    manifest["generated_by"] = "scripts/fetch_data.py"
    path = os.path.join(base, "MANIFEST.json")
    write_bytes(path, (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode())
    log(f"  manifest: {os.path.relpath(path, REPO)}")


def col(name: str, unit: str, desc: str = "") -> dict:
    d = {"name": name, "unit": unit}
    if desc:
        d["description"] = desc
    return d


# ---------------------------------------------------------------- NOAA SWPC

NOAA_BASE = "https://services.swpc.noaa.gov"
NOAA_PRODUCTS = {
    "integral-protons-6-hour": "/json/goes/primary/integral-protons-6-hour.json",
    "integral-protons-7-day": "/json/goes/primary/integral-protons-7-day.json",
    "noaa-scales": "/products/noaa-scales.json",
    "alerts": "/products/alerts.json",
}


def fetch_noaa(force: bool) -> None:
    base = os.path.join(DATA, "env", "noaa_swpc")
    raw = os.path.join(base, "raw")
    now = utcnow()
    stamp = now.strftime("%Y%m%dT%H%MZ")
    files, urls = [], []
    proton_rows: dict[tuple, list] = {}
    for name, path in NOAA_PRODUCTS.items():
        url = NOAA_BASE + path
        urls.append(url)
        log(f"NOAA {name}")
        body, _ = http_get(url, accept="application/json", timeout=120)
        data = json.loads(body)  # validate
        out = os.path.join(raw, f"{name}_{stamp}.json")
        write_bytes(out, body)
        n = len(data) if isinstance(data, (list, dict)) else None
        files.append(file_entry(out, base, rows=n))
        if name.startswith("integral-protons"):
            for r in data:
                key = (r.get("time_tag"), r.get("satellite"), r.get("energy"))
                proton_rows[key] = [r.get("time_tag"), r.get("satellite"), r.get("energy"), r.get("flux")]
        time.sleep(1)

    # Cumulative proton CSV: merge with previous runs so history accumulates.
    csv_path = os.path.join(base, "goes_integral_protons.csv")
    if os.path.exists(csv_path) and not force:
        with open(csv_path, newline="", encoding="utf-8") as f:
            rd = csv.reader(f)
            next(rd, None)
            for r in rd:
                key = (r[0], int(r[1]) if r[1].isdigit() else r[1], r[2])
                proton_rows.setdefault(key, [r[0], key[1], r[2], r[3]])
    rows = sorted(proton_rows.values(), key=lambda r: (r[0], str(r[2]), str(r[1])))
    write_csv(csv_path, ["time_tag_utc", "satellite", "energy", "flux_pfu"], rows)
    times = [r[0] for r in rows]
    files.insert(0, file_entry(csv_path, base, rows=len(rows), columns=[
        col("time_tag_utc", "ISO 8601 UTC", "start of 5-min interval"),
        col("satellite", "-", "GOES satellite number (primary)"),
        col("energy", "-", "integral energy threshold, e.g. '>=10 MeV' (S-scale uses >=10 MeV)"),
        col("flux_pfu", "pfu = particles cm^-2 s^-1 sr^-1", "integral proton flux"),
    ], note=f"merged 6-hour + 7-day products, deduplicated; covers {times[0] if times else '-'} .. {times[-1] if times else '-'}; accumulates across runs"))

    write_manifest(base, {
        "source_id": "noaa_swpc",
        "title": "NOAA SWPC GOES integral protons, NOAA space weather scales, alerts",
        "urls": urls,
        "license": "US Government work (NOAA), public domain",
        "notes": [
            "Live products: each run stores a timestamped raw copy in raw/ and merges protons into goes_integral_protons.csv.",
            "noaa-scales.json: keys '-1' (yesterday), '0' (current), '1'..'3' (forecast days); R/S/G scale 0-5.",
            "S-scale thresholds on >=10 MeV flux: S1>=10, S2>=100, S3>=1e3, S4>=1e4, S5>=1e5 pfu.",
            "alerts.json: list of {product_id, issue_datetime (UTC), message} free-text alerts.",
        ],
        "files": files,
    })


# ---------------------------------------------------------------- CDAWeb RAD

CDAWEB = "https://cdaweb.gsfc.nasa.gov/WS/cdasr/1/dataviews/sp_phys/datasets/MSL_RAD_OBS-L2"
CDA_VAR = "DOSIMETRY_TOTAL_f"
CDA_ROW = re.compile(r"^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2}):(\d{2})\S*\s+(.*)$")


def fetch_cdaweb(force: bool, start_year: int = 2012) -> None:
    base = os.path.join(DATA, "env", "cdaweb_msl_rad")
    raw = os.path.join(base, "raw")
    os.makedirs(raw, exist_ok=True)
    now = utcnow()
    urls = []

    log("CDAWeb inventory + variables")
    for name in ("inventory", "variables"):
        body, _ = http_get(f"{CDAWEB}/{name}", accept="application/json", timeout=120)
        json.loads(body)
        write_bytes(os.path.join(raw, f"{name}.json"), body)
        urls.append(f"{CDAWEB}/{name}")
        time.sleep(PAUSE_S)

    # CDAWeb rejects (HTTP 503) requests spanning more than ~3 months of this
    # dataset, so data is fetched one calendar month at a time.
    y, m = start_year, 1
    while (y, m) <= (now.year, now.month):
        ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
        t0 = dt.datetime(y, m, 1, tzinfo=dt.timezone.utc)
        t1 = min(dt.datetime(ny, nm, 1, tzinfo=dt.timezone.utc), now)
        out = os.path.join(raw, f"{y:04d}", f"msl_rad_obs-l2_{CDA_VAR}_{y:04d}-{m:02d}.txt")
        empty = out + ".empty"
        closed = dt.datetime(ny, nm, 1, tzinfo=dt.timezone.utc) <= now
        if closed and not force and (os.path.exists(out) or os.path.exists(empty)):
            y, m = ny, nm
            continue
        rng = f"{t0.strftime('%Y%m%dT%H%M%SZ')},{t1.strftime('%Y%m%dT%H%M%SZ')}"
        url = f"{CDAWEB}/data/{rng}/{CDA_VAR}?format=text"
        log(f"CDAWeb {y:04d}-{m:02d}")
        try:
            body, _ = http_get(url, accept="application/json", timeout=600)
        except Exception as e:
            log(f"  FAILED: {e}")
            time.sleep(PAUSE_S)
            y, m = ny, nm
            continue
        meta = json.loads(body)
        fds = meta.get("FileDescription") or []
        time.sleep(PAUSE_S)
        if not fds:
            log(f"  no data: {meta.get('Error') or meta.get('Status')}")
            if closed:
                write_bytes(empty, json.dumps(meta).encode())
            y, m = ny, nm
            continue
        txt, _ = http_get(fds[0]["Name"], timeout=600)
        write_bytes(out, txt)
        log(f"  saved {len(txt)/1e3:.0f} kB")
        time.sleep(PAUSE_S)
        y, m = ny, nm
    urls.append(f"{CDAWEB}/data/<YYYYMM01T000000Z>,<next month YYYYMM01T000000Z>/{CDA_VAR}?format=text (one request per calendar month, header Accept: application/json; the JSON response names a temporary text file which is then downloaded)")

    # Parse raw text files -> daily means
    header_cols, units = None, None
    daily: dict[str, list] = {}  # date -> [n, sums..., n_valid...]
    raw_files = sorted(os.path.relpath(os.path.join(dp, f), raw)
                       for dp, _, fs in os.walk(raw) for f in fs if f.endswith(".txt"))
    total_obs = 0
    for fn in raw_files:
        with open(os.path.join(raw, fn), encoding="utf-8", errors="replace") as f:
            lines = f.read().splitlines()
        for i, line in enumerate(lines):
            if line.startswith("EPOCH") and header_cols is None:
                header_cols = line.split()[1:]
                units = lines[i + 1].split()[2:] if i + 1 < len(lines) else None
            m = CDA_ROW.match(line)
            if not m:
                continue
            d, mo, y = m.group(1), m.group(2), m.group(3)
            vals = []
            for tok in m.group(7).split():
                try:
                    v = float(tok)
                except ValueError:
                    v = float("nan")
                if v <= -1e30 or math.isnan(v):  # ISTP fill value -1.0E+31
                    v = float("nan")
                vals.append(v)
            date = f"{y}-{mo}-{d}"
            k = len(vals)
            acc = daily.setdefault(date, [0] + [0.0] * k + [0] * k + [float("inf")] * k + [float("-inf")] * k)
            acc[0] += 1
            for j, v in enumerate(vals):
                if not math.isnan(v):
                    acc[1 + j] += v
                    acc[1 + k + j] += 1
                    acc[1 + 2 * k + j] = min(acc[1 + 2 * k + j], v)
                    acc[1 + 3 * k + j] = max(acc[1 + 3 * k + j], v)
            total_obs += 1

    header_cols = header_cols or ["TOTAL_DOSE_B", "RTG_CORRECTED_DOSE_B", "TOTAL_DOSE_E"]
    k = len(header_cols)
    out_rows = []
    for date in sorted(daily):
        acc = daily[date]
        row = [date, acc[0]]
        for j in range(k):
            n = acc[1 + k + j]
            row.append(fmt(acc[1 + j] / n if n else None, 3))
        for j in range(k):
            n = acc[1 + k + j]
            row += [fmt(acc[1 + 2 * k + j] if n else None, 3), fmt(acc[1 + 3 * k + j] if n else None, 3)]
        out_rows.append(row)
    names = [h.lower() for h in header_cols]
    hdr = ["date_utc", "n_obs"] + [f"{n}_uGy_per_day_mean" for n in names]
    for n in names:
        hdr += [f"{n}_uGy_per_day_min", f"{n}_uGy_per_day_max"]
    daily_path = os.path.join(base, "msl_rad_daily.csv")
    write_csv(daily_path, hdr, out_rows)
    log(f"CDAWeb daily rows: {len(out_rows)} (from {total_obs} observations)")

    unit_txt = " / ".join(sorted(set(units or []))) or "uGray/day_(good_Q)"
    columns = [col("date_utc", "YYYY-MM-DD (UTC Earth date, not sol)"),
               col("n_obs", "count", "number of RAD observations in the day (nominal cadence ~16 min, often ~1 h in L2)")]
    desc = {
        "total_dose_b": "absorbed dose rate in silicon detector B, total (includes MMRTG background)",
        "rtg_corrected_dose_b": "absorbed dose rate in silicon detector B with MMRTG (rover power source) contribution subtracted",
        "total_dose_e": "absorbed dose rate in detector E (tissue-equivalent plastic)",
    }
    for n in names:
        columns.append(col(f"{n}_uGy_per_day_mean", "uGy/day", "daily mean of quality-filtered observation dose rates; " + desc.get(n, "")))
    for n in names:
        columns.append(col(f"{n}_uGy_per_day_min", "uGy/day"))
        columns.append(col(f"{n}_uGy_per_day_max", "uGy/day"))

    files = [file_entry(daily_path, base, rows=len(out_rows), columns=columns,
                        note=f"dates {out_rows[0][0] if out_rows else '-'} .. {out_rows[-1][0] if out_rows else '-'}")]
    for fn in raw_files:
        p = os.path.join(raw, fn)
        nobs = sum(1 for line in open(p, encoding="utf-8", errors="replace") if CDA_ROW.match(line))
        files.append(file_entry(p, base, rows=nobs, note="raw CDAWeb text listing (ISTP header + data)"))
    for fn in ("inventory.json", "variables.json"):
        files.append(file_entry(os.path.join(raw, fn), base))

    write_manifest(base, {
        "source_id": "cdaweb_msl_rad",
        "title": "MSL Curiosity RAD Level 2 dosimetry on Mars surface (CDAWeb MSL_RAD_OBS-L2, variable DOSIMETRY_TOTAL_f)",
        "urls": urls,
        "license": "NASA open data; CDAWeb rules of use: 'The RAD data are archived as fully citable data. Please acknowledge the RAD Principal Investigator Dr. Hassler of Southwest Research Institute Boulder.'",
        "unit_source": f"units row of the CDAWeb text listing: {unit_txt}",
        "notes": [
            "DOSIMETRY_TOTAL_f = quality-filtered variant (data flagged by FLAGGED_DATA removed); rows with fill values are skipped per column.",
            "Three columns: TOTAL_DOSE_B (Si), RTG_CORRECTED_DOSE_B (Si, MMRTG background removed), TOTAL_DOSE_E (tissue-equivalent plastic). For a 'Mars surface GCR dose' the RTG-corrected B value is the physically cleanest; E is closer to tissue. Choose one explicitly in the importer.",
            "Dose rates are absorbed dose (Gy), not dose equivalent (Sv). Convert to mGy/day by /1000.",
            "Inventory starts 2012-08-17 (landing 2012-08-06); large gaps exist (e.g. 2012-08-18 .. 2013-03-22, 2024-03/04).",
            "Days are UTC Earth days; one sol = 24 h 39 min.",
        ],
        "files": files,
    })


# ---------------------------------------------------------------- RadLab

RADLAB = "https://visualization.osdr.nasa.gov/radlab/api/"
RADLAB_COLS = ["absorbed_dose_rate", "dose_equivalent_rate", "module"]
WEIGHT_CAP_S = 300.0  # max seconds a single sample may represent


def _radlab_url(t0: str, t1: str) -> str:
    q = ("spacecraft=ISS&instrument=DosTel"
         f"&timestamp%3E={urllib.parse.quote(t0)}&timestamp%3C{urllib.parse.quote(t1)}&"
         + "&".join(RADLAB_COLS) + "&format=csv")
    return RADLAB + "?" + q


def _parse_ts(s: str) -> float:
    s = s.strip().rstrip("Z")
    fmtstr = "%Y-%m-%dT%H:%M:%S.%f" if "." in s else "%Y-%m-%dT%H:%M:%S"
    return dt.datetime.strptime(s, fmtstr).replace(tzinfo=dt.timezone.utc).timestamp()


def _radlab_aggregate(text: str) -> list[list]:
    """Aggregate RadLab CSV text to daily rows per (instrument_id, module)."""
    rd = csv.DictReader(io.StringIO(text))
    series: dict[tuple, list] = {}
    for r in rd:
        try:
            t = _parse_ts(r["timestamp"])
            v = float(r["absorbed_dose_rate"])
        except (KeyError, ValueError, TypeError):
            continue
        dq = r.get("dose_equivalent_rate") or ""
        try:
            h = float(dq) if dq != "" else float("nan")
        except ValueError:
            h = float("nan")
        series.setdefault((r.get("instrument_id", ""), r.get("module", "")), []).append((t, v, h))
    out = []
    for (inst, module), pts in series.items():
        pts.sort()
        days: dict[str, dict] = {}
        for i, (t, v, h) in enumerate(pts):
            dt_next = pts[i + 1][0] - t if i + 1 < len(pts) else WEIGHT_CAP_S
            w = min(max(dt_next, 0.0), WEIGHT_CAP_S)
            day = dt.datetime.fromtimestamp(t, dt.timezone.utc).strftime("%Y-%m-%d")
            a = days.setdefault(day, {"n": 0, "s": 0.0, "ws": 0.0, "w": 0.0, "mn": float("inf"),
                                      "mx": float("-inf"), "hn": 0, "hws": 0.0, "hw": 0.0})
            a["n"] += 1
            a["s"] += v
            a["ws"] += v * w
            a["w"] += w
            a["mn"] = min(a["mn"], v)
            a["mx"] = max(a["mx"], v)
            if not math.isnan(h):
                a["hn"] += 1
                a["hws"] += h * w
                a["hw"] += w
        for day, a in days.items():
            tw = a["ws"] / a["w"] if a["w"] > 0 else a["s"] / a["n"]
            cover_h = a["w"] / 3600.0
            hmean = a["hws"] / a["hw"] if a["hw"] > 0 else None
            out.append([day, inst, module, a["n"], fmt(cover_h, 2), fmt(a["s"] / a["n"], 4), fmt(tw, 4),
                        fmt(a["mn"], 4), fmt(a["mx"], 4), fmt(tw * 24.0, 2), fmt(hmean, 4)])
    out.sort(key=lambda r: (r[0], r[1], r[2]))
    return out


RADLAB_HDR = ["date_utc", "instrument_id", "module", "n_samples", "coverage_hours",
              "absorbed_dose_rate_uGy_per_h_sample_mean", "absorbed_dose_rate_uGy_per_h_time_weighted_mean",
              "absorbed_dose_rate_uGy_per_h_min", "absorbed_dose_rate_uGy_per_h_max",
              "absorbed_dose_uGy_per_day_est", "dose_equivalent_rate_uSv_per_h_time_weighted_mean"]


def fetch_radlab(force: bool, start: str = "2009-07", end: str = "2024-12") -> None:
    base = os.path.join(DATA, "env", "osdr_radlab")
    monthly = os.path.join(base, "monthly_daily")
    raw = os.path.join(base, "raw_sample")
    os.makedirs(monthly, exist_ok=True)
    y, m = map(int, start.split("-"))
    ey, em = map(int, end.split("-"))
    now = utcnow()

    # one raw sample day, kept verbatim for reference
    sample = os.path.join(raw, "radlab_DosTel_2022-04-01.csv")
    if not os.path.exists(sample) or force:
        log("RadLab raw sample day 2022-04-01")
        u = (RADLAB + "?spacecraft=ISS&instrument=DosTel&timestamp%3E=2022-04-01&timestamp%3C2022-04-02"
             "&absorbed_dose_rate&dose_equivalent_rate&module&latitude&longitude&altitude&format=csv")
        body, _ = http_get(u, timeout=300)
        write_bytes(sample, body)
        time.sleep(PAUSE_S)

    while (y, m) <= (ey, em):
        ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
        t0, t1 = f"{y:04d}-{m:02d}-01", f"{ny:04d}-{nm:02d}-01"
        out = os.path.join(monthly, f"{y:04d}-{m:02d}.csv")
        month_closed = dt.datetime(ny, nm, 1, tzinfo=dt.timezone.utc) <= now
        if os.path.exists(out) and month_closed and not force:
            y, m = ny, nm
            continue
        url = _radlab_url(t0, t1)
        log(f"RadLab {t0} .. {t1}")
        try:
            body, ctype = http_get(url, timeout=900)
        except Exception as e:  # keep going, missing months can be re-run
            log(f"  FAILED: {e}")
            time.sleep(PAUSE_S)
            y, m = ny, nm
            continue
        text = body.decode("utf-8", errors="replace")
        if text.lstrip().startswith("<"):
            log(f"  server error page: {text[:200]!r}")
            time.sleep(PAUSE_S)
            y, m = ny, nm
            continue
        rows = _radlab_aggregate(text)
        write_csv(out, RADLAB_HDR, rows)
        log(f"  {len(body)/1e6:.1f} MB raw -> {len(rows)} daily rows")
        time.sleep(PAUSE_S)
        y, m = ny, nm

    all_rows = []
    for fn in sorted(os.listdir(monthly)):
        if fn.endswith(".csv"):
            with open(os.path.join(monthly, fn), newline="", encoding="utf-8") as f:
                rd = csv.reader(f)
                next(rd, None)
                all_rows.extend(rd)
    daily = os.path.join(base, "radlab_dostel_daily.csv")
    write_csv(daily, RADLAB_HDR, all_rows)
    dates = sorted(r[0] for r in all_rows)
    log(f"RadLab daily rows: {len(all_rows)}")

    columns = [
        col("date_utc", "YYYY-MM-DD (UTC)"),
        col("instrument_id", "-", "DosTel1 / DosTel2 (two telescopes of the DOSIS-3D DOSTEL instrument)"),
        col("module", "-", "ISS module where the detector was located (Columbus for DOSTEL)"),
        col("n_samples", "count"),
        col("coverage_hours", "h", f"sum of per-sample weights (time to next sample, capped at {int(WEIGHT_CAP_S)} s); <~20 h means incomplete day"),
        col("absorbed_dose_rate_uGy_per_h_sample_mean", "uGy/h", "plain mean of samples; biased high because cadence is denser inside the SAA"),
        col("absorbed_dose_rate_uGy_per_h_time_weighted_mean", "uGy/h", "time-weighted mean (recommended)"),
        col("absorbed_dose_rate_uGy_per_h_min", "uGy/h"),
        col("absorbed_dose_rate_uGy_per_h_max", "uGy/h"),
        col("absorbed_dose_uGy_per_day_est", "uGy/day", "time-weighted mean x 24 h"),
        col("dose_equivalent_rate_uSv_per_h_time_weighted_mean", "uSv/h", "empty for DosTel (not provided by the API for this instrument)"),
    ]
    files = [file_entry(daily, base, rows=len(all_rows), columns=columns,
                        note=f"dates {dates[0] if dates else '-'} .. {dates[-1] if dates else '-'}")]
    files.append(file_entry(sample, base, rows=csv_rows(sample),
                            note="verbatim API output for one day (all requested columns incl. latitude/longitude/altitude)"))
    for fn in sorted(os.listdir(monthly)):
        p = os.path.join(monthly, fn)
        files.append(file_entry(p, base, rows=csv_rows(p)))

    write_manifest(base, {
        "source_id": "osdr_radlab",
        "title": "ISS RadLab (NASA OSDR) - DOSTEL absorbed dose rate in Columbus, aggregated to daily values",
        "urls": [RADLAB + "?spacecraft=ISS&instrument=DosTel&timestamp>=<month start>&timestamp<<next month start>&absorbed_dose_rate&dose_equivalent_rate&module&format=csv",
                 "https://visualization.osdr.nasa.gov/radlab/gui/data-api (documentation)"],
        "license": "NASA OSDR open data (DORELI project data, ASI / DLR DOSTEL); cite NASA OSDR RadLab",
        "unit_source": "RadLab Data API documentation field table: absorbed_dose_rate = uGy/hour, dose_equivalent_rate = uSv/hour, flux = cm^-2 sr^-1 s^-1, altitude = km, B = nT",
        "notes": [
            "Raw data is ~2.5 MB per month (~90 MB/year, >50 MB limit), so only daily aggregates are kept; raw is fetched month by month and discarded. One raw day is kept in raw_sample/.",
            "The API also serves other ISS instruments (Lidal, REM/Timepix, Liulin-5); only DosTel is fetched here.",
            "DosTel data in RadLab spans roughly 2009 .. 2024 with gaps (e.g. none around 2012-01, 2023-09, after 2024-06/2024-12).",
            "Absorbed dose rate in silicon detector, not tissue; dose equivalent is not available for DosTel.",
            "API key syntax: bare key = add column, key=value filter, timestamp%3E= / timestamp%3C for ranges (see documentation).",
        ],
        "files": files,
    })


# ---------------------------------------------------------------- OSDR EDA

EDA = "https://visualization.osdr.nasa.gov/eda/"


def _eda_obj(v) -> dict:
    """Embedded series are JSON-encoded strings (possibly '""' when absent)."""
    for _ in range(2):
        if isinstance(v, str):
            try:
                v = json.loads(v) if v.strip() else {}
            except ValueError:
                return {}
    return v if isinstance(v, dict) else {}


def _eda_num(v) -> str:
    """Normalise a numeric cell; 'none'/'NaN'/null/non-numeric -> ''."""
    if v is None:
        return ""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return ""
    if math.isnan(f) or math.isinf(f):
        return ""
    return repr(round(f, 6)) if isinstance(v, float) or "." in str(v) else str(int(f))


def fetch_eda(force: bool) -> None:
    base = os.path.join(DATA, "env", "osdr_eda")
    raw = os.path.join(base, "raw")
    os.makedirs(raw, exist_ok=True)
    log("EDA index")
    idx, _ = http_get(EDA, timeout=120)
    idx_s = idx.decode("utf-8", errors="replace")
    missions = []
    for mid in re.findall(r'id="dash_([A-Za-z0-9._-]+)"', idx_s):
        if mid not in missions:
            missions.append(mid)
    log(f"  missions: {missions}")
    time.sleep(PAUSE_S)

    tele_rows, rad_rows, mil_rows, info = [], [], [], []
    failed = {}
    for mid in missions:
        rawp = os.path.join(raw, f"{mid}.json.gz")
        if os.path.exists(rawp) and not force:
            with gzip.open(rawp, "rt", encoding="utf-8") as f:
                d = json.load(f)
        else:
            url = EDA + "dashboard_" + urllib.parse.quote(mid)
            log(f"EDA {mid}")
            try:
                body, _ = http_get(url, timeout=180)
            except Exception as e:
                failed[mid] = str(e)
                log(f"  FAILED {e}")
                time.sleep(PAUSE_S)
                continue
            s = body.decode("utf-8", errors="replace")
            m = re.search(r'<script id="data" type="application/json">(.*?)</script>', s, re.S)
            if not m:
                failed[mid] = "no embedded <script id=data> JSON"
                time.sleep(PAUSE_S)
                continue
            d = json.loads(m.group(1))
            write_bytes(rawp, gzip.compress((json.dumps(d, ensure_ascii=False) + "\n").encode(), mtime=0))
            time.sleep(PAUSE_S)
        title = d.get("mission_title", "")
        info.append([mid, title, d.get("mission_link", ""), html.unescape(d.get("mission_description_addendum", "") or "")])
        tel = _eda_obj(d.get("telemetry_data"))
        rad = _eda_obj(d.get("radiation_data"))
        times = tel.get("time") or []
        keys = ["temperature_ground", "temperature_iss", "rh_ground", "rh_iss", "co2_ground", "co2_iss"]
        for i, t in enumerate(times):
            row = [mid, t]
            for k in keys:
                arr = tel.get(k) or []
                v = arr[i] if i < len(arr) else None
                row.append(_eda_num(v))
            tele_rows.append(row)
        for kind, ms in (("telemetry", tel.get("milestones") or {}), ("radiation", rad.get("milestones") or {})):
            for name, when in ms.items():
                mil_rows.append([mid, kind, name, when])
        rt = rad.get("time") or []
        for i, t in enumerate(rt):
            row = [mid, t]
            for k in ("gcr", "saa", "total", "accumulated"):
                arr = rad.get(k) or []
                v = arr[i] if i < len(arr) else None
                row.append(_eda_num(v))
            rad_rows.append(row)

    tele_hdr = ["mission", "time_utc", "temp_degC_ground", "temp_degC_iss", "rh_percent_ground",
                "rh_percent_iss", "co2_ppm_ground", "co2_ppm_iss"]
    tele_p = os.path.join(base, "eda_telemetry_raw.csv")
    write_csv(tele_p, tele_hdr, tele_rows)

    # daily means per mission
    agg: dict[tuple, list] = {}
    for r in tele_rows:
        key = (r[0], str(r[1])[:10])
        a = agg.setdefault(key, [[0.0, 0] for _ in range(6)])
        for j in range(6):
            v = r[2 + j]
            if v == "" or v is None:
                continue
            try:
                fv = float(v)
            except ValueError:
                continue
            a[j][0] += fv
            a[j][1] += 1
    daily_rows = []
    for (mid, day), a in sorted(agg.items()):
        daily_rows.append([mid, day, max(x[1] for x in a)] + [fmt(x[0] / x[1] if x[1] else None, 2) for x in a])
    daily_p = os.path.join(base, "eda_telemetry_daily.csv")
    write_csv(daily_p, ["mission", "date_utc", "n_samples"] + [h + "_mean" for h in tele_hdr[2:]], daily_rows)

    rad_p = os.path.join(base, "eda_radiation_daily.csv")
    write_csv(rad_p, ["mission", "date", "gcr_mGy_per_day", "saa_mGy_per_day", "total_mGy_per_day", "accumulated_mGy"], rad_rows)
    mil_p = os.path.join(base, "eda_milestones.csv")
    write_csv(mil_p, ["mission", "series", "milestone", "datetime"], mil_rows)
    info_p = os.path.join(base, "eda_missions.csv")
    write_csv(info_p, ["mission", "title", "link", "note"], info)

    tdates = sorted(str(r[1]) for r in tele_rows)
    tcols = [col("mission", "-", "OSDR payload id, e.g. RR-1 (Rodent Research), APEX, VEG"),
             col("time_utc", "YYYY-MM-DD HH:MM:SS GMT", "Controller_Time_GMT in the EDA table; cadence 1, 5, 10 or 15 min depending on mission")]
    for h, u, dsc in (("temp_degC_ground", "degC", "ground-control habitat"), ("temp_degC_iss", "degC", "ISS cabin / flight hardware"),
                      ("rh_percent_ground", "% RH", "ground-control habitat"), ("rh_percent_iss", "% RH", "ISS cabin / flight hardware"),
                      ("co2_ppm_ground", "ppm", "ground-control chamber (only RR missions)"), ("co2_ppm_iss", "ppm", "ISS cabin (only RR missions)")):
        tcols.append(col(h, u, dsc))
    files = [
        file_entry(tele_p, base, rows=len(tele_rows), columns=tcols,
                   note=f"{len(set(r[0] for r in tele_rows))} missions; times {tdates[0] if tdates else '-'} .. {tdates[-1] if tdates else '-'}"),
        file_entry(daily_p, base, rows=len(daily_rows), note="daily means of eda_telemetry_raw.csv per mission; same units, column suffix _mean"),
        file_entry(rad_p, base, rows=len(rad_rows), columns=[
            col("mission", "-"), col("date", "YYYY-MM-DD"),
            col("gcr_mGy_per_day", "mGy/day", "galactic cosmic ray absorbed dose, in water (converted from Si)"),
            col("saa_mGy_per_day", "mGy/day", "South Atlantic Anomaly (trapped protons) absorbed dose"),
            col("total_mGy_per_day", "mGy/day", "gcr + saa"),
            col("accumulated_mGy", "mGy", "cumulative sum of total over the mission (cumulative, NOT per day)"),
        ]),
        file_entry(mil_p, base, rows=len(mil_rows)),
        file_entry(info_p, base, rows=len(info)),
    ]
    for fn in sorted(os.listdir(raw)):
        files.append(file_entry(os.path.join(raw, fn), base, note="embedded <script id=data> JSON extracted from dashboard page (gzip)"))

    write_manifest(base, {
        "source_id": "osdr_eda",
        "title": "OSDR Environmental Data App - ISS / ground telemetry (T, RH, CO2) and radiation per Rodent Research / APEX / VEG mission",
        "urls": [EDA, EDA + "dashboard_<MISSION>", EDA + "static/js/telemetry_plots.js", EDA + "static/js/radiation_plots.js"],
        "license": "NASA OSDR open data",
        "unit_source": "axis labels in EDA static/js/telemetry_plots.js ('Degrees [C]', 'RH [%]', 'CO2 [ppm]') and radiation_plots.js ('Dose [mGy/day]'); table headers Temp_degC_*, RH_percent_*, CO2_ppm_*",
        "notes": [
            "*_iss columns = ISS cabin / flight unit sensors, *_ground = ground-control habitat; ground dates were shifted to match flight dates (per EDA mission note).",
            "CO2 is present only for RR missions (APEX/VEG pages carry only temperature and RH).",
            "Radiation doses: 'Doses are in water based on standard conversion from dose in silicon ... preliminary analysis ... SRAG, NASA-JSC'. accumulated_mGy is cumulative.",
            "Values are mission-period snapshots (2014+), not a continuous ISS record.",
            f"Missions that failed: {failed}" if failed else "All listed missions fetched.",
        ],
        "files": files,
    })


# ---------------------------------------------------------------- LSDA MR035G

NLSP = "https://nlsp.nasa.gov/api/v1"
MR035G_ID = "4469ebdc-0a65-55e8-bbff-3cf6b044c4c6"
AGG_RE = re.compile(r"_(All|ALL)(_|$)")


def _lsda_is_aggregate(dataset_label: str, file_label: str) -> bool:
    if dataset_label == "MR035G_Campaign_1_DXA":  # one file per scan region, all 3 subjects
        return True
    if dataset_label == "MR035G_Campaign_3_DXA_ReadMe":  # calibration notes
        return True
    # '_ALL_DATA_1131' in the AG pilot screening set is one subject's export
    return bool(AGG_RE.search(file_label)) and not re.search(r"_\d{4}$", file_label)


def fetch_lsda(force: bool, all_files: bool = False) -> None:
    base = os.path.join(DATA, "lsda", "mr035g")
    filesdir = os.path.join(base, "files")
    os.makedirs(filesdir, exist_ok=True)
    url = f"{NLSP}/data/experiments/{MR035G_ID}/full"
    log("LSDA MR035G metadata")
    body, _ = http_get(url, accept="application/json", timeout=180)
    full = json.loads(body)
    rec = full.get("record", {})
    datasets = full.get("related", {}).get("datasets") or []
    meta = {
        "experiment_id": rec.get("experiment_id"),
        "title": rec.get("experiment_title"),
        "doi": rec.get("__doi"),
        "archive_status": rec.get("archive_status"),
        "missions": rec.get("missions"),
        "parameter_name": rec.get("parameter_name"),
        "datasets": datasets,
    }
    meta_p = os.path.join(base, "mr035g_metadata.json")
    write_bytes(meta_p, (json.dumps(meta, indent=1, ensure_ascii=False) + "\n").encode())
    time.sleep(PAUSE_S)

    selected, skipped = [], 0
    for ds in datasets:
        stack = list(ds.get("children") or [])
        while stack:
            n = stack.pop()
            if n.get("type") == "folder":
                stack.extend(n.get("children") or [])
                continue
            if n.get("type") != "file":
                continue
            if all_files or _lsda_is_aggregate(ds.get("label", ""), n.get("label", "")):
                selected.append((ds, n))
            else:
                skipped += 1
    log(f"  {len(selected)} aggregate files selected, {skipped} per-subject files skipped")

    entries = []
    for ds, n in sorted(selected, key=lambda x: (x[0]["label"], x[1]["label"])):
        label = re.sub(r"[^A-Za-z0-9._-]", "_", n["label"])
        sub = os.path.join(filesdir, re.sub(r"[^A-Za-z0-9._-]", "_", ds["label"]))
        existing = [p for p in (os.path.join(sub, label + ext) for ext in (".csv", ".txt")) if os.path.exists(p)]
        if existing and not force:
            path = existing[0]
        else:
            furl = f"{NLSP}/files/{urllib.parse.quote(n['key'])}/download"
            body, ctype = http_get(furl, timeout=120)
            ext = ".csv" if "csv" in ctype.lower() and not label.lower().endswith("readme") else ".txt"
            path = os.path.join(sub, label + ext)
            write_bytes(path, body)
            log(f"  {os.path.relpath(path, base)} ({len(body)} B)")
            time.sleep(1.0)
        hdr = None
        if path.endswith(".csv"):
            with open(path, newline="", encoding="utf-8", errors="replace") as f:
                hdr = next(csv.reader(f), None)
        e = file_entry(path, base, rows=csv_rows(path) if path.endswith(".csv") else None,
                       note=f"dataset={ds['label']}; file_key={n['key']}")
        if hdr:
            e["header"] = hdr
        entries.append(e)

    write_manifest(base, {
        "source_id": "lsda_mr035g",
        "title": "NASA LSDA MR035G Bone Densitometry Assessment (Flight Analog) - DXA in bed rest",
        "doi": "10.83263/7myc-5j86",
        "urls": [url, f"{NLSP}/files/<file key>/download"],
        "license": "CC0 1.0 (DataCite record for DOI 10.83263/7myc-5j86); archive_status: " + str(rec.get("archive_status")),
        "notes": [
            "No login needed: metadata from /api/v1/data/experiments/<id>/full (related.datasets is the file tree), files from /api/v1/files/<key>/download (the endpoint used by the NLSP web file explorer).",
            "Only aggregate files are downloaded (Campaign 1 per-region files, Campaign 3 C3A/C3B '_All_' files, MEDES '_ALL' files, Campaign 3 ReadMe). Per-subject files (Campaign 3 groups C3C..C3H, AG pilot analyzed/screen) are skipped; use --lsda-all-files to fetch everything (~1060 small files, ~2.2 MB).",
            "Units are NOT stated in most files (exception: MEDES WB 'WB Fat Mass (g)'). Hologic export conventions apply: *_BMD g/cm^2, *_BMC g, *_AREA cm^2, *_FAT/*_LEAN/*_MASS g, *_PFAT %, T-/Z-score in SD (dimensionless), WEIGHT kg, HEIGHT cm. Verify ranges per file before import.",
            "Subject codes: Campaign 1 'C1G000n'; Campaign 3 CAMPAIGN (C3A/C3B) + numeric SUBJECT; MEDES 'A1'.. with IDENTIFIER1 'MEDES'/'MEDES 2' (two campaigns). Files with *_Bone suffix are wide Hologic exports (many columns, incl. scanner metadata).",
            "MEDES files have MENOPAUSE_YEAR = -1 for 'not applicable/unknown'.",
            "Dates are US format M/D/YYYY. Campaign 3 rows carry TEST_PHASE (PRE_TEST/IN_TEST/POST_TEST/NA) and BR_DAY; NA phase = 6-month / 1-year follow-up. Campaign 1 files have no phase column (derive from dates).",
            "Scans were done in triplicate (separate rows, distinct SCANID) - average per subject/session in the importer.",
            "Campaign 3 ReadMe: BMD x1.0120, BMC x1.0107, area x0.9987 correction applied for scans between 2006-06-09 and 2006-08-10.",
        ],
        "files": [file_entry(meta_p, base, note="experiment record subset + full dataset/file tree")] + entries,
    })


# ---------------------------------------------------------------- LSDA human vitals

# experiment_identifier -> (slug, NLSP experiment id). The id is the record "id"
# (= path segment of /data/experiments/<id>/full), not the "GUID" field.
LSDA_VITALS = {
    "178066": ("e066_178066", "ff0398fd-0abc-589d-883c-7e55aa73831c"),
    "DSO 467": ("dso467", "c01c5fbf-97e4-5a9d-b404-3bfb19ef237c"),
    "DSO 503S": ("dso503s", "53b325c3-cacb-5828-82a9-8174ad72e556"),
    "284080": ("ar_card3_284080", "d3644feb-1719-5a42-96ff-685fc72fade6"),
    "3.1.1": ("mir18_3_1_1", "fd8098b1-8859-572c-a546-184360f7d5af"),
    "DSO 465": ("dso465", "ae2d7b7f-0e69-5ef2-a044-bf2758539aff"),
    "DSO 470": ("dso470", "004b2d69-c1e0-571f-9667-76f040ddbc72"),
    "DSO 331": ("dso331", "6867ff72-b080-5d65-ae5a-ab0a5f2d4fc1"),
    "NEEMO-ACTIWATCH": ("neemo_actiwatch", "62a350af-45b3-58f7-badb-7fcf7f6772a2"),
    "LMLSTP3.4": ("lmlstp3_4", "caf12d45-8bd3-5e0e-badd-e9473dd7cb21"),
    "LSAHNEWSV11_1": ("lsah_v11_1", "401485a6-47e2-5a23-a965-17bc23a3e8b3"),
    "LSAHNEWSV7_2_2": ("lsah_v7_2_2", "df39f06f-c34a-52e4-97e6-ed5a2cdf77aa"),
    "LSAHNEWSV8_1_2": ("lsah_v8_1_2", "d9389707-a840-5812-9746-9cda98923235"),
}
LSDA_TABULAR_EXT = {"xls", "xlsx", "csv", "txt"}
LSDA_DOC_EXT = {"pdf"}
LSDA_MAX_BYTES = 50 * 1024 * 1024
LSDA_PAUSE_S = 0.5
# Hand-written description of what the files contain (filled after inspecting
# the downloads; keyed by slug -> {file path relative to the slug dir: {...}}).
LSDA_VITALS_CONTENT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lsda_vitals_content.json")


def _safe(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]", "_", s)


def _http_get_limited(url: str, limit: int, timeout: float = 300) -> tuple[bytes | None, str, int | None]:
    """GET url, but stop (return None body) if Content-Length / body exceeds limit."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        ctype = r.headers.get("Content-Type", "")
        clen = r.headers.get("Content-Length")
        if clen and int(clen) > limit:
            return None, ctype, int(clen)
        buf = r.read(limit + 1)
        if len(buf) > limit:
            return None, ctype, None
        return buf, ctype, len(buf)


def _excel_to_csv(path: str) -> list[dict]:
    """Write every sheet of an .xls/.xlsx as <file>__<sheet>.csv next to it.

    Needs xlrd (xls) / openpyxl (xlsx); returns [] with a log hint if missing.
    Cells are written as their stored values (numbers as repr, dates as Excel
    serials for xls - converted to ISO when the cell is date-formatted).
    """
    out = []
    stem = path
    try:
        if path.lower().endswith(".xls"):
            import xlrd  # type: ignore
            wb = xlrd.open_workbook(path, on_demand=True)
            for sh in wb.sheets():
                rows = []
                for i in range(sh.nrows):
                    row = []
                    for j in range(sh.ncols):
                        c = sh.cell(i, j)
                        if c.ctype == xlrd.XL_CELL_DATE:
                            try:
                                row.append(xlrd.xldate.xldate_as_datetime(c.value, wb.datemode).isoformat())
                            except Exception:
                                row.append(c.value)
                        elif c.ctype == xlrd.XL_CELL_NUMBER and float(c.value).is_integer():
                            row.append(int(c.value))
                        else:
                            row.append(c.value)
                    rows.append(row)
                out.append((sh.name, rows))
        else:
            import openpyxl  # type: ignore
            wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
            for ws in wb.worksheets:
                rows = [["" if v is None else (v.isoformat() if hasattr(v, "isoformat") else v) for v in r]
                        for r in ws.iter_rows(values_only=True)]
                out.append((ws.title, rows))
    except ImportError as e:
        log(f"  ({e.name} missing: run via `uv run --no-project --with xlrd==2.0.1 --with openpyxl==3.1.5 python -I scripts/fetch_data.py ...` to also write per-sheet CSVs)")
        return []
    res = []
    for name, rows in out:
        while rows and not any(str(v).strip() for v in rows[-1]):
            rows.pop()
        p = f"{stem}__{_safe(name)}.csv"
        if not rows:  # empty placeholder sheet (Sheet2/Sheet3...): no CSV
            if os.path.exists(p):
                os.remove(p)
            continue
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p + ".part", "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerows(rows)
        os.replace(p + ".part", p)
        res.append({"sheet": name, "csv": p, "rows": len(rows), "cols": max((len(r) for r in rows), default=0)})
    return res


def fetch_lsda_vitals(force: bool, ids: list[str] | None = None) -> None:
    content_all = {}
    if os.path.exists(LSDA_VITALS_CONTENT_PATH):
        with open(LSDA_VITALS_CONTENT_PATH, encoding="utf-8") as f:
            content_all = json.load(f)
    for ident in ids or list(LSDA_VITALS):
        if ident not in LSDA_VITALS:
            log(f"LSDA vitals: unknown identifier {ident!r} (known: {', '.join(LSDA_VITALS)})")
            continue
        slug, eid = LSDA_VITALS[ident]
        base = os.path.join(DATA, "lsda", slug)
        os.makedirs(base, exist_ok=True)
        url = f"{NLSP}/data/experiments/{eid}/full"
        log(f"LSDA {ident} -> lsda/{slug}")
        body, _ = http_get(url, accept="application/json", timeout=180)
        full = json.loads(body)
        rec = full.get("record", {})
        rel = full.get("related", {})
        datasets = rel.get("datasets") or []
        pubs = [it.get("citation") for it in (rel.get("publications") or {}).get("items", []) if it.get("citation")]
        meta = {
            "experiment_id": rec.get("experiment_id"),
            "experiment_identifier": ident,
            "title": rec.get("experiment_title"),
            "doi": rec.get("__doi"),
            "archive_status": rec.get("archive_status"),
            "missions": rec.get("missions"),
            "parameter_name": rec.get("parameter_name"),
            "description": rec.get("experiment_description"),
            "publications": pubs,
            "datasets": datasets,
        }
        meta_p = os.path.join(base, "experiment_metadata.json")
        write_bytes(meta_p, (json.dumps(meta, indent=1, ensure_ascii=False) + "\n").encode())
        time.sleep(LSDA_PAUSE_S)

        files, skipped, seen_sha = [], [], {}
        for ds in datasets:
            info = ds.get("dataset_info") or {}
            stack = [(n, []) for n in (ds.get("children") or [])]
            while stack:
                n, parents = stack.pop(0)
                if n.get("type") == "folder":
                    stack.extend((c, parents + [n.get("label", "")]) for c in (n.get("children") or []))
                    continue
                if n.get("type") != "file":
                    continue
                ext = (n.get("ext") or n["label"].rsplit(".", 1)[-1]).lower()
                furl = f"{NLSP}/files/{urllib.parse.quote(n['key'])}/download"
                desc = {
                    "dataset_catalog": info.get("dataset_catalog") or ds.get("label"),
                    "dataset_name": info.get("dataset_name"),
                    "dataset_description": " ".join(info.get("dataset_description") or [])[:2000] or None,
                    "processing_level": info.get("processing_level"),
                    "file_label": n["label"],
                    "file_key": n["key"],
                    "url": furl,
                }
                if ext not in LSDA_TABULAR_EXT | LSDA_DOC_EXT:
                    skipped.append({**desc, "reason": f"figure/image ({ext}) - a rendered graph, not machine-readable data"})
                    continue
                name = _safe(n["label"])
                # NLSP labels look like '<catalog>.<ext>_<mission>_<id>_<stamp>.<ext>'; keep it but cap length
                if len(name) > 120:
                    name = name[:100] + "." + ext
                sub = os.path.join(base, "files", _safe(desc["dataset_catalog"] or "dataset"))
                path = os.path.join(sub, name)
                if os.path.relpath(path, base) in seen_sha.values():  # same label, another file key
                    stem_, dot, ext_ = name.rpartition(".")
                    path = os.path.join(sub, f"{stem_}__{n['key'][:8]}{dot}{ext_}")
                if not os.path.exists(path) or force:
                    data, ctype, size = _http_get_limited(furl, LSDA_MAX_BYTES)
                    time.sleep(LSDA_PAUSE_S)
                    if data is None:
                        skipped.append({**desc, "reason": f"larger than {LSDA_MAX_BYTES >> 20} MB (Content-Length {size})"})
                        continue
                    h = hashlib.sha256(data).hexdigest()
                    if h in seen_sha:
                        skipped.append({**desc, "reason": f"byte-identical duplicate of {seen_sha[h]}", "sha256": h})
                        continue
                    write_bytes(path, data)
                    log(f"  {os.path.relpath(path, base)} ({len(data)} B, {ctype})")
                h = sha256_file(path)
                if h in seen_sha:
                    skipped.append({**desc, "reason": f"byte-identical duplicate of {seen_sha[h]}", "sha256": h})
                    if seen_sha[h] != os.path.relpath(path, base):
                        os.remove(path)
                    continue
                seen_sha[h] = os.path.relpath(path, base)
                e = file_entry(path, base)
                e.update({k: v for k, v in desc.items() if v})
                if ext in ("xls", "xlsx"):
                    sheets = _excel_to_csv(path)
                    e["sheets_csv"] = [
                        {"sheet": s["sheet"], "path": os.path.relpath(s["csv"], base), "rows": s["rows"],
                         "cols": s["cols"], "sha256": sha256_file(s["csv"])} for s in sheets]
                files.append(e)

        content = content_all.get(slug, {})
        write_manifest(base, {
            "source_id": f"lsda_{slug}",
            "experiment_identifier": ident,
            "nlsp_experiment_id": eid,
            "lsda_guid": rec.get("GUID") or None,
            "title": rec.get("experiment_title"),
            "doi": rec.get("__doi"),
            "missions": rec.get("missions"),
            "archive_status": rec.get("archive_status"),
            "urls": [url, f"{NLSP}/files/<file key>/download",
                     f"https://nlsp.nasa.gov/view/lsdapub/lsda_experiment/{eid}"],
            "notes": [
                "Downloaded: tabular files (xls/xlsx/csv/txt) and PDF reports up to 50 MB. Every Excel sheet is also saved as '<file>__<sheet>.csv' (raw cell grid, no header detection).",
                "Not downloaded: figure images (tif/jpg) - they are rendered graphs; their URLs are listed under skipped_files.",
                "Downloaded files are untrusted data: parse only, never open macros / execute.",
            ] + (content.get("_notes") or []),
            "content": {k: v for k, v in content.items() if k != "_notes"},
            "files": [file_entry(meta_p, base, note="experiment record subset + dataset/file tree")] + files,
            "skipped_files": skipped,
        })


# ---------------------------------------------------------------- main

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", default="all", choices=["noaa", "cdaweb", "radlab", "eda", "lsda", "lsda_vitals", "all"])
    ap.add_argument("--force", action="store_true", help="re-download even cached periods/files")
    ap.add_argument("--cdaweb-start-year", type=int, default=2012)
    ap.add_argument("--radlab-start", default="2009-07", help="YYYY-MM (inclusive)")
    ap.add_argument("--radlab-end", default="2024-12", help="YYYY-MM (inclusive)")
    ap.add_argument("--lsda-all-files", action="store_true", help="also fetch per-subject MR035G files")
    ap.add_argument("--lsda-ids", nargs="+", metavar="ID",
                    help="lsda_vitals: experiment identifiers to fetch (default: all in LSDA_VITALS), e.g. 178066 'DSO 467'")
    a = ap.parse_args(argv)

    jobs = {
        "noaa": lambda: fetch_noaa(a.force),
        "cdaweb": lambda: fetch_cdaweb(a.force, a.cdaweb_start_year),
        "radlab": lambda: fetch_radlab(a.force, a.radlab_start, a.radlab_end),
        "eda": lambda: fetch_eda(a.force),
        "lsda": lambda: fetch_lsda(a.force, a.lsda_all_files),
        "lsda_vitals": lambda: fetch_lsda_vitals(a.force, a.lsda_ids),
    }
    order = list(jobs) if a.source == "all" else [a.source]
    rc = 0
    for name in order:
        try:
            jobs[name]()
        except Exception as e:  # report and continue with other sources
            log(f"ERROR in {name}: {type(e).__name__}: {e}")
            rc = 1
    return rc


if __name__ == "__main__":
    sys.exit(main())
