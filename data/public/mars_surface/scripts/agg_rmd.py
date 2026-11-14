# usage: curl TAB | python3 -I agg_rmd.py <lbl_path> <sol> >> out.csv
# Aggregates REMS MODRDR rows into per-LMST-hour means. Missing = -999.
import sys, csv, datetime, re
lbl = open(sys.argv[1], encoding='latin-1').read()
sol = int(sys.argv[2])
st = re.search(r'^START_TIME\s*=\s*(\S+)', lbl, re.M).group(1)
sc = float(re.search(r'SPACECRAFT_CLOCK_START_COUNT\s*=\s*"?([\d.]+)', lbl).group(1))
t0 = datetime.datetime.fromisoformat(st)
# column index -> (channel, unit, conversion)
cols = {
  15: ('ext_air_temperature', 'C', lambda v: v - 273.15),   # AMBIENT_TEMP (K)
  7:  ('ext_ground_temperature', 'C', lambda v: v - 273.15), # BRIGHTNESS_TEMP (K)
  20: ('uv_abc_irradiance', 'W/m2', lambda v: v),            # UV_ABC
  30: ('ext_relative_humidity', '%', lambda v: v),           # LOCAL_RELATIVE_HUMIDITY
  37: ('ext_pressure', 'Pa', lambda v: v),                   # PRESSURE
}
acc = {}
for row in csv.reader(sys.stdin):
    if len(row) < 40: continue
    try:
        ts = float(row[0]); lmst = row[1].strip()
        if int(lmst[:5]) != sol: continue
        hr = int(lmst[6:8])
    except ValueError:
        continue
    for i, (ch, u, f) in cols.items():
        try: v = float(row[i])
        except ValueError: continue
        if v <= -999: continue
        a = acc.setdefault((hr, ch), [0, 0.0, 1e9, -1e9, 0.0])
        a[0] += 1; a[1] += f(v); a[2] = min(a[2], f(v)); a[3] = max(a[3], f(v)); a[4] += ts
w = csv.writer(sys.stdout)
for (hr, ch), (n, s, mn, mx, tsum) in sorted(acc.items()):
    utc = t0 + datetime.timedelta(seconds=tsum / n - sc)
    w.writerow([utc.strftime('%Y-%m-%dT%H:%M:%SZ'), sol, hr, ch, round(s / n, 3), round(mn, 3), round(mx, 3), n, [c for c in cols.values() if c[0]==ch][0][1]])
