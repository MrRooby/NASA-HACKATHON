"""Tidy GOES integral proton flux for SPE templates. Run: python3 -I process.py <space_weather_dir>"""
import csv, json, sys, re, html, os
from datetime import datetime, timedelta

D = sys.argv[1]
RAW, OUT = os.path.join(D, 'raw'), os.path.join(D, 'processed')
os.makedirs(os.path.join(OUT, 'events'), exist_ok=True)

FMT = '%Y-%m-%dT%H:%M:%SZ'
HAPI_COLS = ['time', 'ge1', 'ge5', 'ge10', 'ge30', 'ge50', 'ge100', 'e_ge0p8', 'e_ge2', 'e_ge4', 'ge60', 'ge500', 'sat_e', 'sat_p']
NCEI_EPS = {'p1_flux_ic': 'ge1', 'p2_flux_ic': 'ge5', 'p3_flux_ic': 'ge10', 'p4_flux_ic': 'ge30',
            'p5_flux_ic': 'ge50', 'p6_flux_ic': 'ge60', 'p7_flux_ic': 'ge100'}
CHANNEL_ORDER = ['ge1', 'ge5', 'ge10', 'ge30', 'ge50', 'ge60', 'ge100', 'ge500']


def read_hapi(path):
    rows = []
    for r in csv.reader(open(path)):
        if not r:
            continue
        rec = dict(zip(HAPI_COLS, r))
        t = datetime.strptime(rec['time'][:19], '%Y-%m-%dT%H:%M:%S')
        vals = {}
        for ch in CHANNEL_ORDER:
            v = rec.get(ch, '')
            if v in ('', 'null'):
                continue
            v = float(v)
            if v <= -99999:  # HAPI fill = -100000
                continue
            vals[ch] = v
        rows.append((t, vals, rec['sat_p']))
    return rows


def read_ncei_eps(paths):
    rows = []
    for p in paths:
        lines = open(p).read().splitlines()
        i = lines.index('data:') if 'data:' in lines else [k for k, l in enumerate(lines) if l.startswith('data:')][0]
        hdr = lines[i + 1].split(',')
        sat = 'GOES-' + os.path.basename(p)[1:3].lstrip('0')
        for l in lines[i + 2:]:
            if not l.strip():
                continue
            rec = dict(zip(hdr, l.split(',')))
            t = datetime.strptime(rec['time_tag'][:19], '%Y-%m-%d %H:%M:%S')
            vals = {}
            for k, ch in NCEI_EPS.items():
                v = float(rec[k])
                if v <= -99999:
                    continue
                vals[ch] = v
            rows.append((t, vals, sat))
    return rows


def ncei(*names):
    return [os.path.join(RAW, 'ncei', n) for n in names]


EVENTS = [
    dict(event_id='SPE_1989-10', name='October 1989 SPE', start='1989-10-19', end='1989-10-28',
         source='NCEI GOES-7 EPS 5-min avg, p*_flux_ic (corrected integral)', loader=lambda: read_ncei_eps(ncei('g07_eps_5m_19891001_19891031.csv'))),
    dict(event_id='SPE_2003-10', name='Halloween 2003 SPE', start='2003-10-26', end='2003-11-07',
         source='NCEI GOES-10 EPS 5-min avg, p*_flux_ic (corrected integral)', loader=lambda: read_ncei_eps(ncei('g10_eps_5m_20031001_20031031.csv', 'g10_eps_5m_20031101_20031130.csv'))),
    dict(event_id='SPE_2012-03', name='March 2012 SPE', start='2012-03-06', end='2012-03-13',
         source='NASA CCMC iSWA HAPI goesp_part_flux_P5M (SWPC real-time GOES primary)', loader=lambda: read_hapi(os.path.join(RAW, 'iswa_hapi', 'goesp_part_flux_P5M_2012-03.csv'))),
    dict(event_id='SPE_2017-09', name='September 2017 SPE', start='2017-09-06', end='2017-09-16',
         source='NASA CCMC iSWA HAPI goesp_part_flux_P5M (SWPC real-time GOES primary)', loader=lambda: read_hapi(os.path.join(RAW, 'iswa_hapi', 'goesp_part_flux_P5M_2017-09.csv'))),
    dict(event_id='SPE_2024-05', name='May 2024 (Gannon storm) SPE', start='2024-05-10', end='2024-05-15',
         source='NASA CCMC iSWA HAPI goesp_part_flux_P5M (SWPC real-time GOES primary)', loader=lambda: read_hapi(os.path.join(RAW, 'iswa_hapi', 'goesp_part_flux_P5M_2024-05.csv'))),
    dict(event_id='SPE_2026-01', name='January 2026 SPE', start='2026-01-18', end='2026-01-26',
         source='NASA CCMC iSWA HAPI goesp_part_flux_P5M (SWPC real-time GOES primary)', loader=lambda: read_hapi(os.path.join(RAW, 'iswa_hapi', 'goesp_part_flux_P5M_2026-01.csv'))),
]


def s_level(f):
    for lvl, thr in ((5, 1e5), (4, 1e4), (3, 1e3), (2, 1e2), (1, 10)):
        if f is not None and f >= thr:
            return 'S%d' % lvl
    return 'none'


# --- official SWPC SPE list (from NCEI-hosted page) ---
t = open(os.path.join(RAW, 'spe_list', 'ngdc_SEP_page.html'), encoding='utf-8', errors='replace').read()
spe = []
for r in re.findall(r'<tr[^>]*>(.*?)</tr>', t, re.S)[1:]:
    c = [' '.join(html.unescape(re.sub(r'<[^>]*>', ' ', x)).split()) for x in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', r, re.S)]
    if len(c) < 6:
        continue

    def ts(s):
        m = re.match(r'(\d{4}) (\d\d)/(\d\d) (\d\d)(\d\d)', s)
        return '%s-%s-%sT%s:%s:00Z' % m.groups() if m else ''
    spe.append(dict(begin_utc=ts(c[0]), max_utc=ts(c[1]), max_pfu_ge10MeV=c[2].replace(',', ''), noaa_region=c[3], location=c[4],
                    flare=c[5], type_ii=c[6] if len(c) > 6 else '', type_iv=c[7] if len(c) > 7 else '', cme_speed=c[8] if len(c) > 8 else ''))
for s in spe:
    try:
        s['noaa_s_level'] = s_level(float(s['max_pfu_ge10MeV']))
    except ValueError:
        s['noaa_s_level'] = ''
with open(os.path.join(OUT, 'swpc_spe_list_1976_present.csv'), 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(spe[0].keys()))
    w.writeheader(); w.writerows(spe)
print('SPE list rows', len(spe))

# --- per-event tidy + summary ---
summary = []
for ev in EVENTS:
    t0, t1 = datetime.strptime(ev['start'], '%Y-%m-%d'), datetime.strptime(ev['end'], '%Y-%m-%d')
    rows = sorted([r for r in ev['loader']() if t0 <= r[0] < t1], key=lambda r: r[0])
    sats = sorted({r[2] for r in rows})
    with open(os.path.join(OUT, 'events', ev['event_id'] + '_goes_integral_protons_5min.csv'), 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['timestamp_utc', 'event_id', 'channel', 'value', 'unit', 'satellite'])
        for tt, vals, sat in rows:
            for ch in CHANNEL_ORDER:
                if ch in vals:
                    w.writerow([tt.strftime(FMT), ev['event_id'], 'proton_flux_' + ch + 'MeV', '%.6g' % vals[ch], 'pfu', sat])
    s10 = [(tt, v['ge10']) for tt, v, _ in rows if 'ge10' in v]
    pk_t, pk = max(s10, key=lambda x: x[1])
    # SWPC definition: start = first of 3 consecutive points >= 10 pfu; end = last point >= 10 pfu
    start = None
    for k in range(len(s10) - 2):
        if all(s10[k + j][1] >= 10 for j in range(3)) and all((s10[k + j + 1][0] - s10[k + j][0]) <= timedelta(minutes=5) for j in range(2)):
            start = s10[k][0]; break
    end = max((tt for tt, v in s10 if v >= 10), default=None)
    above = sum(1 for tt, v in s10 if v >= 10) * 5 / 60.0
    def peak(ch):
        s = [(tt, v[ch]) for tt, v, _ in rows if ch in v]
        return max(s, key=lambda x: x[1]) if s else (None, None)
    p100 = peak('ge100'); p50 = peak('ge50'); p30 = peak('ge30')
    fl10 = sum(v for _, v in s10) * 300.0
    fl100 = sum(v['ge100'] for _, v, _ in rows if 'ge100' in v) * 300.0
    expected = int((t1 - t0).total_seconds() / 300)
    summary.append(dict(
        event_id=ev['event_id'], name=ev['name'], window_start_utc=t0.strftime(FMT), window_end_utc=t1.strftime(FMT),
        satellites=';'.join(sats), source=ev['source'], n_timestamps=len(rows), expected_timestamps_5min=expected,
        start_ge10MeV_utc=start.strftime(FMT) if start else '', end_ge10MeV_utc=end.strftime(FMT) if end else '',
        duration_start_to_end_h='%.1f' % ((end - start).total_seconds() / 3600) if start and end else '',
        hours_above_10pfu='%.1f' % above,
        peak_ge10MeV_utc=pk_t.strftime(FMT), peak_ge10MeV_pfu='%.4g' % pk, noaa_s_level=s_level(pk),
        peak_ge30MeV_pfu='%.4g' % p30[1] if p30[1] is not None else '',
        peak_ge50MeV_pfu='%.4g' % p50[1] if p50[1] is not None else '',
        peak_ge100MeV_utc=p100[0].strftime(FMT) if p100[0] else '', peak_ge100MeV_pfu='%.4g' % p100[1] if p100[1] is not None else '',
        window_integrated_ge10MeV_per_sr_cm2='%.4g' % fl10, window_integrated_ge100MeV_per_sr_cm2='%.4g' % fl100,
    ))
    # matching official SWPC list entries inside the window
    off = [s for s in spe if s['begin_utc'] and t0 - timedelta(days=2) <= datetime.strptime(s['begin_utc'], FMT) < t1]
    summary[-1]['swpc_official_list'] = ' | '.join('%s begin, max %s pfu at %s' % (s['begin_utc'], s['max_pfu_ge10MeV'], s['max_utc']) for s in off)
    print(ev['event_id'], len(rows), '/', expected, sats, 'peak10', pk, pk_t, s_level(pk), 'peak100', p100[1], '| official:', summary[-1]['swpc_official_list'])

with open(os.path.join(OUT, 'spe_events_summary.csv'), 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(summary[0].keys()))
    w.writeheader(); w.writerows(summary)

# --- DONKI ---
drows = []
for fn in sorted(os.listdir(os.path.join(RAW, 'donki'))):
    if not fn.endswith('.json'):
        continue
    typ = fn.split('_')[1]
    for e in json.load(open(os.path.join(RAW, 'donki', fn))):
        drows.append(dict(type=typ, activity_id=e.get('sepID') or e.get('activityID') or e.get('flrID'), start_utc=e.get('eventTime') or e.get('startTime') or e.get('beginTime'),
                          instruments=';'.join(i['displayName'] for i in (e.get('instruments') or [])),
                          linked_events=';'.join(l['activityID'] for l in (e.get('linkedEvents') or [])),
                          notes='notifications=' + ';'.join(n['messageID'] for n in (e.get('sentNotifications') or [])), link=e.get('link')))
with open(os.path.join(OUT, 'donki_events.csv'), 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=['type', 'activity_id', 'start_utc', 'instruments', 'linked_events', 'notes', 'link'])
    w.writeheader(); w.writerows(drows)
print('DONKI rows', len(drows))

# --- NOAA scales (values transcribed from raw/noaa_scales/noaa-scales-explanation.html) ---
with open(os.path.join(OUT, 'noaa_scales_thresholds.csv'), 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['scale', 'level', 'description', 'physical_measure', 'threshold_value', 'threshold_unit', 'avg_frequency_per_11yr_cycle', 'biological_effect'])
    S = [('S1', 'Minor', 10, '50 per cycle', 'None.'),
         ('S2', 'Moderate', 100, '25 per cycle', 'Passengers and crew in high-flying aircraft at high latitudes may be exposed to elevated radiation risk.'),
         ('S3', 'Strong', 1000, '10 per cycle', 'Radiation hazard avoidance recommended for astronauts on EVA; passengers and crew in high-flying aircraft at high latitudes may be exposed to radiation risk.'),
         ('S4', 'Severe', 10000, '3 per cycle', 'Unavoidable radiation hazard to astronauts on EVA; passengers and crew in high-flying aircraft at high latitudes may be exposed to radiation risk.'),
         ('S5', 'Extreme', 100000, 'Fewer than 1 per cycle', 'Unavoidable high radiation hazard to astronauts on EVA (extra-vehicular activity); passengers and crew in high-flying aircraft at high latitudes may be exposed to radiation risk.')]
    for lvl, d, thr, fr, bio in S:
        w.writerow(['solar_radiation_storm', lvl, d, 'GOES >=10 MeV integral proton flux (5-min avg)', thr, 'pfu', fr, bio])
    R = [('R1', 'Minor', 'M1', 1e-5, '2000 per cycle (950 days per cycle)'), ('R2', 'Moderate', 'M5', 5e-5, '350 per cycle (300 days per cycle)'),
         ('R3', 'Strong', 'X1', 1e-4, '175 per cycle (140 days per cycle)'), ('R4', 'Severe', 'X10', 1e-3, '8 per cycle (8 days per cycle)'),
         ('R5', 'Extreme', 'X20', 2e-3, 'Less than 1 per cycle')]
    for lvl, d, cls, thr, fr in R:
        w.writerow(['radio_blackout', lvl, d, 'GOES X-ray peak brightness 0.1-0.8 nm (class %s)' % cls, thr, 'W/m^2', fr, ''])
print('done')
