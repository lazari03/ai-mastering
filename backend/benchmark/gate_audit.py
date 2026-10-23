"""Gate audit: how much of a KNOWN tonal flaw each calibration corrects,
and whether it touches mixes that have nothing wrong.

Fixtures are the calibrated synthetic mixes from tests/synthetic.py: a mix
is pulled onto the neutral curve, then one region is offset by a known
amount (dB). For each flaw x size, this plans a master (no render needed:
the EQ's exact filter response is what the renderer applies) and reports
the mean correction delivered inside the flawed region, in dB toward
fixing it. Healthy fixtures carry only random ripple inside the tolerance
window and should get no moves at all.

Usage (from backend/):
  python -m benchmark.gate_audit                       # every calibration
  python -m benchmark.gate_audit balanced assertive
"""

from __future__ import annotations

import sys
from functools import lru_cache
from pathlib import Path

import numpy as np

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "tests"))

from ai_mastering.analysis.profile import SourceProfile  # noqa: E402
from ai_mastering.audio_utils import _analysis_from_audio  # noqa: E402
from ai_mastering.diagnostics.problems import detect_mastering_problems  # noqa: E402
from ai_mastering.planning import config as C  # noqa: E402
from ai_mastering.planning.plan import build_mastering_plan  # noqa: E402
from ai_mastering.planning.target_model import build_target_context  # noqa: E402
from ai_mastering.processing.eq import band_response_db  # noqa: E402
from synthetic import SR, make_mix  # noqa: E402

# name: (lo_hz, hi_hz, sign of the flaw)
FLAWS = {
    "dark": (3000, 20000, -1),
    "bright": (2500, 9000, 1),
    "muddy": (180, 500, 1),
    "thin": (40, 250, -1),
    "boomy": (40, 250, 1),
    "boxy": (500, 1500, 1),
    "dull_air": (10000, 20000, -1),
    "recessed_mid": (1200, 4000, -1),
}
SIZES_DB = (2.0, 3.0, 4.0, 6.0)
SEEDS = (0, 1)


@lru_cache(maxsize=None)
def _profile(offsets: tuple, seed: int, ripple_db: float) -> SourceProfile:
    audio = make_mix(seconds=16.0, seed=seed, offsets_db=list(offsets), healthy_variation_db=ripple_db)
    return SourceProfile.from_dict(_analysis_from_audio(audio, SR)["source_profile"])


def _plan(profile: SourceProfile):
    ctx = build_target_context(profile.band_layout, "pop", [], "modern", None)
    return build_mastering_plan(profile, ctx, detect_mastering_problems(profile, ctx))


def audit(calibration: str) -> None:
    print(f"\n== {calibration}   (dB of the flaw corrected, mean of {len(SEEDS)} seeds)")
    with C.calibration(calibration):
        for name, (lo, hi, sign) in FLAWS.items():
            row = []
            for size in SIZES_DB:
                fixed = []
                for seed in SEEDS:
                    p = _profile(((lo, hi, sign * size),), seed, 0.5)
                    resp = band_response_db(_plan(p).eq_decisions, p.band_layout, p.sample_rate)
                    fixed.append(-sign * float(np.mean([resp[b["name"]] for b in p.band_layout if lo <= b["center_hz"] <= hi])))
                row.append(f"{size:.0f} dB -> {np.mean(fixed):+.2f}")
            print(f"  {name:13s}", "   ".join(row))
        for ripple in (1.0, 1.5, 2.0):
            moves, total = [], []
            for seed in range(10, 16):
                auto = [d for d in _plan(_profile((), seed, ripple)).eq_decisions if d.source == "automatic"]
                moves.append(len(auto))
                total.append(sum(abs(d.gain_db) for d in auto))
            print(f"  healthy +/-{ripple:.1f} dB ripple: {np.mean(moves):.1f} moves/track, total |gain| mean {np.mean(total):.2f} max {np.max(total):.2f} dB")


def main() -> int:
    names = sys.argv[1:] or list(C.CALIBRATIONS)
    for name in names:
        audit(name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
