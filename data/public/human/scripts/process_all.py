"""Tidy downloaded public human datasets into data/public/human/processed/.
Run from the scratchpad (not from raw/): python3 -P -E process_all.py
Reads untrusted CSV/XPT/ZIP as data only (pandas/zipfile); nothing is executed.
"""
import io, zipfile
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path('/home/bartek/NASA-HACKATHON')
RAW = ROOT / 'data/public/human/raw'
OUT = ROOT / 'data/public/human/processed'
NASA = ROOT / 'data/nasa'
OUT.mkdir(parents=True, exist_ok=True)
calib = []  # rows: variable, population, statistic, value, unit, n, source, notes


def add(var, pop, stat, val, unit, n, src, notes=''):
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return
    calib.append(dict(variable=var, population=pop, statistic=stat,
                      value=round(float(val), 4), unit=unit, n=n, source=src, notes=notes))


def wquantile(x, w, qs):
    o = np.argsort(x); x = x[o]; w = w[o]
    cw = (np.cumsum(w) - 0.5 * w) / w.sum()
    return np.interp(qs, cw, x)


def describe(series, weights=None):
    s = pd.Series(series).astype(float)
    m = s.notna()
    if weights is not None:
        m &= pd.Series(weights).notna() & (pd.Series(weights) > 0)
    x = s[m].to_numpy()
    if len(x) == 0:
        return None
    qs = [0.05, 0.25, 0.5, 0.75, 0.95]
    if weights is None:
        p = np.quantile(x, qs); mean = x.mean(); sd = x.std(ddof=1) if len(x) > 1 else np.nan
    else:
        w = pd.Series(weights)[m].to_numpy().astype(float)
        mean = np.average(x, weights=w); sd = np.sqrt(np.average((x - mean) ** 2, weights=w))
        p = wquantile(x, w, qs)
    return dict(n=len(x), mean=mean, sd=sd, p05=p[0], p25=p[1], p50=p[2], p75=p[3], p95=p[4],
                min=x.min(), max=x.max())

# ---------------------------------------------------------------- 1. OSDR
def alamar_long(path, fluid):
    d = pd.read_csv(path, encoding='utf-8-sig')
    d = d.rename(columns={d.columns[0]: 'sample_name'})
    if 'Unnamed: 2' in d.columns:  # header missing in source file; position matches serum file
        d = d.rename(columns={'Unnamed: 2': 'activin_a_percent_normalized_value'})
    long = d.melt(id_vars='sample_name', var_name='col', value_name='value')
    long['metric'] = np.where(long.col.str.endswith('_concentration_npq'), 'npq',
                              np.where(long.col.str.endswith('_percent_normalized_value'), 'percent_normalized', 'other'))
    long['analyte'] = long.col.str.replace('_concentration_npq', '', regex=False).str.replace('_percent_normalized_value', '', regex=False)
    w = long.pivot_table(index=['sample_name', 'analyte'], columns='metric', values='value', aggfunc='first').reset_index()
    parts = w.sample_name.str.split('_', expand=True)
    w.insert(1, 'subject_id', parts[0]); w.insert(2, 'fluid', fluid); w.insert(3, 'timepoint', parts[2])
    w['phase'] = np.where(w.timepoint.str.startswith('L'), 'preflight', 'postflight')
    w['day_rel_launch_or_return'] = w.timepoint.str.replace('L', '', regex=False).str.replace('R', '', regex=False).astype(int)
    w.columns.name = None
    return w[['sample_name', 'subject_id', 'fluid', 'timepoint', 'phase', 'day_rel_launch_or_return', 'analyte', 'npq', 'percent_normalized']]

u = alamar_long(RAW / 'osdr/LSDS-64_Multiplex_urine.immune.AlamarPanel_TRANSFORMED.csv', 'urine')
u.to_csv(OUT / 'osd656_inspiration4_urine_alamar_long.csv', index=False)
s = alamar_long(RAW / 'osdr/LSDS-8_Multiplex_serum.immune.AlamarPanel_TRANSFORMED.csv', 'serum')
s.to_csv(OUT / 'osd575_inspiration4_serum_alamar_long.csv', index=False)
cv = pd.read_csv(RAW / 'osdr/LSDS-8_Multiplex_serum.cardiovascular.EvePanel_SUBMITTED.csv', encoding='utf-8-sig')
cv = cv.rename(columns={'Analyte': 'analyte', 'Concentration': 'concentration', 'Timepoint': 'timepoint', 'ID': 'subject_id',
                        'Unit': 'unit', 'Timepoint2': 'phase', 'Type': 'panel', 'Percent': 'percent_of_reference'})
cv.to_csv(OUT / 'osd575_inspiration4_cardio_panel_long.csv', index=False)

# Inspiration4 clinical labs (already in repo, read only) -> calibration
def i4(path, tcol):
    d = pd.read_csv(path, encoding='utf-8-sig')
    d = d[d.ANALYTE != 'ANALYTE'].copy()
    d['VALUE'] = pd.to_numeric(d.VALUE, errors='coerce')
    d['tp'] = d[tcol].astype(str)
    d['phase'] = np.where(d.tp.str.startswith('L'), 'preflight', np.where(d.tp == 'R+1', 'postflight_R+1', 'recovery_R+45..R+194'))
    return d
labs = pd.concat([i4(NASA / 'osd575_inspiration4_cmp_long.csv', 'timepoint'), i4(NASA / 'osd569_inspiration4_cbc_long.csv', 'TEST_DATE')])
keep = {'GLUCOSE': 'glucose_serum', 'CREATININE': 'creatinine_serum', 'UREA NITROGEN (BUN)': 'bun_serum', 'SODIUM': 'sodium_serum',
        'POTASSIUM': 'potassium_serum', 'CALCIUM': 'calcium_serum', 'ALBUMIN': 'albumin_serum',
        'WHITE BLOOD CELL COUNT': 'wbc', 'HEMOGLOBIN': 'hemoglobin', 'HEMOGLOBIN (FEMALE)': 'hemoglobin',
        'HEMATOCRIT': 'hematocrit', 'HEMATOCRIT (FEMALE)': 'hematocrit', 'PLATELET COUNT': 'platelets',
        'RED BLOOD CELL COUNT': 'rbc', 'RED BLOOD CELL COUNT (FEMALE)': 'rbc', 'ABSOLUTE LYMPHOCYTES': 'lymphocytes_abs',
        'ABSOLUTE NEUTROPHILS': 'neutrophils_abs'}
labs = labs[labs.ANALYTE.isin(keep)].copy(); labs['var'] = labs.ANALYTE.map(keep)
for (var, phase), g in labs.groupby(['var', 'phase']):
    unit = g.UNITS.iloc[0]; pop = f'Inspiration4 crew (n=4 civilians, 3-day LEO), {phase}'
    v = g.VALUE.dropna()
    add(var, pop, 'mean', v.mean(), unit, len(v), 'OSDR OSD-575/OSD-569 (data/nasa)', 'pooled over subjects x timepoints in phase')
    add(var, pop, 'min', v.min(), unit, len(v), 'OSDR OSD-575/OSD-569 (data/nasa)')
    add(var, pop, 'max', v.max(), unit, len(v), 'OSDR OSD-575/OSD-569 (data/nasa)')
for var, g in labs.groupby('var'):
    for sex, gg in g.groupby('SEX'):
        rmin = pd.to_numeric(gg.RANGE_MIN, errors='coerce').mode(); rmax = pd.to_numeric(gg.RANGE_MAX, errors='coerce').mode()
        unit = gg.UNITS.iloc[0]
        if len(rmin): add(var, f'Quest lab reference range used for Inspiration4 ({sex})', 'ref_low', rmin.iloc[0], unit, None, 'OSDR OSD-575/OSD-569 (data/nasa)')
        if len(rmax): add(var, f'Quest lab reference range used for Inspiration4 ({sex})', 'ref_high', rmax.iloc[0], unit, None, 'OSDR OSD-575/OSD-569 (data/nasa)')

# Astronaut BP (Mendeley, ISS rows)
bp = pd.read_csv(NASA / 'mendeley_bp_in_spaceflight.csv', na_values=['np.nan'])
iss = bp[bp.mission_type == 'ISS'].copy()
iss['posture_condition'] = iss.source.str.extract(r'\(([^)]*)\)\s*$')[0]
iss.to_csv(OUT / 'mendeley_bp_iss_rows.csv', index=False)
rest = iss[~iss.source.str.contains(r'Stand|Sitting', case=False, regex=True)]
for ph in ['pre', 'in', 'post']:
    for comp in ['sbp', 'dbp']:
        col = f'{ph}_{comp}'
        g = rest[[col, 'n']].dropna()
        if len(g):
            add(f'{comp}_astronaut', f'ISS long-duration astronauts, {ph}flight, supine/rest conditions', 'n_weighted_mean_of_study_means',
                np.average(g[col], weights=g.n), 'mmHg', int(g.n.sum()), 'Mendeley Data 10.17632/pz6nt4cpxs.1 (CC BY 4.0)',
                f'{len(g)} study rows; excludes standing/sitting orthostatic conditions; study rows may share subjects')
            add(f'{comp}_astronaut', f'ISS long-duration astronauts, {ph}flight, supine/rest conditions', 'min_study_mean', g[col].min(), 'mmHg', int(g.n.sum()), 'Mendeley Data 10.17632/pz6nt4cpxs.1 (CC BY 4.0)')
            add(f'{comp}_astronaut', f'ISS long-duration astronauts, {ph}flight, supine/rest conditions', 'max_study_mean', g[col].max(), 'mmHg', int(g.n.sum()), 'Mendeley Data 10.17632/pz6nt4cpxs.1 (CC BY 4.0)')
# paired in-flight vs preflight deltas (rows with both)
pair = rest.dropna(subset=['in_sbp', 'pre_sbp'])
if len(pair):
    add('sbp_astronaut_delta_inflight_minus_preflight', 'ISS astronauts (studies reporting both)', 'n_weighted_mean', np.average(pair.in_sbp - pair.pre_sbp, weights=pair.n), 'mmHg', int(pair.n.sum()), 'Mendeley Data 10.17632/pz6nt4cpxs.1 (CC BY 4.0)', f'{len(pair)} study rows')
    add('dbp_astronaut_delta_inflight_minus_preflight', 'ISS astronauts (studies reporting both)', 'n_weighted_mean', np.average(pair.in_dbp - pair.pre_dbp, weights=pair.n), 'mmHg', int(pair.n.sum()), 'Mendeley Data 10.17632/pz6nt4cpxs.1 (CC BY 4.0)', f'{len(pair)} study rows')

# ---------------------------------------------------------------- 2a. MMASH
z = zipfile.ZipFile(RAW / 'mmash/MMASH.zip')
users = sorted({n.split('/')[1] for n in z.namelist() if n.startswith('DataPaper/user_')}, key=lambda x: int(x.split('_')[1]))
rd = lambda u, f: pd.read_csv(io.BytesIO(z.read(f'DataPaper/{u}/{f}.csv')), index_col=0)
info, sleep, quest, saliva, act, hrmin, summ = [], [], [], [], [], [], []
fixday = lambda day: 2 if int(day) == -29 else int(day)  # users 8/9: day '-29' is a month-rollover artefact for recording day 2
tmin = lambda day, t: (fixday(day) - 1) * 1440 + int(t.split(':')[0]) * 60 + int(t.split(':')[1])
for u in users:
    uid = u.replace('user_', 'U')
    a = rd(u, 'user_info'); a.insert(0, 'user', uid); info.append(a)
    sl = rd(u, 'sleep'); sl.insert(0, 'user', uid); sleep.append(sl)
    q = rd(u, 'questionnaire'); q.insert(0, 'user', uid); quest.append(q)
    try:
        sv = rd(u, 'saliva'); sv.insert(0, 'user', uid); saliva.append(sv)
    except KeyError:
        pass
    ac = rd(u, 'Activity'); ac.insert(0, 'user', uid); act.append(ac)
    rr = rd(u, 'RR')
    rr = rr[(rr.ibi_s >= 0.33) & (rr.ibi_s <= 1.5)].copy()  # 40-180 bpm plausibility filter
    rr['minute'] = [tmin(d, t) for d, t in zip(rr.day, rr.time)]
    rr['d'] = rr.ibi_s.diff().abs()
    rr.loc[rr.d > 0.2, 'd'] = np.nan  # drop successive-difference artefacts
    g = rr.groupby('minute')
    m = pd.DataFrame({'n_beats': g.ibi_s.size(), 'hr_bpm': 60 / g.ibi_s.mean(),
                      'rmssd_ms': g.d.apply(lambda x: np.sqrt(np.nanmean(x ** 2)) * 1000 if x.notna().sum() >= 10 else np.nan)}).reset_index()
    m = m[m.n_beats >= 20]  # minutes with sparse coverage dropped
    ag = rd(u, 'Actigraph'); ag['minute'] = [tmin(d, t) for d, t in zip(ag.day, ag.time)]
    steps = ag.groupby('minute').Steps.sum().rename('steps')
    m = m.merge(steps, on='minute', how='left')
    # sleep flag from sleep.csv (onset -> out of bed)
    m['asleep_window'] = False
    for _, r in sl.iterrows():
        on = tmin(r['Onset Date'], r['Onset Time']); off = tmin(r['Out Bed Date'], r['Out Bed Time'])
        if off <= on:  # some sleep.csv rows keep date=1 after midnight
            off += 1440
        m.loc[(m.minute >= on) & (m.minute < off), 'asleep_window'] = True
    m.insert(0, 'user', uid); m.insert(2, 'day', m.minute // 1440 + 1)
    m['minute'] = m.minute.astype(int)
    m.insert(3, 'clock', [f'{(x % 1440) // 60:02d}:{x % 60:02d}' for x in m.minute])
    hrmin.append(m)
    no_sleep = len(sl) == 0
    summ.append(dict(user=uid, age=a.Age.iloc[0] if a.Age.iloc[0] > 0 else np.nan, weight_kg=a.Weight.iloc[0], height_cm=a.Height.iloc[0],
                     bmi=a.Weight.iloc[0] / (a.Height.iloc[0] / 100) ** 2 if a.Height.iloc[0] else np.nan,
                     tst_min=np.nan if no_sleep else sl['Total Sleep Time (TST)'].sum(), time_in_bed_min=np.nan if no_sleep else sl['Total Minutes in Bed'].sum(),
                     sleep_efficiency_pct=np.average(sl.Efficiency, weights=sl['Total Minutes in Bed']) if sl['Total Minutes in Bed'].sum() else np.nan,
                     waso_min=np.nan if no_sleep else sl['Wake After Sleep Onset (WASO)'].sum(), n_sleep_bouts=len(sl),
                     hr_sleep_mean=m.loc[m.asleep_window, 'hr_bpm'].mean(),
                     hr_awake_mean=m.loc[~m.asleep_window, 'hr_bpm'].mean(),
                     hr_minute_p05=m.hr_bpm.quantile(0.05), rmssd_sleep_median_ms=m.loc[m.asleep_window, 'rmssd_ms'].median(),
                     steps_total=m.steps.sum(), recorded_minutes=len(m),
                     stai_state=q.STAI1.iloc[0] if q.STAI1.iloc[0] >= 20 else np.nan, stai_trait=q.STAI2.iloc[0] if q.STAI2.iloc[0] >= 20 else np.nan, psqi=q.Pittsburgh.iloc[0], daily_stress_dsi=q.Daily_stress.iloc[0],
                     panas_pos_mean=q.filter(like='panas_pos').iloc[0].mean(), panas_neg_mean=q.filter(like='panas_neg').iloc[0].mean()))
pd.concat(info).to_csv(OUT / 'mmash_user_info.csv', index=False)
pd.concat(sleep).to_csv(OUT / 'mmash_sleep.csv', index=False)
pd.concat(quest).to_csv(OUT / 'mmash_questionnaire.csv', index=False)
pd.concat(saliva).to_csv(OUT / 'mmash_saliva.csv', index=False)
pd.concat(act).to_csv(OUT / 'mmash_activity_log.csv', index=False)
hm = pd.concat(hrmin); hm['hr_bpm'] = hm.hr_bpm.round(2); hm['rmssd_ms'] = hm.rmssd_ms.round(2)
hm.to_csv(OUT / 'mmash_hr_per_minute.csv', index=False)
ms = pd.DataFrame(summ).round(3); ms.to_csv(OUT / 'mmash_user_summary.csv', index=False)
src = 'PhysioNet MMASH v1.0.0 doi:10.13026/cerq-fc86 (ODbL 1.0)'
pop = 'MMASH healthy young adult males (Italy), 24 h free-living'
mmvars = {'hr_sleep_mean': ('heart_rate_sleeping', 'bpm'), 'hr_awake_mean': ('heart_rate_awake', 'bpm'), 'hr_minute_p05': ('heart_rate_resting_proxy_p05_minute', 'bpm'),
          'rmssd_sleep_median_ms': ('hrv_rmssd_sleep', 'ms'), 'tst_min': ('sleep_total_minutes', 'min'), 'sleep_efficiency_pct': ('sleep_efficiency', '%'),
          'waso_min': ('sleep_waso', 'min'), 'stai_state': ('anxiety_stai_state', 'score 20-80'), 'psqi': ('sleep_quality_psqi', 'score 0-21 (lower better)'),
          'daily_stress_dsi': ('daily_stress_dsi', 'score 0-406'), 'panas_pos_mean': ('mood_panas_positive', 'score 10-50'), 'panas_neg_mean': ('mood_panas_negative', 'score 10-50'),
          'age': ('age', 'years')}
for c, (v, unit) in mmvars.items():
    dsc = describe(ms[c])
    for k in ['mean', 'sd', 'p05', 'p50', 'p95']:
        add(v, pop, k, dsc[k], unit, dsc['n'], src, 'one value per participant')

# ---------------------------------------------------------------- 2b. LifeSnaps
l = pd.read_csv(RAW / 'lifesnaps/daily_fitbit_sema_df_unprocessed.csv', index_col=0)
idmap = {k: f'P{i + 1:02d}' for i, k in enumerate(sorted(l.id.unique()))}
l['participant'] = l.id.map(idmap)
l['sleep_duration_min'] = l.sleep_duration / 60000.0
cols = ['participant', 'date', 'age', 'gender', 'bmi', 'resting_hr', 'nremhr', 'rmssd', 'spo2', 'full_sleep_breathing_rate',
        'nightly_temperature', 'daily_temperature_variation', 'stress_score', 'sleep_points_percentage', 'minutesAsleep', 'minutesAwake',
        'sleep_duration_min', 'minutesToFallAsleep', 'sleep_efficiency', 'sleep_deep_ratio', 'sleep_rem_ratio', 'sleep_light_ratio',
        'steps', 'sedentary_minutes', 'lightly_active_minutes', 'moderately_active_minutes', 'very_active_minutes', 'calories',
        'ALERT', 'HAPPY', 'NEUTRAL', 'RESTED/RELAXED', 'SAD', 'TENSE/ANXIOUS', 'TIRED']
lt = l[cols].rename(columns={'age': 'age_band', 'bmi': 'bmi_band', 'minutesAsleep': 'minutes_asleep', 'minutesAwake': 'minutes_awake',
                             'minutesToFallAsleep': 'minutes_to_fall_asleep', 'nremhr': 'nrem_hr', 'rmssd': 'rmssd_ms',
                             'nightly_temperature': 'nightly_skin_temp_c', 'daily_temperature_variation': 'skin_temp_variation_c',
                             'ALERT': 'mood_alert', 'HAPPY': 'mood_happy', 'NEUTRAL': 'mood_neutral', 'RESTED/RELAXED': 'mood_rested_relaxed',
                             'SAD': 'mood_sad', 'TENSE/ANXIOUS': 'mood_tense_anxious', 'TIRED': 'mood_tired'})
lt = lt.sort_values(['participant', 'date'])
lt.to_csv(OUT / 'lifesnaps_daily.csv', index=False)
for f in ['panas', 'stai']:
    t = pd.read_csv(RAW / f'lifesnaps/{f}.csv', index_col=0)
    t['participant'] = t.user_id.map(idmap); t = t.drop(columns=['user_id'])
    t[['participant'] + [c for c in t.columns if c != 'participant']].to_csv(OUT / f'lifesnaps_{f}_scored.csv', index=False)
src = 'Zenodo 10.5281/zenodo.7229547 LifeSnaps (CC BY 4.0)'
pop = 'LifeSnaps adults (Europe, Fitbit Sense), participant-day level'
# filter implausible sleep (naps / multi-session merges)
lsl = lt[(lt.minutes_asleep >= 180) & (lt.minutes_asleep <= 720)]
lst = lt[lt.stress_score > 0]  # 0 appears to encode 'not computed'
lvars = {'resting_hr': ('heart_rate_resting', 'bpm', lt), 'nrem_hr': ('heart_rate_sleeping', 'bpm', lt), 'rmssd_ms': ('hrv_rmssd_sleep', 'ms', lt),
         'spo2': ('spo2_sleep', '%', lt), 'skin_temp_variation_c': ('skin_temp_nightly_deviation', 'degC', lt), 'stress_score': ('fitbit_stress_score', '0-100 (higher=less stress)', lst),
         'minutes_asleep': ('sleep_total_minutes', 'min', lsl), 'sleep_efficiency': ('sleep_efficiency', '%', lsl), 'steps': ('steps_daily', 'steps', lt)}
for c, (v, unit, df) in lvars.items():
    dsc = describe(df[c])
    for k in ['mean', 'sd', 'p05', 'p50', 'p95']:
        add(v, pop, k, dsc[k], unit, dsc['n'], src, 'participant-days; sleep filtered to 180-720 min' if df is lsl else 'participant-days')
    # within-person day-to-day SD (useful for synthetic day-to-day noise)
    wsd = df.groupby('participant')[c].std().dropna()
    add(v, pop.replace('participant-day level', 'within-person'), 'median_within_person_sd', wsd.median(), unit, len(wsd), src, 'median across participants of day-to-day SD')
moods = [c for c in lt.columns if c.startswith('mood_')]
for c in moods:
    v = lt[c].dropna(); add(c, pop, 'share_of_days_reported', v.mean(), 'fraction', len(v), src, 'fraction of days with >=1 EMA where this mood was selected')

# ---------------------------------------------------------------- 3. NHANES 2017-2018
N = RAW / 'nhanes_2017_2018'
rx = lambda f: pd.read_sas(N / f'{f}.xpt', format='xport')
demo = rx('DEMO_J')[['SEQN', 'RIAGENDR', 'RIDAGEYR', 'RIDEXPRG', 'RIDRETH3', 'WTMEC2YR', 'SDMVPSU', 'SDMVSTRA']]
bpx = rx('BPX_J'); bpxo = rx('BPXO_J'); glu = rx('GLU_J'); acr = rx('ALB_CR_J'); ufl = rx('UCFLOW_J'); bmx = rx('BMX_J')
diq = rx('DIQ_J')[['SEQN', 'DIQ010']]; bpq = rx('BPQ_J')[['SEQN', 'BPQ020']]; cbc = rx('CBC_J')
d = demo.copy()
d['sex'] = d.RIAGENDR.map({1: 'M', 2: 'F'})
bpx['sbp_ausc_mmhg'] = bpx[['BPXSY1', 'BPXSY2', 'BPXSY3', 'BPXSY4']].mean(axis=1)
bpx['dbp_ausc_mmhg'] = bpx[['BPXDI1', 'BPXDI2', 'BPXDI3', 'BPXDI4']].replace(0, np.nan).mean(axis=1)  # DBP 0 = Korotkoff to zero
bpxo['sbp_osc_mmhg'] = bpxo[['BPXOSY1', 'BPXOSY2', 'BPXOSY3']].mean(axis=1)
bpxo['dbp_osc_mmhg'] = bpxo[['BPXODI1', 'BPXODI2', 'BPXODI3']].mean(axis=1)
bpxo['pulse_osc_bpm'] = bpxo[['BPXOPLS1', 'BPXOPLS2', 'BPXOPLS3']].mean(axis=1)
d = d.merge(bpx[['SEQN', 'sbp_ausc_mmhg', 'dbp_ausc_mmhg', 'BPXPLS']], on='SEQN', how='left')
d = d.merge(bpxo[['SEQN', 'sbp_osc_mmhg', 'dbp_osc_mmhg', 'pulse_osc_bpm']], on='SEQN', how='left')
d = d.merge(bmx[['SEQN', 'BMXWT', 'BMXHT', 'BMXBMI']], on='SEQN', how='left')
d = d.merge(glu[['SEQN', 'WTSAF2YR', 'LBXGLU']], on='SEQN', how='left')
d = d.merge(acr[['SEQN', 'URXUMA', 'URXUCR', 'URDACT']], on='SEQN', how='left')
d = d.merge(ufl[['SEQN', 'URXVOL1', 'URDFLOW1', 'URDTIME1']], on='SEQN', how='left')
d = d.merge(cbc[['SEQN', 'LBXWBCSI', 'LBXHGB', 'LBXHCT', 'LBXPLTSI', 'LBXRBCSI', 'LBDLYMNO', 'LBDNENO']], on='SEQN', how='left')
d = d.merge(diq, on='SEQN', how='left').merge(bpq, on='SEQN', how='left')
d = d.rename(columns={'RIDAGEYR': 'age_years', 'RIDEXPRG': 'pregnancy_status', 'RIDRETH3': 'race_eth3', 'WTMEC2YR': 'weight_mec2yr',
                      'BPXPLS': 'pulse_60s_bpm', 'BMXWT': 'weight_kg', 'BMXHT': 'height_cm', 'BMXBMI': 'bmi', 'WTSAF2YR': 'weight_fasting2yr',
                      'LBXGLU': 'glucose_fasting_mgdl', 'URXUMA': 'urine_albumin_mgL', 'URXUCR': 'urine_creatinine_mgdl', 'URDACT': 'urine_acr_mg_per_g',
                      'URXVOL1': 'urine_void1_volume_ml', 'URDFLOW1': 'urine_void1_flow_ml_min', 'URDTIME1': 'urine_void1_minutes_since_last',
                      'LBXWBCSI': 'wbc_1000_per_ul', 'LBXHGB': 'hemoglobin_gdl', 'LBXHCT': 'hematocrit_pct', 'LBXPLTSI': 'platelets_1000_per_ul',
                      'LBXRBCSI': 'rbc_million_per_ul', 'LBDLYMNO': 'lymphocytes_1000_per_ul', 'LBDNENO': 'neutrophils_1000_per_ul',
                      'DIQ010': 'told_diabetes', 'BPQ020': 'told_hypertension'})
d = d[(d.age_years >= 25) & (d.age_years <= 55)].copy()
d['healthy'] = ((d.pregnancy_status != 1) & (d.told_diabetes != 1) & (d.told_hypertension != 1) & d.bmi.between(18.5, 29.99))
d = d.drop(columns=['RIAGENDR'])
d.to_csv(OUT / 'nhanes_2017_2018_adults_25_55.csv', index=False)
h = d[d.healthy]
rows = []
nvars = {'sbp_osc_mmhg': ('sbp', 'mmHg', 'weight_mec2yr'), 'dbp_osc_mmhg': ('dbp', 'mmHg', 'weight_mec2yr'),
         'sbp_ausc_mmhg': ('sbp_auscultatory', 'mmHg', 'weight_mec2yr'), 'dbp_ausc_mmhg': ('dbp_auscultatory', 'mmHg', 'weight_mec2yr'),
         'pulse_60s_bpm': ('heart_rate_seated_clinic', 'bpm', 'weight_mec2yr'), 'pulse_osc_bpm': ('heart_rate_seated_oscillometric', 'bpm', 'weight_mec2yr'),
         'bmi': ('bmi', 'kg/m2', 'weight_mec2yr'), 'glucose_fasting_mgdl': ('glucose_fasting', 'mg/dL', 'weight_fasting2yr'),
         'urine_acr_mg_per_g': ('urine_albumin_creatinine_ratio', 'mg/g', 'weight_mec2yr'), 'urine_albumin_mgL': ('urine_albumin', 'mg/L', 'weight_mec2yr'),
         'urine_creatinine_mgdl': ('urine_creatinine', 'mg/dL', 'weight_mec2yr'), 'urine_void1_flow_ml_min': ('urine_flow_rate', 'mL/min', 'weight_mec2yr'),
         'urine_void1_volume_ml': ('urine_void_volume', 'mL', 'weight_mec2yr'),
         'wbc_1000_per_ul': ('wbc', '1000 cells/uL', 'weight_mec2yr'), 'hemoglobin_gdl': ('hemoglobin', 'g/dL', 'weight_mec2yr'),
         'hematocrit_pct': ('hematocrit', '%', 'weight_mec2yr'), 'platelets_1000_per_ul': ('platelets', '1000 cells/uL', 'weight_mec2yr'),
         'lymphocytes_1000_per_ul': ('lymphocytes_abs', '1000 cells/uL', 'weight_mec2yr'), 'neutrophils_1000_per_ul': ('neutrophils_abs', '1000 cells/uL', 'weight_mec2yr')}
src = 'CDC NHANES 2017-2018 (public domain)'
for c, (v, unit, wcol) in nvars.items():
    for sex in ['all', 'M', 'F']:
        g = h if sex == 'all' else h[h.sex == sex]
        dsc = describe(g[c], g[wcol])
        if dsc is None:
            continue
        rows.append(dict(variable=v, column=c, unit=unit, sex=sex, weight=wcol, **dsc))
        for k in ['mean', 'sd', 'p05', 'p50', 'p95']:
            add(v, f'NHANES 2017-18 healthy adults 25-55, sex={sex}', k, dsc[k], unit, dsc['n'], src, f'survey-weighted ({wcol}); healthy = not pregnant, no dx diabetes/hypertension, BMI 18.5-30')
pd.DataFrame(rows).round(3).to_csv(OUT / 'nhanes_healthy_25_55_summary.csv', index=False)

cal = pd.DataFrame(calib)
cal.to_csv(OUT / 'calibration_reference.csv', index=False)
print('calibration rows', len(cal))
for f in sorted(OUT.glob('*.csv')):
    print(f.name, sum(1 for _ in open(f)) - 1, f.stat().st_size)
