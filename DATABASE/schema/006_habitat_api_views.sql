-- 006_habitat_api_views.sql | MariaDB 11.4 LTS | schemat HABITAT 0.1 (2026-11-14)
-- Widoki do odczytu danych habitatu (MOTHER, GUI). Prefiks habitat_ w bazie astro_api.
-- Widoki NIE nadają statusu ok/caution/alert (to robi MOTHER); pokazują wartości, jakość, zakres nominalny
-- i to, czy wartość jest w nim (range_flag) - informacyjnie.
USE astro_api;

-- H1. Habitat + strefy
CREATE OR REPLACE VIEW habitat_zones AS
SELECT h.code AS habitat_code, h.name AS habitat_name, h.environment_code, h.is_synthetic,
       z.code AS zone_code, z.label AS zone_label, z.zone_type, z.module_id, z.pressurized,
       z.dose_shielding_factor, z.sort_order, z.description
FROM astro_habitat.habitat h
JOIN astro_habitat.zone z ON z.habitat_id = h.id;

-- H2. Katalog kanałów z limitami (limity jako tekst; szczegóły w habitat_channel_limits)
CREATE OR REPLACE VIEW habitat_channels AS
SELECT c.code AS channel_code, c.label, c.category, c.unit, c.value_type, c.allowed_values,
       c.cadence_real, c.cadence_demo, c.cadence_s, c.zone_scope, c.redundant, c.per_crew,
       c.threshold_ref, c.normal_min, c.normal_max, c.basis, c.sources, c.description, c.health_relevant,
       (SELECT GROUP_CONCAT(CONCAT(l.level, ': ',
                                   COALESCE(CONCAT('>=', l.min_value), ''),
                                   IF(l.min_value IS NOT NULL AND l.max_value IS NOT NULL, ' & ', ''),
                                   COALESCE(CONCAT('<', l.max_value), ''),
                                   IF(l.window_hours IS NOT NULL, CONCAT(' (', l.metric, ' ', l.window_hours, ' h)'), ''),
                                   IF(l.sex <> 'any', CONCAT(' [', l.sex, ']'), ''))
                            ORDER BY FIELD(l.level, 'normal', 'caution', 'alert', 'emergency') SEPARATOR '; ')
        FROM astro_habitat.channel_limit l WHERE l.channel_code = c.code) AS limits
FROM astro_habitat.channel c;

CREATE OR REPLACE VIEW habitat_channel_limits AS
SELECT l.channel_code, c.label AS channel_label, c.unit, l.level, l.min_value, l.max_value, l.window_hours,
       l.metric, l.sex, l.message, l.basis, l.source
FROM astro_habitat.channel_limit l
JOIN astro_habitat.channel c ON c.code = l.channel_code;

-- H3. Załoga habitatu (powiązanie z osobą w astro_core, jeśli jest)
CREATE OR REPLACE VIEW habitat_crew AS
SELECT h.code AS habitat_code, cr.code AS crew_code, s.code AS subject_code, cr.home_zone_code, cr.role
FROM astro_habitat.crew cr
JOIN astro_habitat.habitat h ON h.id = cr.habitat_id
LEFT JOIN astro_core.subject s ON s.id = cr.subject_id;

-- H4. Ostatni odczyt każdej serii (habitat x strefa x kanał x sensor x osoba) - kafelki GUI
CREATE OR REPLACE VIEW habitat_latest AS
SELECT h.code AS habitat_code, x.zone_code, x.channel_code, c.label AS channel_label, c.category,
       x.sensor, x.crew_code, x.ts_utc, x.sol, x.value_num, x.value_text, x.unit, x.quality, x.source_flag,
       c.normal_min, c.normal_max, c.threshold_ref,
       CASE WHEN x.value_num IS NULL                                  THEN NULL
            WHEN c.normal_min IS NOT NULL AND x.value_num < c.normal_min THEN 'below_normal'
            WHEN c.normal_max IS NOT NULL AND x.value_num > c.normal_max THEN 'above_normal'
            WHEN c.normal_min IS NULL AND c.normal_max IS NULL         THEN NULL
            ELSE 'in_normal' END AS range_flag
FROM (
  SELECT r.*, ROW_NUMBER() OVER (PARTITION BY r.habitat_id, r.zone_code, r.channel_code, r.sensor, r.crew_key
                                 ORDER BY r.ts_utc DESC) AS rn
  FROM astro_habitat.reading r
) x
JOIN astro_habitat.habitat h ON h.id = x.habitat_id
JOIN astro_habitat.channel c ON c.code = x.channel_code
WHERE x.rn = 1;

-- H5. Szereg godzinowy (trendy, wykresy)
CREATE OR REPLACE VIEW habitat_hourly AS
SELECT h.code AS habitat_code, rh.hour_utc, rh.sol, rh.zone_code, NULLIF(rh.crew_code, '') AS crew_code,
       rh.channel_code, c.label AS channel_label, c.category, c.unit, rh.sensor,
       rh.n_samples, rh.value_mean, rh.value_min, rh.value_max, rh.n_suspect, rh.n_fault, rh.source_flag,
       c.normal_min, c.normal_max,
       CASE WHEN rh.value_mean IS NULL                                     THEN NULL
            WHEN c.normal_min IS NOT NULL AND rh.value_mean < c.normal_min THEN 'below_normal'
            WHEN c.normal_max IS NOT NULL AND rh.value_mean > c.normal_max THEN 'above_normal'
            WHEN c.normal_min IS NULL AND c.normal_max IS NULL             THEN NULL
            ELSE 'in_normal' END AS range_flag
FROM astro_habitat.reading_hourly rh
JOIN astro_habitat.habitat h ON h.id = rh.habitat_id
JOIN astro_habitat.channel c ON c.code = rh.channel_code;

-- H6. Zgodność sensorów A/B (kanały redundantne): różnica średnich godzinowych
CREATE OR REPLACE VIEW habitat_sensor_agreement AS
SELECT h.code AS habitat_code, a.hour_utc, a.zone_code, a.channel_code, c.unit,
       a.value_mean AS sensor_a, b.value_mean AS sensor_b, b.value_mean - a.value_mean AS diff_b_minus_a,
       100 * ABS(b.value_mean - a.value_mean) / NULLIF(ABS(a.value_mean), 0) AS diff_pct
FROM astro_habitat.reading_hourly a
JOIN astro_habitat.reading_hourly b
  ON b.habitat_id = a.habitat_id AND b.channel_code = a.channel_code AND b.zone_code = a.zone_code
 AND b.crew_code = a.crew_code AND b.hour_utc = a.hour_utc AND b.sensor = 'B'
JOIN astro_habitat.habitat h ON h.id = a.habitat_id
JOIN astro_habitat.channel c ON c.code = a.channel_code
WHERE a.sensor = 'A';

-- H7. Zdarzenia
CREATE OR REPLACE VIEW habitat_events AS
SELECT h.code AS habitat_code, e.event_code, e.event_type, e.start_utc, e.end_utc,
       TIMESTAMPDIFF(MINUTE, e.start_utc, e.end_utc) AS duration_min, (e.end_utc IS NULL) AS is_ongoing,
       e.sol, e.zone_code, e.crew_code, e.severity, e.details, e.source_flag
FROM astro_habitat.event e
JOIN astro_habitat.habitat h ON h.id = e.habitat_id;

-- H8. Ekspozycja osoby: godzina x kanał środowiskowy strefy, w której osoba przebywała
--     (średnia ważona minutami pobytu; sensor A albo jedyny). Np. "C2: 6 h w M1 z CO2 > 3 mmHg".
CREATE OR REPLACE VIEW habitat_crew_exposure_hourly AS
SELECT h.code AS habitat_code, x.crew_code, s.code AS subject_code, x.hour_utc, x.channel_code, c.unit,
       GROUP_CONCAT(DISTINCT x.zone_code ORDER BY x.zone_code SEPARATOR ', ') AS zones,
       SUM(x.minutes)                                  AS minutes_observed,
       SUM(x.minutes * x.value_mean) / NULLIF(SUM(x.minutes), 0) AS exposure_mean,
       MAX(x.value_max)                                AS exposure_max
FROM (
  SELECT cl.habitat_id, cl.crew_code, rh.hour_utc, rh.channel_code, cl.zone_code, rh.value_mean, rh.value_max,
         TIMESTAMPDIFF(SECOND, GREATEST(cl.from_utc, rh.hour_utc),
                       LEAST(COALESCE(cl.to_utc, rh.hour_utc + INTERVAL 1 HOUR), rh.hour_utc + INTERVAL 1 HOUR)) / 60
           AS minutes
  FROM astro_habitat.crew_location cl
  JOIN astro_habitat.reading_hourly rh
    ON rh.habitat_id = cl.habitat_id AND rh.zone_code = cl.zone_code AND rh.crew_code = ''
   AND rh.is_primary = 1
   AND rh.hour_utc >= cl.from_utc - INTERVAL 1 HOUR          -- zakres indeksu ix_rh_primary dla każdego pobytu
   AND rh.hour_utc <  COALESCE(cl.to_utc, '9999-12-31')
   AND rh.hour_utc + INTERVAL 1 HOUR > cl.from_utc
  WHERE rh.channel_code IN ('ppco2', 'ppo2_inspired', 'temperature_air', 'rh', 'noise_leq', 'illuminance',
                            'dose_rate', 'pm2_5', 'pm10')
) x
JOIN astro_habitat.habitat h ON h.id = x.habitat_id
JOIN astro_habitat.channel c ON c.code = x.channel_code
JOIN astro_habitat.crew cr ON cr.habitat_id = x.habitat_id AND cr.code = x.crew_code
LEFT JOIN astro_core.subject s ON s.id = cr.subject_id
GROUP BY h.code, x.crew_code, s.code, x.hour_utc, x.channel_code, c.unit;

-- H9. Odczyty osobowe (mocz, nawodnienie, kał, dawka osobista) z powiązaniem do osoby w astro_core
CREATE OR REPLACE VIEW habitat_crew_readings AS
SELECT h.code AS habitat_code, r.crew_code, s.code AS subject_code, r.ts_utc, r.sol, r.zone_code,
       r.channel_code, c.label AS channel_label, c.category, r.value_num, r.value_text, r.unit, r.quality,
       r.source_flag, c.normal_min, c.normal_max,
       CASE WHEN r.value_num IS NULL                                  THEN NULL
            WHEN c.normal_min IS NOT NULL AND r.value_num < c.normal_min THEN 'below_normal'
            WHEN c.normal_max IS NOT NULL AND r.value_num > c.normal_max THEN 'above_normal'
            WHEN c.normal_min IS NULL AND c.normal_max IS NULL         THEN NULL
            ELSE 'in_normal' END AS range_flag
FROM astro_habitat.reading r
JOIN astro_habitat.habitat h ON h.id = r.habitat_id
JOIN astro_habitat.channel c ON c.code = r.channel_code
JOIN astro_habitat.crew cr ON cr.habitat_id = r.habitat_id AND cr.code = r.crew_code
LEFT JOIN astro_core.subject s ON s.id = cr.subject_id
WHERE r.crew_code IS NOT NULL;

-- H10. Scenariusze demo
CREATE OR REPLACE VIEW habitat_scenarios AS
SELECT h.code AS habitat_code, s.code AS scenario_code, s.name, s.channels, s.zone_code, s.crew_codes,
       s.start_sol, s.end_sol, s.expected_reaction
FROM astro_habitat.scenario s
JOIN astro_habitat.habitat h ON h.id = s.habitat_id;

-- H11. Ostatnie odczyty tylko kanałów istotnych dla zdrowia (powietrze, woda, mocz, mikroby, dawka, hałas, światło)
CREATE OR REPLACE VIEW habitat_health_latest AS
SELECT l.*
FROM habitat_latest l
JOIN astro_habitat.channel c ON c.code = l.channel_code
WHERE c.health_relevant = 1;
