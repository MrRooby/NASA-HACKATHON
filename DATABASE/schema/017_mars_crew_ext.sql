-- 017_mars_crew_ext.sql | six added crew members of the Mars habitat (C5..C10 = SYN-05..SYN-10)
-- Idempotent; adds rows only, the original crew C1..C4 is not touched.
-- On a fresh volume it runs at init (crew rows only: the subjects do not exist yet). Run it again after
-- loading data/synthetic/mars_demo (load_canonical.py) to link the subjects, like 007_mars_crew_link.sql.
-- Attributes: DATABASE/synthetic/crew_ext.py (keep both in sync).

SET @hab := (SELECT id FROM astro_habitat.habitat WHERE code = 'MARS-LT-ELYSIUM');

INSERT INTO astro_habitat.crew (habitat_id, code, home_zone_code, role) VALUES
  (@hab, 'C5',  'module_M1', NULL),
  (@hab, 'C6',  'module_M2', NULL),
  (@hab, 'C7',  'module_M2', NULL),
  (@hab, 'C8',  'module_M1', NULL),
  (@hab, 'C9',  'module_M1', NULL),
  (@hab, 'C10', 'module_M2', NULL)
ON DUPLICATE KEY UPDATE home_zone_code = VALUES(home_zone_code);

UPDATE astro_habitat.crew c
JOIN astro_habitat.habitat h ON h.id = c.habitat_id
JOIN astro_core.subject s ON s.code = CASE c.code
  WHEN 'C5'  THEN 'SYN-05'
  WHEN 'C6'  THEN 'SYN-06'
  WHEN 'C7'  THEN 'SYN-07'
  WHEN 'C8'  THEN 'SYN-08'
  WHEN 'C9'  THEN 'SYN-09'
  WHEN 'C10' THEN 'SYN-10'
END
SET c.subject_id = s.id
WHERE h.code = 'MARS-LT-ELYSIUM';
