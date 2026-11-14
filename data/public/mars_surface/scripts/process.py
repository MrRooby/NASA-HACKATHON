# usage: python3 -I process.py <scratch_dir> <mars_surface_dir>
import sys, os, glob, csv, json, datetime, statistics
from collections import defaultdict
sys.path.insert(0, sys.argv[1]); from marstime import msl_sol, msl_sol_noon_utc
base = sys.argv[2]; raw = os.path.join(base, 'raw'); out = os.path.join(base, 'processed')
U = datetime.timezone.utc
persol = defaultdict(list)   # (sol, source, channel, unit) -> values
soldate = {}

# ---------- RAD ----------
RADCH = [('dose_rate_si_total_B', 'uGy/day'), ('dose_rate_si_rtg_corrected_B', 'uGy/day'), ('dose_rate_tissue_E', 'uGy/day')]
rows = []
for f in sorted(glob.glob(os.path.join(raw, 'rad', 'msl_rad_l2_*.txt'))):
    for line in open(f, encoding='latin-1'):
        if line.startswith('#') or not line[:2].isdigit(): continue
        p = line.split()
        if len(p) != 5: continue
        dt = datetime.datetime.strptime(p[0] + ' ' + p[1][:8], '%d-%m-%Y %H:%M:%S').replace(tzinfo=U)
        sol = msl_sol(dt)
        for (ch, u), v in zip(RADCH, p[2:]):
            v = float(v)
            if v <= 0 or v > 1e5: continue  # fill -1e31, zeros (instrument start-up), outside VALIDMAX
            rows.append((dt.strftime('%Y-%m-%dT%H:%M:%SZ'), sol, 'MSL_RAD_OBS-L2', ch, round(v, 3), u))
            persol[(sol, 'MSL_RAD_OBS-L2', ch, u)].append(v)
            soldate.setdefault(sol, dt.strftime('%Y-%m-%d'))
rows = sorted(set(rows))
hdr = ['timestamp_utc', 'sol', 'source', 'channel', 'value', 'unit']
with open(os.path.join(out, 'rad_dose_rate_long.csv'), 'w', newline='') as fh:
    w = csv.writer(fh); w.writerow(hdr); w.writerows(rows)
with open(os.path.join(out, 'rad_solar_event_2024-05-15_25.csv'), 'w', newline='') as fh:
    w = csv.writer(fh); w.writerow(hdr)
    w.writerows(r for r in rows if '2024-05-15' <= r[0][:10] <= '2024-05-25')
print('RAD rows', len(rows), rows[0][0], rows[-1][0])

# ---------- REMS CAB daily feed ----------
d = json.load(open(os.path.join(raw, 'rems', 'cab_msl_weather_feed.json'), encoding='latin-1'))
CAB = [('min_temp', 'ext_air_temperature_min', 'C'), ('max_temp', 'ext_air_temperature_max', 'C'),
       ('min_gts_temp', 'ext_ground_temperature_min', 'C'), ('max_gts_temp', 'ext_ground_temperature_max', 'C'),
       ('pressure', 'ext_pressure_daily', 'Pa')]
cab_rows = []
for s in d['soles']:
    sol = int(s['sol']); date = s['terrestrial_date']
    for k, ch, u in CAB:
        try: v = float(s[k])
        except (ValueError, TypeError): continue
        cab_rows.append((date, sol, s['ls'], 'CAB_REMS_daily', ch, v, u))
    if s.get('local_uv_irradiance_index') not in (None, '--', ''):
        cab_rows.append((date, sol, s['ls'], 'CAB_REMS_daily', 'uv_index_category', s['local_uv_irradiance_index'], 'category'))
    if s.get('atmo_opacity') not in (None, '--', ''):
        cab_rows.append((date, sol, s['ls'], 'CAB_REMS_daily', 'atmo_opacity_category', s['atmo_opacity'], 'category'))
cab_rows.sort(key=lambda r: (r[1], r[4]))
with open(os.path.join(out, 'rems_cab_daily_long.csv'), 'w', newline='') as fh:
    w = csv.writer(fh); w.writerow(['date_utc', 'sol', 'ls_deg', 'source', 'channel', 'value', 'unit']); w.writerows(cab_rows)
print('CAB rows', len(cab_rows), cab_rows[0][:2], cab_rows[-1][:2])

# ---------- REMS PDS hourly (pre-aggregated while streaming) ----------
pds_rows = []
for pf in sorted(glob.glob(os.path.join(sys.argv[1], 'rems_parts', '*.csv'))):
    for r in csv.reader(open(pf)):
        ts, sol, hr, ch, mean, mn, mx, n, u = r
        sol = int(sol)
        pds_rows.append((ts, sol, int(hr), 'PDS_MSL_REMS_MODRDR', ch, float(mean), u, float(mn), float(mx), int(n)))
        persol[(sol, 'PDS_MSL_REMS_MODRDR', ch, u)].append(float(mean))
        soldate.setdefault(sol, ts[:10])
if pds_rows:
    pds_rows.sort(key=lambda r: (r[1], r[2], r[4]))
    with open(os.path.join(out, 'rems_pds_hourly_long.csv'), 'w', newline='') as fh:
        w = csv.writer(fh)
        w.writerow(['timestamp_utc', 'sol', 'lmst_hour', 'source', 'channel', 'value', 'unit', 'raw_min', 'raw_max', 'n_samples'])
        w.writerows(pds_rows)
    print('PDS rows', len(pds_rows))

# ---------- per-sol summary ----------
summ = []
for (sol, src, ch, u), vs in persol.items():
    summ.append((sol, msl_sol_noon_utc(sol).strftime('%Y-%m-%d'), src, ch, u, round(statistics.fmean(vs), 3), round(min(vs), 3), round(max(vs), 3), len(vs)))
cabsol = defaultdict(dict)
for date, sol, ls, src, ch, v, u in cab_rows:
    if u == 'category': continue
    if ch == 'ext_pressure_daily': key, stat = 'ext_pressure', 'mean'
    else: key, stat = ch.rsplit('_', 1)
    e = cabsol[(sol, date, key, u)]; e[stat] = v
for (sol, date, key, u), e in cabsol.items():
    summ.append((sol, msl_sol_noon_utc(sol).strftime('%Y-%m-%d'), 'CAB_REMS_daily', key, u, e.get('mean', ''), e.get('min', ''), e.get('max', ''), 1))
summ.sort(key=lambda r: (r[0], r[2], r[3]))
with open(os.path.join(out, 'per_sol_summary.csv'), 'w', newline='') as fh:
    w = csv.writer(fh)
    w.writerow(['sol', 'date_utc_at_lmst_noon', 'source', 'channel', 'unit', 'mean', 'min', 'max', 'n'])
    w.writerows(summ)
print('per-sol rows', len(summ))
