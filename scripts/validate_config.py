#!/usr/bin/env python3
"""Validate config/*.json: JSON syntax, source ids resolve, threshold bands are ordered and non-overlapping.

Usage: python3 scripts/validate_config.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config"
STATUSES = {"ok", "caution", "alert"}
BASES = {"source", "team_assumption"}

errors: list[str] = []


def load(name):
    path = CONFIG / name
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        errors.append(f"{name}: invalid JSON: {e}")
        return None


def collect_source_refs(node, where, out):
    """Find every 'sources' list anywhere in the tree."""
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "sources" and isinstance(v, list):
                out.extend((where, s) for s in v)
            else:
                collect_source_refs(v, f"{where}.{k}" if where else k, out)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            label = v.get("id", i) if isinstance(v, dict) else i
            collect_source_refs(v, f"{where}[{label}]", out)


def check_bands(ind):
    bands = ind.get("bands")
    if not bands:
        return
    iid = ind["id"]
    prev_max = None
    for i, b in enumerate(bands):
        if b.get("status") not in STATUSES:
            errors.append(f"{iid} band {i}: bad status {b.get('status')!r}")
        if b.get("basis") not in BASES:
            errors.append(f"{iid} band {i}: bad basis {b.get('basis')!r}")
        lo, hi = b.get("min"), b.get("max")
        if i > 0 and lo is None:
            errors.append(f"{iid} band {i}: only the first band may omit 'min'")
        if i < len(bands) - 1 and hi is None:
            errors.append(f"{iid} band {i}: only the last band may omit 'max'")
        if lo is not None and hi is not None and lo >= hi:
            errors.append(f"{iid} band {i}: min {lo} >= max {hi}")
        if prev_max is not None and lo is not None and lo != prev_max:
            errors.append(f"{iid} band {i}: gap/overlap — min {lo} != previous max {prev_max}")
        prev_max = hi


def main():
    sources_doc = load("sources.json")
    thresholds = load("thresholds.json")
    measurements = load("inflight_measurements.json")
    if errors:
        print("\n".join(errors))
        return 1

    known = set(sources_doc["sources"])
    refs: list = []
    collect_source_refs(thresholds, "thresholds", refs)
    collect_source_refs(measurements, "inflight_measurements", refs)
    used = set()
    for where, sid in refs:
        used.add(sid)
        if sid not in known:
            errors.append(f"{where}: unknown source id {sid!r}")

    ids = [i["id"] for i in thresholds["indicators"]]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        errors.append(f"duplicate indicator ids: {sorted(dupes)}")
    for ind in thresholds["indicators"]:
        check_bands(ind)

    unused = sorted(known - used)
    if errors:
        print("FAIL")
        print("\n".join(f"  - {e}" for e in errors))
        return 1
    print(f"OK: {len(ids)} indicators, {len(measurements['confirmed'])} confirmed in-flight measurements, "
          f"{len(known)} sources ({len(refs)} references).")
    if unused:
        print(f"note: sources not referenced anywhere: {unused}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
