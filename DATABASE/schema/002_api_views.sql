-- 002_api_views.sql | MariaDB 11.4 LTS | wersja schematu 0.2 (2026-11-14)
-- STATUS: nieuruchomione jeszcze na serwerze - weryfikacja przy wdrożeniu.
-- Opis: DATABASE/DATABASE_PLAN.md, kontrakt dostępu: DATABASE/schema/api_contract.md
-- Zasada: każdy GROUP BY wymienia wszystkie nieagregowane kolumny (działa także z ONLY_FULL_GROUP_BY).

-- ============================================================
-- astro_api: widoki = jedyny interfejs do odczytu dla GUI, MEDICAL-DIAGNOSIS, eksportu
-- ============================================================
USE astro_api;

-- ---------- A. Katalogi: co jest w bazie ----------

-- A1. Źródła danych + ile czego zawierają
CREATE OR REPLACE VIEW sources AS
SELECT ds.id                AS source_id,
       ds.title, ds.publisher, ds.data_kind, ds.access_status,
       ds.url, ds.doi, ds.license, ds.retrieved_at,
       (SELECT COUNT(*) FROM astro_core.subject s  WHERE s.source_id = ds.id)          AS n_subjects,
       (SELECT COUNT(*) FROM astro_core.mission m  WHERE m.source_id = ds.id)          AS n_missions,
       (SELECT COUNT(DISTINCT o.indicator_id) FROM astro_core.observation o WHERE o.source_id = ds.id) AS n_indicators,
       (SELECT COUNT(*) FROM astro_core.observation o      WHERE o.source_id = ds.id)  AS n_observations,
       (SELECT COUNT(*) FROM astro_core.cohort c           WHERE c.source_id = ds.id)  AS n_cohorts,
       (SELECT COUNT(*) FROM astro_core.env_observation e  WHERE e.source_id = ds.id)  AS n_env_observations,
       (SELECT MAX(b.finished_at) FROM astro_core.import_batch b WHERE b.source_id = ds.id AND b.status = 'ok') AS last_import_at
FROM astro_core.data_source ds;

-- A2. Misje / kampanie
CREATE OR REPLACE VIEW missions AS
SELECT m.code AS mission_code, m.name AS mission_name,
       m.environment_code AS environment, e.label AS environment_label, e.is_analog,
       m.start_date, m.end_date, m.duration_days, m.is_synthetic,
       m.source_id,
       (SELECT COUNT(*) FROM astro_core.participation p WHERE p.mission_id = m.id) AS n_subjects
FROM astro_core.mission m
JOIN astro_core.environment e ON e.code = m.environment_code;

-- A3. Osoby: kim jest, skąd pochodzi, ile ma danych
CREATE OR REPLACE VIEW subjects AS
SELECT s.code AS subject_code, s.source_subject_code,
       s.sex, s.age_band_code AS age_band, s.is_synthetic,
       s.source_id, ds.title AS source_title, ds.data_kind,
       m.code AS mission_code, m.name AS mission_name, m.environment_code AS environment,
       p.role, p.group_label,
       COUNT(o.id)                                  AS n_observations,
       COUNT(DISTINCT o.indicator_id)               AS n_indicators,
       COUNT(DISTINCT o.time_order)                 AS n_timepoints,
       GROUP_CONCAT(DISTINCT i.category ORDER BY i.category SEPARATOR ', ') AS categories
FROM astro_core.subject s
JOIN astro_core.data_source   ds ON ds.id = s.source_id
JOIN astro_core.participation p  ON p.subject_id = s.id
JOIN astro_core.mission       m  ON m.id = p.mission_id
LEFT JOIN astro_core.observation o ON o.subject_id = s.id AND o.mission_id = m.id
LEFT JOIN astro_core.indicator   i ON i.id = o.indicator_id
GROUP BY s.id, s.code, s.source_subject_code, s.sex, s.age_band_code, s.is_synthetic,
         s.source_id, ds.title, ds.data_kind,
         m.id, m.code, m.name, m.environment_code, p.role, p.group_label;

-- A4. Wskaźniki: słownik + gdzie występują
CREATE OR REPLACE VIEW indicators AS
SELECT i.code AS indicator_code, i.label, i.category,
       i.body_system_code AS body_system, bs.body_region,
       i.canonical_unit AS unit, i.value_type, i.scope,
       i.threshold_id, i.baseline_threshold_id, i.description, i.clinical_use, i.is_derived,
       COUNT(DISTINCT o.subject_id) AS n_subjects,
       COUNT(o.id)                  AS n_observations,
       GROUP_CONCAT(DISTINCT o.source_id ORDER BY o.source_id SEPARATOR ', ') AS sources
FROM astro_core.indicator i
LEFT JOIN astro_core.body_system bs ON bs.code = i.body_system_code
LEFT JOIN astro_core.observation o  ON o.indicator_id = i.id
GROUP BY i.id, i.code, i.label, i.category, i.body_system_code, bs.body_region,
         i.canonical_unit, i.value_type, i.scope, i.threshold_id, i.baseline_threshold_id, i.description,
         i.clinical_use, i.is_derived;

-- ---------- B. Mapy pokrycia: źródło x wskaźnik, osoba x wskaźnik ----------

-- B1. Co zawiera każde źródło (wskaźnik po wskaźniku)
CREATE OR REPLACE VIEW source_data_map AS
SELECT t.source_id, t.indicator_code, t.indicator_label, t.category, t.unit,
       COUNT(DISTINCT t.subject_id) AS n_subjects,
       SUM(t.n)                     AS n_observations,
       COUNT(DISTINCT t.tp)         AS n_timepoints,
       GROUP_CONCAT(DISTINCT t.tp ORDER BY t.tp SEPARATOR ', ') AS timepoints,
       MIN(t.min_value) AS min_value, MAX(t.max_value) AS max_value
FROM (
  SELECT o.source_id, o.subject_id, i.code AS indicator_code, i.label AS indicator_label, i.category,
         i.canonical_unit AS unit,
         COALESCE(o.timepoint_label, DATE_FORMAT(o.measured_at, '%Y-%m-%d'), '') AS tp,
         COUNT(*) AS n, MIN(o.value_num) AS min_value, MAX(o.value_num) AS max_value
  FROM astro_core.observation o
  JOIN astro_core.indicator i ON i.id = o.indicator_id
  GROUP BY o.source_id, o.subject_id, i.id, i.code, i.label, i.category, i.canonical_unit, tp
) t
GROUP BY t.source_id, t.indicator_code, t.indicator_label, t.category, t.unit;

-- B2. Co ma każda osoba (wskaźnik po wskaźniku), punkty czasowe w kolejności chronologicznej
CREATE OR REPLACE VIEW subject_data_map AS
SELECT t.subject_code, t.mission_code, t.source_id, t.indicator_code, t.indicator_label, t.category, t.unit,
       SUM(t.n)   AS n_values,
       COUNT(*)   AS n_timepoints,
       GROUP_CONCAT(t.tp ORDER BY t.sort_key, t.tp SEPARATOR ', ') AS timepoints,
       MAX(t.is_synthetic) AS is_synthetic
FROM (
  SELECT s.code AS subject_code, m.code AS mission_code, o.source_id,
         i.code AS indicator_code, i.label AS indicator_label, i.category, i.canonical_unit AS unit,
         COALESCE(o.timepoint_label, DATE_FORMAT(o.measured_at, '%Y-%m-%d'), '') AS tp,
         MIN(o.time_order) AS sort_key,
         COUNT(*) AS n, MAX(o.is_synthetic) AS is_synthetic
  FROM astro_core.observation o
  JOIN astro_core.subject   s ON s.id = o.subject_id
  JOIN astro_core.mission   m ON m.id = o.mission_id
  JOIN astro_core.indicator i ON i.id = o.indicator_id
  GROUP BY s.id, s.code, m.id, m.code, o.source_id, i.id, i.code, i.label, i.category, i.canonical_unit, tp
) t
GROUP BY t.subject_code, t.mission_code, t.source_id, t.indicator_code, t.indicator_label, t.category, t.unit;

-- ---------- R. Dane referencyjne ----------

-- R1. Katalog norm (czytelny)
CREATE OR REPLACE VIEW reference_ranges AS
SELECT i.code AS indicator_code, i.label AS indicator_label, i.category,
       rr.range_kind, rr.class_label, rr.sex, rr.age_min, rr.age_max, rr.population,
       rr.environment_code AS environment,
       rr.low_value, rr.high_value, rr.low_inclusive, rr.high_inclusive,
       rr.critical_low, rr.critical_high, rr.unit,
       rr.condition_note, rr.source_id, ds.title AS source_title, rr.basis, rr.priority, rr.notes
FROM astro_core.reference_range rr
JOIN astro_core.indicator   i  ON i.id  = rr.indicator_id
JOIN astro_core.data_source ds ON ds.id = rr.source_id;

-- R2. Najlepiej pasująca norma (reference_interval) dla każdej obserwacji.
-- Kolejność: płeć dokładna > 'any'; norma dla środowiska > ogólna; węższy przedział wieku; wyższy priority.
-- Wiek nieznany: pasują tylko normy obejmujące cały zakres 18-65 lat.
CREATE OR REPLACE VIEW reference_match AS
SELECT observation_id, reference_range_id, ref_low, ref_high, ref_critical_low, ref_critical_high,
       ref_sex, ref_age_min, ref_age_max, ref_population, ref_source_id
FROM (
  SELECT o.id AS observation_id, rr.id AS reference_range_id,
         rr.low_value AS ref_low, rr.high_value AS ref_high,
         rr.critical_low AS ref_critical_low, rr.critical_high AS ref_critical_high,
         rr.sex AS ref_sex, rr.age_min AS ref_age_min, rr.age_max AS ref_age_max,
         rr.population AS ref_population, rr.source_id AS ref_source_id,
         ROW_NUMBER() OVER (PARTITION BY o.id
                            ORDER BY (rr.sex <> 'any') DESC,
                                     (rr.environment_code IS NOT NULL) DESC,
                                     (rr.age_max - rr.age_min) ASC,
                                     rr.priority DESC, rr.id) AS rn
  FROM astro_core.observation o
  JOIN astro_core.subject s ON s.id = o.subject_id
  JOIN astro_core.mission m ON m.id = o.mission_id
  LEFT JOIN astro_core.age_band ab ON ab.code = s.age_band_code
  JOIN astro_core.reference_range rr
    ON rr.indicator_id = o.indicator_id
   AND rr.range_kind = 'reference_interval'
   AND rr.sex IN (s.sex, 'any')
   AND (rr.environment_code IS NULL OR rr.environment_code = m.environment_code)
   AND ( (ab.code IS NOT NULL AND ab.age_min >= rr.age_min AND ab.age_max <= rr.age_max)
      OR (ab.code IS NULL     AND rr.age_min <= 18       AND rr.age_max >= 65) )
) x
WHERE rn = 1;

-- R3. Klasyfikacje (np. T-score wg WHO): pomiar -> klasa.
-- Wymaga znanego przedziału wieku osoby (klasyfikacje zależą od grupy wieku). Granice wg low/high_inclusive.
CREATE OR REPLACE VIEW classifications AS
SELECT o.id AS observation_id, s.code AS subject_code, m.code AS mission_code,
       i.code AS indicator_code, o.phase, o.timepoint_label, o.time_order, o.replicate,
       o.value_num AS value, i.canonical_unit AS unit,
       rr.class_label, rr.population, rr.sex AS ref_sex, rr.age_min AS ref_age_min, rr.age_max AS ref_age_max,
       rr.source_id AS ref_source_id, rr.basis, o.is_synthetic
FROM astro_core.observation o
JOIN astro_core.subject   s  ON s.id  = o.subject_id
JOIN astro_core.mission   m  ON m.id  = o.mission_id
JOIN astro_core.indicator i  ON i.id  = o.indicator_id
JOIN astro_core.age_band  ab ON ab.code = s.age_band_code
JOIN astro_core.reference_range rr
  ON rr.indicator_id = o.indicator_id
 AND rr.range_kind = 'classification'
 AND rr.sex IN (s.sex, 'any')
 AND (rr.environment_code IS NULL OR rr.environment_code = m.environment_code)
 AND ab.age_min >= rr.age_min AND ab.age_max <= rr.age_max
 AND o.value_num IS NOT NULL
 AND (rr.low_value  IS NULL OR o.value_num > rr.low_value  OR (rr.low_inclusive  AND o.value_num = rr.low_value))
 AND (rr.high_value IS NULL OR o.value_num < rr.high_value OR (rr.high_inclusive AND o.value_num = rr.high_value));

-- ---------- C. Dane: płaskie, gotowe do wykresów ----------

-- C1. Każda obserwacja, wszystko złączone, z normą dobraną do płci/wieku i flagą
CREATE OR REPLACE VIEW observations AS
SELECT o.id AS observation_id,
       s.code AS subject_code, s.sex, s.is_synthetic AS subject_is_synthetic,
       m.code AS mission_code, m.environment_code AS environment,
       o.source_id, ds.data_kind,
       i.code AS indicator_code, i.label AS indicator_label, i.category,
       i.body_system_code AS body_system,
       o.phase, o.anchor, o.day_offset, o.time_is_approx, o.time_order,
       CASE o.anchor WHEN 'launch'  THEN o.day_offset
                     WHEN 'landing' THEN m.duration_days + o.day_offset END AS mission_day,
       o.timepoint_label, o.measured_at, o.replicate,
       o.value_num AS value, o.value_text, i.canonical_unit AS unit,
       -- norma: najpierw tabela reference_range (płeć/wiek), potem norma z pliku źródłowego
       COALESCE(rm.ref_low,  o.ref_min) AS ref_min,
       COALESCE(rm.ref_high, o.ref_max) AS ref_max,
       rm.ref_critical_low, rm.ref_critical_high,
       CASE WHEN rm.reference_range_id IS NOT NULL THEN 'reference_table'
            WHEN o.ref_min IS NOT NULL OR o.ref_max IS NOT NULL THEN 'source_file'
            END AS ref_basis,
       rm.reference_range_id, rm.ref_sex, rm.ref_age_min, rm.ref_age_max,
       o.ref_min AS file_ref_min, o.ref_max AS file_ref_max,
       (rm.reference_range_id IS NOT NULL AND (o.ref_min IS NOT NULL OR o.ref_max IS NOT NULL)
        AND NOT (o.ref_min <=> rm.ref_low AND o.ref_max <=> rm.ref_high)) AS ref_conflict,
       CASE WHEN o.value_num IS NULL OR COALESCE(rm.ref_low, o.ref_min, rm.ref_high, o.ref_max) IS NULL THEN NULL
            WHEN o.value_num < COALESCE(rm.ref_critical_low, -1e308)  THEN 'critical_low'
            WHEN o.value_num > COALESCE(rm.ref_critical_high, 1e308)  THEN 'critical_high'
            WHEN o.value_num < COALESCE(rm.ref_low,  o.ref_min, -1e308) THEN 'below'
            WHEN o.value_num > COALESCE(rm.ref_high, o.ref_max,  1e308) THEN 'above'
            ELSE 'in_range' END AS ref_flag,
       o.sample_type, o.is_synthetic,
       o.raw_name, o.raw_value, o.raw_unit
FROM astro_core.observation o
JOIN astro_core.subject     s  ON s.id  = o.subject_id
JOIN astro_core.mission     m  ON m.id  = o.mission_id
JOIN astro_core.indicator   i  ON i.id  = o.indicator_id
JOIN astro_core.data_source ds ON ds.id = o.source_id
LEFT JOIN reference_match   rm ON rm.observation_id = o.id;

-- C2. Średnia z powtórzeń (triplikaty DXA) w danym punkcie czasowym
CREATE OR REPLACE VIEW observations_mean AS
SELECT subject_code, mission_code, environment, source_id, data_kind,
       indicator_code, indicator_label, category, body_system,
       phase, anchor, day_offset, time_order, mission_day, timepoint_label,
       DATE(measured_at) AS measured_date,
       AVG(value) AS value, STDDEV_SAMP(value) AS value_sd, COUNT(*) AS n_replicates,
       unit, MIN(ref_min) AS ref_min, MAX(ref_max) AS ref_max,
       MIN(ref_critical_low) AS ref_critical_low, MAX(ref_critical_high) AS ref_critical_high,
       MAX(is_synthetic) AS is_synthetic
FROM observations
WHERE value IS NOT NULL
GROUP BY subject_code, mission_code, environment, source_id, data_kind,
         indicator_code, indicator_label, category, body_system,
         phase, anchor, day_offset, time_order, mission_day, timepoint_label, DATE(measured_at), unit;

-- C3. Baseline osoby = średnia wszystkich pomiarów przed misją (phase = 'pre')
CREATE OR REPLACE VIEW baseline AS
SELECT subject_code, mission_code, indicator_code, unit,
       AVG(value) AS baseline_value, COUNT(*) AS n_pre_timepoints,
       GROUP_CONCAT(timepoint_label ORDER BY time_order SEPARATOR ', ') AS baseline_timepoints
FROM observations_mean
WHERE phase = 'pre'
GROUP BY subject_code, mission_code, indicator_code, unit;

-- C4. Zmiana względem baseline'u + status z progów względem baseline'u.
-- Metryka zależy od threshold_band.evaluation (z config/thresholds.json):
--   'baseline_percent'        -> pct_of_baseline   (np. BMD >= 95 % wartości sprzed lotu)
--   'baseline_percent_change' -> pct_change        (np. masa ciała -5 % … +5 %)
CREATE OR REPLACE VIEW change_from_baseline AS
SELECT c.subject_code, c.mission_code, c.indicator_code, c.indicator_label,
       c.category, c.body_system, c.phase, c.timepoint_label, c.day_offset, c.mission_day, c.time_order,
       c.value, c.unit, c.baseline_value, c.delta, c.pct_of_baseline, c.pct_change,
       c.baseline_threshold_id,
       CASE tb.evaluation WHEN 'baseline_percent'        THEN 'pct_of_baseline'
                          WHEN 'baseline_percent_change' THEN 'pct_change' END AS baseline_metric,
       tb.status AS baseline_status, tb.message AS baseline_message, tb.action AS baseline_action,
       tb.escalate, c.is_synthetic
FROM (
  SELECT om.subject_code, om.mission_code, om.indicator_code, om.indicator_label,
         om.category, om.body_system, om.phase, om.timepoint_label, om.day_offset, om.mission_day, om.time_order,
         om.value, om.unit, b.baseline_value,
         om.value - b.baseline_value                        AS delta,
         100 * om.value / NULLIF(b.baseline_value, 0)       AS pct_of_baseline,
         100 * om.value / NULLIF(b.baseline_value, 0) - 100 AS pct_change,
         i.baseline_threshold_id, om.is_synthetic
  FROM observations_mean om
  JOIN baseline b ON b.subject_code = om.subject_code AND b.mission_code = om.mission_code
                 AND b.indicator_code = om.indicator_code
  JOIN astro_core.indicator i ON i.code = om.indicator_code
) c
LEFT JOIN astro_core.threshold_band tb
       ON tb.threshold_id = c.baseline_threshold_id
      AND tb.evaluation IN ('baseline_percent','baseline_percent_change')
      AND (tb.min_value IS NULL OR (CASE tb.evaluation WHEN 'baseline_percent_change' THEN c.pct_change
                                                       ELSE c.pct_of_baseline END) >= tb.min_value)
      AND (tb.max_value IS NULL OR (CASE tb.evaluation WHEN 'baseline_percent_change' THEN c.pct_change
                                                       ELSE c.pct_of_baseline END) <  tb.max_value);

-- C5. Ostatni pomiar każdej osoby dla każdego wskaźnika + status = NAJGORSZY z trzech ocen:
--   (1) progi bezwzględne (threshold_id), (2) progi względem baseline'u (baseline_threshold_id),
--   (3) norma laboratoryjna (poza normą = caution; poza wartością krytyczną = alert).
-- Reguły kroczące (np. średnia z 3 dni) liczy moduł MEDICAL-DIAGNOSIS - nie ma ich tutaj.
CREATE OR REPLACE VIEW latest AS
SELECT z.subject_code, z.mission_code, z.indicator_code, z.indicator_label, z.category, z.body_system,
       z.timepoint_label, z.mission_day, z.time_order, z.measured_date,
       z.value, z.unit, z.ref_min, z.ref_max, z.baseline_value, z.pct_of_baseline, z.is_synthetic,
       CASE z.worst WHEN 3 THEN 'alert' WHEN 2 THEN 'caution' WHEN 1 THEN 'ok' END AS status,
       CASE WHEN z.worst = 0              THEN NULL
            WHEN z.abs_rank  = z.worst    THEN 'threshold'
            WHEN z.base_rank = z.worst    THEN 'baseline_threshold'
            ELSE 'lab_reference' END                                        AS status_basis,
       CASE WHEN z.worst = 0              THEN NULL
            WHEN z.abs_rank  = z.worst    THEN z.abs_message
            WHEN z.base_rank = z.worst    THEN z.base_message END           AS message,
       CASE WHEN z.worst = 0              THEN NULL
            WHEN z.abs_rank  = z.worst    THEN z.abs_action
            WHEN z.base_rank = z.worst    THEN z.base_action END            AS action,
       (COALESCE(z.abs_escalate, 0) + COALESCE(z.base_escalate, 0) > 0 OR z.lab_rank = 3) AS escalate
FROM (
  SELECT y.*,
         GREATEST(COALESCE(y.abs_rank, 0), COALESCE(y.base_rank, 0), COALESCE(y.lab_rank, 0)) AS worst
  FROM (
    SELECT x.subject_code, x.mission_code, x.indicator_code, x.indicator_label, x.category, x.body_system,
           x.timepoint_label, x.mission_day, x.time_order, x.measured_date,
           x.value, x.unit, x.ref_min, x.ref_max, x.is_synthetic,
           b.baseline_value,
           100 * x.value / NULLIF(b.baseline_value, 0) AS pct_of_baseline,
           CASE ta.status  WHEN 'ok' THEN 1 WHEN 'caution' THEN 2 WHEN 'alert' THEN 3 END AS abs_rank,
           ta.message  AS abs_message,  ta.action  AS abs_action,  ta.escalate  AS abs_escalate,
           CASE tbb.status WHEN 'ok' THEN 1 WHEN 'caution' THEN 2 WHEN 'alert' THEN 3 END AS base_rank,
           tbb.message AS base_message, tbb.action AS base_action, tbb.escalate AS base_escalate,
           CASE WHEN x.ref_min IS NULL AND x.ref_max IS NULL                          THEN NULL
                WHEN x.value < x.ref_critical_low OR x.value > x.ref_critical_high    THEN 3
                WHEN x.value < x.ref_min OR x.value > x.ref_max                       THEN 2
                ELSE 1 END AS lab_rank
    FROM (
      SELECT om.*,
             ROW_NUMBER() OVER (PARTITION BY om.subject_code, om.mission_code, om.indicator_code
                                ORDER BY om.time_order DESC, om.measured_date DESC) AS rn
      FROM observations_mean om
    ) x
    JOIN astro_core.indicator i ON i.code = x.indicator_code
    LEFT JOIN baseline b
           ON b.subject_code = x.subject_code AND b.mission_code = x.mission_code
          AND b.indicator_code = x.indicator_code
    LEFT JOIN astro_core.threshold_band ta
           ON ta.threshold_id = i.threshold_id
          AND ta.evaluation IN ('absolute','absolute_and_baseline','absolute_and_rolling')
          AND (ta.min_value IS NULL OR x.value >= ta.min_value)
          AND (ta.max_value IS NULL OR x.value <  ta.max_value)
    LEFT JOIN astro_core.threshold_band tbb
           ON tbb.threshold_id = i.baseline_threshold_id
          AND tbb.evaluation IN ('baseline_percent','baseline_percent_change')
          AND b.baseline_value IS NOT NULL
          AND (tbb.min_value IS NULL OR (CASE tbb.evaluation
                 WHEN 'baseline_percent_change' THEN 100 * x.value / NULLIF(b.baseline_value, 0) - 100
                 ELSE 100 * x.value / NULLIF(b.baseline_value, 0) END) >= tbb.min_value)
          AND (tbb.max_value IS NULL OR (CASE tbb.evaluation
                 WHEN 'baseline_percent_change' THEN 100 * x.value / NULLIF(b.baseline_value, 0) - 100
                 ELSE 100 * x.value / NULLIF(b.baseline_value, 0) END) <  tbb.max_value)
    WHERE x.rn = 1
  ) y
) z;

-- C6. Status części ciała (do klikalnej sylwetki): najgorszy status z 'latest'.
-- Układy bez żadnego pomiaru nie mają wiersza - GUI pokazuje je jako 'no_data'.
CREATE OR REPLACE VIEW body_system_status AS
SELECT l.subject_code, l.mission_code, bs.code AS body_system, bs.label AS body_system_label,
       bs.body_region,
       CASE MAX(CASE l.status WHEN 'alert' THEN 3 WHEN 'caution' THEN 2 WHEN 'ok' THEN 1 ELSE 0 END)
            WHEN 3 THEN 'alert' WHEN 2 THEN 'caution' WHEN 1 THEN 'ok' ELSE 'no_data' END AS status,
       COUNT(*) AS n_indicators,
       SUM(l.status = 'alert')   AS n_alert,
       SUM(l.status = 'caution') AS n_caution,
       MAX(l.escalate)           AS escalate
FROM latest l
JOIN astro_core.body_system bs ON bs.code = l.body_system
GROUP BY l.subject_code, l.mission_code, bs.code, bs.label, bs.body_region;

-- C7. Serie dzienne (wearables, dane symulacyjne) ze średnią kroczącą z 7 DNI KALENDARZOWYCH
-- (okno RANGE po numerze dnia - luki w danych nie wydłużają okna), osobno dla każdej misji.
CREATE OR REPLACE VIEW daily_series AS
SELECT d.*,
       AVG(d.value) OVER (PARTITION BY d.subject_code, d.mission_code, d.indicator_code
                          ORDER BY TO_DAYS(d.measured_date)
                          RANGE BETWEEN 6 PRECEDING AND CURRENT ROW) AS value_7d_mean,
       COUNT(*)     OVER (PARTITION BY d.subject_code, d.mission_code, d.indicator_code
                          ORDER BY TO_DAYS(d.measured_date)
                          RANGE BETWEEN 6 PRECEDING AND CURRENT ROW) AS n_days_7d
FROM (
  SELECT subject_code, mission_code, indicator_code, indicator_label, unit,
         DATE(measured_at) AS measured_date, mission_day,
         AVG(value) AS value, MIN(value) AS value_min, MAX(value) AS value_max, COUNT(*) AS n_samples,
         MAX(is_synthetic) AS is_synthetic
  FROM observations
  WHERE measured_at IS NOT NULL AND value IS NOT NULL
  GROUP BY subject_code, mission_code, indicator_code, indicator_label, unit, DATE(measured_at), mission_day
) d;

-- C8. Środowisko: wartości dzienne
CREATE OR REPLACE VIEW environment_daily AS
SELECT e.environment_code AS environment, e.location, i.code AS indicator_code, i.label AS indicator_label,
       i.canonical_unit AS unit, e.source_id, DATE(e.measured_at) AS measured_date,
       AVG(e.value_num) AS value_mean, MIN(e.value_num) AS value_min, MAX(e.value_num) AS value_max,
       COUNT(*) AS n_samples, MAX(e.is_synthetic) AS is_synthetic
FROM astro_core.env_observation e
JOIN astro_core.indicator i ON i.id = e.indicator_id
GROUP BY e.environment_code, e.location, i.id, i.code, i.label, i.canonical_unit, e.source_id, DATE(e.measured_at);

-- C9. Dane zbiorcze z publikacji: jeden wiersz = badanie x wskaźnik, fazy obok siebie
CREATE OR REPLACE VIEW cohort_stats AS
SELECT c.source_id, c.source_row, c.study_title, c.mission_type, c.environment_code AS environment,
       c.n, c.n_male, c.n_female, c.age_mean, c.bmi_mean, c.countermeasure,
       i.code AS indicator_code, i.canonical_unit AS unit,
       MAX(CASE WHEN cs.phase = 'pre'  THEN cs.mean_value END) AS pre_mean,
       MAX(CASE WHEN cs.phase = 'pre'  THEN cs.sd_value   END) AS pre_sd,
       MAX(CASE WHEN cs.phase = 'in'   THEN cs.mean_value END) AS in_mean,
       MAX(CASE WHEN cs.phase = 'in'   THEN cs.sd_value   END) AS in_sd,
       MAX(CASE WHEN cs.phase = 'post' THEN cs.mean_value END) AS post_mean,
       MAX(CASE WHEN cs.phase = 'post' THEN cs.sd_value   END) AS post_sd
FROM astro_core.cohort c
JOIN astro_core.cohort_stat cs ON cs.cohort_id = c.id
JOIN astro_core.indicator   i  ON i.id = cs.indicator_id
GROUP BY c.id, c.source_id, c.source_row, c.study_title, c.mission_type, c.environment_code,
         c.n, c.n_male, c.n_female, c.age_mean, c.bmi_mean, c.countermeasure,
         i.id, i.code, i.canonical_unit;

-- C10. Dziennik importów
CREATE OR REPLACE VIEW import_log AS
SELECT id AS batch_id, source_id, adapter, file_name, file_sha256, started_at, finished_at,
       status, rows_read, rows_upserted, rows_rejected, notes
FROM astro_core.import_batch;

-- ---------- E. Widoki dla GUI diagnostycznego (0.3) ----------

-- E1. latest zawężony do wskaźników diagnostycznych (bez cytokin, DXA, środowiska)
CREATE OR REPLACE VIEW diagnostic_latest AS
SELECT l.*
FROM latest l
JOIN astro_core.indicator i ON i.code = l.indicator_code
WHERE i.clinical_use = 'diagnostic';
