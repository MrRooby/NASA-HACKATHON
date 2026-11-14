"""Integration test: schema 001..012 + load_canonical against a THROWAWAY MariaDB 11.4.

SKIPPED unless ASTRO_TEST_DB_HOST is set. Never point this at a shared/team database: it creates users and
(with ASTRO_TEST_DB_RESET=1) drops the astro_* databases.

Environment variables:
  ASTRO_TEST_DB_HOST           required; e.g. 127.0.0.1 (CI service container)
  ASTRO_TEST_DB_PORT           default 3306
  ASTRO_TEST_DB_ROOT_PASSWORD  root password of the throwaway server (MARIADB_ROOT_PASSWORD); default ''
  ASTRO_TEST_DB_RESET          '1' = drop existing astro_* databases first (otherwise the test is skipped when
                               astro_core already exists, to avoid touching a database with real content)

Local run (podman or docker):
  docker run --rm -d --name astro-test -p 127.0.0.1:33306:3306 -e MARIADB_ROOT_PASSWORD=test mariadb:11.4
  ASTRO_TEST_DB_HOST=127.0.0.1 ASTRO_TEST_DB_PORT=33306 ASTRO_TEST_DB_ROOT_PASSWORD=test \
      python -m pytest -q tests/integration
  docker rm -f astro-test

The schema is applied the way the mariadb image entrypoint does it (files in name order, 003_users.sh executed
by bash with the same password variables; its SQL is captured through a stub `mariadb` binary on PATH).
"""
from __future__ import annotations

import os
import secrets
import shutil
import stat
import subprocess
import sys
import time
from pathlib import Path

import pytest

from conftest import ETL_DIR, SCHEMA_DIR

pytestmark = pytest.mark.integration

HOST = os.environ.get("ASTRO_TEST_DB_HOST")
if not HOST:
    pytest.skip("ASTRO_TEST_DB_HOST not set (throwaway MariaDB needed)", allow_module_level=True)

pymysql = pytest.importorskip("pymysql")
from pymysql.constants import CLIENT  # noqa: E402

PORT = int(os.environ.get("ASTRO_TEST_DB_PORT", "3306"))
ROOT_PW = os.environ.get("ASTRO_TEST_DB_ROOT_PASSWORD", "")
RESET = os.environ.get("ASTRO_TEST_DB_RESET") == "1"
FIXTURE = Path(__file__).parent / "fixtures" / "canonical_tiny"
DATABASES = ("astro_core", "astro_api", "astro_habitat", "astro_wearables", "astro_medical")

SCHEMA_FILES = sorted(p for p in SCHEMA_DIR.iterdir() if p.name[:3].isdigit() and p.suffix in (".sql", ".sh"))

EXPECTED_TABLES = {
    "astro_core": {"age_band", "body_system", "cohort", "cohort_stat", "data_source", "environment",
                   "env_observation", "import_batch", "indicator", "indicator_alias", "mission", "observation",
                   "participation", "reference_range", "subject", "threshold_band"},
    "astro_habitat": {"channel", "channel_limit", "crew", "crew_location", "event", "habitat", "reading",
                      "reading_hourly", "scenario", "zone"},
    "astro_wearables": {"device", "device_state", "sample", "sample_hour", "sample_minute", "scenario",
                        "sleep_session"},
    "astro_medical": {"alert", "attachment", "earth_doctor_review", "escalation", "medical_event", "transmission"},
}
EXPECTED_API_VIEWS = {
    # 002
    "baseline", "body_system_status", "change_from_baseline", "classifications", "cohort_stats", "daily_series",
    "diagnostic_latest", "environment_daily", "import_log", "indicators", "latest", "missions", "observations",
    "observations_mean", "reference_match", "reference_ranges", "source_data_map", "sources", "subject_data_map",
    "subjects",
    # 006
    "habitat_channel_limits", "habitat_channels", "habitat_crew", "habitat_crew_exposure_hourly",
    "habitat_crew_readings", "habitat_events", "habitat_health_latest", "habitat_hourly", "habitat_latest",
    "habitat_scenarios", "habitat_sensor_agreement", "habitat_zones",
    # 007
    "crew_dose_vs_blood", "crew_hydration_vs_kidney",
    # 009
    "wearable_latest_device_state", "wearable_limb_comparison", "wearable_low_battery_disconnected",
    "wearable_nightly_sleep",
    # 011
    "medical_open_escalations", "medical_pending_reviews", "medical_person_timeline", "medical_transmission_queue",
}


# ------------------------------------------------------------------ helpers
def root_connect(database=None, multi=False):
    return pymysql.connect(host=HOST, port=PORT, user="root", password=ROOT_PW, database=database,
                           charset="utf8mb4", autocommit=True,
                           client_flag=CLIENT.MULTI_STATEMENTS if multi else 0)


def wait_for_server(timeout=90):
    deadline = time.time() + timeout
    while True:
        try:
            root_connect().close()
            return
        except pymysql.err.OperationalError:
            if time.time() > deadline:
                raise
            time.sleep(2)


def run_sql_script(sql: str):
    """Run a multi-statement script like the `mariadb` client would; raises on the first failing statement."""
    con = root_connect(multi=True)
    try:
        with con.cursor() as cur:
            cur.execute(sql)
            while cur.nextset():
                pass
    finally:
        con.close()


def users_sql_from_script(script: Path, env: dict, tmp: Path) -> str:
    """Execute 003_users.sh with bash; a stub `mariadb` on PATH captures the SQL it would send."""
    bindir = tmp / "bin"
    bindir.mkdir(exist_ok=True)
    out = tmp / "users.sql"
    stub = bindir / "mariadb"
    stub.write_text(f'#!/usr/bin/env bash\ncat > "{out}"\n')
    stub.chmod(stub.stat().st_mode | stat.S_IEXEC)
    run_env = {"PATH": f"{bindir}{os.pathsep}{os.environ.get('PATH', '')}", **env}
    subprocess.run([shutil.which("bash") or "bash", str(script)], env=run_env, check=True, timeout=30)
    return out.read_text()


def drop_astro_databases(cur):
    # cross-database FKs (astro_habitat -> astro_core, ...) need the checks off for DROP DATABASE
    cur.execute("SET SESSION foreign_key_checks = 0")
    for db in DATABASES:
        cur.execute(f"DROP DATABASE IF EXISTS {db}")
    cur.execute("SET SESSION foreign_key_checks = 1")


def apply_schema(files, passwords, tmp):
    for f in files:
        sql = users_sql_from_script(f, passwords, tmp) if f.suffix == ".sh" else f.read_text(encoding="utf-8")
        try:
            run_sql_script(sql)
        except pymysql.MySQLError as e:
            raise RuntimeError(f"{f.name}: {e}") from e


# ------------------------------------------------------------------ fixtures
@pytest.fixture(scope="module")
def passwords():
    return {name: secrets.token_urlsafe(12) + "'\\x" for name in        # quote/backslash exercise the escaping
            ("MARIADB_ROOT_PASSWORD", "ASTRO_ETL_PASSWORD", "ASTRO_READER_PASSWORD", "ASTRO_ADMIN_PASSWORD",
             "HABITAT_WRITER_PASSWORD")} | {"MARIADB_ROOT_PASSWORD": ROOT_PW}


@pytest.fixture(scope="module")
def fresh_server():
    wait_for_server()
    con = root_connect()
    try:
        with con.cursor() as cur:
            cur.execute("SHOW DATABASES LIKE 'astro\\_core'")
            exists = cur.fetchone() is not None
            if exists and not RESET:
                pytest.skip("astro_core already exists on the test server; set ASTRO_TEST_DB_RESET=1 to drop it")
            drop_astro_databases(cur)
    finally:
        con.close()


@pytest.fixture(scope="module")
def schema(fresh_server, passwords, tmp_path_factory):
    """Apply the schema once in plain entrypoint order. Returns None or the error text of the first failure."""
    tmp = tmp_path_factory.mktemp("schema")
    try:
        apply_schema(SCHEMA_FILES, passwords, tmp)
        return None
    except RuntimeError as e:
        return str(e)


@pytest.fixture(scope="module")
def db(schema, passwords, tmp_path_factory):
    """A database with the full schema. If the entrypoint order failed, re-apply idempotent files so the
    remaining checks still run (the order failure itself is reported by test_schema_applies_in_entrypoint_order)."""
    if schema is not None:
        tmp = tmp_path_factory.mktemp("schema_retry")
        con = root_connect()
        with con.cursor() as cur:
            drop_astro_databases(cur)
        con.close()
        users = [f for f in SCHEMA_FILES if f.suffix == ".sh"]
        rest = [f for f in SCHEMA_FILES if f.suffix != ".sh"]
        # users (003) after all CREATE TABLEs, 012 (grants on astro_wearables/medical) after 003
        apply_schema([f for f in rest if f.name < "012"] + users + [f for f in rest if f.name >= "012"],
                     passwords, tmp)
    return passwords


# ------------------------------------------------------------------ schema tests
@pytest.mark.xfail(strict=True, reason="BUG: schema/003_users.sh:38-41 grants table-level privileges on "
                          "astro_habitat.reading/reading_hourly/event/crew_location, but those tables are created "
                          "later by 004_habitat_core.sql -> ERROR 1146; a fresh `docker compose up` (empty volume) "
                          "aborts database initialisation at 003_users.sh")
def test_schema_applies_in_entrypoint_order(schema):
    assert schema is None, schema


def test_expected_tables_exist(db):
    con = root_connect()
    with con.cursor() as cur:
        for database, tables in EXPECTED_TABLES.items():
            cur.execute("SELECT table_name FROM information_schema.tables "
                        "WHERE table_schema=%s AND table_type='BASE TABLE'", (database,))
            found = {r[0] for r in cur.fetchall()}
            assert tables <= found, f"{database}: missing {sorted(tables - found)}"
    con.close()


def test_expected_api_views_exist(db):
    con = root_connect()
    with con.cursor() as cur:
        cur.execute("SELECT table_name FROM information_schema.views WHERE table_schema='astro_api'")
        found = {r[0] for r in cur.fetchall()}
        cur.execute("SELECT COUNT(*) FROM information_schema.tables "
                    "WHERE table_schema='astro_api' AND table_type='BASE TABLE'")
        assert cur.fetchone()[0] == 0, "astro_api must contain views only"
    con.close()
    assert EXPECTED_API_VIEWS <= found, f"missing {sorted(EXPECTED_API_VIEWS - found)}"


def test_every_api_view_compiles(db):
    con = root_connect()
    broken = {}
    with con.cursor() as cur:
        cur.execute("SELECT table_name FROM information_schema.views WHERE table_schema='astro_api' "
                    "ORDER BY table_name")
        views = [r[0] for r in cur.fetchall()]
        for v in views:
            try:
                cur.execute(f"SELECT * FROM astro_api.`{v}` LIMIT 0")
                cur.fetchall()
            except pymysql.MySQLError as e:
                broken[v] = str(e)
    con.close()
    assert views and broken == {}


def test_users_and_grants(db):
    """astro_reader can read views but not core tables; astro_etl can write astro_core."""
    def conn(user, pw, database):
        return pymysql.connect(host=HOST, port=PORT, user=user, password=pw, database=database, autocommit=True)

    r = conn("astro_reader", db["ASTRO_READER_PASSWORD"], "astro_api")
    with r.cursor() as cur:
        cur.execute("SELECT * FROM astro_api.indicators LIMIT 0")
        with pytest.raises(pymysql.err.OperationalError):
            cur.execute("SELECT * FROM astro_core.indicator LIMIT 0")
    r.close()
    e = conn("astro_etl", db["ASTRO_ETL_PASSWORD"], "astro_core")
    with e.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM astro_core.observation")
        cur.execute("SELECT COUNT(*) FROM astro_wearables.device")     # granted by 012
        cur.execute("SELECT COUNT(*) FROM astro_medical.alert")
    e.close()
    w = conn("habitat_writer", db["HABITAT_WRITER_PASSWORD"], "astro_habitat")
    with w.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM astro_habitat.reading")
        with pytest.raises(pymysql.err.OperationalError):
            cur.execute("DELETE FROM astro_habitat.channel")
    w.close()


# ------------------------------------------------------------------ load_canonical
def counts():
    con = root_connect("astro_core")
    with con.cursor() as cur:
        out = {}
        for t in ("observation", "env_observation", "subject", "mission", "participation", "indicator",
                  "import_batch"):
            cur.execute(f"SELECT COUNT(*) FROM {t}")
            out[t] = cur.fetchone()[0]
    con.close()
    return out


def run_load_canonical(passwords, *dirs):
    env = {**os.environ, "DB_HOST": HOST, "DB_PORT": str(PORT),
           "ASTRO_ETL_PASSWORD": passwords["ASTRO_ETL_PASSWORD"]}
    return subprocess.run([sys.executable, str(ETL_DIR / "load_canonical.py"), *map(str, dirs)], env=env,
                          capture_output=True, text=True, timeout=120)


@pytest.fixture(scope="module")
def prerequisites(db):
    """Dictionary rows normally provided by load.py (environment, body_system) for the fixture dataset."""
    con = root_connect("astro_core")
    with con.cursor() as cur:
        cur.execute("INSERT IGNORE INTO environment (code, label, gravity_g, is_analog) VALUES ('iss','ISS',0,0)")
        cur.execute("INSERT IGNORE INTO body_system (code, label, body_region) "
                    "VALUES ('cardiovascular','Cardiovascular system','heart')")
    con.close()
    return db


def test_load_canonical_inserts_and_is_idempotent(prerequisites):
    before = counts()
    first = run_load_canonical(prerequisites, FIXTURE)
    assert first.returncode == 0, first.stderr
    after1 = counts()
    assert after1["observation"] - before["observation"] == 3      # 3 valid of 6 rows
    assert after1["env_observation"] - before["env_observation"] == 2
    assert after1["subject"] - before["subject"] == 2
    assert after1["participation"] - before["participation"] == 1

    second = run_load_canonical(prerequisites, FIXTURE)
    assert second.returncode == 0, second.stderr
    after2 = counts()
    for t in ("observation", "env_observation", "subject", "mission", "participation", "indicator"):
        assert after2[t] == after1[t], t
    assert after2["import_batch"] == after1["import_batch"] + 2       # every run is logged

    con = root_connect("astro_core")
    with con.cursor() as cur:
        cur.execute("SELECT rows_read, rows_upserted, rows_rejected, notes, status FROM import_batch "
                    "WHERE adapter='canonical' AND source_id='test_canonical' ORDER BY id DESC LIMIT 1")
        read, ok, rej, notes, status = cur.fetchone()
        assert (read, ok, rej, status) == (6, 3, 3, "ok")
        for reason in ("nieznany wskaźnik", "jednostka", "brak udziału"):
            assert reason in notes
        # rows re-pointed to the newest batch, values from the file
        cur.execute("SELECT o.value_num, o.phase FROM observation o JOIN indicator i ON i.id=o.indicator_id "
                    "JOIN subject s ON s.id=o.subject_id "
                    "WHERE s.code='TST-01' AND i.code='test_hr' ORDER BY o.time_order")
        assert cur.fetchall() == ((62.0, "pre"), (64.0, "in"), (71.0, "post"))
    con.close()

    # the API views see the loaded rows
    con = root_connect("astro_api")
    with con.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM astro_api.observations")
        assert cur.fetchone()[0] >= 3
    con.close()
