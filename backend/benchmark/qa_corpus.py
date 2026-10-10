"""Deterministic QA corpus for the API-level audio lab (benchmark/api_qa.py).

Covers the 20 engineering categories the QA agent must exercise. Every case is
built from tests/synthetic.make_mix (calibrated fixtures with KNOWN tonal state)
plus a recorded transform, with a fixed seed, so the same case id always
produces byte-identical audio and the same input hash.

Synthetic signals validate engineering behaviour (does a flaw get corrected,
does a bad input get a clean refusal, does a format round-trip). They are not
music and say nothing about how a master sounds; that needs the licensed real
corpus (benchmark/corpus/, git-ignored) and human listening.
"""

from __future__ import annotations

import hashlib
import io
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import numpy as np
import soundfile as sf

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "tests"))

from synthetic import SR, make_mix  # noqa: E402

SECONDS = 10.0


@dataclass
class Case:
    id: str
    category: str
    genre: str
    mix: dict = field(default_factory=dict)          # make_mix kwargs (seconds defaults to SECONDS)
    seed: int = 0
    transform: Callable[[np.ndarray], np.ndarray] | None = None
    transform_desc: str = ""
    sr: int = SR
    subtype: str = "FLOAT"
    raw_bytes: bytes | None = None                    # invalid inputs bypass synthesis
    expect: str = "master"                            # "master" | "refuse" | "master_or_refuse"
    form: dict = field(default_factory=dict)          # extra /master form fields
    quick: bool = False                               # part of the --quick subset


def _resample(x: np.ndarray, sr: int) -> np.ndarray:
    import librosa

    return librosa.resample(x.T, orig_sr=SR, target_sr=sr).T.astype(np.float32)


def _gain_db(db: float) -> Callable[[np.ndarray], np.ndarray]:
    return lambda x: (x * 10 ** (db / 20)).astype(np.float32)


def _right_gain(db: float) -> Callable[[np.ndarray], np.ndarray]:
    def f(x):
        y = x.copy()
        y[:, 1] *= 10 ** (db / 20)
        return y
    return f


def _invert_right(x: np.ndarray) -> np.ndarray:
    y = x.copy()
    y[:, 1] *= -1.0
    return y


def _truncated_wav() -> bytes:
    buf = io.BytesIO()
    sf.write(buf, make_mix(seconds=2.0, seed=999), SR, format="WAV", subtype="PCM_16")
    return buf.getvalue()[:300]  # header + a few samples, declared length lies


CASES: list[Case] = [
    Case("c01_balanced_pop", "balanced stereo mix", "pop", dict(healthy_variation_db=1.0), seed=1, quick=True),
    Case("c02_bass_heavy_hiphop", "excessively bass-heavy", "hiphop", dict(offsets_db=[(40, 250, 8.0)]), seed=2, quick=True),
    Case("c03_thin_edm", "thin, insufficient bass", "edm", dict(offsets_db=[(40, 300, -7.0)]), seed=3),
    Case("c04_harsh_pop", "harsh high frequencies", "pop", dict(offsets_db=[(2500, 9000, 6.5)]), seed=4, quick=True),
    Case("c05_overcompressed_edm", "excessively compressed (pre-limited -8 LUFS)", "edm", dict(lufs=-8.0, limit_db=-8.0), seed=5),
    Case("c06_dynamic_jazz", "highly dynamic", "jazz", dict(lufs=-24.0, section_depth_db=8.0, drum_level=1.0), seed=6),
    Case("c07_transient_rock", "transient-heavy drums", "rock", dict(drum_level=2.0), seed=7, quick=True),
    Case("c08_presence_vocal_proxy", "vocal-dominant (presence-band proxy; no real voice)", "singer_songwriter", dict(offsets_db=[(300, 3500, 6.0)]), seed=8),
    Case("c09_phase_inverted", "stereo phase problem (right channel polarity-inverted)", "pop", seed=9, transform=_invert_right, transform_desc="R *= -1"),
    Case("c10_mono_acoustic", "mono material (1-channel file)", "acoustic", seed=10, transform=lambda x: x.mean(axis=1), transform_desc="downmix to 1 channel"),
    Case("c11_clipped_metal", "clipped audio (+14 dB into hard clip)", "metal", seed=11, transform=lambda x: np.clip(x * 10 ** (14 / 20), -1, 1).astype(np.float32), transform_desc="x*5.01 clipped to ±1"),
    Case("c12_quiet_classical", "quiet audio (-32 LUFS)", "classical", dict(lufs=-32.0), seed=12),
    Case("c13_near_silent", "near-silent audio (-18 LUFS mix attenuated 48 dB)", "pop", seed=13, transform=_gain_db(-48.0), transform_desc="-48 dB", expect="master_or_refuse"),
    Case("c14_dc_offset", "DC-offset contamination (+0.05)", "rock", seed=14, transform=lambda x: (x + 0.05).astype(np.float32), transform_desc="+0.05 DC both channels"),
    Case("c15_lr_imbalance", "left/right imbalance (R -8 dB)", "pop", seed=15, transform=_right_gain(-8.0), transform_desc="R -8 dB"),
    Case("c16_short_2s", "short duration (2 s)", "pop", dict(seconds=2.0), seed=16, expect="master_or_refuse"),
    Case("c17_long_180s", "long duration (180 s)", "house", dict(seconds=180.0), seed=17),
    Case("c18a_sr_48k", "sample rate 48 kHz", "pop", seed=18, sr=48000),
    Case("c18b_sr_96k", "sample rate 96 kHz", "pop", seed=19, sr=96000),
    Case("c18c_sr_22k", "sample rate 22.05 kHz", "lofi", seed=20, sr=22050),
    Case("c19a_pcm16", "bit depth 16-bit PCM", "pop", seed=21, subtype="PCM_16", quick=True),
    Case("c19b_pcm24", "bit depth 24-bit PCM", "pop", seed=22, subtype="PCM_24"),
    Case("c19c_pcm32", "bit depth 32-bit PCM", "pop", seed=23, subtype="PCM_32"),
    Case("c20a_garbage", "invalid: random bytes named .wav", "pop", raw_bytes=np.random.default_rng(24).bytes(64_000), expect="refuse", quick=True),
    Case("c20b_truncated", "invalid: truncated WAV", "pop", raw_bytes=_truncated_wav(), expect="refuse"),
    Case("c20c_empty", "invalid: empty file", "pop", raw_bytes=b"", expect="refuse"),
]

# Feature cases: same synthetic audio, different request configuration.
FEATURE_CASES: list[Case] = [
    Case("f01_professional_tier", "feature: Professional engine", "rock", dict(drum_level=2.0), seed=7, form={"tier": "professional"}),
    Case("f02_category_club", "feature: mastering category (Club/DJ)", "edm", dict(healthy_variation_db=1.0), seed=30, form={"category": "club"}),
    Case("f03_output_mp3", "feature: MP3 output", "pop", dict(healthy_variation_db=1.0), seed=31, form={"output_format": "mp3"}),
    Case("f04_output_flac", "feature: FLAC output", "pop", dict(healthy_variation_db=1.0), seed=32, form={"output_format": "flac"}),
    Case("f05_reference_mastering", "feature: reference mastering (dark mix vs balanced reference)", "rock", dict(offsets_db=[(3000, 20000, -7.5)]), seed=33, form={"_reference": "c01_balanced_pop"}),
    Case("f06_tags_warmer", "feature: tags (warmer)", "pop", dict(healthy_variation_db=1.0), seed=34, form={"tags": json.dumps(["warmer"])}),
    Case("f07_tweaks_brightness", "feature: manual tweak (brightness +)", "pop", dict(healthy_variation_db=1.0), seed=35, form={"tweaks": json.dumps({"brightness": 0.5})}),
]


def render(case: Case) -> bytes:
    """The exact bytes uploaded for this case."""
    if case.raw_bytes is not None:
        return case.raw_bytes
    kw = {"seconds": SECONDS, **case.mix}
    x = make_mix(seed=case.seed, **kw)
    if case.transform is not None:
        x = case.transform(x)
    if case.sr != SR:
        x = _resample(x if x.ndim == 2 else x[:, None], case.sr).squeeze()
    buf = io.BytesIO()
    sf.write(buf, np.asarray(x, dtype=np.float32), case.sr, format="WAV", subtype=case.subtype)
    return buf.getvalue()


def input_hash(case: Case, data: bytes) -> str:
    h = hashlib.sha256(data)
    h.update(json.dumps(case.form, sort_keys=True).encode())
    h.update(case.genre.encode())
    return h.hexdigest()[:16]


def describe(case: Case) -> dict:
    return {
        "category": case.category, "genre": case.genre, "seed": case.seed, "make_mix": {"seconds": SECONDS, **case.mix} if case.raw_bytes is None else None,
        "transform": case.transform_desc or None, "sample_rate": case.sr, "subtype": case.subtype if case.raw_bytes is None else None,
        "expect": case.expect, "form": case.form,
    }
