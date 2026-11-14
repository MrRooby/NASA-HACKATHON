-- 001_core.sql | MariaDB 11.4 LTS | wersja schematu 0.2 (2026-11-14)
-- STATUS: nieuruchomione jeszcze na serwerze - weryfikacja przy wdrożeniu.
-- Opis: DATABASE/DATABASE_PLAN.md, kontrakt dostępu: DATABASE/schema/api_contract.md

-- ============================================================
-- astro_core: tabele (zapisuje tylko ETL)
-- ============================================================
CREATE DATABASE IF NOT EXISTS astro_core CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS astro_api  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE astro_core;

-- ---------- 1. Słowniki ----------

CREATE TABLE data_source (
  id             VARCHAR(40)  NOT NULL PRIMARY KEY,          -- 'osdr_osd575'
  title          VARCHAR(300) NOT NULL,
  publisher      VARCHAR(120) NULL,
  url            VARCHAR(500) NULL,
  doi            VARCHAR(120) NULL,
  license        VARCHAR(120) NULL,
  data_kind      ENUM('real_spaceflight','real_analog','real_environment',
                      'literature_aggregate','reference_literature','synthetic') NOT NULL,
  access_status  ENUM('files_public','metadata_public','request_required',
                      'unknown','generated') NOT NULL,
  retrieved_at   DATE NULL,
  notes          TEXT NULL
) ENGINE=InnoDB;

CREATE TABLE environment (
  code                   VARCHAR(30) NOT NULL PRIMARY KEY,   -- = id w config/thresholds.json
  label                  VARCHAR(80) NOT NULL,
  gravity_g              DOUBLE NULL,
  dose_msv_per_day       DOUBLE NULL,
  dose_msv_per_day_min   DOUBLE NULL,
  dose_msv_per_day_max   DOUBLE NULL,
  comm_delay_s_min       DOUBLE NULL,
  comm_delay_s_max       DOUBLE NULL,
  magnetosphere_protected BOOLEAN NULL,
  is_analog              BOOLEAN NOT NULL DEFAULT FALSE
) ENGINE=InnoDB;

CREATE TABLE body_system (
  code        VARCHAR(30) NOT NULL PRIMARY KEY,               -- 'cardiovascular'
  label       VARCHAR(80) NOT NULL,
  body_region VARCHAR(30) NOT NULL,                           -- klikalna część sylwetki: 'heart'
  sort_order  TINYINT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE indicator (
  id               SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code             VARCHAR(60)  NOT NULL UNIQUE,              -- 'glucose', 'bmd_lumbar_spine'
  label            VARCHAR(120) NOT NULL,
  category         ENUM('vitals','lab_cbc','lab_cmp','lab_cardio','lab_cytokine',
                        'bone_dxa','body_composition','fitness','sleep','mood',
                        'nutrition','environment','radiation') NOT NULL,
  body_system_code VARCHAR(30)  NULL,
  canonical_unit   VARCHAR(40)  NOT NULL,
  value_type       ENUM('numeric','ordinal','text') NOT NULL DEFAULT 'numeric',
  scope            ENUM('subject','environment') NOT NULL DEFAULT 'subject',
  threshold_id     VARCHAR(60)  NULL,                         -- progi dla wartości bezwzględnej
  baseline_threshold_id VARCHAR(60) NULL,                     -- progi dla % baseline'u, np. 'bmd_hip_spine_pct_baseline'
  description      TEXT NULL,
  -- do czego służy wskaźnik w aplikacji (GUI diagnostyczne pokazuje tylko 'diagnostic'):
  --   diagnostic          - badanie wykonalne w misji i używane do oceny zdrowia
  --   research            - badanie naukowe (np. cytokiny), nie do diagnostyki w locie
  --   reference           - badanie referencyjne na Ziemi (np. DXA przed/po misji)
  --   environment_context - pomiar środowiska (tło dla oceny osoby)
  clinical_use     ENUM('diagnostic','research','reference','environment_context') NOT NULL DEFAULT 'diagnostic',
  is_derived       BOOLEAN NOT NULL DEFAULT FALSE,            -- id progu liczonego z innych pomiarów (np. % baseline'u), bez własnych pomiarów
  CONSTRAINT fk_ind_body FOREIGN KEY (body_system_code) REFERENCES body_system(code)
) ENGINE=InnoDB;

CREATE TABLE indicator_alias (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  source_id        VARCHAR(40)  NOT NULL,
  raw_name         VARCHAR(200) NOT NULL,                     -- 'GLUCOSE', 'crp_concentration_picogram_per_milliliter'
  raw_unit         VARCHAR(60)  NOT NULL DEFAULT '',
  indicator_id     SMALLINT UNSIGNED NOT NULL,
  factor           DOUBLE NOT NULL DEFAULT 1,                 -- canonical = raw * factor + offset_value
  offset_value     DOUBLE NOT NULL DEFAULT 0,
  unit_is_inferred BOOLEAN NOT NULL DEFAULT FALSE,            -- jednostka przyjęta, nie odczytana z pliku
  UNIQUE KEY uq_alias (source_id, raw_name, raw_unit),
  CONSTRAINT fk_alias_src FOREIGN KEY (source_id)    REFERENCES data_source(id),
  CONSTRAINT fk_alias_ind FOREIGN KEY (indicator_id) REFERENCES indicator(id)
) ENGINE=InnoDB;

-- Kopia config/thresholds.json (źródłem prawdy jest JSON; ETL nadpisuje całość przy imporcie)
CREATE TABLE threshold_band (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  threshold_id   VARCHAR(60) NOT NULL,
  config_version VARCHAR(20) NOT NULL,
  evaluation     VARCHAR(40) NOT NULL,                        -- 'absolute', 'baseline_percent', ...
  min_value      DOUBLE NULL,                                 -- włącznie; NULL = bez dolnej granicy
  max_value      DOUBLE NULL,                                 -- wyłącznie; NULL = bez górnej granicy
  status         ENUM('ok','caution','alert') NOT NULL,
  basis          ENUM('source','team_assumption') NOT NULL,
  message        VARCHAR(300) NULL,
  action         VARCHAR(500) NULL,
  escalate       BOOLEAN NOT NULL DEFAULT FALSE,
  KEY ix_tb_threshold (threshold_id)
) ENGINE=InnoDB;

-- Przedziały wieku używane w całej bazie (osoby mają tylko przedział, nigdy datę urodzenia)
CREATE TABLE age_band (
  code    VARCHAR(10) NOT NULL PRIMARY KEY,                   -- '30-39'
  age_min TINYINT UNSIGNED NOT NULL,                          -- włącznie
  age_max TINYINT UNSIGNED NOT NULL,                          -- włącznie
  CONSTRAINT chk_age_band CHECK (age_min <= age_max)
) ENGINE=InnoDB;

-- Wartości referencyjne (normy) zależne od płci, wieku, środowiska; także klasyfikacje (np. T-score WHO)
CREATE TABLE reference_range (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  indicator_id     SMALLINT UNSIGNED NOT NULL,
  range_kind       ENUM('reference_interval','classification') NOT NULL DEFAULT 'reference_interval',
  class_label      VARCHAR(60)  NOT NULL DEFAULT '',          -- tylko dla classification: 'osteopenia'
  sex              ENUM('F','M','any') NOT NULL DEFAULT 'any',
  age_min          TINYINT UNSIGNED NOT NULL DEFAULT 18,      -- lata, włącznie
  age_max          TINYINT UNSIGNED NOT NULL DEFAULT 120,     -- lata, włącznie
  population       VARCHAR(40)  NOT NULL DEFAULT 'general_adult',  -- 'general_adult','astronaut','postmenopausal'
  environment_code VARCHAR(30)  NULL,                         -- NULL = dowolne środowisko
  low_value        DOUBLE NULL,                               -- NULL = brak dolnej granicy
  high_value       DOUBLE NULL,                               -- NULL = brak górnej granicy
  low_inclusive    BOOLEAN NOT NULL DEFAULT TRUE,             -- czy low_value należy do przedziału
  high_inclusive   BOOLEAN NOT NULL DEFAULT TRUE,             -- czy high_value należy do przedziału
                                                              -- (np. WHO osteopenia: -2.5 < T < -1.0 -> oba FALSE)
  critical_low     DOUBLE NULL,                               -- wartości krytyczne (natychmiastowa eskalacja)
  critical_high    DOUBLE NULL,
  unit             VARCHAR(40)  NOT NULL,                     -- musi = indicator.canonical_unit (sprawdza ETL)
  condition_note   VARCHAR(120) NULL,                         -- 'na czczo', 'w spoczynku, siedząc'
  source_id        VARCHAR(40)  NOT NULL,                     -- skąd norma (zbiór danych albo literatura)
  basis            ENUM('source','team_assumption') NOT NULL,
  priority         TINYINT NOT NULL DEFAULT 0,                -- rozstrzyga remisy przy dopasowaniu
  notes            TEXT NULL,
  natural_key      BINARY(32) AS (UNHEX(SHA2(CONCAT_WS('|', indicator_id, range_kind, class_label, sex,
                     age_min, age_max, population, IFNULL(environment_code,''), source_id), 256))) STORED,
  UNIQUE KEY uq_rr_nk (natural_key),
  KEY ix_rr_indicator (indicator_id, sex),
  CONSTRAINT chk_rr_age   CHECK (age_min <= age_max),
  CONSTRAINT chk_rr_range CHECK (low_value IS NULL OR high_value IS NULL OR low_value <= high_value),
  CONSTRAINT fk_rr_ind FOREIGN KEY (indicator_id)     REFERENCES indicator(id),
  CONSTRAINT fk_rr_env FOREIGN KEY (environment_code) REFERENCES environment(code),
  CONSTRAINT fk_rr_src FOREIGN KEY (source_id)        REFERENCES data_source(id)
) ENGINE=InnoDB;

-- ---------- 2. Misje, osoby, udział ----------

CREATE TABLE mission (
  id               SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code             VARCHAR(40)  NOT NULL UNIQUE,              -- 'I4', 'MR035G-C3A', 'SYN-ISS-180'
  name             VARCHAR(160) NOT NULL,
  environment_code VARCHAR(30)  NOT NULL,
  source_id        VARCHAR(40)  NOT NULL,
  start_date       DATE NULL,                                 -- start / początek bed rest (jeśli znany)
  end_date         DATE NULL,                                 -- lądowanie / koniec bed rest
  duration_days    SMALLINT UNSIGNED NULL,
  is_synthetic     BOOLEAN NOT NULL DEFAULT FALSE,
  description      TEXT NULL,
  CONSTRAINT fk_mis_env FOREIGN KEY (environment_code) REFERENCES environment(code),
  CONSTRAINT fk_mis_src FOREIGN KEY (source_id)        REFERENCES data_source(id)
) ENGINE=InnoDB;

CREATE TABLE subject (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code                VARCHAR(40) NOT NULL UNIQUE,            -- 'I4-C001', 'MR035G-C3A-224', 'SYN-01'
  source_subject_code VARCHAR(40) NOT NULL,                   -- kod z pliku: 'C001', '224'
  source_id           VARCHAR(40) NOT NULL,
  sex                 ENUM('F','M','U') NOT NULL DEFAULT 'U',
  age_band_code       VARCHAR(10) NULL,                       -- wiek na starcie misji; NULL = nieznany
  is_synthetic        BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE KEY uq_subject_src (source_id, source_subject_code),
  CONSTRAINT fk_sub_src FOREIGN KEY (source_id)     REFERENCES data_source(id),
  CONSTRAINT fk_sub_age FOREIGN KEY (age_band_code) REFERENCES age_band(code)
) ENGINE=InnoDB;

CREATE TABLE participation (
  subject_id  INT UNSIGNED      NOT NULL,
  mission_id  SMALLINT UNSIGNED NOT NULL,
  role        ENUM('crew','bed_rest_subject','control','synthetic_crew') NOT NULL,
  group_label VARCHAR(60) NULL,                               -- np. grupa countermeasure
  PRIMARY KEY (subject_id, mission_id),
  CONSTRAINT fk_par_sub FOREIGN KEY (subject_id) REFERENCES subject(id),
  CONSTRAINT fk_par_mis FOREIGN KEY (mission_id) REFERENCES mission(id)
) ENGINE=InnoDB;

-- ---------- 3. Import ----------

CREATE TABLE import_batch (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  source_id     VARCHAR(40)  NOT NULL,
  adapter       VARCHAR(40)  NOT NULL,
  file_name     VARCHAR(300) NOT NULL,
  file_sha256   CHAR(64)     NOT NULL,
  started_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at   DATETIME NULL,
  status        ENUM('running','ok','failed') NOT NULL DEFAULT 'running',
  rows_read     INT UNSIGNED NULL,
  rows_upserted INT UNSIGNED NULL,
  rows_rejected INT UNSIGNED NULL,
  notes         TEXT NULL,
  CONSTRAINT fk_ib_src FOREIGN KEY (source_id) REFERENCES data_source(id)
) ENGINE=InnoDB;

-- ---------- 4. Dane ----------

CREATE TABLE observation (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  subject_id       INT UNSIGNED      NOT NULL,
  mission_id       SMALLINT UNSIGNED NOT NULL,
  indicator_id     SMALLINT UNSIGNED NOT NULL,
  source_id        VARCHAR(40)       NOT NULL,
  import_batch_id  INT UNSIGNED      NOT NULL,
  anchor           ENUM('launch','landing','none') NOT NULL,  -- L-x/FDx -> launch; R-x/R+x -> landing
  day_offset       SMALLINT NULL,                             -- L-92 -> -92; R+45 -> 45
  time_is_approx   BOOLEAN NOT NULL DEFAULT FALSE,            -- np. wizyta '6MO' -> 182
  phase            ENUM('pre','in','post','none') AS (
                     CASE
                       WHEN anchor = 'launch'  AND day_offset < 0  THEN 'pre'
                       WHEN anchor = 'landing' AND day_offset >= 0 THEN 'post'
                       WHEN anchor IN ('launch','landing')         THEN 'in'
                       ELSE 'none'
                     END) STORED,
  -- Klucz chronologii działający bez znajomości długości misji (bed rest):
  -- przed i w trakcie (launch) < po lądowaniu (landing) < serie bez anchora (wg daty)
  time_order       INT AS (
                     CASE anchor
                       WHEN 'launch'  THEN day_offset
                       WHEN 'landing' THEN 100000 + day_offset
                       ELSE 200000 + TO_DAYS(measured_at)
                     END) STORED,
  timepoint_label  VARCHAR(30)  NULL,                         -- oryginał: 'L-92', 'R+45', '6MO'
  measured_at      DATETIME(3)  NULL,                         -- UTC; seria syntetyczna / live
  replicate        TINYINT UNSIGNED NOT NULL DEFAULT 1,       -- triplikaty DXA: 1..3
  value_num        DOUBLE NULL,
  value_text       VARCHAR(200) NULL,
  ref_min          DOUBLE NULL,                               -- norma laboratoryjna z wiersza źródła
  ref_max          DOUBLE NULL,
  sample_type      ENUM('lab_serum','lab_whole_blood','lab_plasma','dxa_scan',
                        'self_report','wearable','manual_device','derived') NOT NULL,
  is_synthetic     BOOLEAN NOT NULL DEFAULT FALSE,
  raw_name         VARCHAR(200) NULL,
  raw_value        VARCHAR(100) NULL,
  raw_unit         VARCHAR(60)  NULL,
  natural_key      BINARY(32) AS (UNHEX(SHA2(CONCAT_WS('|',
                     subject_id, mission_id, indicator_id, source_id, anchor,
                     IFNULL(day_offset,''), IFNULL(measured_at,''), sample_type, replicate), 256))) STORED,
  UNIQUE KEY uq_obs_nk (natural_key),
  KEY ix_obs_subject_ind (subject_id, indicator_id, anchor, day_offset),
  KEY ix_obs_timeline    (subject_id, mission_id, indicator_id, time_order),
  KEY ix_obs_indicator   (indicator_id),
  KEY ix_obs_source      (source_id),
  KEY ix_obs_measured    (measured_at),
  CONSTRAINT chk_obs_value CHECK (value_num IS NOT NULL OR value_text IS NOT NULL),
  CONSTRAINT fk_obs_par FOREIGN KEY (subject_id, mission_id) REFERENCES participation(subject_id, mission_id),
  CONSTRAINT fk_obs_ind FOREIGN KEY (indicator_id)    REFERENCES indicator(id),
  CONSTRAINT fk_obs_src FOREIGN KEY (source_id)       REFERENCES data_source(id),
  CONSTRAINT fk_obs_ib  FOREIGN KEY (import_batch_id) REFERENCES import_batch(id)
) ENGINE=InnoDB;

-- Dane zbiorcze z publikacji (np. Mendeley BP): grupa badanych, nie osoba
CREATE TABLE cohort (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  source_id        VARCHAR(40)  NOT NULL,
  source_row       INT UNSIGNED NOT NULL,                     -- numer wiersza w pliku źródłowym
  study_title      VARCHAR(400) NOT NULL,
  mission_type     VARCHAR(30)  NULL,                         -- 'ISS','STS','Soyuz','HDT','Simulation','Lab'
  environment_code VARCHAR(30)  NULL,
  n                SMALLINT UNSIGNED NULL,
  n_male           SMALLINT UNSIGNED NULL,
  n_female         SMALLINT UNSIGNED NULL,
  age_mean DOUBLE NULL, age_sd DOUBLE NULL,
  bmi_mean DOUBLE NULL, bmi_sd DOUBLE NULL,
  countermeasure   VARCHAR(100) NULL,
  import_batch_id  INT UNSIGNED NOT NULL,
  UNIQUE KEY uq_cohort (source_id, source_row),
  CONSTRAINT fk_coh_src FOREIGN KEY (source_id)        REFERENCES data_source(id),
  CONSTRAINT fk_coh_env FOREIGN KEY (environment_code) REFERENCES environment(code),
  CONSTRAINT fk_coh_ib  FOREIGN KEY (import_batch_id)  REFERENCES import_batch(id)
) ENGINE=InnoDB;

CREATE TABLE cohort_stat (
  cohort_id    INT UNSIGNED      NOT NULL,
  indicator_id SMALLINT UNSIGNED NOT NULL,
  phase        ENUM('pre','in','post') NOT NULL,
  mean_value   DOUBLE NOT NULL,
  sd_value     DOUBLE NULL,
  PRIMARY KEY (cohort_id, indicator_id, phase),
  CONSTRAINT fk_cs_coh FOREIGN KEY (cohort_id)    REFERENCES cohort(id) ON DELETE CASCADE,
  CONSTRAINT fk_cs_ind FOREIGN KEY (indicator_id) REFERENCES indicator(id)
) ENGINE=InnoDB;

-- Pomiary środowiska (nie dotyczą osoby): dawka, CO2, protony NOAA...
CREATE TABLE env_observation (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  environment_code VARCHAR(30)  NOT NULL,
  location         VARCHAR(60)  NOT NULL DEFAULT '',          -- moduł ISS, 'Gale crater'...
  indicator_id     SMALLINT UNSIGNED NOT NULL,
  source_id        VARCHAR(40)  NOT NULL,
  import_batch_id  INT UNSIGNED NOT NULL,
  measured_at      DATETIME(3)  NOT NULL,                     -- UTC
  aggregation      ENUM('raw','hourly_mean','daily_mean','daily_sum') NOT NULL DEFAULT 'raw',
  value_num        DOUBLE NOT NULL,
  is_synthetic     BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE KEY uq_env (environment_code, location, indicator_id, source_id, measured_at, aggregation),
  KEY ix_env_ind_time (indicator_id, measured_at),
  CONSTRAINT fk_env_env FOREIGN KEY (environment_code) REFERENCES environment(code),
  CONSTRAINT fk_env_ind FOREIGN KEY (indicator_id)     REFERENCES indicator(id),
  CONSTRAINT fk_env_src FOREIGN KEY (source_id)        REFERENCES data_source(id),
  CONSTRAINT fk_env_ib  FOREIGN KEY (import_batch_id)  REFERENCES import_batch(id)
) ENGINE=InnoDB;
