-- 014_cognitive_api_views.sql | read-only cognitive contract in astro_api (readable by astro_reader via astro_api.*)
-- Same security model as the other views (default DEFINER = account that applied the schema).
USE astro_api;

CREATE OR REPLACE VIEW cognitive_sessions AS
SELECT ts.id AS session_id, ts.client_session_uuid AS session_uuid,
       s.code AS subject_code, m.code AS mission_code,
       ts.test_id, td.name AS test_name, ts.protocol_version, ts.app_version,
       ts.stimulus_set, ts.seed, ts.session_no, ts.battery_uuid, ts.battery_position,
       ts.is_practice, ts.status, ts.quality, ts.status_reason,
       ts.started_at, ts.completed_at, ts.tz_offset_min, ts.duration_s, ts.anchor, ts.day_offset,
       ts.device_class, ts.refresh_hz, ts.frame_jitter_ms, ts.timer_resolution_ms, ts.focus_lost_ms,
       ts.sleep_h, ts.sleep_quality, ts.fatigue, ts.kss, ts.stress, ts.caffeine_3h,
       ts.is_synthetic, ts.source_id, ts.received_at
FROM astro_cognitive.test_session ts
JOIN astro_cognitive.test_definition td ON td.test_id = ts.test_id
JOIN astro_core.subject s ON s.id = ts.subject_id
LEFT JOIN astro_core.mission m ON m.id = ts.mission_id;

CREATE OR REPLACE VIEW cognitive_trials AS
SELECT tt.session_id, ts.client_session_uuid AS session_uuid,
       s.code AS subject_code, m.code AS mission_code, ts.test_id, ts.session_no,
       ts.is_practice AS session_is_practice, ts.started_at,
       tt.idx, tt.is_practice, tt.stimulus, tt.`condition`, tt.isi_ms,
       tt.t_onset_ms, tt.t_response_ms, tt.rt_ms, tt.expected, tt.actual, tt.event_type,
       tt.timeout, tt.anticipation, tt.valid, tt.focus_lost, tt.ts_source
FROM astro_cognitive.test_trial tt
JOIN astro_cognitive.test_session ts ON ts.id = tt.session_id
JOIN astro_core.subject s ON s.id = ts.subject_id
LEFT JOIN astro_core.mission m ON m.id = ts.mission_id;

CREATE OR REPLACE VIEW cognitive_metrics AS
SELECT tm.session_id, ts.client_session_uuid AS session_uuid,
       s.code AS subject_code, m.code AS mission_code, ts.test_id, ts.session_no,
       ts.is_practice, ts.status, ts.quality, ts.device_class, ts.started_at, ts.is_synthetic,
       tm.metric_code, tm.value, tm.scoring_version
FROM astro_cognitive.test_metric tm
JOIN astro_cognitive.test_session ts ON ts.id = tm.session_id
JOIN astro_core.subject s ON s.id = ts.subject_id
LEFT JOIN astro_core.mission m ON m.id = ts.mission_id;

-- Latest complete, non-practice session per (subject, test).
CREATE OR REPLACE VIEW cognitive_latest AS
SELECT r.session_id, r.session_uuid, r.subject_code, r.mission_code, r.test_id, r.session_no,
       r.stimulus_set, r.status, r.quality, r.device_class, r.started_at, r.completed_at, r.duration_s,
       r.fatigue, r.kss, r.sleep_h, r.is_synthetic
FROM (
  SELECT ts.id AS session_id, ts.client_session_uuid AS session_uuid,
         s.code AS subject_code, m.code AS mission_code, ts.test_id, ts.session_no,
         ts.stimulus_set, ts.status, ts.quality, ts.device_class, ts.started_at, ts.completed_at, ts.duration_s,
         ts.fatigue, ts.kss, ts.sleep_h, ts.is_synthetic,
         ROW_NUMBER() OVER (PARTITION BY ts.subject_id, ts.test_id
                            ORDER BY ts.started_at DESC, ts.id DESC) AS rn
  FROM astro_cognitive.test_session ts
  JOIN astro_core.subject s ON s.id = ts.subject_id
  LEFT JOIN astro_core.mission m ON m.id = ts.mission_id
  WHERE ts.status = 'complete' AND ts.is_practice = 0
) r
WHERE r.rn = 1;
