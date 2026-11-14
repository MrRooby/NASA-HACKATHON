"""Static, offline snapshot of the dashboard on MOTHER's own seeded simulator (no database needed).

    python -m mother.export_demo        -> MOTHER/exports/mother_dashboard.html (single file, opens anywhere)

The live version of the same page is served by `python -m mother.server` and reads the team database.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from .config import MOTHER_DIR, load_config
from .engine import Mother
from .payload import build_payload
from .repository import InMemoryRepository
from .simulator import DEMO_SCENARIOS, SCENARIO_KINDS, MissionSimulator


def build(out_path: Path | None = None, days: int = 180) -> Path:
    cfg = load_config()
    sim = MissionSimulator(days=days, scenarios=DEMO_SCENARIOS, cfg=cfg)
    mother = Mother(InMemoryRepository(), sim.mission, cfg)
    mother.ingest(sim.generate(), now=sim.time_of(days + 1))

    real = None
    try:  # optional: real NASA data section, only when the team database is reachable
        from .real_data import real_data_report
        real = real_data_report(cfg, sim.mission)
        print("  real data from team database: OK", file=sys.stderr)
    except Exception as e:
        print(f"  real data from team database: skipped ({type(e).__name__}: {e})", file=sys.stderr)

    scenarios = [{"kind": s.kind, "fd": s.start_fd, "dur": s.duration_days, "who": s.subject,
                  "desc": SCENARIO_KINDS[s.kind]} for s in DEMO_SCENARIOS]
    data = build_payload(mother, sim.mission, cfg, scenarios=scenarios, real=real,
                         info={"label": "SIMULATED DATA · MOTHER seeded simulator · not medical advice"},
                         progress=lambda p, m: print(f"  {m}", file=sys.stderr) if int(p * 100) % 25 == 0 else None)

    template = (MOTHER_DIR / "web" / "dashboard.html").read_text(encoding="utf-8")
    html = template.replace("/*__MOTHER_DATA__*/null", json.dumps(data, separators=(",", ":"), ensure_ascii=False, default=str))
    out = out_path or (MOTHER_DIR / "exports" / "mother_dashboard.html")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size / 1e6:.1f} MB)", file=sys.stderr)
    return out


if __name__ == "__main__":
    build()
