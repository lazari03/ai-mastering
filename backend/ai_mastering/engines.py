"""The mastering engines (tiers): what each one actually does differently.

Both engines share everything that decides WHAT to change: analysis,
problem detection, confidence gates, budgets, the plan, EQ, de-essing,
saturation, stereo, evaluation/backoff and final QC. A Standard master is
never a deliberately degraded one. The engines differ only in HOW two
stages are rendered, and each difference was kept only after it measured
better (see benchmark/engine_compare.py):

* **Limiter.** Standard anticipates a peak with a gain STEP 3 ms ahead of
  it. Professional approaches every step with a 2 ms linear ramp and is
  identical from the step on (bus_processing._true_peak_limiter_ramped),
  with the same ceiling guarantee. Limiter alone, drum-heavy synthetic mix
  pushed 9 dB into the ceiling: drum punch lost 0.286 vs 0.394 (27% less)
  at the same loudness and -1.0 dBTP, slightly less splatter on a
  bass-hit probe (-25.2 vs -24.6 dB), at the cost of marginally deeper
  HF ducking under hits (5th percentile -1.76 vs -1.62 dB). A symmetric
  (box) smoothing was tried first and rejected: cleaner on paper, but it
  extended reduction past each peak and LOST punch (0.653).
* **Multiband compression split.** When the plan enables compression,
  Professional splits the low end into sub (<90 Hz) and punch (90-250 Hz),
  so kick/bass fundamentals get their own attack instead of sharing one
  20-250 Hz band with the sub.

Anything tier-dependent belongs in an EngineSpec here, not in a
`tier == "professional"` check elsewhere.
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
    limiter="true-peak lookahead limiter (3 ms)",
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
    limiter="ramped-attack true-peak limiter: keeps more drum punch at the same loudness",
    features=(
        "everything in Standard",
        "ramped-attack limiter: keeps more of the drums' punch at the same loudness and ceiling",
        "5-band compression with separate sub and punch bands",
    ),
)

ENGINES: dict[str, EngineSpec] = {e.name: e for e in (STANDARD, PROFESSIONAL)}


def get_engine(tier: str | None) -> EngineSpec:
    """Unknown or missing tiers fall back to Standard, as everywhere else."""
    return ENGINES.get(tier or "standard", STANDARD)
