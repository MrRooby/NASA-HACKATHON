-- Demo scenario "commander irradiated in the reactor bay" (sol 600), inserted on 2026-11-15.
-- Rows: import batch 48 in astro_core.import_batch; zone 'reactor'; C1 in the reactor 05:00-09:18;
-- dose_rate readings (raw + hourly) in the reactor; C1 dose_personal_cum 712.4 mSv; event evt-scn-reactor;
-- channel_limit 73 and 74 (dose_rate caution >= 100, alert >= 1000 uGy/h).
-- Run this to remove the scenario again.
START TRANSACTION;
DELETE FROM astro_habitat.event WHERE import_batch_id = 48;
DELETE FROM astro_habitat.reading WHERE import_batch_id = 48;
DELETE FROM astro_habitat.reading_hourly WHERE zone_code = 'reactor';
DELETE FROM astro_habitat.crew_location WHERE zone_code = 'reactor';
DELETE FROM astro_habitat.channel_limit WHERE id IN (73, 74);
DELETE FROM astro_habitat.zone WHERE code = 'reactor';
DELETE FROM astro_core.import_batch WHERE id = 48;
COMMIT;
