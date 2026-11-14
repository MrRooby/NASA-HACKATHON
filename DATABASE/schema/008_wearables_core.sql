-- 008_wearables_core.sql | Wearable telemetry for the synthetic Mars mission
CREATE DATABASE IF NOT EXISTS astro_wearables CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE astro_wearables;

CREATE TABLE device (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  mission_id SMALLINT UNSIGNED NOT NULL,
  subject_id INT UNSIGNED NOT NULL,
  crew_code VARCHAR(10) NOT NULL,
  limb ENUM('left_arm','right_arm','left_leg','right_leg','head_eeg') NOT NULL,
  device_code VARCHAR(40) NOT NULL UNIQUE,
  serial_no VARCHAR(60) NOT NULL,
  location_code VARCHAR(30) NOT NULL,
  model VARCHAR(80) NOT NULL DEFAULT 'MARS-WEAR-1',
  installed_at DATETIME NOT NULL,
  retired_at DATETIME NULL,
  source_flag ENUM('nasa','simulated','team_assumption') NOT NULL DEFAULT 'simulated',
  UNIQUE KEY uq_device_assignment (mission_id, subject_id, limb),
  CONSTRAINT fk_wd_mission FOREIGN KEY (mission_id) REFERENCES astro_core.mission(id),
  CONSTRAINT fk_wd_subject FOREIGN KEY (subject_id) REFERENCES astro_core.subject(id)
) ENGINE=InnoDB;

CREATE TABLE sample (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  device_id BIGINT UNSIGNED NOT NULL,
  ts_utc DATETIME(3) NOT NULL,
  sol SMALLINT NOT NULL,
  heart_rate_bpm DOUBLE NULL,
  spo2_pct DOUBLE NULL,
  skin_temperature_c DOUBLE NULL,
  perfusion_index DOUBLE NULL,
  eeg_band ENUM('wake','light','deep','rem','unknown') NULL,
  battery_pct DOUBLE NOT NULL,
  connection_state ENUM('connected','buffering','disconnected') NOT NULL,
  quality ENUM('ok','suspect','sensor_fault') NOT NULL DEFAULT 'ok',
  source_flag ENUM('nasa','simulated','team_assumption') NOT NULL DEFAULT 'simulated',
  UNIQUE KEY uq_sample (device_id, ts_utc),
  KEY ix_sample_time (device_id, ts_utc),
  CONSTRAINT fk_ws_device FOREIGN KEY (device_id) REFERENCES device(id)
) ENGINE=InnoDB;

CREATE TABLE device_state (
  device_id BIGINT UNSIGNED NOT NULL,
  state_ts_utc DATETIME(3) NOT NULL,
  state ENUM('connected','buffering','disconnected','low_battery','sensor_fault') NOT NULL,
  battery_pct DOUBLE NOT NULL,
  location_code VARCHAR(30) NOT NULL,
  detail VARCHAR(300) NULL,
  source_flag ENUM('nasa','simulated','team_assumption') NOT NULL DEFAULT 'simulated',
  PRIMARY KEY (device_id, state_ts_utc),
  KEY ix_state_latest (device_id, state_ts_utc),
  CONSTRAINT fk_wstate_device FOREIGN KEY (device_id) REFERENCES device(id)
) ENGINE=InnoDB;

CREATE TABLE sample_minute (
  device_id BIGINT UNSIGNED NOT NULL,
  minute_utc DATETIME NOT NULL,
  sol SMALLINT NOT NULL,
  n_samples INT UNSIGNED NOT NULL,
  heart_rate_mean DOUBLE NULL,
  spo2_mean DOUBLE NULL,
  skin_temperature_mean DOUBLE NULL,
  perfusion_index_mean DOUBLE NULL,
  battery_min DOUBLE NULL,
  n_suspect INT UNSIGNED NOT NULL DEFAULT 0,
  n_fault INT UNSIGNED NOT NULL DEFAULT 0,
  source_flag ENUM('nasa','simulated','team_assumption') NOT NULL DEFAULT 'simulated',
  PRIMARY KEY (device_id, minute_utc),
  CONSTRAINT fk_wmin_device FOREIGN KEY (device_id) REFERENCES device(id)
) ENGINE=InnoDB;

CREATE TABLE sample_hour (
  device_id BIGINT UNSIGNED NOT NULL,
  hour_utc DATETIME NOT NULL,
  sol SMALLINT NOT NULL,
  n_minutes INT UNSIGNED NOT NULL,
  heart_rate_mean DOUBLE NULL,
  spo2_mean DOUBLE NULL,
  skin_temperature_mean DOUBLE NULL,
  perfusion_index_mean DOUBLE NULL,
  battery_min DOUBLE NULL,
  n_suspect INT UNSIGNED NOT NULL DEFAULT 0,
  n_fault INT UNSIGNED NOT NULL DEFAULT 0,
  source_flag ENUM('nasa','simulated','team_assumption') NOT NULL DEFAULT 'simulated',
  PRIMARY KEY (device_id, hour_utc),
  CONSTRAINT fk_whour_device FOREIGN KEY (device_id) REFERENCES device(id)
) ENGINE=InnoDB;

CREATE TABLE sleep_session (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  device_id BIGINT UNSIGNED NOT NULL,
  subject_id INT UNSIGNED NOT NULL,
  sol SMALLINT NOT NULL,
  start_utc DATETIME(3) NOT NULL,
  end_utc DATETIME(3) NOT NULL,
  duration_min DOUBLE NOT NULL,
  sleep_efficiency_pct DOUBLE NULL,
  deep_sleep_pct DOUBLE NULL,
  rem_sleep_pct DOUBLE NULL,
  awakenings SMALLINT UNSIGNED NULL,
  quality ENUM('ok','suspect','sensor_fault') NOT NULL DEFAULT 'ok',
  source_flag ENUM('nasa','simulated','team_assumption') NOT NULL DEFAULT 'simulated',
  UNIQUE KEY uq_sleep (device_id, start_utc),
  CONSTRAINT fk_sleep_device FOREIGN KEY (device_id) REFERENCES device(id),
  CONSTRAINT fk_sleep_subject FOREIGN KEY (subject_id) REFERENCES astro_core.subject(id),
  CONSTRAINT chk_sleep_time CHECK (end_utc > start_utc)
) ENGINE=InnoDB;

CREATE TABLE scenario (
  mission_id SMALLINT UNSIGNED NOT NULL,
  code VARCHAR(10) NOT NULL,
  name VARCHAR(160) NOT NULL,
  subject_code VARCHAR(40) NULL,
  limb VARCHAR(20) NULL,
  start_sol SMALLINT NOT NULL,
  end_sol SMALLINT NOT NULL,
  expected_reaction VARCHAR(400) NULL,
  PRIMARY KEY (mission_id, code),
  CONSTRAINT fk_wscenario_mission FOREIGN KEY (mission_id) REFERENCES astro_core.mission(id)
) ENGINE=InnoDB;

-- The existing ETL account is the producer for this schema; admin retains full access.
GRANT SELECT, INSERT, UPDATE, DELETE ON astro_wearables.* TO 'astro_etl'@'%';
GRANT ALL PRIVILEGES ON astro_wearables.* TO 'admin'@'%';
