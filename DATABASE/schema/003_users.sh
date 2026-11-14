#!/usr/bin/env bash
# 003_users.sh | MariaDB 11.4 LTS | wersja schematu 0.2 (2026-11-14)
# Tworzy użytkowników bazy z haseł w zmiennych środowiskowych (plik DATABASE/.env, poza gitem).
#   astro_etl    - import: SELECT/INSERT/UPDATE/DELETE na astro_core.*, SELECT na astro_api.*
#   astro_reader - backend/GUI/eksport: wyłącznie SELECT na astro_api.* (widoki)
# Uruchamianie:
#   - automatycznie przez obraz mariadb (katalog /docker-entrypoint-initdb.d, po 001 i 002), albo
#   - ręcznie: MARIADB_ROOT_PASSWORD=... ASTRO_ETL_PASSWORD=... ASTRO_READER_PASSWORD=... bash 003_users.sh
# Hasła nigdy nie trafiają do repozytorium.

: "${ASTRO_ETL_PASSWORD:?Brak zmiennej ASTRO_ETL_PASSWORD (DATABASE/.env)}"
: "${ASTRO_READER_PASSWORD:?Brak zmiennej ASTRO_READER_PASSWORD (DATABASE/.env)}"

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
FLUSH PRIVILEGES;
"

if declare -F docker_process_sql >/dev/null; then
  # wewnątrz docker-entrypoint obrazu mariadb (skrypt jest wtedy wczytywany przez 'source')
  docker_process_sql <<<"$astro_users_sql"
else
  mariadb -uroot ${MARIADB_ROOT_PASSWORD:+-p"$MARIADB_ROOT_PASSWORD"} <<<"$astro_users_sql"
fi
unset astro_users_sql
