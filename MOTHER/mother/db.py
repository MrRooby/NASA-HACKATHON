"""MariaDB connection for MOTHER (read-only probe for now).

Credentials come from MOTHER/.env (git-ignored) or the process environment; the password is never printed.
Run `python -m mother.db` to check the connection and list what the database contains.
"""
from __future__ import annotations

import os
import sys

from .config import MOTHER_DIR


def settings() -> dict:
    try:
        from dotenv import load_dotenv
        load_dotenv(MOTHER_DIR / ".env")
    except ImportError:  # pragma: no cover
        pass
    missing = [k for k in ("DB_HOST", "DB_USER", "DB_PASSWORD") if not os.environ.get(k)]
    if missing:
        raise RuntimeError(f"Missing {', '.join(missing)} - create MOTHER/.env from MOTHER/.env.example")
    return {
        "host": os.environ["DB_HOST"].split(":")[0],
        "port": int(os.environ.get("DB_PORT", "3306")),
        "user": os.environ["DB_USER"],
        "password": os.environ["DB_PASSWORD"],
        "database": os.environ.get("DB_NAME", "astro_api"),
    }


def connect():
    import pymysql
    import pymysql.cursors
    s = settings()
    return pymysql.connect(**s, connect_timeout=8, read_timeout=30, charset="utf8mb4",
                           cursorclass=pymysql.cursors.DictCursor, autocommit=True)


def probe() -> int:
    s = settings()
    print(f"connecting to {s['host']}:{s['port']} as {s['user']} (db {s['database']}) ...")
    conn = connect()
    with conn.cursor() as cur:
        cur.execute("SELECT VERSION() AS v, CURRENT_USER() AS u, @@time_zone AS tz")
        print("server:", cur.fetchone())
        cur.execute("SHOW GRANTS")
        for row in cur.fetchall():
            print("grant:", list(row.values())[0])
        cur.execute("SHOW DATABASES")
        print("databases:", [list(r.values())[0] for r in cur.fetchall()])
        cur.execute("SELECT TABLE_SCHEMA s, TABLE_NAME t, TABLE_TYPE k, TABLE_ROWS n FROM information_schema.TABLES "
                    "WHERE TABLE_SCHEMA NOT IN ('information_schema','mysql','performance_schema','sys') "
                    "ORDER BY TABLE_SCHEMA, TABLE_NAME")
        for r in cur.fetchall():
            print(f"  {r['s']}.{r['t']:28s} {r['k']:10s} ~{r['n'] if r['n'] is not None else '-'} rows")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(probe())
