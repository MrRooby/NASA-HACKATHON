-- 007_mars_crew_link.sql | link shared Mars health and habitat demo data
-- Run after 001-006 and after loading data/synthetic/mars_demo.

UPDATE astro_habitat.habitat h
JOIN astro_core.mission m ON m.code = 'SYN-MARS-HAB-600'
SET h.mission_id = m.id
WHERE h.code = 'MARS-LT-ELYSIUM';

UPDATE astro_habitat.crew c
JOIN astro_habitat.habitat h ON h.id = c.habitat_id
JOIN astro_core.subject s ON s.code = CASE c.code
  WHEN 'C1' THEN 'SYN-02'
  WHEN 'C2' THEN 'SYN-01'
  WHEN 'C3' THEN 'SYN-03'
  WHEN 'C4' THEN 'SYN-04'
END
SET c.subject_id = s.id
WHERE h.code = 'MARS-LT-ELYSIUM';

CREATE OR REPLACE VIEW astro_api.crew_dose_vs_blood AS
SELECT h.code AS habitat_code, rh.sol, c.code AS crew_code, c.subject_id,
       rh.hour_utc, rh.value_mean AS dose_personal_cum_msv,
       lymph.value_num AS lymphocytes_pct,
       neut.value_num AS neutrophils_pct,
       wbc.value_num AS wbc,
       plt.value_num AS platelets
FROM astro_habitat.reading_hourly rh
JOIN astro_habitat.habitat h ON h.id = rh.habitat_id
JOIN astro_habitat.crew c ON c.habitat_id = rh.habitat_id AND c.code = rh.crew_code
LEFT JOIN astro_core.observation lymph
  ON lymph.subject_id = c.subject_id AND lymph.mission_id = h.mission_id
 AND lymph.indicator_id = (SELECT id FROM astro_core.indicator WHERE code = 'lymphocytes_pct')
 AND lymph.day_offset = rh.sol
LEFT JOIN astro_core.observation neut
  ON neut.subject_id = c.subject_id AND neut.mission_id = h.mission_id
 AND neut.indicator_id = (SELECT id FROM astro_core.indicator WHERE code = 'neutrophils_pct')
 AND neut.day_offset = rh.sol
LEFT JOIN astro_core.observation wbc
  ON wbc.subject_id = c.subject_id AND wbc.mission_id = h.mission_id
 AND wbc.indicator_id = (SELECT id FROM astro_core.indicator WHERE code = 'wbc')
 AND wbc.day_offset = rh.sol
LEFT JOIN astro_core.observation plt
  ON plt.subject_id = c.subject_id AND plt.mission_id = h.mission_id
 AND plt.indicator_id = (SELECT id FROM astro_core.indicator WHERE code = 'platelets')
 AND plt.day_offset = rh.sol
WHERE rh.channel_code = 'dose_personal_cum'
  AND rh.is_primary = TRUE;

CREATE OR REPLACE VIEW astro_api.crew_hydration_vs_kidney AS
SELECT h.code AS habitat_code, rh.sol, c.code AS crew_code, c.subject_id,
       rh.hour_utc, rh.channel_code, rh.value_mean AS habitat_value,
       cr.value_num AS creatinine, bun.value_num AS bun, na.value_num AS sodium
FROM astro_habitat.reading_hourly rh
JOIN astro_habitat.habitat h ON h.id = rh.habitat_id
JOIN astro_habitat.crew c ON c.habitat_id = rh.habitat_id AND c.code = rh.crew_code
LEFT JOIN astro_core.observation cr
  ON cr.subject_id = c.subject_id AND cr.mission_id = h.mission_id
 AND cr.indicator_id = (SELECT id FROM astro_core.indicator WHERE code = 'creatinine')
 AND cr.day_offset = rh.sol
LEFT JOIN astro_core.observation bun
  ON bun.subject_id = c.subject_id AND bun.mission_id = h.mission_id
 AND bun.indicator_id = (SELECT id FROM astro_core.indicator WHERE code = 'bun')
 AND bun.day_offset = rh.sol
LEFT JOIN astro_core.observation na
  ON na.subject_id = c.subject_id AND na.mission_id = h.mission_id
 AND na.indicator_id = (SELECT id FROM astro_core.indicator WHERE code = 'sodium')
 AND na.day_offset = rh.sol
WHERE rh.channel_code IN ('water_intake_24h', 'urine_volume_24h')
  AND rh.is_primary = TRUE;
