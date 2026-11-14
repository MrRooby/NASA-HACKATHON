#!/usr/bin/env bash
# 015_users_cognitive.sh | cognitive tests: grants + cognitive_writer user (password from env, never in the repo)
#   astro_etl        - SELECT/INSERT/UPDATE/DELETE on astro_cognitive.*
#   admin            - ALL on astro_cognitive.*
#   cognitive_writer - MOTHER's account: append-only on astro_cognitive (no UPDATE/DELETE), reads the dictionaries,
#                      mirrors aggregates into astro_core.observation (+ import_batch). astro_reader sees the
#                      cognitive_* views through its existing SELECT on astro_api.*.
# Must run after 013 (tables), 014 (views) and 003 (astro_etl/admin users). Same style as 003_users.sh.

: "${COGNITIVE_WRITER_PASSWORD:?Brak zmiennej COGNITIVE_WRITER_PASSWORD (DATABASE/.env)}"

astro_sql_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e "s/'/''/g"; }

astro_cog_users_sql="
GRANT SELECT, INSERT, UPDATE, DELETE ON astro_cognitive.* TO 'astro_etl'@'%';
GRANT ALL PRIVILEGES ON astro_cognitive.* TO 'admin'@'%';
CREATE USER IF NOT EXISTS 'cognitive_writer'@'%' IDENTIFIED BY '$(astro_sql_escape "$COGNITIVE_WRITER_PASSWORD")';
ALTER  USER               'cognitive_writer'@'%' IDENTIFIED BY '$(astro_sql_escape "$COGNITIVE_WRITER_PASSWORD")';
GRANT SELECT, INSERT ON astro_cognitive.test_session TO 'cognitive_writer'@'%';
GRANT SELECT, INSERT ON astro_cognitive.test_metric  TO 'cognitive_writer'@'%';
GRANT INSERT ON astro_cognitive.test_trial TO 'cognitive_writer'@'%';
GRANT INSERT ON astro_cognitive.test_event TO 'cognitive_writer'@'%';
GRANT SELECT ON astro_cognitive.test_definition TO 'cognitive_writer'@'%';
GRANT SELECT ON astro_core.subject       TO 'cognitive_writer'@'%';
GRANT SELECT ON astro_core.mission       TO 'cognitive_writer'@'%';
GRANT SELECT ON astro_core.indicator     TO 'cognitive_writer'@'%';
GRANT SELECT ON astro_core.participation TO 'cognitive_writer'@'%';
GRANT INSERT ON astro_core.observation   TO 'cognitive_writer'@'%';
GRANT INSERT ON astro_core.import_batch  TO 'cognitive_writer'@'%';
GRANT SELECT ON astro_api.subjects           TO 'cognitive_writer'@'%';
GRANT SELECT ON astro_api.cognitive_sessions TO 'cognitive_writer'@'%';
GRANT SELECT ON astro_api.cognitive_trials   TO 'cognitive_writer'@'%';
GRANT SELECT ON astro_api.cognitive_metrics  TO 'cognitive_writer'@'%';
GRANT SELECT ON astro_api.cognitive_latest   TO 'cognitive_writer'@'%';
FLUSH PRIVILEGES;
"

if declare -F docker_process_sql >/dev/null; then
  # inside the mariadb image entrypoint (the script is sourced there)
  docker_process_sql <<<"$astro_cog_users_sql"
else
  mariadb -uroot ${MARIADB_ROOT_PASSWORD:+-p"$MARIADB_ROOT_PASSWORD"} <<<"$astro_cog_users_sql"
fi
unset astro_cog_users_sql
