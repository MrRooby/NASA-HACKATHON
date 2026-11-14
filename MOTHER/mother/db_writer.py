"""Write connection for the in-app cognitive tests (the ONLY place MOTHER writes to the team database).

MOTHER is otherwise read-only. This module uses a separate MariaDB user (`cognitive_writer`, created by the
database owner) with INSERT rights on astro_cognitive.* and the astro_core mirror tables only. Credentials come
from MOTHER/.env: COGNITIVE_DB_USER / COGNITIVE_DB_PASSWORD (host and port are the same as for the read user).
Autocommit is OFF: cognitive.save_session commits or rolls back one whole session.
"""
from __future__ import annotations

import os

from .config import MOTHER_DIR

WRITER_HINT = ("Cognitive tests cannot be saved: set COGNITIVE_DB_USER and COGNITIVE_DB_PASSWORD in MOTHER/.env "
               "(ask the database owner for the cognitive_writer password) and restart MOTHER.")


class WriterNotConfigured(RuntimeError):
    """COGNITIVE_DB_USER / COGNITIVE_DB_PASSWORD (or DB_HOST) are missing."""


def writer_settings() -> dict:
    try:
        from dotenv import load_dotenv
        load_dotenv(MOTHER_DIR / ".env")
    except ImportError:  # pragma: no cover
        pass
    missing = [k for k in ("DB_HOST", "COGNITIVE_DB_USER", "COGNITIVE_DB_PASSWORD") if not os.environ.get(k)]
    if missing:
        raise WriterNotConfigured(f"Missing {', '.join(missing)}")
    return {
        "host": os.environ["DB_HOST"].split(":")[0],
        "port": int(os.environ.get("DB_PORT", "3306")),
        "user": os.environ["COGNITIVE_DB_USER"],
        "password": os.environ["COGNITIVE_DB_PASSWORD"],
    }


def connect():
    """New connection, autocommit off, no default database (queries are fully qualified)."""
    import pymysql
    import pymysql.cursors
    s = writer_settings()
    return pymysql.connect(**s, connect_timeout=8, read_timeout=30, write_timeout=30, charset="utf8mb4",
                           cursorclass=pymysql.cursors.DictCursor, autocommit=False)
