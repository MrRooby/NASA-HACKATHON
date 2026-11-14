# Tidy OSDR EDA + RadLab downloads into long CSVs. Run: python3 -I process.py <iss_cabin_dir>
import sys, os, re, json, csv, gzip, glob, math, statistics as st
from collections import defaultdict
from datetime import datetime

BASE = sys.argv[1]
RAW = os.path.join(BASE, 'raw'); OUT = os.path.join(BASE, 'processed')
os.makedirs(OUT, exist_ok=True)
P_TOTAL_MMHG = 760.0  # assumed ISS total cabin pressure (14.7 psia nominal)
COLS = ['timestamp_utc', 'source', 'mission_or_instrument', 'module_or_zone', 'channel', 'value', 'unit', 'qc_flag']

def num(x):
    if x is None: return None
    if isinstance(x, (int, float)):
        return None if (isinstance(x, float) and math.isnan(x)) else float(x)
    s = str(x).strip()
    if s == '' or s.upper() in ('NA', 'NAN', 'NONE', 'NULL'): return None
    try:
        v = float(s); return None if math.isnan(v) else v
    except ValueError:
        return None

def iso(t):
    t = t.strip()
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M', '%Y-%m-%d', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M'):
        try:
            return datetime.strptime(t, fmt).strftime('%Y-%m-%dT%H:%M:%SZ')
        except ValueError:
            pass
    raise ValueError(t)

def fmt(v):
    return ('%.6g' % v) if abs(v) < 1e6 else repr(v)

# ---------------- EDA ----------------
PLANT = ('APEX', 'VEG')
def zone_for(m):
    return 'ISS_flight_plant_hardware' if m.startswith(PLANT) else 'ISS_cabin'

def qc(m, ch, v, ts):
    flags = []
    if ch in ('temperature_air', 'rh', 'co2_ppm') and v == 0: flags.append('zero_invalid')
    if ch == 'rh' and v > 100: flags.append('rh_over_100')
    if ch == 'temperature_air' and zone_for(m) == 'ISS_cabin' and not (15 <= v <= 30): flags.append('temp_outside_15_30C')
    if ch == 'temperature_air' and zone_for(m) != 'ISS_cabin' and v < 15: flags.append('cold_stowage_or_off')
    if ch == 'co2_ppm' and 0 < v < 1000: flags.append('co2_below_1000ppm_suspect')
    if m == 'RR-9': flags.append('timestamp_year_suspect')
    return ';'.join(flags) if flags else 'ok'

tele_rows = 0; rad_rows = 0
eda_info = {}
daily = defaultdict(list)  # (date, source, mi, zone, channel, unit) -> values (ok only)
tele_path = os.path.join(OUT, 'eda_iss_telemetry_long.csv.gz')
rad_path = os.path.join(OUT, 'eda_iss_radiation_daily_long.csv')
with gzip.open(tele_path, 'wt', newline='') as gt, open(rad_path, 'w', newline='') as rf:
    wt = csv.writer(gt, lineterminator='\n'); wt.writerow(COLS)
    wr = csv.writer(rf, lineterminator='\n'); wr.writerow(COLS)
    for f in sorted(glob.glob(os.path.join(RAW, 'eda', 'dashboards', 'dashboard_*.html'))):
        t = open(f, encoding='utf-8').read()
        d = json.loads(re.search(r'<script id="data" type="application/json">(.*?)</script>', t, re.S).group(1))
        m = d['mission']; info = {'title': d.get('mission_title'), 'tele_rows': 0, 'rad_rows': 0, 'tele_range': None, 'rad_range': None, 'dups_dropped': 0, 'dup_ts_conflicts': 0}
        tel = json.loads(d['telemetry_data']) if d.get('telemetry_data') else None
        if isinstance(tel, dict) and tel.get('time'):
            zone = zone_for(m); seen = {}
            chmap = [('temperature_iss', 'temperature_air', 'degC'), ('rh_iss', 'rh', '%RH'), ('co2_iss', 'co2_ppm', 'ppm')]
            ts_list = []
            for i, tm in enumerate(tel['time']):
                ts = iso(tm)
                for key, ch, unit in chmap:
                    arr = tel.get(key) or []
                    if i >= len(arr): continue
                    v = num(arr[i])
                    if v is None: continue
                    k = (ts, ch)
                    if k in seen:
                        if seen[k] == v: info['dups_dropped'] += 1; continue
                        info['dup_ts_conflicts'] += 1
                        flag_extra = 'duplicate_timestamp'
                    else:
                        flag_extra = None
                    seen[k] = v
                    flag = qc(m, ch, v, ts)
                    if flag_extra: flag = flag_extra if flag == 'ok' else flag + ';' + flag_extra
                    out = [(ch, v, unit)]
                    if ch == 'co2_ppm':
                        out.append(('ppco2_mmHg', v * 1e-6 * P_TOTAL_MMHG, 'mmHg'))
                    for c2, v2, u2 in out:
                        wt.writerow([ts, 'OSDR_EDA', m, zone, c2, fmt(v2), u2, flag]); tele_rows += 1; info['tele_rows'] += 1
                        if flag == 'ok' or flag == 'timestamp_year_suspect':
                            daily[(ts[:10], 'OSDR_EDA', m, zone, c2, u2)].append(v2)
                    ts_list.append(ts)
            if ts_list: info['tele_range'] = (min(ts_list), max(ts_list))
        rad = json.loads(d['radiation_data']) if d.get('radiation_data') else None
        if isinstance(rad, dict) and rad.get('time'):
            dates = []
            for i, tm in enumerate(rad['time']):
                ts = iso(tm)
                for key, ch, unit in [('gcr', 'dose_gcr', 'mGy/day'), ('saa', 'dose_saa', 'mGy/day'), ('total', 'dose_total', 'mGy/day'), ('accumulated', 'dose_accumulated', 'mGy')]:
                    v = num((rad.get(key) or [None] * (i + 1))[i])
                    if v is None: continue
                    wr.writerow([ts, 'OSDR_EDA', m, 'ISS_payload_SRAG_estimate', ch, fmt(v), unit, 'ok']); rad_rows += 1; info['rad_rows'] += 1
                    daily[(ts[:10], 'OSDR_EDA', m, 'ISS_payload_SRAG_estimate', ch, unit)].append(v)
                dates.append(ts[:10])
            info['rad_range'] = (min(dates), max(dates))
        eda_info[m] = info

# ---------------- RadLab ----------------
ZONE_BY_SC = {'TGO': 'Mars_orbit (ExoMars TGO)', 'Curiosity': 'Mars_surface_Gale_crater (Curiosity rover)',
              'LRO': 'Lunar_orbit (LRO)', 'BioSentinel': 'Deep_space_heliocentric (BioSentinel)', 'Orion': 'Cislunar_transit (Orion, Artemis I)'}
RCOLS = COLS + ['latitude_deg', 'longitude_deg', 'altitude_km', 'spacecraft', 'instrument_family']
seen = set(); rl_rows = 0; rl_info = defaultdict(lambda: {'n': 0, 'min_ts': None, 'max_ts': None, 'zone': None})
rl_path = os.path.join(OUT, 'radlab_dose_rate_long.csv.gz')
with gzip.open(rl_path, 'wt', newline='') as g:
    w = csv.writer(g, lineterminator='\n'); w.writerow(RCOLS)
    for f in sorted(glob.glob(os.path.join(RAW, 'radlab', '*.csv'))):
        with open(f, newline='', encoding='utf-8') as fh:
            for r in csv.DictReader(fh):
                iid = r['instrument_id']; ts = iso(r['timestamp'])
                if (ts, iid) in seen: continue
                seen.add((ts, iid))
                sc = r.get('spacecraft', ''); mod = r.get('module', '')
                zone = ('ISS_' + mod.replace(' ', '_')) if sc == 'ISS' and mod else ZONE_BY_SC.get(sc, sc or 'unknown')
                for col, ch in (('absorbed_dose_rate', 'dose_rate_absorbed'), ('dose_equivalent_rate', 'dose_rate_equivalent')):
                    v = num(r.get(col))
                    if v is None: continue
                    unit = 'uGy/h' if ch == 'dose_rate_absorbed' else 'uSv/h'
                    flag = 'daily_mean_preliminary' if iid.endswith('-pre') else 'ok'
                    w.writerow([ts, 'OSDR_RadLab', iid, zone, ch, fmt(v), unit, flag,
                                r.get('latitude', ''), r.get('longitude', ''), r.get('altitude', ''), sc, r.get('instrument_family', '')])
                    rl_rows += 1
                    daily[(ts[:10], 'OSDR_RadLab', iid, zone, ch, unit)].append(v)
                    inf = rl_info[iid]; inf['n'] += 1; inf['zone'] = zone
                    inf['min_ts'] = ts if inf['min_ts'] is None or ts < inf['min_ts'] else inf['min_ts']
                    inf['max_ts'] = ts if inf['max_ts'] is None or ts > inf['max_ts'] else inf['max_ts']

# ---------------- daily summary ----------------
ds_path = os.path.join(OUT, 'daily_summary.csv')
with open(ds_path, 'w', newline='') as fh:
    w = csv.writer(fh, lineterminator='\n')
    w.writerow(['date_utc', 'source', 'mission_or_instrument', 'module_or_zone', 'channel', 'unit', 'n_samples', 'mean', 'min', 'p05', 'median', 'p95', 'max'])
    n_ds = 0
    for k in sorted(daily):
        v = sorted(daily[k]); n = len(v)
        q = (lambda p: v[min(n - 1, max(0, int(round(p * (n - 1)))))])
        w.writerow(list(k) + [n, fmt(st.fmean(v)), fmt(v[0]), fmt(q(0.05)), fmt(st.median(v)), fmt(q(0.95)), fmt(v[-1])]); n_ds += 1

json.dump({'eda': eda_info, 'radlab': rl_info, 'tele_rows': tele_rows, 'rad_rows': rad_rows, 'radlab_rows': rl_rows, 'daily_rows': n_ds},
          open(os.path.join(sys.argv[2]), 'w'), indent=1, default=list)
print('tele', tele_rows, 'rad', rad_rows, 'radlab', rl_rows, 'daily', n_ds)
