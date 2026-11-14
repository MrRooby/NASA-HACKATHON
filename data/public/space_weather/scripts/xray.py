import csv, sys, os
D = sys.argv[1]; R = os.path.join(D, 'raw', 'iswa_hapi'); O = os.path.join(D, 'processed')
def cls(f):
    for c, thr in (('X', 1e-4), ('M', 1e-5), ('C', 1e-6), ('B', 1e-7), ('A', 1e-8)):
        if f >= thr: return '%s%.1f' % (c, f / thr)
    return ''
def r_level(f):
    for l, t in (('R5', 2e-3), ('R4', 1e-3), ('R3', 1e-4), ('R2', 5e-5), ('R1', 1e-5)):
        if f >= t: return l
    return 'none'
summ = []
for t in ('2017-09', '2024-05', '2026-01'):
    rows = [r for r in csv.reader(open(os.path.join(R, 'goesp_xray_flux_P1M_%s.csv' % t))) if r]
    eid = 'XRAY_' + t
    with open(os.path.join(O, 'events', eid + '_goes_xray_1min.csv'), 'w', newline='') as f:
        w = csv.writer(f); w.writerow(['timestamp_utc', 'event_id', 'channel', 'value', 'unit', 'satellite'])
        for ts, sw, lw, sat in rows:
            if float(lw) > 0: w.writerow([ts, eid, 'xray_flux_0.1-0.8nm', lw, 'W/m^2', sat])
            if float(sw) > 0: w.writerow([ts, eid, 'xray_flux_0.05-0.4nm', sw, 'W/m^2', sat])
    lw = [(r[0], float(r[2])) for r in rows if float(r[2]) > 0]
    # daily maxima of long channel (simple, not a flare catalog)
    days = {}
    for ts, v in lw:
        d = ts[:10]
        if d not in days or v > days[d][1]: days[d] = (ts, v)
    for d, (ts, v) in sorted(days.items()):
        summ.append(dict(window_id=eid, date=d, max_time_utc=ts, max_xray_0p1_0p8nm_Wm2='%.3g' % v, goes_class_from_1min=cls(v), noaa_r_level=r_level(v)))
    print(eid, len(rows), max(lw, key=lambda x: x[1]))
with open(os.path.join(O, 'xray_daily_max_summary.csv'), 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(summ[0])); w.writeheader(); w.writerows(summ)
for s in summ: print(s)
