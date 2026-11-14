"""MOTHER backend: a JSON API (no web pages) computed live from the team database.

    python -m mother.server            (start.bat / start.sh do this for you)

The user interface lives in GUI/ (React + 3D astronaut) and calls /api/*. By default MOTHER only listens on
this computer (127.0.0.1; MOTHER_HOST changes that, e.g. inside Docker). Results are cached and recomputed
automatically when the database owner imports new data (astro_api.import_log changes).
"""
from __future__ import annotations

import argparse
import json
import os
import socket
import threading
import time
import traceback
from datetime import datetime, timedelta, timezone

from fastapi import Request  # module level: FastAPI resolves route annotations from module globals

from .config import load_config

RECHECK_SECONDS = 30
CSRF_HEADER_VALUE = "awernasa"   # POST /api/cognitive/sessions needs X-Requested-With: awernasa (anti-CSRF)
DB_HINT = ("Check that Tailscale is connected to the team network and that the password in MOTHER/.env is right "
           "(run start again with --setup to re-enter it).")


class Live:
    """One cached, background-computed dataset keyed by the database version."""

    def __init__(self, name, compute):
        self.name, self.compute = name, compute
        self.lock = threading.Lock()
        self.version = self.data = self.error = None
        self.progress, self.message = 0.0, "Waiting"
        self.running = False
        self.checked = 0.0
        self.failed = (None, 0.0)   # (version, when) of the last failed computation

    def _run(self, version):
        try:
            data = self.compute(version, self._progress)
            with self.lock:
                self.data, self.version, self.error = data, version, None
        except Exception as e:  # keep serving the previous result if there is one
            traceback.print_exc()
            with self.lock:
                self.error = f"{type(e).__name__}: {e}"
                self.failed = (version, time.time())
        finally:
            with self.lock:
                self.running = False

    def _progress(self, p, msg):
        with self.lock:
            self.progress, self.message = p, msg

    def ensure(self):
        now = time.time()
        if now - self.checked < RECHECK_SECONDS and (self.data is not None or self.running):
            return
        self.checked = now
        try:
            version = db_version()
        except Exception as e:
            with self.lock:
                self.error = f"Cannot reach the team database ({type(e).__name__})"
            return
        with self.lock:
            if self.running or version == self.version:
                return
            if self.failed[0] == version and now - self.failed[1] < 120:
                return  # do not retry a failing computation on every page poll
            self.running, self.progress, self.message, self.error = True, 0.0, "Reading the database…", None
        threading.Thread(target=self._run, args=(version,), daemon=True).start()

    def response(self):
        self.ensure()
        with self.lock:
            if self.data is not None:
                return {"status": "ready", "updating": self.running, "version": self.version, "data": self.data}
            if self.error and not self.running:
                return {"status": "error", "message": self.error, "hint": DB_HINT}
            return {"status": "computing", "progress": self.progress, "message": self.message}


def db_version() -> str:
    from .db_mission import database_version
    from .db_source import TeamDatabase
    db = TeamDatabase()
    try:
        return database_version(db)
    finally:
        db.close()


def compute_dashboard(version, progress):
    from .db_mission import load_mission
    from .db_source import TeamDatabase
    from .engine import Mother
    from .payload import build_payload
    from .real_data import real_data_report
    from .repository import InMemoryRepository

    cfg = load_config()
    db = TeamDatabase()
    try:
        progress(0.01, "Loading the mission from the database…")
        mission, ms, info = load_mission(db, cfg, os.environ.get("MOTHER_MISSION") or None)
        kind = "synthetic data, labelled" if info["is_synthetic"] else "real data"
        labs = {}
        for a in mission.crew:
            panel, _ = db.lab_panel(a.id, a.id, datetime.now(timezone.utc))
            labs[a.id] = {"panel": panel, "subject": a.id,
                          "note": f"Blood panels for {a.id} from the team database ({kind}; reference ranges matched to sex). "
                                  "L = before launch, R = after landing."}
    finally:
        db.close()
    progress(0.03, "Reading real NASA data (space weather, ISS cabin, bed rest)…")
    try:
        real = real_data_report(cfg, None)
    except Exception:
        traceback.print_exc()
        real = {"space_weather": None, "iss_cabin": None, "bone": None}
    real["labs"] = labs
    real["generated_at"] = datetime.now(timezone.utc).isoformat()
    mother = Mother(InMemoryRepository(), mission, cfg)
    progress(0.05, f"Checking {len(ms):,} measurements through the quality gate…")
    report = mother.ingest(ms, now=mission.end + timedelta(days=60))
    data = build_payload(mother, mission, cfg, labs={a.id: [] for a in mission.crew}, real=real,
                         info={"label": f"DATABASE · {info['mission_name']} · {kind} · not medical advice",
                               "mission_name": info["mission_name"], "version": version,
                               "rejected": len(report.rejected), "measurements": len(ms)},
                         progress=lambda p, m: progress(0.05 + 0.95 * p, m))
    return data


def compute_data_map(version, progress):
    from .data_map import build
    progress(0.2, "Reading the database…")
    return build()


DASHBOARD = Live("dashboard", compute_dashboard)
DATA_MAP = Live("data-map", compute_data_map)


def create_app():
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse
    from pydantic import ValidationError

    app = FastAPI(title="MOTHER", docs_url="/api/docs")

    @app.get("/")
    def index():
        """MOTHER is API-only; the user interface is the GUI/ app."""
        return {"service": "MOTHER", "ui": "GUI/ (React app)", "docs": "/api/docs",
                "endpoints": ["/api/status", "/api/subjects", "/api/organs", "/api/organs/{code}",
                              "/api/habitat", "/api/dashboard", "/api/data-map", "/api/cognitive/protocols", "/api/cognitive/{subject}",
                              "POST /api/cognitive/sessions"]}

    @app.get("/api/dashboard")
    def api_dashboard():
        return JSONResponse(DASHBOARD.response(), headers={"Cache-Control": "no-store"})

    @app.get("/api/data-map")
    def api_data_map():
        r = DATA_MAP.response()
        if r["status"] == "computing":  # small and fast: wait for it instead of making the page poll
            for _ in range(60):
                time.sleep(0.5)
                r = DATA_MAP.response()
                if r["status"] != "computing":
                    break
        return JSONResponse(r, headers={"Cache-Control": "no-store"})

    # ---------------- simple contract for the UI (see MOTHER/UI_CONTRACT.md) ----------------
    def _db_call(fn):
        from .db_source import TeamDatabase
        try:
            db = TeamDatabase()
        except Exception as e:
            return JSONResponse({"error": f"Cannot reach the team database ({type(e).__name__})", "hint": DB_HINT}, status_code=503)
        try:
            return JSONResponse(fn(db), headers={"Cache-Control": "no-store"})
        except KeyError as e:
            return JSONResponse({"error": f"Unknown person {e}"}, status_code=404)
        finally:
            db.close()

    @app.get("/api/subjects")
    def api_subjects():
        from .organs import list_subjects
        return _db_call(list_subjects)

    @app.get("/api/organs")
    def api_organs_overview():
        from .organs import overview
        return _db_call(overview)

    @app.get("/api/organs/{subject}")
    def api_organs(subject: str, day: int | None = None, sol: int | None = None, mission: str | None = None):
        from .organs import organ_report
        return _db_call(lambda db: organ_report(db, subject, day=day, sol=sol, mission=mission))

    @app.get("/api/habitat")
    def api_habitat(sol: int | None = None):
        """Habitat zones with their sensor readings for one sol (default: the latest sol with data)."""
        from .habitat import habitat_report
        return _db_call(lambda db: habitat_report(db, sol=sol))

    # ---------------- cognitive tests (MOTHER/UI_CONTRACT.md v1.2, config/cognitive/CONTRACT.md) ----------------
    # /protocols is declared before /{subject} so it is never captured as a person's code.
    @app.get("/api/cognitive/protocols")
    def api_cognitive_protocols():
        from . import cognitive
        return JSONResponse(cognitive.protocols(), headers={"Cache-Control": "no-store"})

    @app.get("/api/cognitive/{subject}")
    def api_cognitive(subject: str):
        from . import cognitive
        return _db_call(lambda db: cognitive.cognitive_report(db, subject))

    @app.post("/api/cognitive/sessions")
    async def api_cognitive_save(request: Request):
        from starlette.concurrency import run_in_threadpool
        from . import cognitive
        nostore = {"Cache-Control": "no-store"}
        if request.headers.get("x-requested-with") != CSRF_HEADER_VALUE:
            return JSONResponse({"error": f"Header X-Requested-With: {CSRF_HEADER_VALUE} is required"}, status_code=403,
                                headers=nostore)
        too_big = JSONResponse({"error": f"Body larger than {cognitive.MAX_BODY_BYTES} bytes"}, status_code=413, headers=nostore)
        try:
            if int(request.headers.get("content-length") or 0) > cognitive.MAX_BODY_BYTES:
                return too_big
        except ValueError:
            return JSONResponse({"error": "Bad Content-Length"}, status_code=400, headers=nostore)
        body = bytearray()
        async for chunk in request.stream():
            body += chunk
            if len(body) > cognitive.MAX_BODY_BYTES:
                return too_big
        try:
            raw = json.loads(bytes(body) or b"null")
            payload = cognitive.CognitiveSession.model_validate(raw)
        except ValidationError as e:
            return JSONResponse({"error": "Invalid session", "detail": cognitive.validation_errors(e)}, status_code=422,
                                headers=nostore)
        except ValueError:
            return JSONResponse({"error": "Body is not valid JSON"}, status_code=422, headers=nostore)

        def work():
            from . import db_writer
            try:
                conn = db_writer.connect()
            except db_writer.WriterNotConfigured as e:
                return JSONResponse({"error": f"Cognitive writer is not configured ({e})", "hint": db_writer.WRITER_HINT},
                                    status_code=503, headers=nostore)
            except Exception as e:
                return JSONResponse({"error": f"Cannot reach the team database ({type(e).__name__})", "hint": DB_HINT},
                                    status_code=503, headers=nostore)
            try:
                result, created = cognitive.save_session(conn, payload)
            except cognitive.SessionNotFound as e:
                return JSONResponse({"error": str(e)}, status_code=404, headers=nostore)
            except Exception as e:
                traceback.print_exc()
                return JSONResponse({"error": f"Session was not saved ({type(e).__name__})", "hint": DB_HINT},
                                    status_code=503, headers=nostore)
            finally:
                try:
                    conn.close()
                except Exception:  # pragma: no cover
                    pass
            return JSONResponse(result, status_code=201 if created else 200, headers=nostore)

        return await run_in_threadpool(work)

    @app.get("/api/status")
    def api_status():
        try:
            version, ok, err = db_version(), True, None
        except Exception as e:
            version, ok, err = None, False, f"{type(e).__name__}"
        d = DASHBOARD
        return {"database": {"reachable": ok, "version": version, "error": err, "hint": None if ok else DB_HINT},
                "dashboard": {"ready": d.data is not None, "computing": d.running, "progress": d.progress,
                              "message": d.message, "error": d.error}}

    return app


def free_port(start: int) -> int:
    for port in range(start, start + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return port
    return start


def main():
    ap = argparse.ArgumentParser(description="Run the MOTHER API on this computer")
    ap.add_argument("--port", type=int, default=int(os.environ.get("MOTHER_PORT", 8000)))
    ap.add_argument("--no-browser", action="store_true", help="kept for compatibility; MOTHER no longer opens a browser")
    args = ap.parse_args()

    import uvicorn
    from .db import settings
    settings()  # fail early with a clear message if MOTHER/.env is missing
    port = free_port(args.port)
    url = f"http://localhost:{port}"
    print(f"\n  MOTHER API is running:  {url}/api/status\n  API docs:               {url}/api/docs\n"
          "  User interface:         run the GUI app (GUI/README.md)\n  Stop with Ctrl+C.\n", flush=True)
    threading.Thread(target=DASHBOARD.ensure, daemon=True).start()   # start the long analysis right away
    # MOTHER_HOST lets the Docker image listen on 0.0.0.0 inside the container; default stays local-only.
    uvicorn.run(create_app(), host=os.environ.get("MOTHER_HOST", "127.0.0.1"), port=port, log_level="warning")


if __name__ == "__main__":
    main()
