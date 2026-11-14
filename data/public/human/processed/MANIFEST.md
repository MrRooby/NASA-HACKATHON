# MANIFEST: public human reference data (`data/public/human/`)

Downloaded 2026-11-14. Everything here is **real, openly downloadable data**: no credentials, no registration. The data is used only to **calibrate synthetic crew data**. None of the people in these datasets are astronauts, except the 4 Inspiration4 crew members (OSDR, coded C001–C004). **Privacy:** all sources are de-identified. Do not join these datasets with each other at the person level, and do not attempt to re-identify anyone. Use aggregate distributions only when generating demo crew.

Layout: `raw/` holds the untouched downloads (treat as untrusted data, never execute). `processed/` holds the tidy CSVs and this file. `scripts/` holds `process_all.py`, which regenerates `processed/` in about 10 s. Run it with `python3 -P -E data/public/human/scripts/process_all.py`. It needs pandas and numpy. `remotezip.py` is the HTTP-range zip extractor used for LifeSnaps.

Total size is about 44 MB (raw 40 MB, of which 24 MB is the MMASH zip; processed 3.7 MB).

---

## 1. NASA OSDR: Inspiration4 (SpaceX, 4 civilians, 3-day LEO flight, Sept 2021)

| | |
|---|---|
| Studies | OSD-656 (urine), OSD-575 (serum), https://osdr.nasa.gov/bio/repo/data/studies/OSD-656 , …/OSD-575 |
| File listing API | `https://osdr.nasa.gov/osdr/data/osd/files/<n>` |
| Download URL pattern | `https://osdr.nasa.gov/geode-py/ws/studies/OSD-<n>/download?source=datamanager&file=<url-encoded filename>` |
| License | NASA open data (OSDR public release, no access restrictions). Cite OSDR study and Overbey/Mason et al. 2024 (SOMA, Nature). |
| Raw files (`raw/osdr/`) | `LSDS-64_Multiplex_urine.immune.AlamarPanel_TRANSFORMED.csv` (OSD-656), `LSDS-64_Multiplex_200plex v1-Target Information.csv` (OSD-656, analyte to UniProt/gene map), `LSDS-8_Multiplex_serum.immune.AlamarPanel_TRANSFORMED.csv` (OSD-575), `LSDS-8_Multiplex_serum.cardiovascular.EvePanel_SUBMITTED.csv` (OSD-575, long form of the cardio panel already in `data/nasa/`) |

Checked and **not re-downloaded** because they are already in `data/nasa/`: CMP and CBC (TRANSFORMED and SUBMITTED), the serum immune Eve panel, and the cardio Eve panel (wide). Everything else in OSD-569 is omics: RNA-seq xlsx files of about 100 MB, skipped. An OSDR search for human vitals, actigraphy, heart rate, blood pressure and sleep found **no public per-person physiological time series**, only omics and cell studies. LSDA astronaut physiology needs a data request, so it was not used.

| Processed file | Rows | Columns / units | Notes |
|---|---|---|---|
| `osd656_inspiration4_urine_alamar_long.csv` | 4488 | sample_name, subject_id (C001–C004), fluid, timepoint (L-92, L-44, L-3, R+1, R+45, R+82), phase, day_rel_launch_or_return, analyte, npq, percent_normalized | Alamar NULISA 200-plex inflammation panel. **NPQ = log2-scale relative protein quantity, NOT a clinical concentration.** It cannot be compared with clinical reference ranges. Only within-subject change over time is meaningful. 22 samples (C001 has no L-3 or R+1 urine). The source file had a blank header in column 3. By position (it matches the serum file) we named it `activin_a_percent_normalized_value`. |
| `osd575_inspiration4_serum_alamar_long.csv` | 5481 | same as above | Same panel in serum, 27 samples, timepoints up to R+194. |
| `osd575_inspiration4_cardio_panel_long.csv` | 252 | analyte, concentration, unit (ng/ml or pg/ml), timepoint, subject_id, phase, panel, percent_of_reference | Eve Technologies cardiovascular panel (CRP, fibrinogen, haptoglobin, etc.). |

There is **no routine clinical urinalysis** (albumin/creatinine, specific gravity, volume) in public Inspiration4 data. For urine ACR, flow and volume, use NHANES (section 3).

## 2a. PhysioNet MMASH v1.0.0: Multilevel Monitoring of Activity and Sleep in Healthy people

| | |
|---|---|
| Page | https://physionet.org/content/mmash/1.0.0/ (DOI 10.13026/cerq-fc86), **Open Access** |
| Download | https://physionet.org/files/mmash/1.0.0/MMASH.zip (SHA256 ef91ee1b…0726, verified against SHA256SUMS.txt) |
| License | **Open Data Commons Open Database License (ODbL) v1.0**, not CC BY. Attribution plus share-alike on *derived databases*. Our processed CSVs from MMASH are a derived database: keep them under ODbL and credit "MMASH, PhysioNet, Rossi et al. 2020". Synthetic values drawn from summary statistics are produced works, but still credit the source. |
| Population | 22 healthy young adult **males** (Italy), mean age 27. 24 h free-living recording with Polar H7 beat-to-beat RR and ActiGraph wGT3X-BT. Questionnaires: PANAS ×5/day, STAI, PSQI, DSI, MEQ, BIS/BAS. Saliva cortisol and melatonin. |

| Processed file | Rows | Columns / units |
|---|---|---|
| `mmash_hr_per_minute.csv` | 30108 | user (U1–U22), minute (minutes from 00:00 of day 1), day, clock, n_beats, hr_bpm (60/mean IBI), rmssd_ms, steps (sum per minute from actigraph), asleep_window (between sleep onset and out-of-bed per sleep.csv) |
| `mmash_user_summary.csv` | 22 | per participant: age, weight_kg, height_cm, bmi, tst_min, time_in_bed_min, sleep_efficiency_pct, waso_min, n_sleep_bouts, hr_sleep_mean, hr_awake_mean, hr_minute_p05 (bpm), rmssd_sleep_median_ms, steps_total, recorded_minutes, stai_state, stai_trait, psqi, daily_stress_dsi, panas_pos_mean, panas_neg_mean (scores) |
| `mmash_sleep.csv` | 22 | original sleep.csv columns plus user (minutes, %, counts; see PhysioNet page) |
| `mmash_questionnaire.csv` | 22 | MEQ, STAI1 (state), STAI2 (trait), Pittsburgh (PSQI), Daily_stress (DSI), BIS/BAS, panas_pos/neg at 10/14/18/22 h and 9 h on day 2 |
| `mmash_saliva.csv` | 42 | SAMPLES (before sleep / wake up), Cortisol NORM, Melatonin NORM (normalised units as published) |
| `mmash_activity_log.csv` | 456 | Activity code (1 sleeping, 2 laying down, 3 sitting, 4 light, 5 medium, 6 heavy, 7 eating, 8 small screen, 9 large screen, 10 caffeine, 11 smoking, 12 alcohol), Start, End, Day |
| `mmash_user_info.csv` | 22 | Gender, Weight (kg), Height (cm), Age (y) |

Processing and caveats:
- **RR filter:** IBIs outside 0.33–1.5 s (40–180 bpm) are dropped. Successive differences above 200 ms are excluded from RMSSD. Minutes with fewer than 20 beats are dropped.
- **Day labels:** users 8 and 9 have day = −29 in RR/Actigraph, a month-rollover artefact. It was mapped to day 2.
- **Sleep windows:** some sleep.csv rows keep date = 1 after midnight. The out-of-bed time is wrapped by +24 h.
- **Source errors kept in the raw/tidy copies but set to NaN in the summary:** user 18 Age = 0, user 7 STAI trait = 0. User 11 has no sleep record.
- Only one night per person, all male, mostly in their 20s. That is short-sleep-heavy (TST median 336 min). Use it for **intra-day HR shape and HRV**, not for population sleep norms.

## 2b. LifeSnaps (Zenodo record 7229547, v4)

| | |
|---|---|
| Page | https://zenodo.org/records/7229547 (DOI 10.5281/zenodo.7229547). Yfantidou et al. 2022, *Scientific Data* |
| License | **CC BY 4.0**, open access |
| Download | `rais_anonymized.zip` (615 MB) at https://zenodo.org/api/records/7229547/files/rais_anonymized.zip/content. **Only 3 members were extracted**, via HTTP range requests (`scripts/remotezip.py`); the full zip was not downloaded: `csv_rais_anonymized/daily_fitbit_sema_df_unprocessed.csv`, `scored_surveys/panas.csv`, `scored_surveys/stai.csv` |
| Population | 71 adults (Europe). Sex is recorded for 69: 42 M, 27 F. Age is given only as <30 / ≥30 (37 / 31 people, 3 unknown), and BMI is partially banded. About 4 months (2021-05 to 2022-01) with a Fitbit Sense, plus EMA mood prompts. |

| Processed file | Rows | Columns / units |
|---|---|---|
| `lifesnaps_daily.csv` | 7410 participant-days | participant (P01–P71, recoded from the dataset's anonymised hash), date, age_band, gender, bmi_band, resting_hr (bpm), nrem_hr (bpm), rmssd_ms, spo2 (%), full_sleep_breathing_rate (/min), nightly_skin_temp_c (wrist **skin** temperature, about 34 °C, not core), skin_temp_variation_c (deviation from the person's baseline), stress_score (Fitbit 0–100, higher = less stress; 0 seems to mean "not computed"), sleep_points_percentage, minutes_asleep, minutes_awake, sleep_duration_min, minutes_to_fall_asleep, sleep_efficiency (%), sleep_deep/rem/light_ratio, steps, activity minutes, calories, mood_* (EMA flags 0/1: alert, happy, neutral, rested_relaxed, sad, tense_anxious, tired) |
| `lifesnaps_panas_scored.csv` | 268 | participant, type, submitdate, positive_affect_score, negative_affect_score (10–50) |
| `lifesnaps_stai_scored.csv` | 279 | participant, type, submitdate, stai_stress (20–80), stai_stress_category |

Caveats: the data is "unprocessed" and has many gaps (resting_hr is present on 4422 of 7410 days). Sleep metrics in the calibration are filtered to 180–720 min/night. Stress-score calibration excludes 0.

## 3. CDC NHANES 2017–2018 (cycle J)

| | |
|---|---|
| URL pattern | `https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2017/DataFiles/<FILE>.xpt` |
| Files | DEMO_J, BPX_J (auscultatory BP, 60 s pulse), BPXO_J (oscillometric BP, 3 readings plus pulse), GLU_J (fasting plasma glucose, fasting subsample), ALB_CR_J (urine albumin and creatinine, ACR), UCFLOW_J (urine void volume and flow), BMX_J (BMI), DIQ_J (diabetes dx), BPQ_J (hypertension dx), CBC_J |
| License | US federal government work, **public domain**. Cite NCHS/CDC NHANES. |
| Not available | **Body temperature is not measured in NHANES 2017–18.** There is no 24 h urine volume; UCFLOW holds single timed spot voids only. |

| Processed file | Rows | Content |
|---|---|---|
| `nhanes_2017_2018_adults_25_55.csv` | 2646 | All examined persons aged 25–55. Columns: SEQN, age_years, sex, pregnancy_status, race_eth3, survey design (weight_mec2yr, weight_fasting2yr, SDMVPSU, SDMVSTRA), sbp/dbp_ausc_mmhg (mean of available readings; DBP 0 treated as missing), sbp/dbp_osc_mmhg (mean of 3), pulse_60s_bpm, pulse_osc_bpm, weight_kg, height_cm, bmi, glucose_fasting_mgdl, urine_albumin_mgL, urine_creatinine_mgdl, urine_acr_mg_per_g, urine_void1_volume_ml, urine_void1_flow_ml_min, urine_void1_minutes_since_last, CBC (wbc/lymphocytes/neutrophils in 1000/µL, rbc in million/µL, hemoglobin_gdl, hematocrit_pct, platelets in 1000/µL), told_diabetes, told_hypertension, healthy (flag) |
| `nhanes_healthy_25_55_summary.csv` | 57 | variable × sex (all/M/F): n, survey-weighted mean, sd, p05, p25, p50, p75, p95, min, max |

The **"healthy" definition is a team assumption:** age 25–55, not pregnant, never told they have diabetes or hypertension, BMI 18.5–<30. The filter is self-report only, so undiagnosed hyperglycaemia remains (fasting glucose max 451 mg/dL). Use percentiles, not mean ± SD, for skewed variables (ACR, urine albumin). Survey weights give US-population estimates. They are point estimates only, without design-based SEs.

## 4. Astronaut BP: Mendeley Data "Blood Pressures In Spaceflight" (already in `data/nasa/`, read only)

| | |
|---|---|
| Source | https://data.mendeley.com/datasets/pz6nt4cpxs (DOI 10.17632/pz6nt4cpxs.1), R. Lee, 2025. Summary-level BP from published studies and LSDA. |
| License | **CC BY 4.0** (verified via the Mendeley public API on 2026-11-14; DATA_SOURCES.md still says "unchecked") |
| Processed | `mendeley_bp_iss_rows.csv` (20 ISS rows, plus `posture_condition` parsed from the title) |

Caveats: these are study-level means, not individuals. Several rows come from the same study under different postures, and cohorts may overlap. Row "Inflight leg cuff… (Stand)" has sex_male = 80 with n = 8 (source typo). The calibration uses n-weighted means of **supine/rest rows only**; standing and sitting orthostatic-test rows are excluded.

## 5. `calibration_reference.csv` (613 rows)

Columns: `variable, population, statistic, value, unit, n, source, notes`. It combines:
- Inspiration4 CMP/CBC (from `data/nasa/`): mean, min and max per phase (preflight L-92..L-3, postflight R+1, recovery R+45..R+194), plus the lab reference ranges by sex (ref_low, ref_high).
- ISS astronaut SBP/DBP pre, in and post flight (Mendeley), plus the in-flight minus preflight delta.
- NHANES healthy 25–55: mean, sd, p05, p50, p95 by sex.
- MMASH per-participant distributions: sleeping, awake and resting-proxy HR, RMSSD, TST, efficiency, WASO, STAI, PSQI, DSI, PANAS.
- LifeSnaps participant-day distributions plus `median_within_person_sd` (day-to-day noise for synthetic series), and the share of days on which each EMA mood was reported.

Caveat for Inspiration4 glucose: these are not standardised fasting draws. At R+45, three crew members show 36–44 mg/dL, below the reference range. That is most likely a pre-analytical artefact (delayed processing or glycolysis), not real hypoglycaemia. Do not use those values as an in-flight glucose model.
