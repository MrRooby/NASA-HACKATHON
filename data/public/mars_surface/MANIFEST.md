# Mars surface environment: real public data (MANIFEST)

Downloaded 2026-11-14. All values are REAL measurements from Curiosity (MSL) at **Gale crater**
(4.59 S, 137.44 E, about -4.5 km below the Mars datum). Our scenario habitat is a sealed lava tube near
**Elysium Mons**, at a different latitude and a much higher elevation. Treat these series as a
*realistic template* for the outside environment and the surface radiation level, **not** as
site-specific values (see "Caveats for the demo generator").

Folder layout:
- `raw/`: files exactly as downloaded (untouched)
- `processed/`: tidy outputs, built with the helper scripts (kept outside the repo, in the session scratchpad)

Conventions in `processed/`:
- `sol` = Curiosity mission sol (Gale local mean solar time). For RAD it is computed from UTC with the
  Mars24 / Allison & McEwen (2000) algorithm (checked against RAD file headers: sols 11, 4171 and 4500 match).
- `date_utc_at_lmst_noon` in the per-sol summary = UTC calendar date at local mean noon of that sol.
- Missing values are dropped (not written as NaN).

---

## 1. MSL RAD dose rate (radiation)

| | |
|---|---|
| Source | MSL Radiation Assessment Detector, Level 2 (`MSL_RAD_OBS-L2`, variable `DOSIMETRY_TOTAL_f`, quality filtered). PI D. Hassler, SwRI. DOI 10.48322/20qb-4e17 |
| Agency | NASA (SPDF/CDAWeb; data from the PDS PPI node pipeline) |
| URL | `https://cdaweb.gsfc.nasa.gov/WS/cdasr/1/dataviews/sp_phys/datasets/MSL_RAD_OBS-L2/data/<start>,<end>/DOSIMETRY_TOTAL_f?format=text` (Accept: application/json; the JSON gives a temporary ASCII file URL). Fetched in monthly chunks. |
| License | NASA open data (public domain, US Gov). Cite Hassler et al. 2014, Space Sci Rev, doi:10.1007/s11214-012-9913-1, and the dataset DOI. |
| Raw files | `raw/rad/msl_rad_l2_YYYY-MM.txt`: 2024-01 to 2025-12 (24 files) + 2012-08 (first surface days, sols 11-24). About 7.9 MB. |
| Time range | 2024-01-01 to 2025-12-31 (sols 4053-4765, about 1.07 Mars years), plus 2012-08-17 to 2012-08-31 |
| Cadence | ~16-17 min per observation (~84-86 per sol), with gaps |
| Raw columns | `EPOCH` (dd-mm-yyyy hh:mm:ss UTC), `TOTAL_DOSE_B` (silicon detector B, µGy/day), `RTG_CORRECTED_DOSE_B` (B minus the rover MMRTG background, µGy/day), `TOTAL_DOSE_E` (plastic scintillator E, tissue-equivalent, µGy/day). Fill value -1e31. |

Processed:
- `processed/rad_dose_rate_long.csv` (`timestamp_utc, sol, source, channel, value, unit`), 180,507 rows.
  Channels: `dose_rate_si_total_B`, `dose_rate_si_rtg_corrected_B`, `dose_rate_tissue_E` (all `uGy/day`).
  Dropped: fill values (-1e31) and exact zeros (24 values, instrument start-up in 2012-08).
- `processed/rad_solar_event_2024-05-15_25.csv`: the same format, 2,970 rows. This is the **May 2024 solar
  storm**: a Forbush decrease (tissue E dose drops from ~166 to ~130 µGy/day on 15-19 May), then the
  **SEP peak on 2024-05-20 ~06:15 UTC at 8,378 µGy/day** in E (sol 4190 mean 1,917 µGy/day; sol 4191 mean
  462), back to baseline by 22-23 May.

Typical values (2024-2025, per-sol mean of `dose_rate_tissue_E`): median ~159 µGy/day, quiet-time range
~130-185. Note that 2024-2025 is **solar maximum**, so the GCR dose is lower than the often-quoted
~210-240 µGy/day from 2012-2013.

**Not available:** the cruise phase (2011-12 to 2012-07). CDAWeb answers "No data available" for every month before
2012-08 for this dataset (the L2 product starts at landing even though the dataset metadata says 2011-11-20).
Cruise data (Zeitlin et al. 2013, ~481 µGy/day in Si) would have to come from the PDS PPI node RAD EDR/RDR
archive. We did not fetch it.

Caveats: `TOTAL_DOSE_E` is labelled "tissue-equivalent plastic" and is not MMRTG-corrected in this product.
These are **absorbed dose** rates (Gy), not dose equivalent (Sv). To get Sv you need a quality factor (published
mean Q on the surface is ~3.05, Hassler et al. 2014 Science). RAD sits inside the rover, with some local shielding.

---

## 2. Curiosity REMS weather

### 2a. CAB REMS daily summary (full mission, per sol)

| | |
|---|---|
| Source | REMS daily summary feed, produced by Centro de Astrobiología (CAB, INTA-CSIC, Spain), served by NASA |
| URL | `https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json` |
| Agency | CAB / INTA-CSIC (instrument team) + NASA/JPL (hosting) |
| License/terms | The disclaimer in the file says it is **"provided by CAB … intended for outreach purposes only. Any other use is discouraged"**. Scientific data is in PDS (2b). That suits a hackathon demo, but cite CAB and do not present it as science-grade. |
| Raw file | `raw/rems/cab_msl_weather_feed.json` (1.7 MB, 4,745 sol records) |
| Time range | sol 1 (2012-08-07) to sol 4995 (2026-08-25), with gaps |
| Cadence | 1 record per sol |
| Fields | min/max air temperature (°C), min/max ground temperature (°C), pressure (Pa, daily value), `ls` (solar longitude, deg), UV index category (Low…Very_High/Extreme), atmospheric opacity (category, almost always "Sunny"). Wind and humidity are always "--". |

Processed: `processed/rems_cab_daily_long.csv` (`date_utc, sol, ls_deg, source, channel, value, unit`),
33,044 rows. Channels: `ext_air_temperature_min/max`, `ext_ground_temperature_min/max` (C), `ext_pressure_daily` (Pa),
`uv_index_category`, `atmo_opacity_category` (unit `category`).

### 2b. PDS REMS MODRDR (science-grade, sampled sols, hourly)

| | |
|---|---|
| Source | MSL REMS MODRDR (`MSL-M-REMS-5-MODRDR-V1.0`, "best estimate" product after filters, corrections and models). Producer: CAB. |
| URL | `https://pds-atmospheres.nmsu.edu/PDS/data/mslrem_1001/DATA/SOL_xxxxx_yyyyy/SOLnnnnn/RME_*RMD*.TAB` (format: `https://pds-atmospheres.nmsu.edu/PDS/data/mslrem_1001/LABEL/MODRDR6.FMT`) |
| Agency | NASA PDS Atmospheres Node (NMSU) |
| License | PDS public archive (NASA open data). Cite Gómez-Elvira et al. 2012, Space Sci Rev, doi:10.1007/s11214-012-9921-1. |
| Raw files kept | `raw/rems/MODRDR6.FMT` (column definitions) and `raw/rems/pds_labels/*.LBL` (one label per sampled sol). The `.TAB` files (~12 MB per sol at 1 Hz) were **streamed and aggregated on the fly, not stored**, to stay within the size budget. Re-download them from the URLs above. |
| Sampling | 24 sols, every 28 sols: 4060, 4088, …, 4704 (2024-01-07 to 2025-10-30), about one full Mars year (644 sols of the 669-sol year), roughly one sol per Mars "month". Every sampled sol has all 24 LMST hours. |
| Cadence | per LMST hour (mean of the ~1 Hz samples in that hour; `raw_min`/`raw_max`/`n_samples` kept) |

Processed: `processed/rems_pds_hourly_long.csv`
(`timestamp_utc, sol, lmst_hour, source, channel, value, unit, raw_min, raw_max, n_samples`), 2,732 rows.
Channels (MODRDR column → channel):
- `AMBIENT_TEMP` (K) → `ext_air_temperature` (C)
- `BRIGHTNESS_TEMP` (K) → `ext_ground_temperature` (C)
- `PRESSURE` (Pa) → `ext_pressure` (Pa)
- `LOCAL_RELATIVE_HUMIDITY` (%) → `ext_relative_humidity` (%)
- `UV_ABC` (W/m²) → `uv_abc_irradiance` (W/m2, 200-380 nm band)

`timestamp_utc` = UTC of the mean sample time in that hour (derived from SCLK and the label START_TIME).
Rows with -999 (missing) are excluded. Confidence-level flags were **not** applied (we used the MODRDR "best
estimate" as is). Single-sample spikes appear in `raw_min`/`raw_max` (e.g. ground temperature), so use `value` (the hourly mean).
REMS samples in blocks, not continuously, so some hours of some sols are missing (UV especially).
Wind columns are -999 in recent years (the wind sensor is degraded), so wind was not extracted.
Relative humidity is relative to the humidity-sensor temperature: it is meaningful at night (up to ~15-20 %) and ~0-1 % in daytime.

---

## 3. NSSDC Mars Fact Sheet (constants)

| | |
|---|---|
| Source | NASA GSFC NSSDC Mars Fact Sheet (D. R. Williams) |
| URL | https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html |
| License | NASA public web page (US Gov, public domain) |
| Raw | `raw/nssdc/marsfact.html` |
| Processed | `processed/mars_constants_nssdc.csv` (`parameter, value, unit, basis, notes`), 35 rows. `basis=source` means the value is copied from the page; `basis=derived` means one-way light time, computed by us from the min/max Earth distance (3.0-22.3 min). |

---

## 4. Per-sol summary (input for the demo generator)

`processed/per_sol_summary.csv`: `sol, date_utc_at_lmst_noon, source, channel, unit, mean, min, max, n`
(long format, one row per sol × source × channel), 16,412 rows.
- `MSL_RAD_OBS-L2`: mean/min/max of the ~17-min dose rates within the sol (n = observations).
- `PDS_MSL_REMS_MODRDR`: mean/min/max **of the hourly means** within the sol (n = hours with data).
- `CAB_REMS_daily`: `ext_air_temperature` and `ext_ground_temperature` have only min/max; `ext_pressure` has only mean (CAB's daily value); n = 1.

---

## 5. Not fetched / failed

- RAD cruise phase 2011-12 to 2012-07: not in the CDAWeb L2 dataset (see 1).
- InSight APSS/TWINS (Elysium Planitia, 4.5 N, 135.6 E, the closest real weather station to Elysium Mons):
  not fetched. The api.nasa.gov `insight_weather` endpoint is frozen (last 7 sols only). The full data is PDS4 on the
  Atmospheres node (`https://atmos.nmsu.edu/data_and_services/atmospheres_data/INSIGHT/insight.html`), but it was too heavy for the time we had. **Recommended next step**: InSight is far more representative for an Elysium site than Gale.
- Mars Dust Activity Database (Battalio & Wang): not fetched.

## 6. Caveats for the demo generator

- **Site difference.** Gale floor is ~-4.5 km. Elysium Mons flanks are several km higher (summit ~+12.6 km). Surface pressure
  scales roughly as exp(-Δh / 11 km) (NSSDC scale height). A habitat at, say, +1 km would see about 60 % of the Gale pressure.
  Gale is 4.6 S and Elysium Mons is 25 N, so the seasons are shifted (Ls) and the temperature amplitude differs. Mark any rescaling as `team_assumption`.
- **Lava tube.** A habitat inside a sealed lava tube is shielded from most of the surface GCR and SEP dose, and its inside
  temperature is nearly constant. These "outside" series are for the external sensors only. Shielding factors are team assumptions.
- RAD dose is absorbed dose (µGy/day). For astronaut limits (Sv) apply a quality factor and document it.
- 2024-2025 = solar maximum: lower GCR, more SEPs. Good for the "solar storm" demo scenario (20 May 2024).
