"""Engine capabilities: shared diagnosis and safety, distinct workflows.

Professional adds separate sub/punch compression and one measured
refinement trial when peak processing is active and render budget remains.
Healthy sources may still match: processing requires a measured benefit.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from .bus_processing import _bus_process, _bus_process_pro


@dataclass(frozen=True)
class EngineSpec:
    name: str
    label: str
    compression_crossovers_hz: tuple[float, ...]
    compression_bands: tuple[str, ...]
    bus: Callable
    limiter: str
    features: tuple[str, ...]
    refinement_trials: int = 0

    def describe(self) -> dict:
        return {"engine": self.name, "label": self.label, "limiter": self.limiter, "compression_bands": list(self.compression_bands), "refinement_trials": self.refinement_trials, "features": list(self.features)}


STANDARD = EngineSpec(
    name="standard",
    label="Standard",
    compression_crossovers_hz=(250.0, 2000.0, 6000.0),
    compression_bands=("low", "low_mid", "high_mid", "high"),
    bus=_bus_process,
    limiter="ramped-attack true-peak limiter (1 ms lookahead)",
    features=(
        "adaptive analysis, EQ correction and loudness targeting",
        "true-peak limiting to the delivery ceiling",
        "4-band compression when the source needs it",
    ),
)

PROFESSIONAL = EngineSpec(
    name="professional",
    label="Professional",
    compression_crossovers_hz=(90.0, 250.0, 2000.0, 6000.0),
    compression_bands=("sub", "punch", "low_mid", "high_mid", "high"),
    bus=_bus_process_pro,
    refinement_trials=1,
    limiter="ramped-attack true-peak limiter (shared with Standard)",
    features=(
        "everything in Standard",
        "5-band compression with separate sub and punch bands",
        "measured comparison with a gentler render inside the shared safety budget",
    ),
)

ENGINES: dict[str, EngineSpec] = {e.name: e for e in (STANDARD, PROFESSIONAL)}


def get_engine(tier: str | None) -> EngineSpec:
    """Unknown or missing tiers fall back to Standard, as everywhere else."""
    return ENGINES.get(tier or "standard", STANDARD)
