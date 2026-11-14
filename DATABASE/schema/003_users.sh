#!/usr/bin/env bash
# 003_users.sh | MariaDB 11.4 LTS | wersja schematu 0.2 (2026-11-14)
# Tworzy użytkowników bazy z haseł w zmiennych środowiskowych (plik DATABASE/.env, poza gitem).
#   astro_etl    - import: SELECT/INSERT/UPDATE/DELETE na astro_core.*, SELECT na astro_api.*
#   astro_reader - backend/GUI/eksport: SELECT na astro_api.* (widoki) + tylko-do-odczytu tabele,
#                  które MOTHER czyta bezpośrednio (lista w 012_users_extra.sql); bez zapisu, bez astro_medical
#   admin        - konto zespołu do ręcznej pracy: pełne prawa do astro_core, astro_api, astro_habitat (hasło domyślnie 'admin')
#   habitat_writer - producent HABITAT: zapis odczytów/zdarzeń do astro_habitat (bez kasowania katalogu)
# Uruchamianie:
#   - automatycznie przez obraz mariadb (katalog /docker-entrypoint-initdb.d, po 001 i 002), albo
#   - ręcznie: MARIADB_ROOT_PASSWORD=... ASTRO_ETL_PASSWORD=... ASTRO_READER_PASSWORD=... bash 003_users.sh
# Hasła nigdy nie trafiają do repozytorium.

: "${ASTRO_ETL_PASSWORD:?Brak zmiennej ASTRO_ETL_PASSWORD (DATABASE/.env)}"
: "${ASTRO_READER_PASSWORD:?Brak zmiennej ASTRO_READER_PASSWORD (DATABASE/.env)}"
ASTRO_ADMIN_PASSWORD="${ASTRO_ADMIN_PASSWORD:-admin}"
: "${HABITAT_WRITER_PASSWORD:?Brak zmiennej HABITAT_WRITER_PASSWORD (DATABASE/.env)}"

# Ucieczka znaków dla literału SQL: \ -> \\ oraz ' -> ''
astro_sql_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e "s/'/''/g"; }

astro_users_sql="
CREATE USER IF NOT EXISTS 'astro_etl'@'%'    IDENTIFIED BY '$(astro_sql_escape "$ASTRO_ETL_PASSWORD")';
ALTER  USER               'astro_etl'@'%'    IDENTIFIED BY '$(astro_sql_escape "$ASTRO_ETL_PASSWORD")';
CREATE USER IF NOT EXISTS 'astro_reader'@'%' IDENTIFIED BY '$(astro_sql_escape "$ASTRO_READER_PASSWORD")';
ALTER  USER               'astro_reader'@'%' IDENTIFIED BY '$(astro_sql_escape "$ASTRO_READER_PASSWORD")';
GRANT SELECT, INSERT, UPDATE, DELETE ON astro_core.* TO 'astro_etl'@'%';
GRANT SELECT ON astro_api.* TO 'astro_etl'@'%';
GRANT SELECT ON astro_api.* TO 'astro_reader'@'%';
CREATE USER IF NOT EXISTS 'admin'@'%' IDENTIFIED BY '$(astro_sql_escape "$ASTRO_ADMIN_PASSWORD")';
ALTER  USER               'admin'@'%' IDENTIFIED BY '$(astro_sql_escape "$ASTRO_ADMIN_PASSWORD")';
GRANT ALL PRIVILEGES ON astro_core.* TO 'admin'@'%';
GRANT ALL PRIVILEGES ON astro_api.*  TO 'admin'@'%';
GRANT ALL PRIVILEGES ON astro_habitat.* TO 'admin'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON astro_habitat.* TO 'astro_etl'@'%';
CREATE USER IF NOT EXISTS 'habitat_writer'@'%' IDENTIFIED BY '$(astro_sql_escape "$HABITAT_WRITER_PASSWORD")';
ALTER  USER               'habitat_writer'@'%' IDENTIFIED BY '$(astro_sql_escape "$HABITAT_WRITER_PASSWORD")';
GRANT SELECT ON astro_habitat.* TO 'habitat_writer'@'%';
GRANT SELECT ON astro_api.* TO 'habitat_writer'@'%';
FLUSH PRIVILEGES;
-- Tylko uprawnienia na poziomie bazy (db.*): MariaDB pozwala je nadać, zanim baza powstanie.
-- Uprawnienia do POJEDYNCZYCH tabel (habitat_writer -> reading/event/..., astro_reader -> tabele czytane
-- przez MOTHER) są w 012_users_extra.sql, który uruchamia się po utworzeniu tabel (004-011);
-- GRANT na nieistniejącą tabelę kończy się ERROR 1146 i przerywa inicjalizację świeżego wolumenu.
"

if declare -F docker_process_sql >/dev/null; then
  # wewnątrz docker-entrypoint obrazu mariadb (skrypt jest wtedy wczytywany przez 'source')
  docker_process_sql <<<"$astro_users_sql"
else
  mariadb -uroot ${MARIADB_ROOT_PASSWORD:+-p"$MARIADB_ROOT_PASSWORD"} <<<"$astro_users_sql"
fi
unset astro_users_sql
