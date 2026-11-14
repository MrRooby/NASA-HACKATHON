-- 005_habitat_seed.sql | MariaDB 11.4 LTS | schemat HABITAT 0.1 (2026-11-14)
-- Dane startowe z HABITAT/README.md (gałąź FARTEK-HABITAT): habitat, strefy, załoga, katalog kanałów,
-- limity spoza config/thresholds.json, scenariusze. Idempotentne (można uruchamiać wielokrotnie).
-- Gdy powstanie HABITAT/channels.json (README §6.3), katalog kanałów należy ładować z niego.

-- Wymagane wiersze w astro_core (przy świeżej bazie load.py jeszcze nie działał; potem je nadpisze).
INSERT IGNORE INTO astro_core.environment (code, label, gravity_g, dose_msv_per_day, magnetosphere_protected, is_analog)
VALUES ('mars_surface', 'Mars surface', 0.38, 0.67, FALSE, FALSE);
INSERT IGNORE INTO astro_core.data_source (id, title, publisher, data_kind, access_status, notes)
VALUES ('habitat_sim_v1', 'HABITAT demo generator v1: simulated lava-tube habitat sensors (Mars)', 'NASA-HACKATHON team',
        'synthetic', 'generated', 'HABITAT/README.md (FARTEK-HABITAT). NOT real habitat data.');

USE astro_habitat;

-- ---------- habitat ----------
INSERT INTO habitat (code, name, environment_code, site_description, latitude_deg, longitude_deg, elevation_km,
                     site_basis, atm_pressure_kpa, atm_o2_fraction_pct, atm_ppo2_inspired_mmhg, sol_epoch_utc,
                     sol_length_s, mission_sols, crew_capacity, is_synthetic, notes)
VALUES ('MARS-LT-ELYSIUM', 'Sealed lava-tube habitat, Elysium Mons region', 'mars_surface',
        'Romio 2022 architecture (sealed lava tube, skylight cupolas with MOXIE, 49 m2 modules with own ECLSS) '
        'at a site per Zhu 2025 suitability analysis. Exact MGC3 cave candidate TBD.',
        25, 145, NULL, 'team_assumption', 56.5, 34, 128, '2039-01-01 00:00:00', 88775.244, 600, 4, TRUE,
        'Exploration atmosphere 8.2 psia / 34 % O2 (OCHMO TB-003). Location region 20-30N, 140-150E [ZAŁ].')
ON DUPLICATE KEY UPDATE name=VALUES(name), site_description=VALUES(site_description), notes=VALUES(notes),
  atm_pressure_kpa=VALUES(atm_pressure_kpa), atm_o2_fraction_pct=VALUES(atm_o2_fraction_pct),
  atm_ppo2_inspired_mmhg=VALUES(atm_ppo2_inspired_mmhg), mission_sols=VALUES(mission_sols);
SET @hab = (SELECT id FROM habitat WHERE code = 'MARS-LT-ELYSIUM');

-- ---------- strefy (README §2); dose_shielding_factor = [ZAŁ] (README §3.6: surface > cupola > tunnel > module)
INSERT INTO zone (habitat_id, code, label, zone_type, module_id, pressurized, dose_shielding_factor, sort_order, description) VALUES
 (@hab, 'surface',       'Surface: landing pad, ISRU, MOXIE, power, weather station', 'surface', NULL, FALSE, 1.00,  1, 'Exterior conditions, external dose, power, MOXIE output'),
 (@hab, 'airlock_A',     'Airlock / suitport A', 'airlock', NULL, TRUE, 0.60,  2, 'Cycles, gas loss, dust (PM, ultrafine), barrier status'),
 (@hab, 'airlock_B',     'Airlock / suitport B', 'airlock', NULL, TRUE, 0.60,  3, 'Redundant access tunnel'),
 (@hab, 'cupola_1',      'Skylight cupola 1', 'cupola', NULL, TRUE, 0.50,  4, 'Highest dose inside the tube; daylight; cupola-rock seal'),
 (@hab, 'cupola_2',      'Skylight cupola 2', 'cupola', NULL, TRUE, 0.50,  5, NULL),
 (@hab, 'cupola_3',      'Skylight cupola 3', 'cupola', NULL, TRUE, 0.50,  6, NULL),
 (@hab, 'cupola_4',      'Skylight cupola 4', 'cupola', NULL, TRUE, 0.50,  7, NULL),
 (@hab, 'tunnel_common', 'Tunnel common area (park, circulation)', 'tunnel', NULL, TRUE, 0.15,  8, 'General atmosphere, light, noise, structure (SHM), wall temperature'),
 (@hab, 'module_M1',     'Habitation module M1 (C1, C2)', 'module', 'M1', TRUE, 0.05,  9, 'Own ECLSS; local CO2; water, urine/feces per person; sleep noise; heating'),
 (@hab, 'module_M2',     'Habitation module M2 (C3, C4)', 'module', 'M2', TRUE, 0.05, 10, NULL),
 (@hab, 'farm',          'Farm "Tree of Light" (EDEN ISS heritage)', 'farm', NULL, TRUE, 0.15, 11, 'Plant O2/CO2, high RH, light'),
 (@hab, 'ambulatory',    'Ambulatory (medical bay)', 'medical', NULL, TRUE, 0.10, 12, 'Atmosphere, surface microbes'),
 (@hab, 'gym',           'Gym', 'gym', NULL, TRUE, 0.10, 13, 'CO2 and RH rise with exercise; occupancy'),
 (@hab, 'lab',           'Laboratory', 'lab', NULL, TRUE, 0.10, 14, 'Atmosphere; planetary-protection barrier')
ON DUPLICATE KEY UPDATE label=VALUES(label), zone_type=VALUES(zone_type), module_id=VALUES(module_id),
  pressurized=VALUES(pressurized), dose_shielding_factor=VALUES(dose_shielding_factor), sort_order=VALUES(sort_order),
  description=VALUES(description);

-- ---------- załoga (README §1.4); subject_id przypisuje import, gdy osoby są w astro_core
INSERT INTO crew (habitat_id, code, home_zone_code, role) VALUES
 (@hab, 'C1', 'module_M1', NULL), (@hab, 'C2', 'module_M1', NULL),
 (@hab, 'C3', 'module_M2', NULL), (@hab, 'C4', 'module_M2', NULL)
ON DUPLICATE KEY UPDATE home_zone_code=VALUES(home_zone_code);

-- ---------- katalog kanałów (README §3) ----------
INSERT INTO channel (code, label, category, unit, value_type, allowed_values, cadence_real, cadence_demo, cadence_s,
                     zone_scope, redundant, per_crew, threshold_ref, normal_min, normal_max, basis, sources, description) VALUES
-- 3.1 powietrze
 ('pressure_total',   'Total pressure', 'air', 'kPa', 'numeric', NULL, 'continuous', '1 min', 60, 'pressurized', TRUE, FALSE, NULL, 56.0, 57.0, 'nasa', 'OCHMO TB-003; NASA-STD-3001', 'Nominal 56.5 +-0.5 kPa (8.2 psia). Drop -> leak.'),
 ('ppo2_inspired',    'Inspired O2 partial pressure (PIO2)', 'air', 'mmHg', 'numeric', NULL, 'continuous', '1 min', 60, 'pressurized', TRUE, FALSE, 'cabin_ppo2', 127, NULL, 'nasa', 'nasa_std_3001_v2 [6003]; OCHMO TB-003', 'Nominal ~128 mmHg at 8.2 psia/34 % O2 - only 1 mmHg above the 1 h hypoxia limit. See HABITAT.md: conflict with cabin_ppo2 bands.'),
 ('o2_fraction',      'O2 fraction', 'air', '%', 'numeric', NULL, 'continuous', '1 min', 60, 'pressurized', FALSE, FALSE, NULL, NULL, 34, 'nasa', 'OCHMO TB-003', '> 34 % -> fire risk.'),
 ('ppco2',            'CO2 partial pressure', 'air', 'mmHg', 'numeric', NULL, 'continuous', '1 min, per module', 60, 'pressurized', TRUE, FALSE, 'cabin_co2', 1.5, 2.5, 'nasa', 'ochmo_tb_co2; law_2014', 'Measure per module (local pockets, Georgescu 2021). +1 mmHg ~ doubles headache odds.'),
 ('temperature_air',  'Air temperature', 'air', '°C', 'numeric', NULL, 'continuous', '1 min', 60, 'pressurized', FALSE, FALSE, 'cabin_temperature', 20, 25, 'nasa', 'nasa_std_3001_v2', NULL),
 ('rh',               'Relative humidity', 'air', '%RH', 'numeric', NULL, 'continuous', '1 min', 60, 'pressurized', FALSE, FALSE, 'cabin_humidity', 30, 60, 'nasa', 'nasa_std_3001_v2', NULL),
 ('voc_formaldehyde', 'Formaldehyde', 'air', 'ppm', 'numeric', NULL, 'every 73 h (AQM)', '6 h', 21600, 'pressurized', FALSE, FALSE, NULL, 0.008, 0.08, 'nasa', 'AQM NTRS 20170002579; SMAC', NULL),
 ('voc_benzene',      'Benzene', 'air', 'ppm', 'numeric', NULL, 'every 73 h (AQM)', '6 h', 21600, 'pressurized', FALSE, FALSE, NULL, NULL, NULL, 'nasa', 'AQM; SMAC', 'Normally ~0.'),
 ('nh3',              'Ammonia', 'air', 'ppm', 'numeric', NULL, 'event', 'event', NULL, 'pressurized', FALSE, FALSE, NULL, NULL, NULL, 'nasa', 'SMAC NTRS 20090014213', 'Normally ~0; leak scenario.'),
 ('co',               'Carbon monoxide', 'air', 'ppm', 'numeric', NULL, 'event (CSA-CP)', 'event', NULL, 'pressurized', FALSE, FALSE, NULL, NULL, NULL, 'nasa', 'SMAC', 'Below detection normally; fire marker.'),
 ('hcn',              'Hydrogen cyanide', 'air', 'ppm', 'numeric', NULL, 'event (CSA-CP)', 'event', NULL, 'pressurized', FALSE, FALSE, NULL, NULL, NULL, 'nasa', 'SMAC', 'Combustion product.'),
 ('hcl',              'Hydrogen chloride', 'air', 'ppm', 'numeric', NULL, 'event (CSA-CP)', 'event', NULL, 'pressurized', FALSE, FALSE, NULL, NULL, NULL, 'nasa', 'SMAC', 'Combustion product.'),
 ('pm10',             'Particulate matter PM10', 'air', 'mg/m3', 'numeric', NULL, 'continuous', '1 min', 60, 'pressurized', FALSE, FALSE, NULL, NULL, 0.05, 'nasa', 'NASA Mars dust limit draft 2026; Meyer 2018', NULL),
 ('pm2_5',            'Particulate matter PM2.5', 'air', 'mg/m3', 'numeric', NULL, 'continuous', '1 min', 60, 'pressurized', FALSE, FALSE, NULL, NULL, 0.05, 'nasa', 'NASA Mars dust limit draft 2026', NULL),
 ('ultrafine_count',  'Ultrafine particle count', 'air', 'particles/cm3', 'numeric', NULL, NULL, '1 min (airlocks)', 60, 'airlock,tunnel', FALSE, FALSE, NULL, NULL, NULL, 'team_assumption', 'VanBommel 2026', 'Rises after EVA.'),
-- 3.2 woda
 ('water_toc',        'Total organic carbon (potable water)', 'water', 'mg/L', 'numeric', NULL, 'weekly (TOCA)', 'weekly', 604800, 'module', FALSE, FALSE, NULL, 0.1, 0.5, 'nasa', 'TOCA NTRS 20170009165; MiniTOCA NTRS 20240004588', 'Limit 3.0 mg/L.'),
 ('water_silver',     'Silver biocide', 'water', 'µg/L', 'numeric', NULL, 'sessions (CWQMK)', 'weekly', 604800, 'module', FALSE, FALSE, NULL, 200, 400, 'nasa', 'CWQMK', '< 100 -> microbial risk.'),
 ('water_coliform',   'Coliform bacteria detected', 'water', '', 'boolean', 'not_detected,detected', 'monthly', 'monthly', NULL, 'module', FALSE, FALSE, NULL, NULL, NULL, 'nasa', 'ISS water kits', 'Per 100 mL.'),
 ('water_bacteria',   'Heterotrophic bacteria in water', 'water', 'CFU/mL', 'numeric', NULL, 'quarterly (MCD)', 'quarterly', NULL, 'module', FALSE, FALSE, NULL, NULL, 50, 'nasa', 'Microbial Capture Device', NULL),
 ('water_recovery',   'Water recovery ratio (WRS + BPA)', 'water', '%', 'numeric', NULL, 'continuous', '1 h', 3600, 'module', FALSE, FALSE, NULL, 98, NULL, 'nasa', 'ISS WRS + Brine Processor', '< 95 % -> degraded.'),
 ('water_tank_level', 'Water tank level', 'water', 'L', 'numeric', NULL, 'continuous', '10 min', 600, 'module', FALSE, FALSE, NULL, NULL, NULL, 'team_assumption', NULL, 'Watch downward trend.'),
-- 3.3 mocz i nawodnienie (per osoba)
 ('water_intake',            'Water intake (dispenser draw)', 'urine', 'mL', 'numeric', NULL, NULL, 'event', NULL, 'module', FALSE, TRUE, NULL, NULL, NULL, 'nasa', 'OCHMO-MTB-003; nasa_std_3001_v2 [6109]', 'Per draw; summed to water_intake_24h.'),
 ('water_intake_24h',        'Water intake per day', 'urine', 'L/d', 'numeric', NULL, NULL, 'daily', 86400, 'module', FALSE, TRUE, NULL, 2.5, NULL, 'nasa', 'nasa_std_3001_v2 [6109]; OCHMO-MTB-003', 'Target >= 2.5 L/d + 0.24 L per EVA hour.'),
 ('urine_void_volume',       'Urine void volume', 'urine', 'mL', 'numeric', NULL, NULL, 'each void', NULL, 'module', FALSE, TRUE, NULL, NULL, NULL, 'team_assumption', 'UWMS', NULL),
 ('void_count_24h',          'Voids per day', 'urine', 'count/d', 'numeric', NULL, NULL, 'daily', 86400, 'module', FALSE, TRUE, NULL, NULL, NULL, 'team_assumption', 'OCHMO-MTB-003', 'Low count + low intake -> dehydration / retention.'),
 ('time_since_last_void',    'Time since last void', 'urine', 'h', 'numeric', NULL, NULL, 'continuous', 600, 'module', FALSE, TRUE, NULL, NULL, 8, 'team_assumption', 'OCHMO-MTB-003 (9 in-flight retention cases)', '> ~8 h awake with normal intake -> suspected urinary retention.'),
 ('urine_volume_24h',        'Urine volume per day', 'urine', 'L/d', 'numeric', NULL, '24-h collection (pre/in/post flight)', 'daily', 86400, 'module', FALSE, TRUE, NULL, 0.8, 2.0, 'clinical', 'MedlinePlus 003425; Renal ER 2024', 'Stone prevention target >= 2.5 L/d.'),
 ('urine_specific_gravity',  'Urine specific gravity', 'urine', '', 'numeric', NULL, NULL, 'each void', NULL, 'module', FALSE, TRUE, NULL, 1.005, 1.030, 'clinical', 'MedlinePlus 003587', '> 1.030 dehydration.'),
 ('urine_ph',                'Urine pH', 'urine', 'pH', 'numeric', NULL, '24-h collection', 'each void', NULL, 'module', FALSE, TRUE, NULL, 4.6, 8.0, 'clinical', 'MedlinePlus 003583; Renal ER 2024', '< ~5.5 uric-acid stones; > 7.2 struvite (infection).'),
 ('urine_calcium_24h',       'Urine calcium per day', 'urine', 'mg/d', 'numeric', NULL, '24-h collection', 'daily', 86400, 'module', FALSE, TRUE, NULL, 100, 250, 'clinical', 'MedlinePlus 003603; Renal ER 2024; Smith 2014', 'Hypercalciuria > 300 (M) / > 250 (F); early bone-loss signal.'),
 ('urine_oxalate_24h',       'Urine oxalate per day', 'urine', 'mg/d', 'numeric', NULL, '24-h collection', 'daily', 86400, 'module', FALSE, TRUE, NULL, NULL, 45, 'nasa', 'Renal ER 2024 (Ennis & Asplin 2016)', NULL),
 ('urine_citrate_24h',       'Urine citrate per day', 'urine', 'mg/d', 'numeric', NULL, '24-h collection', 'daily', 86400, 'module', FALSE, TRUE, NULL, NULL, NULL, 'nasa', 'Whitson 2009; Renal ER 2024', 'Drop (hypocitraturia) -> stone risk; responds to potassium citrate. Threshold [ZAŁ].'),
 ('urine_dipstick_glucose',    'Urine dipstick: glucose', 'urine', '', 'categorical', 'negative,positive', NULL, 'each void', NULL, 'module', FALSE, TRUE, NULL, NULL, NULL, 'clinical', 'MedlinePlus 003579; Ax-1 Healthy.io', 'Positive -> metabolic.'),
 ('urine_dipstick_ketones',    'Urine dipstick: ketones', 'urine', '', 'categorical', 'negative,positive', NULL, 'each void', NULL, 'module', FALSE, TRUE, NULL, NULL, NULL, 'clinical', 'MedlinePlus 003579', 'Positive -> energy deficit.'),
 ('urine_dipstick_protein',    'Urine dipstick: protein', 'urine', '', 'categorical', 'negative,positive', NULL, 'each void', NULL, 'module', FALSE, TRUE, NULL, NULL, NULL, 'clinical', 'MedlinePlus 003579', NULL),
 ('urine_dipstick_blood',      'Urine dipstick: blood', 'urine', '', 'categorical', 'negative,positive', NULL, 'each void', NULL, 'module', FALSE, TRUE, NULL, NULL, NULL, 'clinical', 'MedlinePlus 003579', 'Positive -> stone or injury.'),
 ('urine_dipstick_nitrite',    'Urine dipstick: nitrite', 'urine', '', 'categorical', 'negative,positive', NULL, 'each void', NULL, 'module', FALSE, TRUE, NULL, NULL, NULL, 'clinical', 'MedlinePlus 003579', 'Positive -> UTI.'),
 ('urine_dipstick_leukocytes', 'Urine dipstick: leukocytes', 'urine', '', 'categorical', 'negative,positive', NULL, 'each void', NULL, 'module', FALSE, TRUE, NULL, NULL, NULL, 'clinical', 'MedlinePlus 003579', 'Positive -> UTI.'),
 ('urine_dipstick_bilirubin',  'Urine dipstick: bilirubin', 'urine', '', 'categorical', 'negative,positive', NULL, 'each void', NULL, 'module', FALSE, TRUE, NULL, NULL, NULL, 'clinical', 'MedlinePlus 003579', NULL),
 ('urine_albumin_creatinine',  'Urine albumin/creatinine ratio', 'urine', 'mg/g', 'numeric', NULL, NULL, 'weekly', 604800, 'module', FALSE, TRUE, NULL, NULL, NULL, 'team_assumption', 'Ax-1 Healthy.io', 'Clinical source still needed (README §9).'),
-- 3.4 kał (per osoba)
 ('feces_event',          'Defecation event', 'feces', '', 'event', NULL, 'each use', 'each use', NULL, 'module', FALSE, TRUE, NULL, NULL, NULL, 'team_assumption', NULL, '~1/day.'),
 ('feces_mass',           'Feces mass (wet)', 'feces', 'g', 'numeric', NULL, NULL, 'each use', NULL, 'module', FALSE, TRUE, NULL, NULL, NULL, 'nasa', 'BVAD 2022', '~123 g/day.'),
 ('feces_bristol',        'Bristol stool scale', 'feces', 'score 1–7', 'numeric', NULL, NULL, 'manual log', NULL, 'module', FALSE, TRUE, NULL, 3, 4, 'team_assumption', NULL, NULL),
 ('fecal_canister_fill',  'Fecal canister fill', 'feces', '%', 'numeric', NULL, 'on change', 'each use', NULL, 'module', FALSE, FALSE, NULL, NULL, NULL, 'nasa', 'ISS UWMS', '~13 uses per canister.'),
 ('microbiome_swab',      'Microbiome swab collected', 'feces', '', 'event', NULL, 'FD30, R-30', 'sol 30, sol 570', NULL, 'module', FALSE, TRUE, NULL, NULL, NULL, 'nasa', 'Spaceflight Standard Measures', NULL),
-- 3.5 mikroby
 ('air_bacteria',     'Airborne bacteria', 'microbes', 'CFU/m3', 'numeric', NULL, 'quarterly', 'quarterly', NULL, 'pressurized', FALSE, FALSE, NULL, NULL, 1000, 'nasa', 'ISS microbial monitoring', NULL),
 ('air_fungi',        'Airborne fungi', 'microbes', 'CFU/m3', 'numeric', NULL, 'quarterly', 'quarterly', NULL, 'pressurized', FALSE, FALSE, NULL, NULL, 100, 'nasa', 'ISS microbial monitoring', NULL),
 ('surface_bacteria', 'Surface bacteria', 'microbes', 'CFU/100cm2', 'numeric', NULL, 'quarterly', 'quarterly', NULL, 'pressurized', FALSE, FALSE, NULL, NULL, 10000, 'nasa', 'Checinska Sielaff 2019', NULL),
 ('surface_fungi',    'Surface fungi', 'microbes', 'CFU/100cm2', 'numeric', NULL, 'quarterly', 'quarterly', NULL, 'pressurized', FALSE, FALSE, NULL, NULL, 100, 'nasa', 'ISS microbial monitoring', NULL),
 ('minion_id',        'MinION sequencing result (taxa list)', 'microbes', '', 'event', NULL, 'on demand', 'on anomaly', NULL, 'pressurized', FALSE, FALSE, NULL, NULL, NULL, 'nasa', 'Castro-Wallace 2017', 'value_text = taxa list.'),
-- 3.6 promieniowanie
 ('dose_rate',               'Absorbed dose rate', 'radiation', 'µGy/h', 'numeric', NULL, 'continuous (HERA/Timepix)', '1 min', 60, 'all', TRUE, FALSE, NULL, NULL, NULL, 'nasa', 'Hassler 2014; Villar-Millán 2026; De Angelis 2002', 'Surface ~0.64-0.67 mSv/d; tunnel much lower. > 1.25 x 5-day background -> suspected SPE (arXiv 2502.02469).'),
 ('dose_personal_cum',       'Personal cumulative dose', 'radiation', 'mSv', 'numeric', NULL, 'continuous (Crew Active Dosimeter)', '1 min', 60, 'all', FALSE, TRUE, 'radiation_career_mSv', NULL, NULL, 'nasa', 'nasa_std_3001_v1 [4030]', 'Career limit 600 mSv.'),
 ('solar_proton_flux_10MeV', 'Solar proton flux >= 10 MeV', 'radiation', 'pfu', 'numeric', NULL, '5 min (NOAA GOES)', '5 min', 300, 'surface', FALSE, FALSE, 'solar_proton_flux_10MeV', NULL, 10, 'nasa', 'noaa_scales', 'S3 >= 1000 pfu -> no EVA.'),
-- 3.7 hałas, światło
 ('noise_leq',    'Noise level (Leq)', 'noise_light', 'dBA', 'numeric', NULL, '24 h every 60 d (dosimeter)', '1 min + daily summary', 60, 'pressurized', FALSE, FALSE, 'noise_24h', NULL, 70, 'nasa', 'nasa_std_3001_v2 [6115]; Limardo 2013', 'NC-50 work, NC-40 sleep.'),
 ('illuminance',  'Illuminance', 'noise_light', 'lux', 'numeric', NULL, NULL, '1 min', 60, 'pressurized', FALSE, FALSE, NULL, 150, 750, 'nasa', 'Sun 2024', '150-500 lux (Earth), 200-750 (ISS).'),
 ('cct',          'Correlated colour temperature', 'noise_light', 'K', 'numeric', NULL, 'SSLA (ISS)', '1 min', 60, 'pressurized', FALSE, FALSE, NULL, NULL, NULL, 'nasa', 'Brainard 2016; Rahman 2022', 'Circadian profile: cool day, warm evening.'),
-- 3.8 obecność
 ('zone_occupancy', 'Zone occupancy', 'presence', 'persons', 'numeric', NULL, NULL, '1 min', 60, 'all', FALSE, FALSE, NULL, NULL, NULL, 'team_assumption', 'Sun 2024', 'Demand-controlled ventilation.'),
 ('crew_location',  'Crew location (zone)', 'presence', '', 'categorical', NULL, NULL, 'on zone change', NULL, 'all', FALSE, TRUE, NULL, NULL, NULL, 'team_assumption', NULL, 'Stored also as intervals in crew_location table; value_text = zone code.'),
-- 3.9 szczelność, śluzy, ochrona planetarna
 ('airlock_cycle',       'Airlock cycle', 'integrity', '', 'event', NULL, NULL, 'each cycle', NULL, 'airlock', FALSE, FALSE, NULL, NULL, NULL, 'team_assumption', NULL, NULL),
 ('airlock_gas_loss',    'Airlock gas loss', 'integrity', 'kg/cycle', 'numeric', NULL, NULL, 'each cycle', NULL, 'airlock', FALSE, FALSE, NULL, NULL, NULL, 'team_assumption', 'Cohen 2015', 'Suitport reduces loss.'),
 ('pressure_decay_rate', 'Pressure decay rate', 'integrity', 'kPa/h', 'numeric', NULL, NULL, '10 min per segment', 600, 'pressurized', FALSE, FALSE, NULL, NULL, NULL, 'team_assumption', NULL, NULL),
 ('leak_detector',       'Leak detector (joint)', 'integrity', '', 'categorical', 'ok,leak', NULL, '1 min', 60, 'cupola,airlock,tunnel', FALSE, FALSE, NULL, NULL, NULL, 'team_assumption', 'Cai 2026', 'Joints and seams fail most often.'),
 ('pp_barrier_status',   'Planetary-protection barrier', 'integrity', '', 'categorical', 'ok,breach', NULL, 'on change', NULL, 'lab,airlock', FALSE, FALSE, NULL, NULL, NULL, 'team_assumption', 'Cohen 2015', NULL),
 ('vent_event',          'Vent event', 'integrity', '', 'event', NULL, NULL, 'event', NULL, 'all', FALSE, FALSE, NULL, NULL, NULL, 'team_assumption', NULL, NULL),
 ('waste_dump_event',    'Waste dump event', 'integrity', '', 'event', NULL, NULL, 'event', NULL, 'all', FALSE, FALSE, NULL, NULL, NULL, 'team_assumption', NULL, NULL),
-- 3.10 konstrukcja i bilans cieplny
 ('strain',           'Structural strain', 'structure_thermal', 'µε', 'numeric', NULL, NULL, '1 min', 60, 'tunnel,cupola', FALSE, FALSE, NULL, NULL, NULL, 'team_assumption', 'Zhou 2025', '5 measurement points (vault, walls, base).'),
 ('wall_convergence', 'Wall convergence', 'structure_thermal', 'mm', 'numeric', NULL, NULL, '10 min', 600, 'tunnel', FALSE, FALSE, NULL, NULL, NULL, 'team_assumption', NULL, NULL),
 ('seismic_event',    'Marsquake', 'structure_thermal', 'magnitude', 'numeric', NULL, NULL, 'event', NULL, 'tunnel', FALSE, FALSE, NULL, NULL, NULL, 'team_assumption', 'Boston 2004', 'Collapse risk.'),
 ('wall_temperature', 'Rock wall temperature', 'structure_thermal', '°C', 'numeric', NULL, NULL, '10 min', 600, 'tunnel,cupola', FALSE, FALSE, NULL, NULL, NULL, 'team_assumption', 'Cushing 2007; Horvath 2022', 'Stable in caves.'),
 ('heating_power',    'Heating power', 'structure_thermal', 'W', 'numeric', NULL, NULL, '1 min', 60, 'module', FALSE, FALSE, NULL, NULL, NULL, 'team_assumption', 'Zhou 2025', 'Peak losses ~04:00 local time, higher in winter.'),
-- 3.11 systemy i zasilanie
 ('power_fission',    'Fission power output', 'power', 'kW', 'numeric', NULL, NULL, '1 min', 60, 'surface', FALSE, FALSE, NULL, 38, 42, 'nasa', 'NASA Mars power decision 2024', '~40 kW class, constant.'),
 ('power_solar',      'Solar power output', 'power', 'kW', 'numeric', NULL, NULL, '1 min', 60, 'surface', FALSE, FALSE, NULL, NULL, NULL, 'team_assumption', NULL, 'Diurnal cycle, drops in dust storms.'),
 ('power_hvac',       'Power: HVAC', 'power', 'kW', 'numeric', NULL, NULL, '1 min', 60, 'all', FALSE, FALSE, NULL, NULL, NULL, 'team_assumption', 'Sun 2024', 'power_by_subsystem'),
 ('power_eclss',      'Power: ECLSS', 'power', 'kW', 'numeric', NULL, NULL, '1 min', 60, 'all', FALSE, FALSE, NULL, NULL, NULL, 'team_assumption', 'Sun 2024', 'power_by_subsystem'),
 ('power_lighting',   'Power: lighting', 'power', 'kW', 'numeric', NULL, NULL, '1 min', 60, 'all', FALSE, FALSE, NULL, NULL, NULL, 'team_assumption', 'Sun 2024', 'power_by_subsystem'),
 ('power_farm',       'Power: farm', 'power', 'kW', 'numeric', NULL, NULL, '1 min', 60, 'farm', FALSE, FALSE, NULL, NULL, NULL, 'team_assumption', 'Sun 2024', 'power_by_subsystem'),
 ('moxie_o2_rate',    'MOXIE O2 production', 'power', 'g/h', 'numeric', NULL, NULL, '1 min', 60, 'surface', FALSE, FALSE, NULL, NULL, NULL, 'nasa', 'MOXIE', '~12 g/h per unit (peak) x N.'),
 ('subsystem_status', 'Subsystem status', 'power', '', 'categorical', 'ok,degraded,fault', NULL, 'on change', NULL, 'all', FALSE, FALSE, NULL, NULL, NULL, 'team_assumption', NULL, 'value_text = status; subsystem in event details.'),
 ('habitat_mode',     'Habitat mode', 'power', '', 'categorical', 'pre_crew_checkout,nominal,shelter,contingency', NULL, 'on change', NULL, 'all', FALSE, FALSE, NULL, NULL, NULL, 'team_assumption', 'Cohen 2015', NULL),
-- 3.12 otoczenie
 ('ext_pressure',     'Exterior pressure', 'exterior', 'Pa', 'numeric', NULL, NULL, '5 min', 300, 'surface', FALSE, FALSE, NULL, 600, 900, 'nasa', 'NSSDC Mars fact sheet; MSL REMS', 'Diurnal +-10 %.'),
 ('ext_temperature',  'Exterior temperature', 'exterior', '°C', 'numeric', NULL, NULL, '5 min', 300, 'surface', FALSE, FALSE, NULL, -90, 15, 'nasa', 'NSSDC; Zhu 2025', NULL),
 ('dust_opacity_tau', 'Dust optical depth (tau)', 'exterior', '', 'numeric', NULL, NULL, '1 h', 3600, 'surface', FALSE, FALSE, NULL, 0.5, 1.0, 'nasa', 'Mars Dust Activity Database', 'Storm 5-11.'),
 ('uv_flux',          'UV flux', 'exterior', 'W/m2', 'numeric', NULL, NULL, '5 min', 300, 'surface', FALSE, FALSE, NULL, NULL, NULL, 'nasa', 'MSL REMS', 'Drops ~95 % in a dust storm.'),
 ('wind_speed',       'Wind speed', 'exterior', 'm/s', 'numeric', NULL, NULL, '5 min', 300, 'surface', FALSE, FALSE, NULL, 2, 30, 'nasa', 'NSSDC; Sun 2024', NULL)
ON DUPLICATE KEY UPDATE label=VALUES(label), category=VALUES(category), unit=VALUES(unit), value_type=VALUES(value_type),
  allowed_values=VALUES(allowed_values), cadence_real=VALUES(cadence_real), cadence_demo=VALUES(cadence_demo),
  cadence_s=VALUES(cadence_s), zone_scope=VALUES(zone_scope), redundant=VALUES(redundant), per_crew=VALUES(per_crew),
  threshold_ref=VALUES(threshold_ref), normal_min=VALUES(normal_min), normal_max=VALUES(normal_max), basis=VALUES(basis),
  sources=VALUES(sources), description=VALUES(description);

-- kanały techniczne (dla modułu HABITAT, nie dla GUI diagnostycznego)
UPDATE channel SET health_relevant = (category NOT IN ('integrity','structure_thermal','power','exterior')
                                      AND code NOT IN ('water_tank_level','water_recovery','zone_occupancy','fecal_canister_fill'));

-- ---------- limity spoza config/thresholds.json (README §3) ----------
-- Semantyka jak w threshold_band: min_value włącznie, max_value wyłącznie. Limit "> X" zapisujemy jako
-- min_value tuż nad X (np. O2 > 34 % -> 34.0001), żeby wartość nominalna X nie wpadała w przedział.
DELETE FROM channel_limit;
INSERT INTO channel_limit (channel_code, level, min_value, max_value, window_hours, metric, sex, message, basis, source) VALUES
 ('ppo2_inspired', 'caution', NULL, 127, 1, 'mean', 'any', 'Mild hypoxia limit (1 h mean)', 'nasa', 'nasa_std_3001_v2 [6003]'),
 ('ppo2_inspired', 'alert',   NULL, 122, NULL, 'value', 'any', 'Absolute minimum PIO2', 'nasa', 'nasa_std_3001_v2 [6003]'),
 ('ppo2_inspired', 'caution', NULL, NULL, 168, 'trend', 'any', 'Slow decline over weeks (Biosphere 2 lesson) - detect before threshold', 'team_assumption', 'Zhong 2025'),
 ('o2_fraction',   'alert',   34.0001, NULL, NULL, 'value', 'any', 'O2 above 34 % - fire risk', 'nasa', 'OCHMO TB-003'),
 ('ppco2',         'alert',   4.5, NULL, NULL, 'value', 'any', 'Symptoms (fatigue, nausea) above 4.5 mmHg', 'nasa', 'ochmo_tb_co2'),
 ('voc_formaldehyde', 'alert', 0.1, NULL, 168, 'mean', 'any', 'SMAC 7 d', 'nasa', 'SMAC NTRS 20090014213'),
 ('voc_benzene',   'alert',   0.07, NULL, 4320, 'mean', 'any', 'SMAC 180 d', 'nasa', 'SMAC'),
 ('nh3',           'caution', 3, NULL, 168, 'mean', 'any', 'SMAC 7 d', 'nasa', 'SMAC'),
 ('nh3',           'emergency', 30, NULL, 1, 'mean', 'any', 'SMAC 1 h - leak', 'nasa', 'SMAC'),
 ('co',            'caution', 55, NULL, 168, 'mean', 'any', 'SMAC 7 d', 'nasa', 'SMAC'),
 ('co',            'emergency', 425, NULL, 1, 'mean', 'any', 'SMAC 1 h - fire', 'nasa', 'SMAC'),
 ('hcn',           'emergency', 8, NULL, 1, 'mean', 'any', 'SMAC 1 h', 'nasa', 'SMAC'),
 ('hcl',           'emergency', 5, NULL, 1, 'mean', 'any', 'SMAC 1 h', 'nasa', 'SMAC'),
 ('pm10',          'alert',   0.1, NULL, 720, 'mean', 'any', 'Mars dust 30-day limit (draft)', 'nasa', 'NASA 2026 draft'),
 ('pm2_5',         'alert',   0.1, NULL, 720, 'mean', 'any', 'Mars dust 30-day limit (draft)', 'nasa', 'NASA 2026 draft'),
 ('water_toc',     'alert',   3.0, NULL, NULL, 'value', 'any', 'TOC potable limit', 'nasa', 'TOCA'),
 ('water_silver',  'caution', NULL, 100, NULL, 'value', 'any', 'Silver below 100 µg/L - microbial risk', 'nasa', 'CWQMK'),
 ('water_bacteria','alert',   50, NULL, NULL, 'value', 'any', '>= 50 CFU/mL', 'nasa', 'MCD'),
 ('water_recovery','caution', NULL, 95, NULL, 'value', 'any', 'Water recovery degraded', 'nasa', 'ISS WRS'),
 ('water_intake_24h', 'caution', NULL, 2.5, 24, 'value', 'any', 'Below 2.5 L/d (+0.24 L per EVA hour)', 'nasa', 'nasa_std_3001_v2 [6109]'),
 ('urine_volume_24h', 'caution', NULL, 2.5, 24, 'value', 'any', 'Below stone-prevention target 2.5 L/d', 'nasa', 'Renal ER 2024'),
 ('urine_volume_24h', 'alert',   NULL, 0.8, 48, 'consecutive_days', 'any', '< 0.8 L/d for >= 2 days - dehydration', 'team_assumption', 'MedlinePlus 003425'),
 ('urine_specific_gravity', 'caution', 1.030, NULL, NULL, 'value', 'any', '> 1.030 - dehydration', 'clinical', 'MedlinePlus 003587'),
 ('urine_ph',      'caution', NULL, 5.5, NULL, 'value', 'any', 'Low pH - uric-acid stone risk', 'team_assumption', 'Renal ER 2024'),
 ('urine_ph',      'caution', 7.2, NULL, NULL, 'value', 'any', 'High pH - struvite (infection)', 'clinical', 'Renal ER 2024'),
 ('urine_calcium_24h', 'caution', 300, NULL, 24, 'value', 'M', 'Hypercalciuria (men)', 'clinical', 'MedlinePlus 003603; Renal ER 2024'),
 ('urine_calcium_24h', 'caution', 250, NULL, 24, 'value', 'F', 'Hypercalciuria (women)', 'clinical', 'MedlinePlus 003603; Renal ER 2024'),
 ('urine_oxalate_24h', 'caution', 45, NULL, 24, 'value', 'any', 'Elevated oxalate - stone risk', 'nasa', 'Renal ER 2024'),
 ('time_since_last_void', 'caution', 8, NULL, NULL, 'value', 'any', 'Suspected urinary retention (awake, normal intake)', 'team_assumption', 'OCHMO-MTB-003'),
 ('air_bacteria',  'alert',   1000, NULL, NULL, 'value', 'any', NULL, 'nasa', 'ISS'),
 ('air_fungi',     'alert',   100, NULL, NULL, 'value', 'any', NULL, 'nasa', 'ISS'),
 ('surface_bacteria', 'alert', 10000, NULL, NULL, 'value', 'any', NULL, 'nasa', 'ISS'),
 ('surface_fungi', 'alert',   100, NULL, NULL, 'value', 'any', NULL, 'nasa', 'ISS'),
 ('dose_rate',     'caution', 1.25, NULL, 120, 'ratio_to_background', 'any', 'Dose rate > 1.25 x 5-day background - suspected SPE (min_value is the ratio)', 'nasa', 'arXiv 2502.02469'),
 ('dose_personal_cum', 'alert', 600, NULL, NULL, 'value', 'any', 'Career limit', 'nasa', 'nasa_std_3001_v1 [4030]'),
 ('dust_opacity_tau', 'caution', 5, NULL, NULL, 'value', 'any', 'Dust storm', 'nasa', 'Mars Dust Activity Database');

-- ---------- scenariusze (README §5); sole ustali generator demo ----------
INSERT INTO scenario (habitat_id, code, name, channels, zone_code, crew_codes, expected_reaction) VALUES
 (@hab, 'H1',  'CO2 scrubber failure in M1', 'ppco2', 'module_M1', 'C1,C2', 'Alert; affected crew via crew_location; link to headache in self-assessment'),
 (@hab, 'H2',  'O2 generator failure', 'ppo2_inspired', NULL, NULL, 'Alert below 127 mmHg; small 8.2 psi margin'),
 (@hab, 'H3',  'Slow O2 decline (Biosphere 2 lesson)', 'ppo2_inspired', NULL, NULL, 'Detect trend BEFORE threshold crossing'),
 (@hab, 'H4',  'Dehydration of C2', 'urine_volume_24h,urine_specific_gravity,water_intake_24h', 'module_M1', 'C2', 'Hydration recommendation; stone risk'),
 (@hab, 'H5',  'Rising urine calcium with skipped exercise', 'urine_calcium_24h', NULL, NULL, 'Link to BMD forecast'),
 (@hab, 'H6',  'Dust after EVA', 'pm10,pm2_5,ultrafine_count', 'airlock_A', NULL, 'Alert; cleaning procedure'),
 (@hab, 'H7',  'TOC rising in water (DMSD)', 'water_toc', NULL, NULL, 'Warning before 3 mg/L limit'),
 (@hab, 'H8',  'SPE during EVA', 'solar_proton_flux_10MeV,dose_rate,dose_personal_cum', 'surface', NULL, 'End EVA, shelter up to ~36 h, personal dose; quality=suspect on sensitive electronics'),
 (@hab, 'H9',  'Global dust storm (weeks)', 'dust_opacity_tau,power_solar,uv_flux', 'surface', NULL, 'Limit EVA; power balance (fission unchanged)'),
 (@hab, 'H10', 'NH3 leak / fire', 'nh3,co,pm10,pm2_5', NULL, NULL, 'Emergency'),
 (@hab, 'H11', 'Leak at cupola-rock joint', 'leak_detector,pressure_decay_rate', 'cupola_2', NULL, 'Leak localisation'),
 (@hab, 'H12', 'Marsquake', 'seismic_event,wall_convergence,strain', 'tunnel_common', NULL, 'Structure inspection'),
 (@hab, 'H13', 'Comm blackout at solar conjunction (~13 days)', NULL, NULL, NULL, 'Reports to Earth queued'),
 (@hab, 'H14', 'Pre-crew checkout (before sol 1)', 'habitat_mode,pressure_total,pressure_decay_rate', NULL, NULL, 'Habitat readiness report')
ON DUPLICATE KEY UPDATE name=VALUES(name), channels=VALUES(channels), zone_code=VALUES(zone_code),
  crew_codes=VALUES(crew_codes), expected_reaction=VALUES(expected_reaction);
