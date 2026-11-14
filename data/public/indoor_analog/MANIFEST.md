# indoor_analog: real Earth data for seeding the Mars lava-tube habitat sensor demo

Downloaded and processed on **2026-11-14**. Everything here is **real measured data**; nothing is synthetic.
The demo generator should use these files for **shapes, ranges and rates** (CO2 rise and decay with occupancy, the light day cycle, how stable cave air is), and label its own output as "simulated".

Reproduce with `python3 -I process_indoor_analog.py /home/bartek/NASA-HACKATHON/data/public/indoor_analog`. It reads `raw/` and writes `processed/`. It uses only the standard library plus numpy, which it loads from `~/.local/lib/python3.14/site-packages`.

## Tidy long format (all `processed/*_long.csv`)

| column | meaning |
|---|---|
| `timestamp_utc` | ISO 8601 UTC (`...Z`) |
| `tz_offset_local` | offset of the site's local clock, so local time = UTC + offset (used for day-cycle analysis) |
| `source` | dataset id (see below) |
| `room_or_site` | room, sensor node or cave site |
| `channel` | `co2`, `temperature`/`air_temperature`, `relative_humidity`, `light`, `sound`, `occupancy`, `occupant_count`, `pir_motion`, `radon_222`, `ch4`, `airflow_in`, … |
| `value` | numeric value |
| `unit` | `ppm`, `degC`, `%`, `lux`, `binary`, `persons`, `Bq/m3`, `ppb`, `m/s`, `V_mic_amplitude`, … |

## Datasets

### 1. UCI Occupancy Detection (office, Mons, Belgium, Feb 2015)
- **URL:** https://archive.ics.uci.edu/dataset/357/occupancy+detection. Zip: https://archive.ics.uci.edu/static/public/357/occupancy+detection.zip. DOI 10.24432/C5X01N
- **Citation:** Candanedo, L. & Feldheim, V. (2016). Accurate occupancy detection of an office room from light, temperature, humidity and CO2 measurements using statistical learning models. *Energy and Buildings* 112.
- **License:** CC BY 4.0.
- **Raw:** `raw/uci_occupancy/` holds `occupancy.zip` plus the extracted `datatraining.txt`, `datatest.txt` and `datatest2.txt`. All three are merged and de-duplicated by timestamp.
- **Processed:** `processed/uci_occupancy_detection_long.csv`, 123,360 rows (20,560 timestamps × 6 channels), 1-min cadence, 2015-02-02 → 2015-02-18.
- **Channels:** temperature 19.0–24.4 °C · RH 16.7–39.5 % · light 0–1,697 lux (the office is dark at night) · CO2 412.8–2,076.5 ppm · humidity ratio (kg/kg) · occupancy 0/1 (ground truth from photos every minute).
- **Caveats:** timestamps are local, and the files do not state a timezone. We assumed CET (UTC+1, February). Occupancy is binary, so the files have no head count. Room volume is not in the files.

### 2. UCI Room Occupancy Estimation (room 6 m × 4.6 m, India, Dec 2017 – Jan 2018)
- **URL:** https://archive.ics.uci.edu/dataset/864/room+occupancy+estimation. Zip: https://archive.ics.uci.edu/static/public/864/room+occupancy+estimation.zip. DOI 10.24432/C5P605
- **Citation:** Singh, A.P., Jain, V., Chaudhari, S., Kraemer, F.A., Werner, S., Garg, V. (2018). Machine Learning-Based Occupancy Estimation Using Multivariate Sensor Nodes. IEEE Globecom Workshops.
- **License:** CC BY 4.0.
- **Raw:** `raw/uci_room_occ/` holds `room.zip` and `Occupancy_Estimation.csv`.
- **Processed:** `processed/uci_room_occupancy_estimation_long.csv`, 172,193 rows (10,129 timestamps), cadence about 30 s. The recording is several sessions over 7 days with gaps between them.
- **Channels:**
  - nodes S1–S4: temperature 24.4–29.0 °C, light 0–280 lux, sound
  - S5: CO2 345–1,270 ppm and the authors' `co2_slope_author` (a sliding-window slope; the authors do not give its exact units)
  - S6 and S7: PIR 0/1
  - `occupant_count`: 0–3 persons (ground truth)
- **Caveats:**
  - **Sound is the microphone amplifier output in volts (ADC), not dBA**, so it can only shape a relative noise curve.
  - The UCI description says "no HVAC systems were in use", so the room had only natural infiltration, which is a good stand-in for a sealed habitat.
  - Room height is not given.
  - Timestamps are local; we assumed IST (UTC+5:30).

### 3. Jenolan Caves (limestone show cave, NSW, Australia): CO2, CH4, radon-222, air temperature, airflow
- **URLs:**
  - https://doi.org/10.1594/PANGAEA.878072: in-cave sensor station "Flitch of Bacon" (air temperature, pCO2, airflow), 15-min cadence, 2012-05 → 2016-07
  - https://doi.org/10.1594/PANGAEA.878071: FTIR multi-site (pCO2, CH4, CO, N2O, δ13C), 1-min cadence, 2015-03 → 2016-05
  - https://doi.org/10.1594/PANGAEA.878074: radon-222 (AlphaGUARD), about hourly, 2014-08 → 2016-06
  - Parent series: https://doi.org/10.1594/PANGAEA.878077
  - Files were downloaded with `?format=textfile`.
- **Citation:** Waring, C.L., Hankin, S.I., Griffith, D.W.T., Kettlewell, G. (2017), PANGAEA; supplement to Waring et al. (2017) *Seasonal total methane depletion in limestone caves*, Sci. Rep. 7, doi:10.1038/s41598-017-07769-6.
- **License:** CC BY 3.0.
- **Raw:** `raw/pangaea_jenolan/` holds `PANGAEA.878071.tab.gz`, `PANGAEA.878072.tab.gz` (gzipped to save space) and `PANGAEA.878074.tab`.
- **Processed:** `processed/cave_jenolan_hourly_long.csv`, 147,740 rows. **Every series is averaged to hourly means.** Sites:
  - `flitch_of_bacon_station`
  - `ftir_{lower_katies_bower, upper_katies_bower, flitch_of_bacon, ambient}`, where `ambient` is outside air
  - `radon_{lower_katies_bower, beside_pool, soil_flux_chamber}`, where `soil_flux_chamber` measures soil gas, not cave air
- **Ranges:**
  - Cave air temperature at Flitch of Bacon: median 12.7 °C, p05–p95 11.1–13.7 °C (hourly min 7.7, max 14.4), mean daily range 0.40 °C.
  - Cave CO2: Flitch of Bacon station median 539 ppm (p95 2,489). Lower Katie's Bower (FTIR) median 3,284 ppm, hourly max 7,298. Outside air median 423 ppm.
  - Radon at Lower Katie's Bower: median 1,280 Bq/m³, p95 about 14,300 Bq/m³, max 18,176.
- **Caveats:**
  - PANGAEA Date/Time is UTC by repository convention. The local offset is given as +10:00 (AEST, DST ignored).
  - Some FTIR CH4 hourly values are negative (instrument noise near zero). We kept them as published.
  - This is a ventilated limestone show cave, not a lava tube.

### 4. Nullarbor Plain caves (Australia): bihourly T and RH
- **URLs:**
  - https://doi.org/10.1594/PANGAEA.964571: back of Mullamullang Cave, 2021-04 → 2022-10
  - https://doi.org/10.1594/PANGAEA.939066: Abrakurrie Cave, 2019-11 → 2021-03
  - Series: https://doi.org/10.1594/PANGAEA.939075
- **Citation:** Lipar, M. & Ferk, M. (2021, 2024), PANGAEA.
- **License:** CC BY 4.0.
- **Raw:** `raw/pangaea_nullarbor/`.
- **Processed:** `processed/cave_nullarbor_long.csv`, 25,974 rows, 2-h cadence. The files use local time GMT+8 as stated.
- **Ranges:**
  - Abrakurrie: 15.0–16.7 °C, **mean daily range 0.07 °C**, RH almost always 100 %.
  - Mullamullang back: 11.6–18.1 °C, daily range 0.73 °C, RH 62–95 %.
- **Caveats:** the dataset comments list human cave visits (for example 31 May 2020, 11:45–12:15 in Abrakurrie). These show what a short human disturbance looks like in a stable cave.

### 5. Mauna Loa lava-tube (ice) caves, Hawaii: the real LAVA TUBE data
- **URL:** https://zenodo.org/records/1296081 (DOI 10.5281/zenodo.1296081). Files are at `https://zenodo.org/api/records/1296081/files/<name>/content`.
- **Citation:** Schorghofer, N. (2018). *Multi-year temperature and humidity time series from ice caves on Mauna Loa, Hawaii.* Funded by the NASA Astrobiology Institute. Cave descriptions: Pflitsch et al. 2016 (AAAR 48:33-43) and Teehera et al. 2018 (Geomicrobiology J. 35:227-241).
- **License: CC BY-NC-ND 4.0.** You must give attribution and may not use it commercially. **NoDerivatives:** do not publicly redistribute the processed file or modified versions of it. Use it internally to calibrate parameters. The processed file name ends in `__CC-BY-NC-ND`, so it is easy to exclude from a public repo or release.
- **Raw:** `raw/zenodo_maunaloa_lavatube/` holds README.TXT, loggers_summary.csv and 3 of the 11 logger files (gzipped). All loggers are HOBO units logging every 30 min.
  - `h816_arsiaB.dat`: Arsia Cave, Icebat Hall, after the barrier, near the floor; T and RH; 2013-03 → 2017-02
  - `n184_arsiaB.dat`: Arsia Cave, station G4; T at the floor and 1.9 m higher (about half the tube height); 2012-04 → 2017-02
  - `h679_mlic.dat`: Mauna Loa Icecave, above the ice; T and RH; 2011-11 → 2015-11
- **Processed:** `processed/cave_maunaloa_lavatube_long__CC-BY-NC-ND.csv`, 203,688 rows, **hourly means** of the 30-min data. Local time is GMT-10 as stated in the headers. Missing values (-999) were dropped.
- **Ranges:**
  - Arsia G4 floor −1.1–4.4 °C (median 1.7) and 1.9 m above the floor −0.4–5.1 °C (median 2.2), mean daily range 0.5–0.8 °C. The roughly 0.5 °C median difference between floor and mid-height is real vertical stratification.
  - Icecave: −1.0–3.2 °C (median 0.0), daily range 0.34 °C.
  - RH median 89–100 %.
- **Caveats:** these are high-altitude ice caves (cold-trap lava tubes), so the absolute temperature is near 0 °C. Use them for the **stability and stratification pattern**, not the level. A Mars lava tube would sit near the local mean annual temperature, which is far colder.

## Analysis outputs

### `processed/summary_stats.csv`
One row per source × site × channel with these columns: n, start/end, median cadence (s), min, p05, median, mean, p95, max, std, `mean_daily_range` (mean of max−min within each local calendar day, counting only days that have at least 80 % of the median number of samples per day) and n_full_days.

### `processed/co2_occupancy_analysis.json`: CO2 versus occupancy
**A. Room Occupancy Estimation (has head counts):**
- **Method:**
  1. Average CO2 to 1-min means.
  2. Compute dC/dt as a centred difference over ±5 min, keeping only 11-min windows where the head count stays constant (4,960 windows).
  3. Fit by OLS: `dC/dt = a·n + b·(C − C_bg) + c`, with C_bg = 1st percentile CO2 = 345 ppm.
- **Result:**
  - **a = 2.81 ppm/min per occupant** (in this about 27.6 m² room)
  - b = −0.0086 /min, an effective removal or infiltration rate of about **0.51 /h**
  - c = −0.14 ppm/min
  - R² = 0.70
- **Mean dC/dt by head count:** 0 → −0.61, 1 → 1.13, 2 → 2.26, 3 → 4.03 ppm/min. The rise is roughly linear in occupants.
- **Typical CO2 by head count (median / max):** 0: 355 / 1,255 (decay tails) · 1: 440 / 630 · 2: 685 / 1,065 · 3: 870 / 1,270 ppm.
- **Scaling to a different room:** a = G/V (G = CO2 generation per person, V = room volume). The room height is not published, so G cannot be derived exactly. For illustration only: with an assumed 3 m height, V ≈ 83 m³ and G ≈ 2.81e-6 × 83 m³/min ≈ 0.23 L/min per person.

**B. Occupancy Detection (binary occupancy, 1-min data):**
- **Rise:** over the first 60 min of occupied episodes lasting at least 60 min (22 episodes), median **3.1 ppm/min**, range −3.2 to 7.9. Some episodes start with CO2 already high or with a window or door open.
- **Decay:** we fitted `ln(C − C_bg)` against time over the first 3 h of evening unoccupied periods (C_bg = 423 ppm, 11 episodes). Median decay rate is **0.43 /h** (half-life about 1.6 h); individual episodes range from 0.13 to 0.94 /h. One episode (2015-02-17) stays at about 1,500 ppm overnight with almost no decay; it is kept as it is in the data.
- **CO2 levels:** median 929 ppm while occupied (p95 1,528, max 2,028.5; overall series max 2,076.5) and 511 ppm while unoccupied.

### `processed/light_hour_of_day_profile.csv`
Median and p90 lux plus the fraction of time occupied, for each local hour.
- **Office (Belgium, Feb):** 0 lux from 18:00 to 07:00. A step to about 430–450 lux (median) from 09:00 to 17:00, which is artificial lighting following occupancy, with a lunch dip at 13:00 (median 229 lux). Lights go off at 18:00.
- **India room:** levels are lower (about 120–160 lux when lit) and also follow occupancy.

## Mars habitat conversion: read before using the CO2 values
- The Earth data are mole fractions (ppm) at about 1 atm (760 mmHg). The Jenolan site is at 839 m, so its pressure is somewhat lower than 1 atm.
- The health limit in `config/thresholds.json` (`cabin_co2`) is a **partial pressure** (3 mmHg, 1-h mean). The conversion is
  `pCO2[mmHg] = ppm × 1e-6 × P_total[mmHg]`, with 1 atm = 760 mmHg and **8.2 psi ≈ 424 mmHg (56.5 kPa)**.
  For example, 1,000 ppm is 0.76 mmHg on Earth but 0.42 mmHg at 8.2 psi. 3 mmHg corresponds to about 3,950 ppm at 1 atm and about **7,070 ppm at 8.2 psi**.
- For a fixed volume, temperature and metabolic CO2 output, the **rise rate in partial pressure** does not depend on total pressure. The **rise in ppm is about 1.8× larger at 8.2 psi** (760/424), because there are fewer total gas molecules.
- To drive the generator: convert the Earth rise rate to mmHg/min at 1 atm (2.81 ppm/min × 760e-6 ≈ 0.0021 mmHg/min per occupant in a room of about 83 m³). Scale it by V_room_earth / V_module, simulate in mmHg, and then display ppm = pCO2 / P_total × 1e6 if a ppm reading is wanted.
- Humidity ratio (kg/kg) depends on total pressure. RH does not.

## Confined-habitat analog data (item 3): no openly downloadable environmental time series found
- **Zenodo** keyword searches for "HI-SEAS", "Mars Desert Research Station", "Lunar Palace", "Mars-500", "SIRIUS isolation", "Concordia station indoor" and "isolated confined environment CO2 habitat" found only papers, presentations and images. None had habitat CO2, temperature or RH time series.
- **MDRS daily crew and engineering reports** (mdrs.marssociety.org): the site now redirects to a JavaScript-rendered Raisely page, and `curl` gets no report content (we also tried the WP JSON API). We did not scrape it. The reports are prose; they may mention numbers such as power, water or Hab temperature, but they are not a dataset.
- **HERA, NEEMO, CHAPEA, Concordia:** we found no public environmental dataset during this session. Publications describe the conditions, but the time series are not open.
- **ISS cabin CO2, T and RH:** see the OSDR Environmental Data App noted in `DATA_SOURCES.md` and `data/public/iss_cabin/`, which is handled outside this folder.

## Optional item 4 (indoor dBA or light-spectrum CCT): not found
We found no open dBA series in this session. The only acoustic signal here is UCI Room Occupancy's microphone voltage, which is relative only.

## Not done / failures
- PANGAEA has no lava-tube microclimate series. The lava tube coverage comes from the Zenodo Mauna Loa set, which is NC-ND.
- USGS ScienceBase search returned non-JSON (HTML), so we skipped it. We found no NPS (Lava Beds, Craters of the Moon) time series that could be downloaded openly.
- Zenodo record 22710161 ("Autonomous interior survey of a lava tube for planetary habitat assessment", CC BY 4.0) is 7.5 GB of maps and models, so we did not download it.
- We downloaded only 3 of the 11 Mauna Loa logger files, to stay within the size budget.
