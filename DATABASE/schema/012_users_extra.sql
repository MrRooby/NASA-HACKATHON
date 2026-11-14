-- 012_users_extra.sql | uprawnienia, które wymagają istniejących tabel (uruchamiany po 001-011).
-- Plik jest idempotentny: na działającej bazie (wolumen już zainicjalizowany) można go uruchomić ręcznie:
--   docker exec -i astro-mariadb sh -c 'mariadb -uroot -p"$MARIADB_ROOT_PASSWORD"' < DATABASE/schema/012_users_extra.sql

-- Moduły ETL: wearables i medical.
GRANT SELECT, INSERT, UPDATE, DELETE ON astro_wearables.* TO 'astro_etl'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON astro_medical.* TO 'astro_etl'@'%';
GRANT ALL PRIVILEGES ON astro_wearables.* TO 'admin'@'%';
GRANT ALL PRIVILEGES ON astro_medical.* TO 'admin'@'%';

-- habitat_writer (producent HABITAT): zapis odczytów i zdarzeń, bez kasowania katalogu.
-- Przeniesione z 003_users.sh: tabele powstają dopiero w 004_habitat_core.sql.
GRANT INSERT, UPDATE ON astro_habitat.reading        TO 'habitat_writer'@'%';
GRANT INSERT, UPDATE ON astro_habitat.reading_hourly TO 'habitat_writer'@'%';
GRANT INSERT, UPDATE ON astro_habitat.event          TO 'habitat_writer'@'%';
GRANT INSERT, UPDATE ON astro_habitat.crew_location  TO 'habitat_writer'@'%';

-- astro_reader (MOTHER/GUI): tylko SELECT, tylko tabele, które MOTHER czyta bezpośrednio
-- (organs.py, db_source.py, db_mission.py, data_map.py). Bez zapisu i bez astro_medical.
-- Bez tych uprawnień /api/organs i /api/dashboard kończą się błędem 1142 (SELECT command denied).
GRANT SELECT ON astro_core.subject         TO 'astro_reader'@'%';
GRANT SELECT ON astro_core.mission         TO 'astro_reader'@'%';
GRANT SELECT ON astro_core.indicator       TO 'astro_reader'@'%';
GRANT SELECT ON astro_core.body_system     TO 'astro_reader'@'%';
GRANT SELECT ON astro_core.env_observation TO 'astro_reader'@'%';
GRANT SELECT ON astro_habitat.habitat      TO 'astro_reader'@'%';
GRANT SELECT ON astro_habitat.crew         TO 'astro_reader'@'%';
GRANT SELECT ON astro_habitat.reading      TO 'astro_reader'@'%';
GRANT SELECT ON astro_wearables.device        TO 'astro_reader'@'%';
GRANT SELECT ON astro_wearables.device_state  TO 'astro_reader'@'%';
GRANT SELECT ON astro_wearables.sample_minute TO 'astro_reader'@'%';
GRANT SELECT ON astro_wearables.sleep_session TO 'astro_reader'@'%';

FLUSH PRIVILEGES;
