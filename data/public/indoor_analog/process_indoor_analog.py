"""Tidy real indoor/cave datasets into long CSVs + summary stats.
Run: python3 -I process.py <base_dir>   (reads <base>/raw, writes <base>/processed)
"""
import gzip
import sys, os, csv, json, math, glob, statistics
from datetime import datetime, timedelta, timezone
from collections import defaultdict
sys.path.append(os.path.expanduser("~/.local/lib/python3.14/site-packages"))
import numpy as np

BASE = sys.argv[1]
RAW = os.path.join(BASE, "raw")
OUT = os.path.join(BASE, "processed")
os.makedirs(OUT, exist_ok=True)
HEADER = ["timestamp_utc", "tz_offset_local", "source", "room_or_site", "channel", "value", "unit"]
SUMMARY = []  # rows for summary_stats.csv


def fmt(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%S")


def tzstr(off_h):
    sign = "+" if off_h >= 0 else "-"
    h = abs(off_h)
    return f"{sign}{int(h):02d}:{int(round((h - int(h)) * 60)):02d}"


class Writer:
    def __init__(self, name):
        self.path = os.path.join(OUT, name)
        self.f = open(self.path, "w", newline="")
        self.w = csv.writer(self.f)
        self.w.writerow(HEADER)
        self.n = 0
        self.series = defaultdict(list)  # (source,site,channel,unit) -> [(utc, local, val)]

    def add(self, local_dt, off_h, source, site, channel, value, unit):
        if value is None or (isinstance(value, float) and math.isnan(value)):
            return
        utc = local_dt - timedelta(hours=off_h)
        v = round(value, 6) if isinstance(value, float) else value
        self.w.writerow([fmt(utc) + "Z", tzstr(off_h), source, site, channel, v, unit])
        self.n += 1
        self.series[(source, site, channel, unit)].append((utc, local_dt, float(value)))

    def close(self):
        self.f.close()
        for (src, site, ch, unit), pts in self.series.items():
            summarize(src, site, ch, unit, pts)
        print(self.path, self.n, "rows")
        return self.n


def summarize(src, site, ch, unit, pts):
    pts.sort()
    vals = np.array([p[2] for p in pts])
    times = [p[0] for p in pts]
    dts = np.diff([t.timestamp() for t in times]) if len(times) > 1 else np.array([0])
    # mean daily range (max-min within a local calendar day, days with >=80% of median daily count)
    byday = defaultdict(list)
    for _, loc, v in pts:
        byday[loc.date()].append(v)
    cnt = statistics.median([len(x) for x in byday.values()])
    ranges = [max(x) - min(x) for x in byday.values() if len(x) >= 0.8 * cnt]
    SUMMARY.append({
        "source": src, "room_or_site": site, "channel": ch, "unit": unit, "n": len(vals),
        "start_utc": fmt(times[0]) + "Z", "end_utc": fmt(times[-1]) + "Z",
        "median_cadence_s": float(np.median(dts)) if len(dts) else "",
        "min": float(vals.min()), "p05": float(np.percentile(vals, 5)), "median": float(np.median(vals)),
        "mean": float(vals.mean()), "p95": float(np.percentile(vals, 95)), "max": float(vals.max()),
        "std": float(vals.std()),
        "mean_daily_range": float(np.mean(ranges)) if ranges else "",
        "n_full_days": len(ranges),
    })


# ---------------------------------------------------------------- 1. UCI Occupancy Detection
def uci_occupancy():
    w = Writer("uci_occupancy_detection_long.csv")
    off = 1.0  # Belgium, February: CET (UTC+1) -- timestamps in files are local, tz not stated in files
    chans = [("Temperature", "temperature", "degC"), ("Humidity", "relative_humidity", "%"),
             ("Light", "light", "lux"), ("CO2", "co2", "ppm"), ("HumidityRatio", "humidity_ratio", "kg_water/kg_dry_air"),
             ("Occupancy", "occupancy", "binary")]
    recs = []
    for fn in ["datatraining.txt", "datatest.txt", "datatest2.txt"]:
        with open(os.path.join(RAW, "uci_occupancy", fn)) as f:
            r = csv.reader(f)
            hdr = next(r)
            for row in r:
                d = dict(zip(hdr, row[1:]))
                dt = datetime.strptime(d["date"], "%Y-%m-%d %H:%M:%S")
                recs.append((dt, fn, d))
    recs.sort(key=lambda x: x[0])
    seen = set()
    clean = []
    for dt, fn, d in recs:
        if dt in seen:
            continue
        seen.add(dt)
        clean.append((dt, d))
        for col, ch, unit in chans:
            v = float(d[col])
            w.add(dt, off, "uci_occupancy_detection", "office_mons_BE", ch, int(v) if ch == "occupancy" else v, unit)
    w.close()
    return clean


# ---------------------------------------------------------------- 2. UCI Room Occupancy Estimation
def uci_room():
    w = Writer("uci_room_occupancy_estimation_long.csv")
    off = 5.5  # India (IST) -- local timestamps, tz not stated in file
    recs = []
    with open(os.path.join(RAW, "uci_room_occ", "Occupancy_Estimation.csv")) as f:
        r = csv.DictReader(f)
        for d in r:
            dt = datetime.strptime(d["Date"] + " " + d["Time"], "%Y/%m/%d %H:%M:%S")
            recs.append((dt, d))
    recs.sort(key=lambda x: x[0])
    for dt, d in recs:
        for i in range(1, 5):
            w.add(dt, off, "uci_room_occupancy_estimation", f"room_node_S{i}", "temperature", float(d[f"S{i}_Temp"]), "degC")
            w.add(dt, off, "uci_room_occupancy_estimation", f"room_node_S{i}", "light", float(d[f"S{i}_Light"]), "lux")
            w.add(dt, off, "uci_room_occupancy_estimation", f"room_node_S{i}", "sound", float(d[f"S{i}_Sound"]), "V_mic_amplitude")
        w.add(dt, off, "uci_room_occupancy_estimation", "room_node_S5", "co2", float(d["S5_CO2"]), "ppm")
        w.add(dt, off, "uci_room_occupancy_estimation", "room_node_S5", "co2_slope_author", float(d["S5_CO2_Slope"]), "author_defined_slope")
        w.add(dt, off, "uci_room_occupancy_estimation", "room_node_S6", "pir_motion", int(d["S6_PIR"]), "binary")
        w.add(dt, off, "uci_room_occupancy_estimation", "room_node_S7", "pir_motion", int(d["S7_PIR"]), "binary")
        w.add(dt, off, "uci_room_occupancy_estimation", "room", "occupant_count", int(d["Room_Occupancy_Count"]), "persons")
    w.close()
    return recs


# ---------------------------------------------------------------- 3. Jenolan Caves (PANGAEA, CC-BY-3.0)
def read_pangaea(path):
    op = gzip.open if path.endswith(".gz") else open
    with op(path, "rt", encoding="utf-8") as f:
        lines = f.read().split("\n")
    i = next(k for k, l in enumerate(lines) if l.startswith("*/"))
    hdr = lines[i + 1].split("\t")
    rows = [l.split("\t") for l in lines[i + 2:] if l.strip()]
    return hdr, rows


def parse_iso(s):
    for f in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, f)
        except ValueError:
            pass
    raise ValueError(s)


def hourly(points):
    """points: list of (dt, value) -> list of (hour_dt, mean)."""
    b = defaultdict(list)
    for dt, v in points:
        b[dt.replace(minute=0, second=0)].append(v)
    return sorted((k, sum(v) / len(v)) for k, v in b.items())


def jenolan():
    w = Writer("cave_jenolan_hourly_long.csv")
    src = "pangaea_jenolan_caves"
    # PANGAEA Date/Time is UTC by convention; local AEST = UTC+10 (DST not applied)
    off = 10.0
    def addh(local_from_utc_pts, site, ch, unit):
        for hdt, v in hourly(local_from_utc_pts):
            w.add(hdt + timedelta(hours=off), off, src, site, ch, v, unit)
    # in-cave sensor station (Flitch of Bacon), 15-min -> hourly
    hdr, rows = read_pangaea(os.path.join(RAW, "pangaea_jenolan", "PANGAEA.878072.tab.gz"))
    cols = {"Flow in [m/s]": ("airflow_in", "m/s"), "TTT [°C]": ("air_temperature", "degC"), "pCO2 [ppmv]": ("co2", "ppm")}
    for c, (ch, unit) in cols.items():
        j = hdr.index(c)
        pts = [(parse_iso(r[0]), float(r[j])) for r in rows if len(r) > j and r[j] != ""]
        addh(pts, "flitch_of_bacon_station", ch, unit)
    # FTIR multi-site, 1-min -> hourly (CO2 and CH4)
    hdr, rows = read_pangaea(os.path.join(RAW, "pangaea_jenolan", "PANGAEA.878071.tab.gz"))
    for c, ch, unit in [("pCO2 [ppmv]", "co2", "ppm"), ("CH4 [ppbv]", "ch4", "ppb")]:
        j = hdr.index(c)
        bysite = defaultdict(list)
        for r in rows:
            if len(r) > j and r[j] != "":
                bysite[r[0]].append((parse_iso(r[1]), float(r[j])))
        for site, pts in bysite.items():
            addh(pts, "ftir_" + site.lower().replace("'", "").replace(" ", "_"), ch, unit)
    # Radon, hourly-ish
    hdr, rows = read_pangaea(os.path.join(RAW, "pangaea_jenolan", "PANGAEA.878074.tab"))
    j = hdr.index("222Rn [Bq/m**3]")
    bysite = defaultdict(list)
    for r in rows:
        if len(r) > j and r[j] != "":
            bysite[r[0]].append((parse_iso(r[1]), float(r[j])))
    for site, pts in bysite.items():
        addh(pts, "radon_" + site.lower().replace("'", "").replace(" ", "_"), "radon_222", "Bq/m3")
    w.close()


# ---------------------------------------------------------------- 4. Nullarbor caves (PANGAEA, CC-BY-4.0)
def nullarbor():
    w = Writer("cave_nullarbor_long.csv")
    off = 8.0  # files state "Date/Time local", COMMENT: GMT+8
    for fid, site in [("964571", "mullamullang_cave_back"), ("939066", "abrakurrie_cave")]:
        hdr, rows = read_pangaea(os.path.join(RAW, "pangaea_nullarbor", f"PANGAEA.{fid}.tab"))
        jt, jh = hdr.index("TTT [°C]"), hdr.index("RH [%]")
        for r in rows:
            dt = parse_iso(r[0])
            if r[jt]:
                w.add(dt, off, "pangaea_nullarbor_caves", site, "air_temperature", float(r[jt]), "degC")
            if r[jh]:
                w.add(dt, off, "pangaea_nullarbor_caves", site, "relative_humidity", float(r[jh]), "%")
    w.close()


# ---------------------------------------------------------------- 5. Mauna Loa lava tubes (Zenodo, CC-BY-NC-ND-4.0)
def maunaloa():
    w = Writer("cave_maunaloa_lavatube_long__CC-BY-NC-ND.csv")
    off = -10.0  # header: GMT-10:00
    files = [("h816_arsiaB.dat", "arsia_cave_icebat_hall_after_barrier_floor", [("air_temperature", "degC"), ("relative_humidity", "%")]),
             ("n184_arsiaB.dat", "arsia_cave_station_G4", [("air_temperature_floor", "degC"), ("air_temperature_1.9m_above_floor", "degC")]),
             ("h679_mlic.dat", "mauna_loa_icecave_above_ice", [("air_temperature", "degC"), ("relative_humidity", "%")])]
    for fn, site, chans in files:
        pts = defaultdict(list)
        with gzip.open(os.path.join(RAW, "zenodo_maunaloa_lavatube", fn + ".gz"), "rt", encoding="latin-1") as f:
            for line in f:
                p = line.split()
                if len(p) < 6 or not p[0].isdigit():
                    continue
                dt = datetime.strptime(" ".join(p[1:4]), "%m/%d/%y %I:%M:%S %p")
                for k, s in enumerate(p[4:6]):
                    v = float(s)
                    if v != -999:
                        pts[k].append((dt, v))
        for k, (ch, unit) in enumerate(chans):  # 30-min -> hourly mean (local time)
            for hdt, v in hourly(pts[k]):
                w.add(hdt, off, "zenodo_maunaloa_lavatubes", site, ch, v, unit)
    w.close()


# ---------------------------------------------------------------- analyses
def co2_analysis(occ_clean, room_recs):
    res = {}
    # ---- A. Room Occupancy Estimation: mass-balance regression with occupant counts
    # resample to 1-min means, contiguous segments only
    mins = defaultdict(list)
    for dt, d in room_recs:
        mins[dt.replace(second=0)].append((float(d["S5_CO2"]), int(d["Room_Occupancy_Count"])))
    keys = sorted(mins)
    C = {k: np.mean([x[0] for x in mins[k]]) for k in keys}
    N = {k: np.mean([x[1] for x in mins[k]]) for k in keys}
    cbg = float(np.percentile([C[k] for k in keys], 1))
    X, Y = [], []
    by_n = defaultdict(list)
    H = 5  # centred difference over +-5 min
    for k in keys:
        a, b = k - timedelta(minutes=H), k + timedelta(minutes=H)
        if a in C and b in C:
            window = [k + timedelta(minutes=m) for m in range(-H, H + 1)]
            if not all(x in C for x in window):
                continue
            ns = [N[x] for x in window]
            if max(ns) != min(ns):
                continue  # only windows with constant occupancy
            dcdt = (C[b] - C[a]) / (2 * H)  # ppm/min
            X.append([N[k], C[k] - cbg, 1.0])
            Y.append(dcdt)
            by_n[int(N[k])].append(dcdt)
    X, Y = np.array(X), np.array(Y)
    coef, *_ = np.linalg.lstsq(X, Y, rcond=None)
    pred = X @ coef
    r2 = 1 - np.sum((Y - pred) ** 2) / np.sum((Y - Y.mean()) ** 2)
    res["room_occupancy_estimation"] = {
        "method": "1-min mean CO2 (sensor S5); dC/dt = centred difference over +-5 min, only windows where occupant count constant for 11 min; "
                  "OLS fit dC/dt = a*n + b*(C - C_bg) + c with C_bg = 1st percentile CO2. a = per-occupant CO2 rise rate in THIS room (ppm/min/person); "
                  "-b = first-order removal rate (1/min) = effective ventilation/infiltration rate.",
        "C_bg_ppm": round(cbg, 1),
        "a_ppm_per_min_per_occupant": round(float(coef[0]), 3),
        "b_per_min": round(float(coef[1]), 5),
        "effective_air_change_per_hour": round(float(-coef[1] * 60), 3),
        "c_ppm_per_min": round(float(coef[2]), 3),
        "r2": round(float(r2), 3), "n_windows": int(len(Y)),
        "mean_dCdt_ppm_per_min_by_occupant_count": {str(k): {"mean": round(float(np.mean(v)), 3), "median": round(float(np.median(v)), 3), "n": len(v)} for k, v in sorted(by_n.items())},
        "co2_ppm_by_occupant_count": {},
    }
    byc = defaultdict(list)
    for dt, d in room_recs:
        byc[int(d["Room_Occupancy_Count"])].append(float(d["S5_CO2"]))
    for k, v in sorted(byc.items()):
        res["room_occupancy_estimation"]["co2_ppm_by_occupant_count"][str(k)] = {"median": float(np.median(v)), "p95": float(np.percentile(v, 95)), "max": float(max(v)), "n": len(v)}

    # ---- B. Occupancy Detection: binary occupancy episodes, rise & exponential decay
    ts = [dt for dt, _ in occ_clean]
    co2 = np.array([float(d["CO2"]) for _, d in occ_clean])
    occ = np.array([int(float(d["Occupancy"])) for _, d in occ_clean])
    unocc = co2[occ == 0]
    cbg2 = float(np.percentile(unocc, 1))
    # split episodes (break also on >5-min gaps)
    eps = []
    s = 0
    for i in range(1, len(ts) + 1):
        if i == len(ts) or occ[i] != occ[s] or (ts[i] - ts[i - 1]).total_seconds() > 300:
            eps.append((s, i - 1, int(occ[s])))
            s = i
    rises, decays = [], []
    for k, (a, b, o) in enumerate(eps):
        dur = (ts[b] - ts[a]).total_seconds() / 60
        if o == 1 and dur >= 60:
            # first 60 minutes of occupancy
            j = next(i for i in range(a, b + 1) if (ts[i] - ts[a]).total_seconds() >= 3600)
            rises.append({"start_local": fmt(ts[a]), "duration_min": round(dur), "co2_start": co2[a], "co2_after_60min": co2[j],
                          "rise_ppm_per_min_first_60min": round((co2[j] - co2[a]) / ((ts[j] - ts[a]).total_seconds() / 60), 3),
                          "co2_peak": float(co2[a:b + 1].max())})
        if o == 0 and dur >= 180 and k > 0 and eps[k - 1][2] == 1:
            idx = [i for i in range(a, b + 1) if (ts[i] - ts[a]).total_seconds() <= 3 * 3600]
            t = np.array([(ts[i] - ts[a]).total_seconds() / 3600 for i in idx])
            ex = co2[idx] - cbg2
            m = ex > 5
            if m.sum() > 30:
                sl, ic = np.polyfit(t[m], np.log(ex[m]), 1)
                decays.append({"start_local": fmt(ts[a]), "co2_start": float(co2[a]), "co2_after_3h": float(co2[idx[-1]]),
                               "decay_rate_per_h": round(float(-sl), 3), "half_life_h": round(float(math.log(2) / -sl), 2) if sl < 0 else None})
    res["occupancy_detection"] = {
        "method": "Episodes of constant binary occupancy (gaps >5 min split episodes). Rise = (CO2 at +60 min - CO2 at start)/60 for occupied episodes >=60 min. "
                  "Decay = OLS slope of ln(CO2 - C_bg) vs time over the first 3 h of unoccupied episodes (>=3 h) that follow occupancy; C_bg = 1st percentile of unoccupied CO2. "
                  "Occupant COUNT is not in this dataset, so per-occupant rate is not derivable here.",
        "C_bg_ppm": round(cbg2, 1),
        "co2_occupied": {"median": float(np.median(co2[occ == 1])), "p95": float(np.percentile(co2[occ == 1], 95)), "max": float(co2[occ == 1].max())},
        "co2_unoccupied": {"median": float(np.median(unocc)), "p05": float(np.percentile(unocc, 5))},
        "rise_episodes": rises,
        "rise_ppm_per_min_median": float(np.median([r["rise_ppm_per_min_first_60min"] for r in rises])) if rises else None,
        "decay_episodes": decays,
        "decay_rate_per_h_median": float(np.median([d["decay_rate_per_h"] for d in decays])) if decays else None,
    }
    with open(os.path.join(OUT, "co2_occupancy_analysis.json"), "w") as f:
        json.dump(res, f, indent=1, default=float)
    return res


def light_profile(occ_clean, room_recs):
    rows = []
    for name, recs, getlux, getocc in [
        ("uci_occupancy_detection", occ_clean, lambda d: float(d["Light"]), lambda d: int(float(d["Occupancy"]))),
        ("uci_room_occupancy_estimation", room_recs, lambda d: float(d["S1_Light"]), lambda d: int(d["Room_Occupancy_Count"]) > 0),
    ]:
        b = defaultdict(list)
        bo = defaultdict(list)
        for dt, d in recs:
            b[dt.hour].append(getlux(d))
            bo[dt.hour].append(1 if getocc(d) else 0)
        for h in range(24):
            if b[h]:
                rows.append([name, h, len(b[h]), round(float(np.median(b[h])), 1), round(float(np.percentile(b[h], 90)), 1),
                             round(float(np.mean(bo[h])), 3)])
    with open(os.path.join(OUT, "light_hour_of_day_profile.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["source", "local_hour", "n", "lux_median", "lux_p90", "fraction_occupied"])
        w.writerows(rows)


if __name__ == "__main__":
    occ_clean = uci_occupancy()
    room = uci_room()
    jenolan()
    nullarbor()
    maunaloa()
    res = co2_analysis(occ_clean, room)
    light_profile(occ_clean, room)
    keys = list(SUMMARY[0].keys())
    with open(os.path.join(OUT, "summary_stats.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, keys)
        w.writeheader()
        for r in SUMMARY:
            w.writerow({k: (round(v, 4) if isinstance(v, float) else v) for k, v in r.items()})
    print(json.dumps({k: {kk: vv for kk, vv in v.items() if kk not in ("rise_episodes", "decay_episodes", "method")} for k, v in res.items()}, indent=1, default=float))
