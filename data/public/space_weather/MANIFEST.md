# Space weather: real public data for SPE / flare demo templates

Downloaded on 2026-11-14 (UTC). All values are real measurements or are computed directly from them. Nothing is synthetic.
Processing scripts were kept outside the repo, in the session scratchpad (`agentC2/process.py`, `agentC2/xray.py`). They only parse CSV/HTML/JSON, so the outputs can be rebuilt from `raw/`.

## Sources (exact URLs)

| raw/ path | What | URL | Terms |
|---|---|---|---|
| `iswa_hapi/goesp_part_flux_P5M_{2012-03,2017-09,2024-05,2026-01}.csv` | SWPC real-time **GOES-primary** integral protons, 5-min (>=1, 5, 10, 30, 50, 60, 100, 500 MeV + electrons), archived by NASA CCMC iSWA | `https://iswa.gsfc.nasa.gov/IswaSystemWebApp/hapi/data?id=goesp_part_flux_P5M&time.min=<start>T00:00:00Z&time.max=<end>T00:00:00Z` (schema: `.../hapi/info?id=goesp_part_flux_P5M`, saved as `_info.json`) | NASA/NOAA public data, no restrictions; cite NASA CCMC iSWA + NOAA SWPC |
| `iswa_hapi/goesp_xray_flux_P1M_{2017-09,2024-05,2026-01}.csv` | GOES-primary XRS 1-min (0.05–0.4 nm short, 0.1–0.8 nm long), W/m² | same HAPI server, `id=goesp_xray_flux_P1M` | same |
| `ncei/g07_eps_5m_19891001_19891031.csv` | GOES-7 EPS 5-min averages (1989) | `https://www.ncei.noaa.gov/data/goes-space-environment-monitor/access/avg/1989/10/goes07/csv/g07_eps_5m_19891001_19891031.csv` | NOAA NCEI, public domain |
| `ncei/g10_eps_5m_2003{1001_20031031,1101_20031130}.csv` | GOES-10 EPS 5-min averages (2003) | `.../access/avg/2003/10/goes10/csv/...` and `.../2003/11/goes10/csv/...` | same |
| `ncei/g13_epead_cpflux_5m_*.csv`, `ncei/g15_epead_cpflux_5m_*.csv` | GOES-13/15 EPEAD corrected integral protons, 5-min (2012-03, 2017-09). Kept as a **cross-check only** and not used in processed/ | `.../access/avg/2012/03/goes13/csv/`, `.../2017/09/goes13/csv/`, `.../2017/09/goes15/csv/` | same |
| `swpc/*.json` | **Live snapshot** of NOAA SWPC JSON API, taken 2026-11-14 ~14:00 UTC | `https://services.swpc.noaa.gov/json/goes/primary/integral-protons-3-day.json`, `.../integral-protons-6-hour.json`, `.../xrays-1-day.json`, `.../xray-flares-latest.json`, `https://services.swpc.noaa.gov/products/noaa-scales.json`, `.../products/alerts.json`, `.../products/noaa-planetary-k-index.json` | NOAA public domain. Use these to mock the live API format. |
| `spe_list/ngdc_SEP_page.html` | Official NOAA SWPC list "Solar Proton Events Affecting the Earth Environment 1976–present" | `https://www.ngdc.noaa.gov/stp/space-weather/interplanetary-data/solar-proton-events/SEP%20page%20code.html` | NOAA public domain |
| `spe_list/umbra_SEP.html` | Older NASA mirror of the same list (stale, kept for reference) | `https://umbra.nascom.nasa.gov/SEP/` | public |
| `noaa_scales/noaa-scales-explanation.html` | NOAA Space Weather Scales page | `https://www.swpc.noaa.gov/noaa-scales-explanation` | NOAA public domain |
| `donki/DONKI_SEP_2024-04-15_2024-06-13.json` | NASA DONKI SEP events (only this window, see "Failures") | `https://api.nasa.gov/DONKI/SEP?startDate=2024-04-15&endDate=2024-06-13&api_key=DEMO_KEY` | NASA open API |

## processed/

**`events/SPE_<id>_goes_integral_protons_5min.csv`** is the tidy/long format, one row per (timestamp, channel).
Columns: `timestamp_utc` (ISO, start of the 5-min average), `event_id`, `channel` (`proton_flux_ge{1,5,10,30,50,60,100,500}MeV`), `value`, `unit` (`pfu` = protons cm⁻² s⁻¹ sr⁻¹), `satellite`. Fill and missing values are dropped, not zero-filled.

| event_id | window (UTC, end exclusive) | satellite / product | channels |
|---|---|---|---|
| SPE_1989-10 | 1989-10-19 → 10-28 | GOES-7 EPS `p1..p7_flux_ic` (NCEI) | 1,5,10,30,50,60,100 |
| SPE_2003-10 | 2003-10-26 → 11-07 | GOES-10 EPS `p1..p7_flux_ic` (NCEI) | 1,5,10,30,50,60,100 |
| SPE_2012-03 | 2012-03-06 → 03-13 | GOES-13 (SWPC real-time primary, via iSWA) | 1,5,10,30,50,100 |
| SPE_2017-09 | 2017-09-06 → 09-16 | GOES-13 (SWPC primary) | 1,5,10,30,50,100 |
| SPE_2024-05 | 2024-05-10 → 05-15 | GOES-18 (SWPC primary for protons) | 1,5,10,30,50,60,100,500 |
| SPE_2026-01 | 2026-01-18 → 01-26 | GOES-18 (SWPC primary for protons) | same |

**`events/XRAY_<id>_goes_xray_1min.csv`**: same long format, channels `xray_flux_0.1-0.8nm` (the one used for the flare class) and `xray_flux_0.05-0.4nm`, unit W/m².
Windows: 2017-09-04 → 09-12, 2024-05-08 → 05-15, 2026-01-18 → 01-20.

**`spe_events_summary.csv`** has one row per SPE window: `start_ge10MeV_utc` and `end_ge10MeV_utc` follow the SWPC definition (start = first of 3 consecutive 5-min points ≥10 pfu, end = last point ≥10 pfu, both *within the window*). It also has `duration_start_to_end_h`, `hours_above_10pfu`, peak time and value for ≥10 MeV, `noaa_s_level` (from the peak), peaks for ≥30, ≥50 and ≥100 MeV, `window_integrated_*_per_sr_cm2` (Σ flux × 300 s over the window, per steradian; **not** an omnidirectional fluence and **not** a dose), `n_timestamps` vs `expected_timestamps_5min` (data completeness), and `swpc_official_list` (matching rows from the official NOAA list, for validation).

**`swpc_spe_list_1976_present.csv`**: the official NOAA list, parsed (319 events). Columns: `begin_utc`, `max_utc`, `max_pfu_ge10MeV`, `noaa_region`, `location`, `flare`, `type_ii`, `type_iv`, `cme_speed`, `noaa_s_level` (derived from the max). This is the best source for event frequency and magnitude statistics.

**`xray_daily_max_summary.csv`**: the daily maximum of the 0.1–0.8 nm flux per window, with the GOES class and NOAA R-level computed from 1-min data. It is not an official flare catalog: flare peaks here can differ by ±0.1 class from the SWPC event list.

**`donki_events.csv`**: `type, activity_id, start_utc, instruments, linked_events, notes, link`. It has 27 SEP entries for 2024-04-15..06-13 only. Linked FLR and CME IDs are listed, but the FLR and CME records themselves were not downloaded.

**`noaa_scales_thresholds.csv`**: S1–S5 (≥10 MeV pfu: 10, 100, 1e3, 1e4, 1e5, plus frequency per cycle and the biological effect text verbatim) and R1–R5 (X-ray W/m²: 1e-5, 5e-5, 1e-4, 1e-3, 2e-3). Values were transcribed from the NOAA scales page in raw/.

## Validation against the official NOAA SWPC list (peak ≥10 MeV)

| event | ours (5-min) | official list |
|---|---|---|
| 1989-10 | 42,200 pfu @ 10-20 16:00 (S4) | 42,200 @ 10-20 16:00 |
| 2003-10 | 33,700 pfu @ 10-29 06:10 (S4, GOES-10) | 29,500 @ 10-29 06:15 (different satellite) |
| 2012-03 | 6,530 pfu @ 03-08 11:15 (S3) | 6,530 @ 03-08 11:15 |
| 2017-09 | 1,490 pfu @ 09-11 11:40 (S3) | 1,494 @ 09-11 11:45 |
| 2024-05 | 207 pfu @ 05-10 17:45 (S2) | 208 @ 05-10 17:45 |
| 2026-01 | 36,976 pfu @ 01-19 19:15 (S4) | 37,000 @ 01-19 19:15 |

## Caveats

- **Satellite and instrument changes:** GOES-7 (1989) and GOES-10 (2003) EPS, GOES-13 EPEAD (2012, 2017) and GOES-18 SGPS (2024, 2026) are different detectors. NOAA states: "no attempt has been made to cross-normalize the resulting proton fluxes". The 2003 peak differs from the official list for this reason (we used GOES-10, the official value comes from another GOES).
- GOES-13/15 have East/West-facing detectors that disagree by up to ~30% (e.g. 2017-09: 1494 vs 1347 pfu). The NCEI science files in raw/ show this.
- **Window truncation:** the 2017-09 event began on 2017-09-05 00:40 (official), before our window, so `start_ge10MeV_utc` = window start. The 1989 and 2003 windows end while flux is still ≥10 pfu. Durations for these windows are therefore lower bounds.
- **2026-01 has a very soft spectrum:** ≥10 MeV reached 37,000 pfu, but ≥100 MeV peaked at only ~0.55 pfu. The NOAA list notes "ESP enhanced at CME arrival", meaning low-energy shock-accelerated particles. 1989-10 is the opposite case: hard spectrum, ≥100 MeV up to 531 pfu. The radiation hazard behind shielding depends mostly on the high-energy channels, so S-level alone is a poor proxy for crew dose.
- All fluxes are measured at **geostationary orbit (Earth, ~1 AU)**, partly inside Earth's magnetosphere. They are not Mars or deep-space values.
- X-ray: SWPC real-time data before GOES-16 was operationally scaled. Classes for 2017 here (X9.3, X8.3) match the historical operational classes, while NOAA's later science reprocessing gives values ~1.4× higher.
- The `swpc/` snapshots reflect the moment of download only.

## Failures / not obtained

- **NASA DONKI (api.nasa.gov, DEMO_KEY):** the API rejects ranges longer than 60 days ("Date range cannot exceed 60 days"), and DEMO_KEY allows only 10 requests per hour (`x-ratelimit-remaining: 0` after 2 requests, with the quota partly shared with other requests from this IP). Covering SEP, CME and FLR for 2012–2026 would take about 270 requests. Only SEP 2024-04-15..06-13 was fetched. The direct DONKI host `kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/...` (no key, no range limit) timed out from this network. **To finish:** get a free personal key at api.nasa.gov (1000 req/h) and loop over 60-day windows, or retry the kauai endpoint from another network.
- GOES-R (16/18) NCEI L2 `sgps-l2-avg5m` science files contain only *differential* channels plus >500 MeV, with no ≥10 MeV integral, so the SWPC operational integral series from iSWA HAPI was used instead.
- `ftp.swpc.noaa.gov/pub/indices/SPE.txt` timed out. The NCEI-hosted HTML list was used.
