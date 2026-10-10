"""A deterministic synthetic corpus for benchmark/regression.py.

The real-world corpus (benchmark/corpus/, licensed mixes, git-ignored) is the
evidence that matters, but it isn't available in CI. This builds the same
layout (<id>/mix.wav + meta.json) from the calibrated fixtures in
tests/synthetic.py, so every engine change can be compared against a
committed baseline (benchmark/baselines/synthetic.json) on every push.

What it can and can't tell you: the fixtures have KNOWN tonal state, so a
change in how much of a flaw is corrected, how much punch is lost, which
candidate ships, or whether a case stops delivering shows up exactly. It
says nothing about how real music sounds; that needs the real corpus and
ears (benchmark/calibration_ab.py).

Usage (from backend/):
  python -m benchmark.regression --synthetic --baseline benchmark/baselines/synthetic.json
  python -m benchmark.regression --synthetic --write benchmark/baselines/synthetic.json   # after a REVIEWED change
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "tests"))

from synthetic import SR, make_mix  # noqa: E402

SECONDS = 10.0

# id: (make_mix kwargs, meta). Each line names the behaviour it pins.
TRACKS: dict[str, tuple[dict, dict]] = {
    # healthy material must stay (nearly) untouched
    "healthy_pop": (dict(healthy_variation_db=1.0), {"genre": "pop"}),
    "healthy_master_pop": (dict(lufs=-10.5, limit_db=-4.0, healthy_variation_db=0.8), {"genre": "pop"}),
    # the historical failure: bass loss / HF boost
    "bass_heavy_hiphop": (dict(offsets_db=[(40, 250, 6.5)]), {"genre": "hiphop"}),
    "thin_edm": (dict(offsets_db=[(40, 300, -7.0)]), {"genre": "edm"}),
    "dark_rock": (dict(offsets_db=[(3000, 20000, -7.5)]), {"genre": "rock"}),
    "bright_harsh_pop": (dict(offsets_db=[(2500, 9000, 6.5)]), {"genre": "pop"}),
    "regression_mix_pop": (dict(offsets_db=[(140, 450, 6.0), (5500, 10000, 4.0), (14000, 20000, -5.0)]), {"genre": "pop"}),
    "boomy_extreme_trap": (dict(offsets_db=[(40, 250, 12.0)]), {"genre": "trap"}),
    # dynamics / transients
    "rock_transient": (dict(drum_level=1.2, healthy_variation_db=0.5), {"genre": "rock"}),
    "already_limited_edm": (dict(lufs=-9.0, limit_db=-6.0), {"genre": "edm"}),
    "quiet_dynamic_jazz": (dict(lufs=-26.0, section_depth_db=6.0, drum_level=1.0), {"genre": "jazz"}),
    # stereo
    "wide_low_techno": (dict(low_end_width=0.6), {"genre": "techno"}),
    # Standard vs Professional on the material where they can differ
    "rock_transient_pro": (dict(drum_level=1.2, healthy_variation_db=0.5), {"genre": "rock", "tier": "professional"}),
    "bass_heavy_hiphop_pro": (dict(offsets_db=[(40, 250, 6.5)]), {"genre": "hiphop", "tier": "professional"}),
    # The one case the engines render differently: the plan compresses
    # (micro-dynamics need ~0.5) and Professional splits sub/punch.
    "dense_drums_edm": (dict(lufs=-22.0, drum_level=2.0), {"genre": "edm"}),
    "dense_drums_edm_pro": (dict(lufs=-22.0, drum_level=2.0), {"genre": "edm", "tier": "professional"}),
}

# Inputs that need post-processing after make_mix.
SPECIAL = {
    "clipped_metal": ({"genre": "metal"}, lambda x: np.clip(x * 10 ** (14 / 20), -1.0, 1.0)),
    "mono_acoustic": ({"genre": "acoustic"}, lambda x: x.mean(axis=1)),
    "one_dead_channel_rnb": ({"genre": "rnb"}, lambda x: np.stack([x[:, 0], np.zeros(len(x), np.float32)], axis=1)),
    "short_3s_pop": ({"genre": "pop"}, lambda x: x[: int(SR * 3.0)]),
}


def build(corpus: Path) -> Path:
    corpus.mkdir(parents=True, exist_ok=True)
    # A *_pro track reuses its Standard twin's seed: the same audio on the
    # other engine, so the two rows are directly comparable.
    seeds = {name: 100 + i for i, name in enumerate(n for n in TRACKS if not n.endswith("_pro"))}
    for name, (kw, meta) in TRACKS.items():
        _write(corpus / name, make_mix(seconds=SECONDS, seed=seeds[name.removesuffix("_pro")], **kw), SR, meta)
    for i, (name, (meta, transform)) in enumerate(SPECIAL.items()):
        _write(corpus / name, transform(make_mix(seconds=SECONDS, seed=200 + i)).astype(np.float32), SR, meta)
    # Non-44.1 kHz source: rendered at its own rate.
    import librosa

    x = make_mix(seconds=SECONDS, seed=300)
    _write(corpus / "pop_48k", librosa.resample(x.T, orig_sr=SR, target_sr=48000).T.astype(np.float32), 48000, {"genre": "pop"})
    return corpus


def _write(track_dir: Path, audio: np.ndarray, sr: int, meta: dict) -> None:
    track_dir.mkdir(parents=True, exist_ok=True)
    sf.write(str(track_dir / "mix.wav"), audio, sr, subtype="FLOAT")
    (track_dir / "meta.json").write_text(json.dumps({**meta, "license": "synthetic (tests/synthetic.py)"}))
