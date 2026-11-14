"""Integration test: schema 001..016 + load_canonical (+ cognitive module) against a THROWAWAY MariaDB 11.4.

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
import re
import secrets
import shutil
import stat
import subprocess
import sys
import time
from pathlib import Path

import pytest

from conftest import ETL_DIR, REPO_ROOT, SCHEMA_DIR, SYN_DIR

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
DATABASES = ("astro_core", "astro_api", "astro_habitat", "astro_wearables", "astro_medical", "astro_cognitive")

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
    "astro_cognitive": {"test_definition", "test_session", "test_trial", "test_metric", "test_event"},
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
    # 014
    "cognitive_sessions", "cognitive_trials", "cognitive_metrics", "cognitive_latest",
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
             "HABITAT_WRITER_PASSWORD", "COGNITIVE_WRITER_PASSWORD")} | {"MARIADB_ROOT_PASSWORD": ROOT_PW}


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
        before = [f for f in SCHEMA_FILES if f.suffix != ".sh" and f.name < "012"]
        users = [f for f in SCHEMA_FILES if f.name.startswith("003")]
        after = [f for f in SCHEMA_FILES if f.name >= "012"]      # 012 grants, 013-016 cognitive (incl. 015 .sh)
        apply_schema(before + users + after, passwords, tmp)
    return passwords


# ------------------------------------------------------------------ schema tests
def test_schema_applies_in_entrypoint_order(schema):
    """Regression: 003_users.sh used to grant table-level privileges on astro_habitat tables created later by
    004 (ERROR 1146), so a fresh `docker compose up` aborted. Table-level grants now live in 012."""
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
        cur.execute("SELECT * FROM astro_core.indicator LIMIT 0")          # read-only table grant (012)
        for forbidden in ("SELECT * FROM astro_core.observation LIMIT 0",   # raw data: only through views
                          "SELECT * FROM astro_medical.alert LIMIT 0",      # medical data: never for the reader
                          "SELECT * FROM astro_cognitive.test_trial LIMIT 0",
                          "INSERT INTO astro_core.body_system (code, label, body_region) VALUES ('x', 'x', 'x')",
                          "DELETE FROM astro_habitat.reading"):
            with pytest.raises((pymysql.err.OperationalError, pymysql.err.ProgrammingError)):
                cur.execute(forbidden)
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


MOTHER_READ_MODULES = ("organs.py", "db_source.py", "db_mission.py", "data_map.py")   # run as astro_reader


def test_reader_can_read_every_table_mother_queries(db):
    """Regression for /api/organs and /api/dashboard failing with 1142 (SELECT command denied): every table MOTHER's
    read path names directly (outside astro_api) must be readable by astro_reader. cognitive.py is excluded: its
    raw-table access runs as cognitive_writer (db_writer.py)."""
    src = REPO_ROOT / "MOTHER" / "mother"
    tables = set()
    for name in MOTHER_READ_MODULES:
        tables |= set(re.findall(r"\b(astro_(?:core|habitat|wearables|medical|cognitive)\.[a-z_]+)",
                                 (src / name).read_text(encoding="utf-8")))
    assert tables, "no direct table reads found - did the MOTHER modules move?"
    r = pymysql.connect(host=HOST, port=PORT, user="astro_reader", password=db["ASTRO_READER_PASSWORD"],
                        database="astro_api", autocommit=True)
    denied = []
    with r.cursor() as cur:
        for t in sorted(tables):
            try:
                cur.execute(f"SELECT 1 FROM {t} LIMIT 0")
            except pymysql.MySQLError as e:
                denied.append(f"{t}: {e.args[1] if len(e.args) > 1 else e}")
    r.close()
    assert not denied, "astro_reader cannot read tables MOTHER queries (grant them in 012_users_extra.sql):\n" + "\n".join(denied)


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


# ------------------------------------------------------------------ cognitive module (013-016)
COGNITIVE_VIEW_COLUMNS = {
    "cognitive_sessions": {"session_id", "session_uuid", "subject_code", "mission_code", "test_id", "session_no",
                           "is_practice", "status", "quality", "started_at", "device_class", "fatigue", "kss"},
    "cognitive_trials": {"session_id", "session_uuid", "subject_code", "mission_code", "test_id", "idx", "stimulus",
                         "rt_ms", "event_type"},
    "cognitive_metrics": {"session_id", "session_uuid", "subject_code", "mission_code", "test_id", "metric_code",
                          "value", "scoring_version"},
    "cognitive_latest": {"session_id", "session_uuid", "subject_code", "mission_code", "test_id", "quality",
                         "started_at"},
}


def user_connect(user, pw, database=None):
    return pymysql.connect(host=HOST, port=PORT, user=user, password=pw, database=database, autocommit=True)


@pytest.fixture(scope="module")
def syn_mission(db):
    """SYN-ISS-180 with SYN-01..04 (normally loaded by load_canonical data/synthetic/demo)."""
    con = root_connect("astro_core")
    with con.cursor() as cur:
        cur.execute("INSERT IGNORE INTO environment (code, label, gravity_g, is_analog) VALUES ('iss','ISS',0,0)")
        cur.execute("INSERT IGNORE INTO data_source (id, title, data_kind, access_status) "
                    "VALUES ('synthetic_v1','Synthetic v1','synthetic','generated')")
        cur.execute("INSERT IGNORE INTO mission (code, name, environment_code, source_id, start_date, end_date, "
                    "duration_days, is_synthetic) VALUES ('SYN-ISS-180','Synthetic ISS','iss','synthetic_v1',"
                    "'2030-01-01','2030-06-30',180,1)")
        for n in range(1, 5):
            cur.execute("INSERT IGNORE INTO subject (code, source_subject_code, source_id, sex, is_synthetic) "
                        "VALUES (%s,%s,'synthetic_v1','U',1)", (f"SYN-0{n}", f"SYN-0{n}"))
            cur.execute("INSERT IGNORE INTO participation (subject_id, mission_id, role) "
                        "SELECT s.id, m.id, 'synthetic_crew' FROM subject s, mission m "
                        "WHERE s.code=%s AND m.code='SYN-ISS-180'", (f"SYN-0{n}",))
    con.close()
    return db


def test_cognitive_seed_rows(db):
    con = root_connect("astro_core")
    with con.cursor() as cur:
        cur.execute("SELECT test_id, current_protocol FROM astro_cognitive.test_definition ORDER BY test_id")
        assert cur.fetchall() == (("dsst", "dsst-1.0"), ("gonogo", "gonogo-1.0"), ("pvt", "pvtb-1.0"))
        cur.execute("SELECT id, data_kind, access_status FROM data_source WHERE id='mother_app_cognitive'")
        assert cur.fetchone() == ("mother_app_cognitive", "real_analog", "generated")
        cur.execute("SELECT code, category FROM indicator WHERE code IN ('pvt_reaction_ms','pvt_lapses',"
                    "'gonogo_commission_rate','dsst_throughput_per_min')")
        assert dict(cur.fetchall()) == {"pvt_reaction_ms": "fitness", "pvt_lapses": "cognitive",
                                        "gonogo_commission_rate": "cognitive", "dsst_throughput_per_min": "cognitive"}
        cur.execute("SELECT column_type FROM information_schema.columns WHERE table_schema='astro_core' "
                    "AND table_name='indicator' AND column_name='category'")
        ct = cur.fetchone()[0]
        assert ct.startswith("enum('vitals','lab_cbc'") and ct.endswith("'radiation','cognitive')")
    con.close()
    # 016 is idempotent
    run_sql_script((SCHEMA_DIR / "016_cognitive_seed.sql").read_text(encoding="utf-8"))


def test_cognitive_views_columns(db):
    con = root_connect()
    with con.cursor() as cur:
        for view, cols in COGNITIVE_VIEW_COLUMNS.items():
            cur.execute("SELECT column_name FROM information_schema.columns "
                        "WHERE table_schema='astro_api' AND table_name=%s", (view,))
            found = {r[0] for r in cur.fetchall()}
            assert cols <= found, f"{view}: missing {sorted(cols - found)}"
    con.close()


def test_cognitive_grants(syn_mission):
    reader = user_connect("astro_reader", syn_mission["ASTRO_READER_PASSWORD"], "astro_api")
    with reader.cursor() as cur:
        for view in COGNITIVE_VIEW_COLUMNS:
            cur.execute(f"SELECT * FROM astro_api.{view} LIMIT 0")        # works for the reader (definer rights)
        with pytest.raises(pymysql.err.OperationalError):
            cur.execute("INSERT INTO astro_cognitive.test_definition (test_id, name, domain, current_protocol) "
                        "VALUES ('x','x','x','x')")
        with pytest.raises(pymysql.err.OperationalError):
            cur.execute("SELECT * FROM astro_cognitive.test_session LIMIT 0")
    reader.close()

    w = user_connect("cognitive_writer", syn_mission["COGNITIVE_WRITER_PASSWORD"], "astro_cognitive")
    uid = "00000000-0000-4000-8000-000000000001"
    with w.cursor() as cur:
        cur.execute("SELECT id FROM astro_core.subject WHERE code='SYN-01'")
        sid = cur.fetchone()[0]
        cur.execute("SELECT id FROM astro_core.mission WHERE code='SYN-ISS-180'")
        mid = cur.fetchone()[0]
        ins = ("INSERT INTO test_session (client_session_uuid, subject_id, mission_id, test_id, protocol_version, "
               "app_version, stimulus_set, seed, session_no, status, started_at, device_class, fatigue) "
               "VALUES (%s,%s,%s,'pvt','pvtb-1.0','t','A',1,1,'complete','2030-02-01 08:00:00.000','keyboard',%s)")
        cur.execute(ins, (uid, sid, mid, 3))
        cur.execute("SELECT id FROM test_session WHERE client_session_uuid=%s", (uid,))
        session_id = cur.fetchone()[0]
        cur.execute("INSERT INTO test_trial (session_id, idx, stimulus, event_type, rt_ms) "
                    "VALUES (%s,0,'counter','response',250.5)", (session_id,))
        cur.execute("INSERT INTO test_metric (session_id, metric_code, value, scoring_version) "
                    "VALUES (%s,'pvt_median_rt_ms',250.5,'1.0')", (session_id,))
        cur.execute("INSERT INTO test_event (session_id, seq, t_ms, kind) VALUES (%s,0,1.5,'blur')", (session_id,))
        cur.execute("SELECT COUNT(*) FROM astro_api.cognitive_trials WHERE session_uuid=%s", (uid,))
        assert cur.fetchone()[0] == 1
        # append-only: no DELETE/UPDATE of sessions or trials
        with pytest.raises(pymysql.err.OperationalError):
            cur.execute("DELETE FROM test_session WHERE id=%s", (session_id,))
        with pytest.raises(pymysql.err.OperationalError):
            cur.execute("UPDATE test_session SET quality='low' WHERE id=%s", (session_id,))
        with pytest.raises(pymysql.err.OperationalError):
            cur.execute("DELETE FROM test_trial WHERE session_id=%s", (session_id,))
        # idempotency key
        with pytest.raises(pymysql.err.IntegrityError):
            cur.execute(ins, (uid, sid, mid, 3))
        # FK: unknown subject
        with pytest.raises(pymysql.err.IntegrityError):
            cur.execute(ins, ("00000000-0000-4000-8000-000000000002", 999999, mid, 3))
        # CHECK: fatigue 1-10 (MariaDB reports error 4025 as OperationalError)
        with pytest.raises((pymysql.err.IntegrityError, pymysql.err.OperationalError), match="ck_cs_fatigue"):
            cur.execute(ins, ("00000000-0000-4000-8000-000000000003", sid, mid, 11))
        # observation mirror
        cur.execute("INSERT INTO astro_core.import_batch (source_id, adapter, file_name, file_sha256, status) "
                    "VALUES ('mother_app_cognitive','mother_cognitive','session:x',REPEAT('a',64),'ok')")
        bid = w.insert_id()
        cur.execute("SELECT id FROM astro_core.indicator WHERE code='pvt_reaction_ms'")
        iid = cur.fetchone()[0]
        cur.execute("INSERT INTO astro_core.observation (subject_id, mission_id, indicator_id, source_id, "
                    "import_batch_id, anchor, day_offset, measured_at, value_num, sample_type) "
                    "VALUES (%s,%s,%s,'mother_app_cognitive',%s,'launch',31,'2030-02-01 08:00:00.000',250.5,"
                    "'manual_device')", (sid, mid, iid, bid))
        with pytest.raises(pymysql.err.OperationalError):
            cur.execute("DELETE FROM astro_core.observation")
    w.close()
    root = root_connect("astro_cognitive")      # clean up the writer's rows
    with root.cursor() as cur:
        cur.execute("DELETE FROM test_session WHERE client_session_uuid=%s", (uid,))
        cur.execute("DELETE FROM astro_core.observation WHERE source_id='mother_app_cognitive'")
        cur.execute("DELETE FROM astro_core.import_batch WHERE source_id='mother_app_cognitive'")
    root.close()


def cognitive_counts():
    con = root_connect("astro_cognitive")
    with con.cursor() as cur:
        out = {}
        for t in ("test_session", "test_trial", "test_metric"):
            cur.execute(f"SELECT COUNT(*) FROM {t}")
            out[t] = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM astro_core.observation WHERE source_id='synthetic_v1' "
                    "AND indicator_id IN (SELECT id FROM astro_core.indicator WHERE code IN ('pvt_reaction_ms',"
                    "'pvt_lapses','gonogo_commission_rate','dsst_throughput_per_min'))")
        out["observation"] = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM astro_core.import_batch WHERE adapter='cognitive_synthetic'")
        out["import_batch"] = cur.fetchone()[0]
    con.close()
    return out


def test_load_cognitive_idempotent_and_mirrors_observations(syn_mission, tmp_path):
    gen = subprocess.run([sys.executable, str(SYN_DIR / "cognitive_generate.py"), "--seed", "42", "--out",
                          str(tmp_path / "cog")], capture_output=True, text=True, timeout=120)
    assert gen.returncode == 0, gen.stderr
    env = {**os.environ, "DB_HOST": HOST, "DB_PORT": str(PORT),
           "ASTRO_ETL_PASSWORD": syn_mission["ASTRO_ETL_PASSWORD"]}

    def run():
        return subprocess.run([sys.executable, str(ETL_DIR / "load_cognitive.py"), str(tmp_path / "cog")],
                              env=env, capture_output=True, text=True, timeout=300)

    first = run()
    assert first.returncode == 0, first.stderr
    c1 = cognitive_counts()
    assert c1["test_session"] == 244 and c1["test_trial"] > 15000 and c1["test_metric"] > 244 * 5
    assert c1["observation"] > 0 and c1["import_batch"] == 1
    second = run()
    assert second.returncode == 0, second.stderr
    assert cognitive_counts() == c1

    con = root_connect("astro_api")
    with con.cursor() as cur:
        # practice sessions are not mirrored: 4 subjects x 24 non-practice PVT sessions
        cur.execute("SELECT COUNT(*), MIN(day_offset), MAX(day_offset), MIN(unit), MAX(anchor) FROM astro_api.observations "
                    "WHERE indicator_code='pvt_reaction_ms' AND source_id='synthetic_v1' "
                    "AND mission_code='SYN-ISS-180'")
        n, lo, hi, unit, anchor = cur.fetchone()
        assert n == 4 * (3 + 25) and lo == -10 and hi == 175 and unit == "ms" and anchor == "launch"
        cur.execute("SELECT DISTINCT category FROM astro_api.observations WHERE indicator_code='pvt_lapses'")
        assert cur.fetchall() == (("cognitive",),)
        # latest complete non-practice session per (subject, test)
        cur.execute("SELECT COUNT(*), SUM(session_no > 1) FROM astro_api.cognitive_latest")
        assert cur.fetchone() == (12, 12)
        cur.execute("SELECT COUNT(*) FROM astro_api.cognitive_metrics WHERE metric_code='pvt_median_rt_ms' "
                    "AND value IS NOT NULL")
        assert cur.fetchone()[0] == 4 * 29
        cur.execute("SELECT COUNT(DISTINCT session_uuid) FROM astro_api.cognitive_trials")
        assert cur.fetchone()[0] == 244
    con.close()
