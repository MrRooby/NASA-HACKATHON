# ISS cabin environment + in-cabin radiation (real public data)

Downloaded 2026-11-14 for seeding the Mars-habitat HABITAT-module demo. All values are real NASA OSDR data. Nothing is synthetic. Processing only reshapes, drops exact duplicates, adds QC flags and adds one derived column (ppCO2).

Total size: about 67 MB (raw 56 MB, processed 11 MB).

## Sources and terms

| Source | URL | Access |
|---|---|---|
| NASA OSDR Environmental Data App (EDA) | https://visualization.osdr.nasa.gov/eda/ ; per mission: `https://visualization.osdr.nasa.gov/eda/dashboard_<MISSION>` | Public, no key. JSON is embedded in `<script id="data">` |
| NASA OSDR RadLab API | `https://visualization.osdr.nasa.gov/radlab/api/?query=(timestamp>=A)AND(timestamp<B)[AND(spacecraft=ISS)AND(instrument_family=X)]&fields+=absorbed_dose_rate,dose_equivalent_rate,instrument_family,module,latitude,longitude,altitude,flux,spacecraft,instrument,source&format=csv` | Public, no key |

Terms: NASA data are generally public domain in the US. Cite "NASA Open Science Data Repository (OSDR)". Credit SRAG/NASA-JSC for EDA radiation. Credit the instrument teams for RadLab: DLR DOSIS/DosTel, MSL-RAD SwRI, Liulin-MO IKI/BAS, LRO CRaTER, BioSentinel BPD, Artemis I HERA, ISS REM/Timepix and ISS-RAD. The RadLab docs page (`/radlab/gui/data-api`) and `/radlab/api/` root returned HTTP 500 on 2026-11-14. Field names were discovered by probing, because an invalid field returns a header-only CSV.

## Layout

```
raw/eda/index.html, raw/eda/js/*.js         EDA app shell + plotting JS (used to confirm units)
raw/eda/dashboards/dashboard_<M>.html       24 mission dashboards (embedded JSON), 42 MB
raw/radlab/radlab_<date>.csv                full-day pulls, all instruments, 9 days (see below)
raw/radlab/radlab_ISS_RAD_family_2012-2026.csv   ISS-RAD daily per-module values (spacecraft=ISS, family=RAD)
raw/radlab/subset_timepix_*.csv             subsets of an oversized Timepix pull (see caveat)
processed/eda_iss_telemetry_long.csv.gz     ISS temp / RH / CO2 / ppCO2, native cadence
processed/eda_iss_radiation_daily_long.csv  EDA daily GCR / SAA / total / accumulated dose
processed/radlab_dose_rate_long.csv.gz      RadLab dose rates (+ lat/lon/alt)
processed/daily_summary.csv                 per-day stats of all of the above
scripts/process.py, scripts/filter_tpx.py   reproducible processing (run with python3 -I)
```

## Processed files

The common tidy columns are `timestamp_utc, source, mission_or_instrument, module_or_zone, channel, value, unit, qc_flag`.

### eda_iss_telemetry_long.csv.gz: 2,363,681 rows (167 MB uncompressed)

This file holds only the EDA "ISS"/flight columns. Ground-control columns were left out and remain in raw.

| channel | unit | notes |
|---|---|---|
| temperature_air | degC | |
| rh | %RH | |
| co2_ppm | ppm | RR missions only. APEX/VEG have no CO2 |
| ppco2_mmHg | mmHg | **derived** = ppm × 1e-6 × 760. Assumes 760 mmHg (14.7 psia) total pressure. ISS actual about 14.2–14.9 psia, so ±3 % |

- `module_or_zone`: `ISS_cabin` is used for RR missions (EDA tooltip: "measurements gathered through sensors from the ISS cabin"). `ISS_flight_plant_hardware` is used for APEX/VEG (the EDA describes these as "hardware units"). The exact ISS module or sensor location is **not given** by EDA.
- Cadence: RR-1/3/5/6/7/9/12/19 are about 5 min. RR-10/18/20/22/23/25/28 and most of VEG-01C are about 1 min. APEX is 10 min.
- `qc_flag` values:

| flag | meaning |
|---|---|
| `ok` | |
| `zero_invalid` | value is exactly 0 |
| `rh_over_100` | relative humidity above 100 % |
| `temp_outside_15_30C` | cabin temperature outside 15–30 °C |
| `cold_stowage_or_off` | plant hardware below 15 °C |
| `co2_below_1000ppm_suspect` | ISS cabin is never below about 1000 ppm. Values 200/250/400/500 look like sensor floors or off |
| `duplicate_timestamp` | same timestamp and channel with a different value |
| `timestamp_year_suspect` | RR-9, see caveats |

Exact duplicate rows were dropped (152,456 in RR-22).

| mission | ISS telemetry range (UTC) | channels |
|---|---|---|
| RR-1 | 2014-09-20 → 2014-11-01 | T, RH, CO2 |
| RR-3 | 2016-04-08 → 2016-05-28 | T, RH, CO2 |
| RR-5 | 2017-06-01 → 2017-08-08 | T, RH, CO2 |
| RR-6 | 2017-12-06 → 2018-02-06 | T, RH, CO2 |
| RR-7 | 2018-07-01 → 2018-09-18 | T, RH, CO2 |
| RR-9 | 2018-08-14 → 2018-09-18 (sic) | T, RH, CO2 |
| RR-10 | 2020-12-04 → 2021-01-03 | T, RH, CO2 |
| RR-12 | 2019-04-17 → 2019-05-28 | T, RH, CO2 |
| RR-18 | 2021-12-20 → 2022-02-28 | T, RH (no CO2) |
| RR-19 | 2019-12-03 → 2020-01-07 | T, RH, CO2 |
| RR-20 | 2023-11-21 → 2024-01-07 | T, RH, CO2 |
| RR-22 | 2022-07-16 → 2022-09-09 | T, RH, CO2 (poor quality) |
| RR-23 | 2020-12-09 → 2021-01-15 | T, RH, CO2 |
| RR-25 | 2022-11-29 → 2023-02-02 | T, RH, CO2 |
| RR-28 | 2024-03-24 → 2024-05-06 | T, RH, CO2 |
| APEX-03-1 | 2015-01-10 → 2015-01-28 | T, RH |
| APEX-03-2 | 2015-01-26 → 2015-02-11 | T, RH |
| APEX-04 | 2017-02-26 → 2017-03-22 | T, RH |
| VEG-01A | 2014-04-18 → 2014-06-11 | T, RH |
| VEG-01C | 2015-11-12 → 2016-01-31 | T, RH |

RR-4, RR-8 and RR-17 have radiation only. VEG-01B has no data.

Typical clean-mission values (daily means, `ok` rows):

- CO2: about 1,600–4,300 ppm (1.2–3.2 mmHg), with a median within-day swing of about 500–1,500 ppm.
- Temperature: 21–24 °C, with a within-day swing of about 0.5–2 °C.
- Relative humidity: 34–45 %. Some days reach 50–67 %.

### eda_iss_radiation_daily_long.csv: 1,868 rows

| channel | unit | notes |
|---|---|---|
| dose_gcr | mGy/day | |
| dose_saa | mGy/day | |
| dose_total | mGy/day | GCR+SAA |
| dose_accumulated | mGy | cumulative over the mission |

- Zone is `ISS_payload_SRAG_estimate`. EDA describes it as "cumulative absorbed doses (in water, converted from silicon) from preliminary analysis of ISS instruments by SRAG, NASA-JSC; launch-vehicle portion approximated from US Lab averages".
- Missions: RR-1, 3, 4, 6, 7, 8, 9 (2017-08-18 → 09-18, includes the **Sept 2017 solar particle event**: GCR column peaks 0.39 mGy/day), 12, 17, 19, 23.
- Cadence is daily. Typical total is 0.19–0.42 mGy/day.

### radlab_dose_rate_long.csv.gz: 147,226 rows

Extra columns: `latitude_deg, longitude_deg, altitude_km, spacecraft, instrument_family`. Lat, lon and altitude are given for ISS rows only.

| channel | unit |
|---|---|
| dose_rate_absorbed | µGy/h (written `uGy/h`) |
| dose_rate_equivalent | µSv/h, **empty in every pull, so no rows** |

`qc_flag = daily_mean_preliminary` marks the `*-pre` instruments. They give one value per day at 00:00 and appear to be daily means. The `-pre` suffix is not documented.

| instrument_id | zone | coverage pulled | cadence |
|---|---|---|---|
| REM-LAB1O3-pre, REM-LABSSC8-pre | ISS_US_Lab | 2014-09 → 2024-02 (gaps; mostly during RR missions) | daily |
| REM-COL1A2-pre | ISS_Columbus | 2019-04 → 2024-02 | daily |
| REM-JPM1FD4-pre | ISS_JPM | 2019-04 → 2024-02 | daily |
| REM-CUPSSC17-pre | ISS_Cupola | 2019-04 → 2024-02 | daily |
| REM-NOD1SSC22-pre | ISS_Node_1 | 2019-05 → 2024-02 | daily |
| REM-NOD3SSC24-pre | ISS_Node_3 | 2019-04 → 2024-02 | daily |
| RAD-LAB1O3/COL1A2/JPM1D5/NOD2P3/NOD3A5-pre | ISS_US_Lab / Columbus / JPM / Node_2 / Node_3 | 2016-04 → 2020-01 | daily |
| DosTel1, DosTel2 | ISS_Columbus | 2017-09-10/11, 2019-12-05..07, 2022-04-01, 2024-05-10/11 | about 30–90 s, with lat/lon, so SAA spikes up to about 700 µGy/h are visible |
| SPACEDOS02A-F-2019 | ISS_SM (Russian Service Module) | 2019-12-05..07 | 15 s, with lat/lon |
| REM-Lid, Lidal | ISS_Columbus | 2021-10-28..30 (GLE SPE period), 2022-04-01 | about 5 min |
| MSL-RAD-Surface | Mars surface, Gale crater | same 9 days as above | about 15–20 min |
| Liulin-MO-AB/CD-Orbit | Mars orbit (TGO) | 2019-12-05..07, 2021-10-28, 2022-04-01 | about 1 min |
| CRaTER-D1D2 | Lunar orbit (LRO) | same 9 days | hourly |
| BPD | Deep space, heliocentric (BioSentinel) | 2024-05-01 → 05-20 (May 2024 SPE) | 1 min |
| Artemis-I-HERA-HSU1/2 | Cislunar (Orion, Artemis I) | 2022-11-16 → 12-11, whole mission | 1 min |

Full-day pulls (all instruments): 2017-09-10, 2017-09-11 (SPE), 2019-12-05/06/07 (quiet, best module coverage), 2021-10-28 (GLE), 2022-04-01, 2024-05-10, 2024-05-11 (Gannon storm / SPE).

### daily_summary.csv: 7,016 rows

Columns: `date_utc, source, mission_or_instrument, module_or_zone, channel, unit, n_samples, mean, min, p05, median, p95, max`.

- EDA telemetry stats use only `ok` rows, plus RR-9 rows (`timestamp_year_suspect`).
- RadLab means are **sample means, not time-weighted**. The cadence is irregular, and SAA passes are not oversampled on purpose.

## Unit determination and confidence

- **EDA CO2 = ppm**: high confidence. Both the plot axis label in `telemetry_plots.js` ("CO2 [ppm]") and the table header (`CO2_ppm_ISS`) say so. Values of 1,500–5,000 match the known ISS cabin range.
- **EDA temperature = °C, RH = %**: high confidence (headers `Temp_degC_ISS`, `RH_percent_ISS`).
- **EDA gcr / saa / total = mGy/day**: high confidence.
  - The axis label in `radiation_plots.js` is "Dose [mGy/day]".
  - Magnitudes match: the ISS absorbed dose is about 0.2–0.4 mGy/day.
  - They cross-check with RadLab ISS dose rates. In Dec 2019, REM in the US Lab averaged 11.5–15 µGy/h (0.28–0.36 mGy/day), while EDA RR-19 total was 0.33–0.39 mGy/day.
- **EDA accumulated = mGy**: high confidence. The JS axis label still says mGy/day, but the tooltip says it is the cumulative sum and the values rise monotonically.
- **RadLab absorbed_dose_rate = µGy/h**: high confidence for ISS, MSL, TGO and LRO, medium for BPD and HERA. The API returns no unit metadata. The evidence:
  - ISS module daily means are 7–35, which matches about 0.3–0.6 mGy/day.
  - MSL-RAD on the Mars surface reads 8–9 (≈0.21 mGy/day, the published Hassler 2014 value).
  - TGO Liulin-MO in Mars orbit reads about 15 (the published figure is about 14–16 µGy/h).
  - LRO CRaTER in quiet conditions reads about 13.
  - The detector material (silicon vs tissue/water) is **not stated** and probably varies by instrument. DosTel and SPACEDOS medians of about 4–5 µGy/h outside the SAA are lower than REM because they are point samples; daily means include SAA.

## Caveats

- **RR-9 telemetry timestamps run 2018-08-14 → 09-18.** RR-9 actually flew in Aug–Sep 2017 (its EDA radiation series is 2017). This looks like a one-year offset in the source. The rows are kept as published and flagged; they are **not** a copy of RR-7, which overlaps in time with different values.
- **Each RR mission's "ISS" sensor differs.** RR-10 and RR-23 overlap in time but differ at the same timestamps. Treat each as one cabin-area sensor, not a station-wide average.
- **RR-22 is poor quality.** It has many zeros, duplicate timestamps, integer temperatures, and a CO2 median of about 800 ppm, which is implausible for the ISS. Do not use it for seeding.
- **RR-7 daily mean CO2 reaches 8,275 ppm (≈6.3 mmHg).** This is above typical ISS ops values. It may be real local pooling or a sensor issue; the source does not say.
- **RR-18 RH reaches 125 %.** These rows are flagged `rh_over_100`.
- **APEX/VEG "ISS" temperatures of 1.5–5 °C** are cold-stowage or transport periods, and their RH of 85–99 % is the plant chamber, not the cabin.
- **Timepix pull was cut down.** The 2-year Timepix pulls for 2022–2025 were about 130 MB, mostly BioSentinel at 1 min. They were filtered locally into `subset_timepix_*` by `scripts/filter_tpx.py` without changing values, and the originals were deleted. Kept: all `*-pre` ISS daily rows, REM-Lid on 2021-10-27..30 and 2022-01-10..12 (only 2021-10-28..30 present), BPD for 2024-05-01..20, and all of Artemis-I HERA.
- **RadLab `flux` was not processed** (unit unknown). It remains in the raw CSVs for most instruments.

## Optional: noise and crew-quarters CO2 (not downloaded; published reference values only)

No public time-series dataset of ISS acoustic levels or crew-quarters CO2 was found in a quick search.

- **Crew-quarters noise.** The US-segment crew quarters measured 49.1–50.4 dBA (Apr 2015) and 42.6–49.7 dBA (Sep 2017). The sleep standard is NC-40 (≈49 dBA). The flight surgeon advises mitigation if the 8-h sleep LAeq exceeds 50 dBA.
  - https://ntrs.nasa.gov/api/citations/20200002173/downloads/20200002173.pdf
  - https://ntrs.nasa.gov/api/citations/20150011048/downloads/20150011048.pdf
  - https://www.nasa.gov/sites/default/files/atoms/files/acoustics_technical_brief_ochmo_0.pdf
- **CO2 limits.** NASA-STD-3001 Vol 2 Rev D limits the 1-h average ppCO2 to ≤ 3 mmHg (lowered from 3.8–7.5 mmHg). To keep headache risk below 1 %, the 7-day average should be below 2.5 mmHg. The actual ISS range is 1–9 mmHg. A 2016 abstract notes the 24-h operational limit has been 4.0 mmHg since 2010.
  - https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf
  - https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/20150019624.pdf
