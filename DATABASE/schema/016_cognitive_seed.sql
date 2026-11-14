-- 016_cognitive_seed.sql | cognitive module seed in astro_core (idempotent; safe to re-run)
USE astro_core;

-- 1. indicator.category += 'cognitive' (existing values keep their order; MODIFY with the same list is a no-op)
ALTER TABLE indicator MODIFY COLUMN category
  ENUM('vitals','lab_cbc','lab_cmp','lab_cardio','lab_cytokine',
       'bone_dxa','body_composition','fitness','sleep','mood',
       'nutrition','environment','radiation','cognitive') NOT NULL;

-- 2. body system used by the cognitive indicators (load.py seeds the same row; identical values)
INSERT INTO body_system (code, label, body_region) VALUES ('behavioral', 'Behavioral health', 'head')
ON DUPLICATE KEY UPDATE code = code;

-- 3. data source of live sessions mirrored by MOTHER (synthetic sessions use the generator's source)
INSERT INTO data_source (id, title, publisher, data_kind, access_status, notes) VALUES
  ('mother_app_cognitive', 'MOTHER cognitive tests (PVT-B, Go/No-Go, DSST) run in the GUI',
   'NASA-HACKATHON team', 'real_analog', 'generated',
   'Performance indicators compared with the person''s own baseline; not a diagnosis. Trial level data: astro_cognitive.')
ON DUPLICATE KEY UPDATE title = VALUES(title), publisher = VALUES(publisher), data_kind = VALUES(data_kind),
                        access_status = VALUES(access_status), notes = VALUES(notes);

-- 4. indicators mirrored into astro_core.observation (CONTRACT section 5).
--    pvt_reaction_ms already exists in the Mars demo as category 'fitness': it is kept unchanged on conflict.
INSERT INTO indicator (code, label, category, body_system_code, canonical_unit, value_type, scope, clinical_use,
                       description) VALUES
  ('pvt_reaction_ms', 'PVT reaction time', 'fitness', 'behavioral', 'ms', 'numeric', 'subject', 'diagnostic',
   'Median reaction time of a PVT-B session (pvt_median_rt_ms).'),
  ('pvt_lapses', 'PVT lapses', 'cognitive', 'behavioral', 'count', 'numeric', 'subject', 'research',
   'PVT-B lapses (reaction >= 355 ms or timeout) per 3 minute session.'),
  ('gonogo_commission_rate', 'Go/No-Go commission rate', 'cognitive', 'behavioral', 'ratio', 'numeric', 'subject',
   'research', 'Share of NO-GO trials answered by mistake (0-1).'),
  ('dsst_throughput_per_min', 'DSST throughput', 'cognitive', 'behavioral', 'per min', 'numeric', 'subject',
   'research', 'Correct symbol-digit substitutions per minute.')
ON DUPLICATE KEY UPDATE
  label            = IF(code = 'pvt_reaction_ms', label, VALUES(label)),
  category         = IF(code = 'pvt_reaction_ms', category, VALUES(category)),
  body_system_code = COALESCE(body_system_code, VALUES(body_system_code)),
  canonical_unit   = IF(code = 'pvt_reaction_ms', canonical_unit, VALUES(canonical_unit)),
  description      = COALESCE(description, VALUES(description));
