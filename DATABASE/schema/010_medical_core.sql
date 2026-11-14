-- 010_medical_core.sql | medical operations and Earth communication records
CREATE DATABASE IF NOT EXISTS astro_medical CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE astro_medical;

CREATE TABLE medical_event (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  mission_id SMALLINT UNSIGNED NOT NULL,
  subject_id INT UNSIGNED NULL,
  habitat_id SMALLINT UNSIGNED NULL,
  event_code VARCHAR(80) NOT NULL,
  event_type ENUM('symptom','vital','lab','imaging','procedure','medication','diagnosis','report','drill','note') NOT NULL,
  report_kind ENUM('pmc_weekly','flight_surgeon','incident','none') NOT NULL DEFAULT 'none',
  observed_at DATETIME(3) NOT NULL,
  sol SMALLINT NULL,
  title VARCHAR(240) NOT NULL,
  value_num DOUBLE NULL,
  value_text VARCHAR(500) NULL,
  unit VARCHAR(40) NULL,
  severity ENUM('info','minor','major','critical') NOT NULL DEFAULT 'info',
  status ENUM('recorded','needs_review','reviewed','closed') NOT NULL DEFAULT 'recorded',
  is_drill BOOLEAN NOT NULL DEFAULT FALSE,
  source_flag ENUM('simulated','team_assumption','nasa') NOT NULL DEFAULT 'simulated',
  details JSON NULL,
  UNIQUE KEY uq_med_event (mission_id, event_code),
  KEY ix_med_subject_time (subject_id, observed_at),
  KEY ix_med_mission_sol (mission_id, sol),
  CONSTRAINT fk_me_mission FOREIGN KEY (mission_id) REFERENCES astro_core.mission(id),
  CONSTRAINT fk_me_subject FOREIGN KEY (subject_id) REFERENCES astro_core.subject(id),
  CONSTRAINT fk_me_habitat FOREIGN KEY (habitat_id) REFERENCES astro_habitat.habitat(id),
  CONSTRAINT chk_me_details CHECK (details IS NULL OR JSON_VALID(details))
) ENGINE=InnoDB;

CREATE TABLE attachment (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  medical_event_id BIGINT UNSIGNED NOT NULL,
  attachment_code VARCHAR(80) NOT NULL UNIQUE,
  file_name VARCHAR(240) NOT NULL,
  relative_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  byte_size INT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  attachment_type ENUM('photo','ultrasound','ecg','document','other') NOT NULL,
  review_status ENUM('pending','in_review','accepted','rejected') NOT NULL DEFAULT 'pending',
  created_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_att_event FOREIGN KEY (medical_event_id) REFERENCES medical_event(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE earth_doctor_review (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  attachment_id BIGINT UNSIGNED NOT NULL,
  reviewer VARCHAR(120) NOT NULL,
  status ENUM('requested','in_review','approved','needs_repeat','rejected') NOT NULL DEFAULT 'requested',
  requested_at DATETIME(3) NOT NULL,
  reviewed_at DATETIME(3) NULL,
  impression VARCHAR(500) NULL,
  notes TEXT NULL,
  UNIQUE KEY uq_review (attachment_id),
  CONSTRAINT fk_review_attachment FOREIGN KEY (attachment_id) REFERENCES attachment(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE transmission (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  mission_id SMALLINT UNSIGNED NOT NULL,
  medical_event_id BIGINT UNSIGNED NULL,
  attachment_id BIGINT UNSIGNED NULL,
  transmission_code VARCHAR(80) NOT NULL UNIQUE,
  payload_type ENUM('event','attachment','report') NOT NULL,
  priority ENUM('routine','urgent','emergency') NOT NULL DEFAULT 'routine',
  queued_at DATETIME(3) NOT NULL,
  available_at DATETIME(3) NULL,
  blackout_start_sol SMALLINT NULL,
  blackout_end_sol SMALLINT NULL,
  status ENUM('queued','held_blackout','sent','failed','cancelled') NOT NULL DEFAULT 'queued',
  sent_at DATETIME(3) NULL,
  retry_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  notes VARCHAR(500) NULL,
  KEY ix_tx_queue (mission_id, status, priority, queued_at),
  CONSTRAINT fk_tx_mission FOREIGN KEY (mission_id) REFERENCES astro_core.mission(id),
  CONSTRAINT fk_tx_event FOREIGN KEY (medical_event_id) REFERENCES medical_event(id) ON DELETE CASCADE,
  CONSTRAINT fk_tx_attachment FOREIGN KEY (attachment_id) REFERENCES attachment(id) ON DELETE CASCADE,
  CONSTRAINT chk_tx_payload CHECK (medical_event_id IS NOT NULL OR attachment_id IS NOT NULL)
) ENGINE=InnoDB;

CREATE TABLE alert (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  mission_id SMALLINT UNSIGNED NOT NULL,
  subject_id INT UNSIGNED NULL,
  alert_code VARCHAR(80) NOT NULL UNIQUE,
  severity ENUM('info','caution','alert','critical') NOT NULL,
  title VARCHAR(240) NOT NULL,
  message TEXT NOT NULL,
  source_kind ENUM('observation','habitat_reading','habitat_event','medical_event','manual') NOT NULL,
  observation_id BIGINT UNSIGNED NULL,
  habitat_reading_id BIGINT UNSIGNED NULL,
  habitat_event_id BIGINT UNSIGNED NULL,
  medical_event_id BIGINT UNSIGNED NULL,
  opened_at DATETIME(3) NOT NULL,
  closed_at DATETIME(3) NULL,
  status ENUM('open','acknowledged','resolved','suppressed') NOT NULL DEFAULT 'open',
  UNIQUE KEY uq_alert_source (alert_code),
  CONSTRAINT fk_alert_mission FOREIGN KEY (mission_id) REFERENCES astro_core.mission(id),
  CONSTRAINT fk_alert_subject FOREIGN KEY (subject_id) REFERENCES astro_core.subject(id),
  CONSTRAINT fk_alert_obs FOREIGN KEY (observation_id) REFERENCES astro_core.observation(id),
  CONSTRAINT fk_alert_reading FOREIGN KEY (habitat_reading_id) REFERENCES astro_habitat.reading(id),
  CONSTRAINT fk_alert_hab_event FOREIGN KEY (habitat_event_id) REFERENCES astro_habitat.event(id),
  CONSTRAINT fk_alert_med_event FOREIGN KEY (medical_event_id) REFERENCES medical_event(id),
  CONSTRAINT chk_alert_source CHECK (observation_id IS NOT NULL OR habitat_reading_id IS NOT NULL OR habitat_event_id IS NOT NULL OR medical_event_id IS NOT NULL OR source_kind = 'manual')
) ENGINE=InnoDB;

CREATE TABLE escalation (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  alert_id BIGINT UNSIGNED NOT NULL,
  escalation_code VARCHAR(80) NOT NULL UNIQUE,
  level ENUM('flight_surgeon','mission_control','emergency') NOT NULL,
  status ENUM('open','acknowledged','closed') NOT NULL DEFAULT 'open',
  assigned_to VARCHAR(120) NULL,
  opened_at DATETIME(3) NOT NULL,
  acknowledged_at DATETIME(3) NULL,
  closed_at DATETIME(3) NULL,
  notes TEXT NULL,
  CONSTRAINT fk_esc_alert FOREIGN KEY (alert_id) REFERENCES alert(id) ON DELETE CASCADE
) ENGINE=InnoDB;
