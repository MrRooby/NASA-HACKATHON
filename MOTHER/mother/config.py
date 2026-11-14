"""Load the team's shared configuration (repo-root `config/*.json`) plus MOTHER's own knowledge graph.

The shared files are read-only for MOTHER: they are owned by the whole team and validated by
`scripts/validate_config.py`. MOTHER-specific knowledge lives in `MOTHER/config/`.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

from .models import Status

PACKAGE_DIR = Path(__file__).resolve().parent
MOTHER_DIR = PACKAGE_DIR.parent
REPO_ROOT = MOTHER_DIR.parent


def shared_config_dir() -> Path:
    """Team-wide config/ at the repo root; falls back to the copy in MOTHER/config/shared when only the
    MOTHER folder was downloaded."""
    if os.environ.get("MOTHER_SHARED_CONFIG"):
        return Path(os.environ["MOTHER_SHARED_CONFIG"])
    repo = REPO_ROOT / "config"
    return repo if (repo / "thresholds.json").exists() else MOTHER_DIR / "config" / "shared"


def mother_config_dir() -> Path:
    return Path(os.environ.get("MOTHER_CONFIG", MOTHER_DIR / "config"))


def data_dir() -> Path:
    return Path(os.environ.get("MOTHER_DATA", REPO_ROOT / "data"))


def _load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


@dataclass(frozen=True)
class Band:
    status: Status
    basis: str
    message: str
    min: float | None = None
    max: float | None = None
    action: str | None = None
    escalate: bool = False

    def contains(self, value: float) -> bool:
        # 'min' inclusive, 'max' exclusive, omitted = unbounded (see thresholds.json _about)
        if self.min is not None and value < self.min:
            return False
        if self.max is not None and value >= self.max:
            return False
        return True


@dataclass(frozen=True)
class Indicator:
    id: str
    label: str
    unit: str
    category: str
    evaluation: str
    bands: tuple[Band, ...] = ()
    rolling_rules: tuple[dict[str, Any], ...] = ()
    baseline_rule: dict[str, Any] | None = None
    sources: tuple[str, ...] = ()
    spaceflight_context: str | None = None
    raw: dict[str, Any] = field(default_factory=dict, compare=False, hash=False)

    def band_for(self, value: float) -> Band | None:
        for b in self.bands:
            if b.contains(value):
                return b
        return None


@dataclass(frozen=True)
class Environment:
    id: str
    label: str
    gravity_g: float
    dose_mSv_per_day: float
    comm_delay_one_way_s: tuple[float, float]
    magnetosphere_protected: bool


@dataclass
class Config:
    indicators: dict[str, Indicator]
    environments: dict[str, Environment]
    radiation_limits: dict[str, Any]
    lab_panels: dict[str, Any]
    inflight_measurements: dict[str, Any]
    sources: dict[str, Any]
    knowledge: dict[str, Any]

    def indicator(self, indicator_id: str) -> Indicator | None:
        return self.indicators.get(indicator_id)


def _parse_indicator(d: dict[str, Any]) -> Indicator:
    bands = tuple(
        Band(
            status=Status(b["status"]),
            basis=b.get("basis", "source"),
            message=b.get("message", ""),
            min=b.get("min"),
            max=b.get("max"),
            action=b.get("action"),
            escalate=bool(b.get("escalate", False)),
        )
        for b in d.get("bands", [])
    )
    return Indicator(
        id=d["id"],
        label=d.get("label", d["id"]),
        unit=d.get("unit", ""),
        category=d.get("category", "other"),
        evaluation=d.get("evaluation", "absolute"),
        bands=bands,
        rolling_rules=tuple(d.get("rolling_rules", [])),
        baseline_rule=d.get("baseline_rule"),
        sources=tuple(d.get("sources", [])),
        spaceflight_context=d.get("spaceflight_context"),
        raw=d,
    )


@lru_cache(maxsize=4)
def load_config(shared_dir: str | None = None, mother_dir: str | None = None) -> Config:
    sdir = Path(shared_dir) if shared_dir else shared_config_dir()
    mdir = Path(mother_dir) if mother_dir else mother_config_dir()

    thresholds = _load(sdir / "thresholds.json")
    inflight = _load(sdir / "inflight_measurements.json")
    sources = _load(sdir / "sources.json").get("sources", {})
    knowledge = _load(mdir / "knowledge_graph.json")

    indicators = {d["id"]: _parse_indicator(d) for d in thresholds["indicators"]}
    # MOTHER's auxiliary indicators (symptoms, raw inputs) extend — never override — the shared ones.
    for d in knowledge.get("auxiliary_indicators", []):
        indicators.setdefault(d["id"], _parse_indicator(d))

    environments = {
        e["id"]: Environment(
            id=e["id"],
            label=e["label"],
            gravity_g=e["gravity_g"],
            dose_mSv_per_day=e["dose_equivalent_mSv_per_day"],
            comm_delay_one_way_s=tuple(e["comm_delay_one_way_s"]),
            magnetosphere_protected=e["magnetosphere_protected"],
        )
        for e in thresholds["environments"]
    }
    return Config(
        indicators=indicators,
        environments=environments,
        radiation_limits=thresholds.get("radiation_organ_limits_mGyEq", {}),
        lab_panels=thresholds.get("lab_panels", {}),
        inflight_measurements=inflight,
        sources=sources,
        knowledge=knowledge,
    )
