"""The mastering engines (tiers): what each one actually does differently.

Both engines share everything that decides WHAT to change: analysis,
problem detection, confidence gates, budgets, the plan, EQ, de-essing,
saturation, stereo, evaluation/backoff and final QC. A Standard master is
never a deliberately degraded one. The engines differ only in how one
stage is rendered:

* **Multiband compression split.** When the plan enables compression,
  Professional splits the low end into sub (<90 Hz) and punch (90-250 Hz),
  so kick/bass fundamentals get their own attack instead of sharing one
  20-250 Hz band with the sub.

Both engines use the same ramped-attack true-peak limiter
(bus_processing._true_peak_limiter). A Professional-only limiter was
tried and dropped: once the shared limiter gained its own ramped attack,
the difference measured within noise on real tracks.

Because compression only runs when the plan finds a need, most masters
render identically on both engines. Anything that should make them differ
belongs in an EngineSpec here, not in a `tier == "professional"` check.
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

    def describe(self) -> dict:
        return {"engine": self.name, "label": self.label, "limiter": self.limiter, "compression_bands": list(self.compression_bands), "features": list(self.features)}


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
    limiter="ramped-attack true-peak limiter (shared with Standard)",
    features=(
        "everything in Standard",
        "5-band compression with separate sub and punch bands",
    ),
)

ENGINES: dict[str, EngineSpec] = {e.name: e for e in (STANDARD, PROFESSIONAL)}


def get_engine(tier: str | None) -> EngineSpec:
    """Unknown or missing tiers fall back to Standard, as everywhere else."""
    return ENGINES.get(tier or "standard", STANDARD)
