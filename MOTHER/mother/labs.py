"""Blood panels from the real Inspiration4 crew data (NASA OSDR OSD-575 CMP, OSD-569 CBC).

Rule from thresholds.json `lab_panels`: use each row's own reference range; in range = ok, outside = caution,
outside on 2 consecutive draws = alert (team assumption).
"""
from __future__ import annotations

import csv
import re
from collections import defaultdict
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

from .config import Config, REPO_ROOT
from .models import Finding, FindingKind, Status


def _tp_key(tp: str) -> int:
    m = re.match(r"([LR])([+-])(\d+)", tp.strip())
    if not m:
        return 0
    n = int(m.group(3))
    return -n if m.group(1) == "L" else 10_000 + n  # all preflight draws sort before all postflight


def _num(s: str) -> float | None:
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


@lru_cache(maxsize=4)
def load_lab_rows(files: tuple[str, ...]) -> list[dict[str, Any]]:
    rows = []
    for f in files:
        p = REPO_ROOT / f
        if not p.exists():
            continue
        with p.open(encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                tp = r.get("timepoint") or r.get("TEST_DATE") or ""
                rows.append({"analyte": r["ANALYTE"].strip(), "value": _num(r["VALUE"]),
                             "min": _num(r["RANGE_MIN"]), "max": _num(r["RANGE_MAX"]), "units": r["UNITS"],
                             "panel": r["TEST_TYPE"], "subject": r["SUBJECT_ID"], "timepoint": tp.strip(),
                             "file": Path(f).name})
    return rows


def _status(v, lo, hi) -> tuple[Status, int]:
    if v is None:
        return Status.OK, 0
    if lo is not None and v < lo:
        return Status.CAUTION, -1
    if hi is not None and v > hi:
        return Status.CAUTION, +1
    return Status.OK, 0


def lab_panel(cfg: Config, lab_subject: str, astronaut_id: str, now: datetime) -> tuple[list[dict], list[Finding]]:
    files = tuple(cfg.lab_panels.get("files", []))
    by_analyte: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for r in load_lab_rows(files):
        if r["subject"] == lab_subject:
            by_analyte[(r["panel"], r["analyte"])].append(r)

    risk_map = cfg.knowledge.get("lab_analyte_risks", {})
    panel, findings = [], []
    for (pnl, analyte), rows in sorted(by_analyte.items()):
        rows.sort(key=lambda r: _tp_key(r["timepoint"]))
        pts = []
        prev_dir = 0
        for r in rows:
            st, d = _status(r["value"], r["min"], r["max"])
            if d and d == prev_dir:
                st = Status.ALERT
            prev_dir = d
            pts.append({"timepoint": r["timepoint"], "value": r["value"], "status": st.value})
        last = rows[-1]
        last_status = Status(pts[-1]["status"])
        panel.append({"panel": pnl, "analyte": analyte, "units": last["units"], "range": [last["min"], last["max"]],
                      "points": pts, "latest_status": last_status.value, "risk": risk_map.get(analyte),
                      "source_file": last["file"]})
        if last_status != Status.OK:
            risk = risk_map.get(analyte)
            src = "osdr_osd575" if pnl == "CMP" else "osdr_osd569"
            findings.append(Finding(
                subject_id=astronaut_id, kind=FindingKind.LAB, status=last_status,
                title=f"Lab {analyte}: {last['value']} {last['units']} outside reference range",
                rule_id=f"lab.{pnl}.{analyte}", ts=now, indicator_id=None,
                action="Discuss at the next Private Medical Conference." if last_status == Status.CAUTION
                else "Out of range on two consecutive draws - report to flight surgeon.",
                escalate=last_status == Status.ALERT, basis="team_assumption",
                evidence={"analyte": analyte, "value": last["value"], "range": [last["min"], last["max"]],
                          "timepoint": last["timepoint"], "history": pts, "lab_subject": lab_subject, "real_data": True},
                sources=[src], risks=[risk] if risk else [],
                explanation=(f"Real Inspiration4 crew data ({lab_subject}, {pnl}, {last['timepoint']}): {analyte} = "
                             f"{last['value']} {last['units']}, lab range {last['min']}-{last['max']}."),
            ))
    return panel, findings
