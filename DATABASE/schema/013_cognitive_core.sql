-- 013_cognitive_core.sql | cognitive performance tests (PVT-B, Go/No-Go, DSST) | contract: config/cognitive/CONTRACT.md
-- Trial-level data written by MOTHER (cognitive_writer) or the synthetic ETL; metrics are re-scored server side
-- with MOTHER/mother/cognitive_scoring.py (scoring_version column). Performance indicators, NOT a diagnosis.
-- FK types match 001_core.sql: subject.id INT UNSIGNED, mission.id SMALLINT UNSIGNED.
CREATE DATABASE IF NOT EXISTS astro_cognitive CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE astro_cognitive;

CREATE TABLE test_definition (                       -- dictionary; more tests (nback2, stroop) need no schema change
  test_id          VARCHAR(16) NOT NULL PRIMARY KEY,   -- pvt | gonogo | dsst
  name             VARCHAR(80) NOT NULL,
  domain           VARCHAR(40) NOT NULL,
  current_protocol VARCHAR(24) NOT NULL
) ENGINE=InnoDB;

INSERT INTO test_definition (test_id, name, domain, current_protocol) VALUES
  ('pvt',    'Psychomotor Vigilance Task (PVT-B)', 'sustained attention',          'pvtb-1.0'),
  ('gonogo', 'Go/No-Go',                           'inhibitory control',           'gonogo-1.0'),
  ('dsst',   'Digit Symbol Substitution Test',     'processing speed / working memory', 'dsst-1.0')
ON DUPLICATE KEY UPDATE name = VALUES(name), domain = VALUES(domain), current_protocol = VALUES(current_protocol);

CREATE TABLE test_session (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_session_uuid CHAR(36) NOT NULL,                       -- idempotency key of POST /api/cognitive/sessions
  subject_id          INT UNSIGNED NOT NULL,
  mission_id          SMALLINT UNSIGNED NULL,
  test_id             VARCHAR(16) NOT NULL,
  battery_uuid        CHAR(36) NULL,
  battery_position    TINYINT UNSIGNED NULL,
  protocol_version    VARCHAR(24) NOT NULL,
  app_version         VARCHAR(24) NOT NULL,
  stimulus_set        CHAR(1) NOT NULL,                        -- A..D
  seed                BIGINT UNSIGNED NOT NULL,
  session_no          INT UNSIGNED NOT NULL,
  is_practice         TINYINT(1) NOT NULL DEFAULT 0,           -- the first session per test is practice
  status              ENUM('complete','interrupted','aborted','invalid') NOT NULL,
  quality             ENUM('ok','low') NOT NULL DEFAULT 'ok',
  status_reason       VARCHAR(200) NULL,
  started_at          DATETIME(3) NOT NULL,                    -- UTC
  completed_at        DATETIME(3) NULL,
  tz_offset_min       SMALLINT NULL,
  duration_s          DOUBLE NULL,
  anchor              ENUM('launch','landing','none') NULL,
  day_offset          SMALLINT NULL,
  -- device (payload.device)
  device_class        ENUM('keyboard','touch','mouse','unknown') NOT NULL DEFAULT 'unknown',
  user_agent          VARCHAR(300) NULL,
  screen_w            SMALLINT UNSIGNED NULL,
  screen_h            SMALLINT UNSIGNED NULL,
  dpr                 DECIMAL(4,2) NULL,
  refresh_hz          DECIMAL(6,2) NULL,
  frame_jitter_ms     DECIMAL(6,2) NULL,
  timer_resolution_ms DECIMAL(6,3) NULL,
  focus_lost_ms       INT UNSIGNED NOT NULL DEFAULT 0,
  -- context (payload.context)
  sleep_h             DECIMAL(3,1) NULL,
  sleep_quality       TINYINT NULL,
  fatigue             TINYINT NULL,
  kss                 TINYINT NULL,
  stress              TINYINT NULL,
  caffeine_3h         TINYINT(1) NULL,
  -- provenance
  is_synthetic        TINYINT(1) NOT NULL DEFAULT 0,
  source_id           VARCHAR(40) NULL,                        -- astro_core.data_source.id (no FK: keeps the writer decoupled)
  import_batch_id     INT UNSIGNED NULL,                       -- astro_core.import_batch.id of the observation mirror
  received_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_cs_uuid (client_session_uuid),
  KEY ix_cs_subject_test_time (subject_id, test_id, started_at),
  KEY ix_cs_mission (mission_id),
  KEY ix_cs_synthetic (is_synthetic, mission_id),
  CONSTRAINT fk_cs_subject FOREIGN KEY (subject_id) REFERENCES astro_core.subject(id),
  CONSTRAINT fk_cs_mission FOREIGN KEY (mission_id) REFERENCES astro_core.mission(id),
  CONSTRAINT fk_cs_test    FOREIGN KEY (test_id)    REFERENCES test_definition(test_id),
  CONSTRAINT ck_cs_fatigue  CHECK (fatigue       IS NULL OR fatigue       BETWEEN 1 AND 10),
  CONSTRAINT ck_cs_stress   CHECK (stress        IS NULL OR stress        BETWEEN 1 AND 10),
  CONSTRAINT ck_cs_sleepq   CHECK (sleep_quality IS NULL OR sleep_quality BETWEEN 1 AND 10),
  CONSTRAINT ck_cs_kss      CHECK (kss           IS NULL OR kss           BETWEEN 1 AND 9),
  CONSTRAINT ck_cs_sleeph   CHECK (sleep_h       IS NULL OR sleep_h       BETWEEN 0 AND 24),
  CONSTRAINT ck_cs_duration CHECK (duration_s    IS NULL OR duration_s >= 0)
) ENGINE=InnoDB;

CREATE TABLE test_trial (
  session_id    BIGINT UNSIGNED NOT NULL,
  idx           SMALLINT UNSIGNED NOT NULL,
  is_practice   TINYINT(1) NOT NULL DEFAULT 0,
  stimulus      VARCHAR(32) NOT NULL,                          -- pvt 'counter'; gonogo 'go'|'nogo'; dsst 'A3'
  `condition`   VARCHAR(24) NULL,
  isi_ms        INT NULL,
  t_onset_ms    DOUBLE NULL,
  t_response_ms DOUBLE NULL,
  rt_ms         DOUBLE NULL,                                   -- exact client value (scoring is reproducible from the DB)
  expected      VARCHAR(8) NULL,
  actual        VARCHAR(8) NULL,
  event_type    ENUM('response','lapse','false_start','hit','omission','commission','correct_rejection',
                     'correct','error') NOT NULL,
  timeout       TINYINT(1) NOT NULL DEFAULT 0,
  anticipation  TINYINT(1) NOT NULL DEFAULT 0,
  valid         TINYINT(1) NOT NULL DEFAULT 1,
  focus_lost    TINYINT(1) NOT NULL DEFAULT 0,
  ts_source     CHAR(1) NULL,                                  -- 'e' = event.timeStamp, 'h' = performance.now()
  PRIMARY KEY (session_id, idx),
  CONSTRAINT fk_tt_session FOREIGN KEY (session_id) REFERENCES test_session(id) ON DELETE CASCADE,
  CONSTRAINT ck_tt_rt CHECK (rt_ms IS NULL OR rt_ms BETWEEN 0 AND 30000)
) ENGINE=InnoDB;

CREATE TABLE test_metric (
  session_id      BIGINT UNSIGNED NOT NULL,
  metric_code     VARCHAR(40) NOT NULL,                        -- pvt_median_rt_ms, dsst_throughput_per_min, ...
  value           DOUBLE NULL,                                 -- NULL = not computable
  scoring_version VARCHAR(16) NOT NULL,
  PRIMARY KEY (session_id, metric_code),
  CONSTRAINT fk_tm_session FOREIGN KEY (session_id) REFERENCES test_session(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE test_event (                                      -- blur, visibility, extra_press, scoring_mismatch, ...
  session_id BIGINT UNSIGNED NOT NULL,
  seq        SMALLINT UNSIGNED NOT NULL,
  t_ms       DOUBLE NOT NULL,
  kind       VARCHAR(24) NOT NULL,
  detail     VARCHAR(200) NULL,
  PRIMARY KEY (session_id, seq),
  CONSTRAINT fk_te_session FOREIGN KEY (session_id) REFERENCES test_session(id) ON DELETE CASCADE
) ENGINE=InnoDB;
