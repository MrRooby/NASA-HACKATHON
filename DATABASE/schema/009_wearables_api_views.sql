-- 009_wearables_api_views.sql
USE astro_api;

CREATE OR REPLACE VIEW wearable_latest_device_state AS
SELECT m.code AS mission_code, d.device_code, d.crew_code, d.limb, d.location_code,
       x.state_ts_utc, x.state, x.battery_pct, x.detail
FROM astro_wearables.device_state x
JOIN astro_wearables.device d ON d.id=x.device_id
JOIN astro_core.mission m ON m.id=d.mission_id
JOIN (SELECT device_id, MAX(state_ts_utc) state_ts_utc
      FROM astro_wearables.device_state GROUP BY device_id) latest
  ON latest.device_id=x.device_id AND latest.state_ts_utc=x.state_ts_utc;

CREATE OR REPLACE VIEW wearable_limb_comparison AS
SELECT m.code AS mission_code, s.sol, s.ts_utc, s.crew_code,
       MAX(CASE WHEN s.limb='left_arm' THEN s.perfusion_index END) AS left_arm_perfusion,
       MAX(CASE WHEN s.limb='right_arm' THEN s.perfusion_index END) AS right_arm_perfusion,
       MAX(CASE WHEN s.limb='left_leg' THEN s.perfusion_index END) AS left_leg_perfusion,
       MAX(CASE WHEN s.limb='right_leg' THEN s.perfusion_index END) AS right_leg_perfusion,
       MAX(CASE WHEN s.limb='left_arm' THEN s.heart_rate_bpm END) AS left_arm_hr,
       MAX(CASE WHEN s.limb='right_arm' THEN s.heart_rate_bpm END) AS right_arm_hr,
       MAX(CASE WHEN s.limb='left_leg' THEN s.heart_rate_bpm END) AS left_leg_hr,
       MAX(CASE WHEN s.limb='right_leg' THEN s.heart_rate_bpm END) AS right_leg_hr,
       CASE WHEN MAX(CASE WHEN s.limb='left_arm' THEN s.perfusion_index END) IS NULL
                   OR MAX(CASE WHEN s.limb='right_arm' THEN s.perfusion_index END) IS NULL
                   OR MAX(CASE WHEN s.limb='left_leg' THEN s.perfusion_index END) IS NULL
                   OR MAX(CASE WHEN s.limb='right_leg' THEN s.perfusion_index END) IS NULL THEN 1
            WHEN ABS(MAX(CASE WHEN s.limb='left_leg' THEN s.perfusion_index END) -
                     MAX(CASE WHEN s.limb='right_leg' THEN s.perfusion_index END)) >= 0.30 THEN 1
            WHEN ABS(MAX(CASE WHEN s.limb='left_arm' THEN s.perfusion_index END) -
                     MAX(CASE WHEN s.limb='right_arm' THEN s.perfusion_index END)) >= 0.30 THEN 1
            ELSE 0 END AS discrepancy_flag
FROM (SELECT sm.*, d.crew_code, d.limb, d.mission_id
      FROM astro_wearables.sample sm JOIN astro_wearables.device d ON d.id=sm.device_id) s
JOIN astro_core.mission m ON m.id=s.mission_id
GROUP BY m.code, s.sol, s.ts_utc, s.crew_code;

CREATE OR REPLACE VIEW wearable_low_battery_disconnected AS
SELECT m.code AS mission_code, d.device_code, d.crew_code, d.limb,
       s.ts_utc, s.battery_pct, s.connection_state, s.quality, d.location_code
FROM astro_wearables.sample s
JOIN astro_wearables.device d ON d.id=s.device_id
JOIN astro_core.mission m ON m.id=d.mission_id
WHERE s.battery_pct < 20 OR s.connection_state <> 'connected';

CREATE OR REPLACE VIEW wearable_nightly_sleep AS
SELECT m.code AS mission_code, d.crew_code, d.limb, ss.sol, ss.start_utc, ss.end_utc,
       ss.duration_min, ss.sleep_efficiency_pct, ss.deep_sleep_pct, ss.rem_sleep_pct,
       ss.awakenings, ss.quality
FROM astro_wearables.sleep_session ss
JOIN astro_wearables.device d ON d.id=ss.device_id
JOIN astro_core.mission m ON m.id=d.mission_id
WHERE d.limb='head_eeg';

GRANT SELECT ON astro_api.wearable_latest_device_state TO 'astro_etl'@'%';
GRANT SELECT ON astro_api.wearable_limb_comparison TO 'astro_etl'@'%';
GRANT SELECT ON astro_api.wearable_low_battery_disconnected TO 'astro_etl'@'%';
GRANT SELECT ON astro_api.wearable_nightly_sleep TO 'astro_etl'@'%';
GRANT SELECT ON astro_api.wearable_latest_device_state TO 'astro_reader'@'%';
GRANT SELECT ON astro_api.wearable_limb_comparison TO 'astro_reader'@'%';
GRANT SELECT ON astro_api.wearable_low_battery_disconnected TO 'astro_reader'@'%';
GRANT SELECT ON astro_api.wearable_nightly_sleep TO 'astro_reader'@'%';
