-- 004_habitat_core.sql | MariaDB 11.4 LTS | schemat HABITAT 0.1 (2026-11-14)
-- Dane habitatu w tunelu lawowym na Marsie (plan: HABITAT/README.md na gałęzi FARTEK-HABITAT).
-- Opis: DATABASE/schema/HABITAT.md
--
-- Zasady (HABITAT/README.md §0, §6):
--   * HABITAT jest producentem danych: zapisuje odczyty sensorów i zdarzenia. NIE ocenia statusu ok/caution/alert
--     (robi to MOTHER wg config/thresholds.json); oznacza tylko jakość odczytu (quality).
--   * Każdy odczyt ma strefę (zone), opcjonalnie osobę (crew) i sensor A/B (kanały redundantne).
--   * Pochodzenie: source_flag = nasa | simulated | team_assumption (UI musi to pokazywać).
--   * Zapisuje producent HABITAT (użytkownik habitat_writer); czytają wszyscy przez widoki astro_api.habitat_*.

CREATE DATABASE IF NOT EXISTS astro_habitat CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE astro_habitat;

-- ---------- 1. Habitat, strefy, załoga ----------

CREATE TABLE habitat (
  id                   SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code                 VARCHAR(40)  NOT NULL UNIQUE,                 -- 'MARS-LT-ELYSIUM'
  name                 VARCHAR(160) NOT NULL,
  environment_code     VARCHAR(30)  NOT NULL,                        -- astro_core.environment ('mars_surface')
  mission_id           SMALLINT UNSIGNED NULL,                       -- astro_core.mission (gdy misja jest w bazie)
  site_description     VARCHAR(400) NULL,
  latitude_deg         DOUBLE NULL,                                  -- [ZAŁ] dopóki nie wybrano kandydata MGC3
  longitude_deg        DOUBLE NULL,
  elevation_km         DOUBLE NULL,
  site_basis           ENUM('nasa','team_assumption') NOT NULL DEFAULT 'team_assumption',
  -- atmosfera nominalna (eksploracyjna NASA 8.2 psia / 34 % O2)
  atm_pressure_kpa     DOUBLE NULL,
  atm_o2_fraction_pct  DOUBLE NULL,
  atm_ppo2_inspired_mmhg DOUBLE NULL,
  -- czas: sol 1 zaczyna się w sol_epoch_utc; długość sola w sekundach
  sol_epoch_utc        DATETIME NULL,
  sol_length_s         DOUBLE NOT NULL DEFAULT 88775.244,
  mission_sols         SMALLINT UNSIGNED NULL,                       -- 600 w demo
  crew_capacity        SMALLINT UNSIGNED NULL,
  is_synthetic         BOOLEAN NOT NULL DEFAULT TRUE,
  notes                TEXT NULL,
  CONSTRAINT fk_hab_env FOREIGN KEY (environment_code) REFERENCES astro_core.environment(code),
  CONSTRAINT fk_hab_mis FOREIGN KEY (mission_id)       REFERENCES astro_core.mission(id)
) ENGINE=InnoDB;

CREATE TABLE zone (
  habitat_id           SMALLINT UNSIGNED NOT NULL,
  code                 VARCHAR(30)  NOT NULL,                        -- 'module_M1', 'airlock_A', 'cupola_2'
  label                VARCHAR(120) NOT NULL,
  zone_type            ENUM('surface','airlock','cupola','tunnel','module','farm','medical','gym','lab') NOT NULL,
  module_id            VARCHAR(10)  NULL,                            -- 'M1' dla module_M1
  pressurized          BOOLEAN NOT NULL,
  dose_shielding_factor DOUBLE NULL,                                 -- dawka w strefie / dawka na powierzchni [ZAŁ]
  sort_order           TINYINT UNSIGNED NOT NULL DEFAULT 0,
  description          VARCHAR(300) NULL,
  PRIMARY KEY (habitat_id, code),
  CONSTRAINT fk_zone_hab FOREIGN KEY (habitat_id) REFERENCES habitat(id)
) ENGINE=InnoDB;

CREATE TABLE crew (
  habitat_id           SMALLINT UNSIGNED NOT NULL,
  code                 VARCHAR(10)  NOT NULL,                        -- 'C1'..'C4'
  subject_id           INT UNSIGNED NULL,                            -- astro_core.subject (dane zdrowotne osoby)
  home_zone_code       VARCHAR(30)  NULL,                            -- moduł mieszkalny
  role                 VARCHAR(60)  NULL,
  PRIMARY KEY (habitat_id, code),
  CONSTRAINT fk_crew_hab  FOREIGN KEY (habitat_id) REFERENCES habitat(id),
  CONSTRAINT fk_crew_zone FOREIGN KEY (habitat_id, home_zone_code) REFERENCES zone(habitat_id, code),
  CONSTRAINT fk_crew_sub  FOREIGN KEY (subject_id) REFERENCES astro_core.subject(id)
) ENGINE=InnoDB;

-- ---------- 2. Katalog kanałów (HABITAT/README.md §3, §6.3) ----------

CREATE TABLE channel (
  code                 VARCHAR(40)  NOT NULL PRIMARY KEY,            -- = 'channel' w rekordzie HABITAT
  label                VARCHAR(160) NOT NULL,
  category             ENUM('air','water','urine','feces','microbes','radiation','noise_light','presence',
                            'integrity','structure_thermal','power','exterior') NOT NULL,
  unit                 VARCHAR(30)  NOT NULL,                        -- jednostka kanoniczna ('' = bezwymiarowe)
  value_type           ENUM('numeric','boolean','categorical','event') NOT NULL DEFAULT 'numeric',
  allowed_values       VARCHAR(200) NULL,                            -- dla categorical: 'ok,leak'
  cadence_real         VARCHAR(60)  NULL,                            -- jak często mierzy się realnie
  cadence_demo         VARCHAR(60)  NULL,                            -- kadencja w generatorze demo
  cadence_s            INT UNSIGNED NULL,                            -- kadencja demo w sekundach (NULL = zdarzeniowo)
  zone_scope           VARCHAR(200) NULL,                            -- typy stref / strefy, gdzie kanał występuje
  redundant            BOOLEAN NOT NULL DEFAULT FALSE,               -- sensory A/B
  per_crew             BOOLEAN NOT NULL DEFAULT FALSE,               -- odczyt przypisany osobie (crew_code)
  threshold_ref        VARCHAR(60)  NULL,                            -- astro_core.threshold_band.threshold_id
  normal_min           DOUBLE NULL,                                  -- zakres nominalny (informacyjnie)
  normal_max           DOUBLE NULL,
  basis                ENUM('nasa','clinical','team_assumption') NOT NULL,
  sources              VARCHAR(400) NULL,                            -- id z config/sources.json albo cytowania
  description          VARCHAR(600) NULL,
  KEY ix_ch_category (category)
) ENGINE=InnoDB;

-- Limity i progi z planu HABITAT, których nie ma w config/thresholds.json (SMAC, woda, mocz, mikroby...).
-- HABITAT ich nie stosuje; służą MOTHER i GUI jako dane referencyjne.
CREATE TABLE channel_limit (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  channel_code         VARCHAR(40)  NOT NULL,
  level                ENUM('normal','caution','alert','emergency') NOT NULL,
  min_value            DOUBLE NULL,                                  -- włącznie; NULL = bez dolnej granicy
  max_value            DOUBLE NULL,                                  -- wyłącznie; NULL = bez górnej granicy
  window_hours         DOUBLE NULL,                                  -- okno uśredniania (SMAC 1 h, 7 d = 168 h)
  metric               VARCHAR(40)  NOT NULL DEFAULT 'value',        -- 'value', 'mean', 'trend', 'consecutive_days'
  sex                  ENUM('F','M','any') NOT NULL DEFAULT 'any',
  message              VARCHAR(300) NULL,
  basis                ENUM('nasa','clinical','team_assumption') NOT NULL,
  source               VARCHAR(200) NULL,
  KEY ix_cl_channel (channel_code),
  CONSTRAINT fk_cl_ch FOREIGN KEY (channel_code) REFERENCES channel(code),
  CONSTRAINT chk_cl_range CHECK (min_value IS NULL OR max_value IS NULL OR min_value <= max_value)
) ENGINE=InnoDB;

-- ---------- 3. Dane: odczyty, agregaty, zdarzenia, lokalizacja załogi ----------

-- Rekord odczytu (HABITAT/README.md §6.1). Kanały 1-min dają duże wolumeny:
-- demo 600 soli x ~150 serii 1-min ~ 130 mln wierszy -> generator zapisuje 1-min tylko dla okien
-- scenariuszy, a resztę jako agregaty godzinowe (reading_hourly).
CREATE TABLE reading (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  habitat_id           SMALLINT UNSIGNED NOT NULL,
  ts_utc               DATETIME(3)  NOT NULL,
  sol                  SMALLINT NULL,                                -- numer sola (<= 0 przed przylotem załogi)
  zone_code            VARCHAR(30)  NOT NULL,
  crew_code            VARCHAR(10)  NULL,                            -- tylko kanały per_crew
  channel_code         VARCHAR(40)  NOT NULL,
  sensor               ENUM('A','B','') NOT NULL DEFAULT '',         -- '' = kanał nieredundantny
  value_num            DOUBLE NULL,
  value_text           VARCHAR(200) NULL,                            -- categorical / boolean / opis zdarzenia
  unit                 VARCHAR(30)  NOT NULL,                        -- musi = channel.unit (sprawdza import)
  quality              ENUM('ok','suspect','sensor_fault') NOT NULL DEFAULT 'ok',
  source_flag          ENUM('nasa','simulated','team_assumption') NOT NULL,
  import_batch_id      INT UNSIGNED NULL,                            -- astro_core.import_batch
  crew_key             VARCHAR(10) AS (IFNULL(crew_code, '')) STORED, -- NULL w kluczu unikalnym nie koliduje
  UNIQUE KEY uq_reading (habitat_id, channel_code, zone_code, sensor, ts_utc, crew_key),
  KEY ix_rd_zone_time    (habitat_id, zone_code, channel_code, ts_utc),
  KEY ix_rd_crew_time    (habitat_id, crew_code, channel_code, ts_utc),
  KEY ix_rd_time         (ts_utc),
  CONSTRAINT chk_rd_value CHECK (value_num IS NOT NULL OR value_text IS NOT NULL),
  CONSTRAINT fk_rd_zone FOREIGN KEY (habitat_id, zone_code) REFERENCES zone(habitat_id, code),
  CONSTRAINT fk_rd_crew FOREIGN KEY (habitat_id, crew_code) REFERENCES crew(habitat_id, code),
  CONSTRAINT fk_rd_ch   FOREIGN KEY (channel_code) REFERENCES channel(code),
  CONSTRAINT fk_rd_ib   FOREIGN KEY (import_batch_id) REFERENCES astro_core.import_batch(id)
) ENGINE=InnoDB;

-- Agregaty godzinowe (liczy import albo generator); na nich stoją widoki trendów i ekspozycji.
CREATE TABLE reading_hourly (
  habitat_id           SMALLINT UNSIGNED NOT NULL,
  hour_utc             DATETIME NOT NULL,                            -- początek godziny UTC
  zone_code            VARCHAR(30)  NOT NULL,
  crew_code            VARCHAR(10)  NOT NULL DEFAULT '',             -- '' = nie dotyczy osoby
  channel_code         VARCHAR(40)  NOT NULL,
  sensor               ENUM('A','B','') NOT NULL DEFAULT '',
  sol                  SMALLINT NULL,
  n_samples            INT UNSIGNED NOT NULL,
  value_mean           DOUBLE NULL,
  value_min            DOUBLE NULL,
  value_max            DOUBLE NULL,
  n_suspect            INT UNSIGNED NOT NULL DEFAULT 0,
  n_fault              INT UNSIGNED NOT NULL DEFAULT 0,
  source_flag          ENUM('nasa','simulated','team_assumption') NOT NULL,
  is_primary           BOOLEAN AS (sensor IN ('', 'A')) STORED,      -- seria główna (sensor A albo jedyny)
  PRIMARY KEY (habitat_id, channel_code, zone_code, crew_code, sensor, hour_utc),
  KEY ix_rh_time (habitat_id, hour_utc),
  KEY ix_rh_primary (habitat_id, channel_code, zone_code, crew_code, is_primary, hour_utc),
  CONSTRAINT fk_rh_zone FOREIGN KEY (habitat_id, zone_code) REFERENCES zone(habitat_id, code),
  CONSTRAINT fk_rh_ch   FOREIGN KEY (channel_code) REFERENCES channel(code)
) ENGINE=InnoDB;

-- Rekord zdarzenia (HABITAT/README.md §6.2)
CREATE TABLE event (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  habitat_id           SMALLINT UNSIGNED NOT NULL,
  event_code           VARCHAR(40)  NOT NULL,                        -- 'evt-000431' z HABITAT
  event_type           ENUM('eva_start','eva_end','airlock_cycle','spe_onset','dust_storm','scrubber_fault',
                            'o2_gen_fault','leak','seismic','fire','nh3_leak','comm_blackout','vent',
                            'waste_dump','mode_change','maintenance') NOT NULL,
  start_utc            DATETIME(3)  NOT NULL,
  end_utc              DATETIME(3)  NULL,                            -- NULL = trwa
  sol                  SMALLINT NULL,
  zone_code            VARCHAR(30)  NULL,
  crew_code            VARCHAR(10)  NULL,                            -- np. EVA danej osoby
  severity             ENUM('info','minor','major','critical') NOT NULL DEFAULT 'info',
  details              JSON NULL,                                    -- {"subsystem": "CO2_removal_M1"}
  source_flag          ENUM('nasa','simulated','team_assumption') NOT NULL,
  import_batch_id      INT UNSIGNED NULL,
  UNIQUE KEY uq_event (habitat_id, event_code),
  KEY ix_ev_time (habitat_id, start_utc),
  KEY ix_ev_type (event_type),
  CONSTRAINT chk_ev_time    CHECK (end_utc IS NULL OR end_utc >= start_utc),
  CONSTRAINT chk_ev_details CHECK (details IS NULL OR JSON_VALID(details)),
  CONSTRAINT fk_ev_hab  FOREIGN KEY (habitat_id) REFERENCES habitat(id),
  CONSTRAINT fk_ev_zone FOREIGN KEY (habitat_id, zone_code) REFERENCES zone(habitat_id, code),
  CONSTRAINT fk_ev_crew FOREIGN KEY (habitat_id, crew_code) REFERENCES crew(habitat_id, code),
  CONSTRAINT fk_ev_ib   FOREIGN KEY (import_batch_id) REFERENCES astro_core.import_batch(id)
) ENGINE=InnoDB;

-- Gdzie kto był (z kanału crew_location): przedziały czasu. Pozwala przypisać ekspozycję osobie
-- ("C2 spędził 6 h w module z CO2 > 3 mmHg"). to_utc NULL = nadal w strefie.
CREATE TABLE crew_location (
  habitat_id           SMALLINT UNSIGNED NOT NULL,
  crew_code            VARCHAR(10)  NOT NULL,
  from_utc             DATETIME(3)  NOT NULL,
  to_utc               DATETIME(3)  NULL,
  zone_code            VARCHAR(30)  NOT NULL,
  source_flag          ENUM('nasa','simulated','team_assumption') NOT NULL,
  PRIMARY KEY (habitat_id, crew_code, from_utc),
  KEY ix_cl_zone (habitat_id, zone_code, from_utc),
  CONSTRAINT chk_cl_time CHECK (to_utc IS NULL OR to_utc > from_utc),
  CONSTRAINT fk_loc_crew FOREIGN KEY (habitat_id, crew_code) REFERENCES crew(habitat_id, code),
  CONSTRAINT fk_loc_zone FOREIGN KEY (habitat_id, zone_code) REFERENCES zone(habitat_id, code)
) ENGINE=InnoDB;

-- Scenariusze anomalii do demo (HABITAT/README.md §5) i ich oczekiwana reakcja - do testów E2E.
CREATE TABLE scenario (
  habitat_id           SMALLINT UNSIGNED NOT NULL,
  code                 VARCHAR(10)  NOT NULL,                        -- 'H1'..'H14'
  name                 VARCHAR(160) NOT NULL,
  channels             VARCHAR(300) NULL,                            -- kanały, które się zmieniają
  zone_code            VARCHAR(30)  NULL,
  crew_codes           VARCHAR(40)  NULL,
  start_sol            SMALLINT NULL,                                -- ustalane przez generator demo
  end_sol              SMALLINT NULL,
  expected_reaction    VARCHAR(400) NULL,                            -- czego oczekujemy od MOTHER/GUI
  PRIMARY KEY (habitat_id, code),
  CONSTRAINT fk_sc_hab FOREIGN KEY (habitat_id) REFERENCES habitat(id)
) ENGINE=InnoDB;
