"""Controlled synthetic mixes for engine tests.

A "mix" = broadband bed + kick / snare / hat pattern + slow section
dynamics, then spectrally CALIBRATED: the mix's own relative spectrum is
measured with the engine's analysis and an FFT-domain correction pulls it
onto (neutral curve + requested offsets). That makes the tonal state of
each fixture known exactly, so a test failure indicts the engine, not an
unknown property of a recording.

The neutral curve is only the calibration anchor for "healthy" fixtures;
`healthy_variation_db` adds a smooth random tilt/ripple inside the
tolerance window so tests do not pass merely because a fixture sits
exactly on the target.
"""

from __future__ import annotations

import numpy as np
import pyloudnorm as pyln

from ai_mastering.analysis.spectral import analyze_spectrum
from ai_mastering.planning.target_model import neutral_curve_db

SR = 44100


def _fft_filter(x: np.ndarray, gain_db_fn) -> np.ndarray:
    n = x.shape[0]
    spec = np.fft.rfft(x, axis=0)
    f = np.fft.rfftfreq(n, 1.0 / SR)
    g = 10.0 ** (gain_db_fn(np.maximum(f, 1.0)) / 20.0)
    g[f < 18.0] = 0.0
    if spec.ndim == 2:
        g = g[:, np.newaxis]
    return np.fft.irfft(spec * g, n=n, axis=0).astype(np.float32)


def _drums(n: int, rng: np.random.Generator, bpm: float, kick_amp: float, snare_amp: float, hat_amp: float) -> np.ndarray:
    out = np.zeros(n, dtype=np.float32)
    beat = int(SR * 60.0 / bpm)
    t = np.arange(int(SR * 0.35)) / SR
    kick = np.sin(2 * np.pi * (45.0 * t + (110.0 - 45.0) * 0.03 * (1 - np.exp(-t / 0.03)))) * np.exp(-t / 0.16)
    snare_len = int(SR * 0.2)
    hat_len = int(SR * 0.05)
    for i, start in enumerate(range(0, n - len(t), beat)):
        out[start : start + len(t)] += kick_amp * kick.astype(np.float32)
        if i % 2 == 1:
            s = rng.standard_normal(snare_len) * np.exp(-np.arange(snare_len) / (SR * 0.06))
            out[start : start + snare_len] += snare_amp * s.astype(np.float32)
        for half in (0, beat // 2):
            hs = start + half
            if hs + hat_len < n:
                h = rng.standard_normal(hat_len) * np.exp(-np.arange(hat_len) / (SR * 0.012))
                h = np.diff(np.concatenate(([0.0], h)))  # crude high-pass
                out[hs : hs + hat_len] += hat_amp * h.astype(np.float32)
    return out


def make_mix(
    seconds: float = 24.0,
    offsets_db=None,
    seed: int = 0,
    bpm: float = 120.0,
    width: float = 0.35,
    low_end_width: float = 0.0,
    drum_level: float = 0.6,
    section_depth_db: float = 3.0,
    healthy_variation_db: float = 0.0,
    lufs: float = -18.0,
    limit_db: float | None = None,
) -> np.ndarray:
    """offsets_db: list of (lo_hz, hi_hz, dB) regions added to the neutral
    curve (smooth 1/6-octave transitions)."""
    rng = np.random.default_rng(seed)
    n = int(SR * seconds)
    bed = rng.standard_normal(n).astype(np.float32)
    drums = _drums(n, rng, bpm, 0.9 * drum_level, 0.5 * drum_level, 0.25 * drum_level)
    env = 10.0 ** ((section_depth_db * np.sin(2 * np.pi * np.arange(n) / (SR * 8.0))) / 20.0)
    mono = bed * 0.3 * env.astype(np.float32) + drums

    side_src = rng.standard_normal(n).astype(np.float32) * 0.3 * env.astype(np.float32)

    ripple_phase = rng.uniform(0, 2 * np.pi)

    def target_db(f):
        base = np.interp(np.log2(f), np.log2([a for a, _ in _ANCHORS]), [v for _, v in _ANCHORS])
        if healthy_variation_db:
            lf = np.log2(f / 1000.0)
            base = base + healthy_variation_db * (0.6 * np.sin(lf * 0.9 + ripple_phase) + 0.4 * lf / 5.0)
        for lo, hi, db in offsets_db or []:
            edge = 1.0 / 6.0
            w = 1.0 / (1.0 + np.exp(-(np.log2(f / lo)) / (edge / 4))) * (1.0 / (1.0 + np.exp((np.log2(f / hi)) / (edge / 4))))
            base = base + db * w
        return base

    # Calibrate: whiten the mix to pink-flat (per-octave) using the measured
    # relative spectrum, then impose the target.
    mid = mono.copy()
    for _ in range(2):
        meas = analyze_spectrum(np.stack([mid, mid], 1), SR)
        centers = np.array([b["center_hz"] for b in meas["bands"]])
        rel = np.array([meas["relative_db"][b["name"]] for b in meas["bands"]])
        want = np.array([target_db(np.array([c]))[0] for c in centers])
        want -= np.mean(want[(centers >= 300) & (centers <= 3000)])
        corr = want - rel
        mid = _fft_filter(mid, lambda f, c=corr: np.interp(np.log2(f), np.log2(centers), c))

    side = _fft_filter(side_src, lambda f: target_db(f) - 10 * np.log10(f / 1000.0))
    side_rms_target = width * float(np.sqrt(np.mean(mid**2)))
    side *= side_rms_target / (float(np.sqrt(np.mean(side**2))) + 1e-12)
    # Low end: mono unless low_end_width requested.
    lp = _fft_filter(side, lambda f: np.where(f < 120.0, 0.0, -120.0))
    side = side - lp
    if low_end_width:
        low_side = _fft_filter(rng.standard_normal(n).astype(np.float32), lambda f: np.where(f < 120.0, 0.0, -120.0))
        low_mid = _fft_filter(mid, lambda f: np.where(f < 120.0, 0.0, -120.0))
        low_side *= low_end_width * float(np.sqrt(np.mean(low_mid**2))) / (float(np.sqrt(np.mean(low_side**2))) + 1e-12)
        side = side + low_side

    stereo = np.stack([mid + side, mid - side], axis=1).astype(np.float32)
    meter = pyln.Meter(SR)
    stereo *= 10.0 ** ((lufs - meter.integrated_loudness(stereo)) / 20.0)
    if limit_db is not None:
        # Crude brickwall: hard-ish tanh at limit_db, then renormalise.
        c = 10.0 ** (limit_db / 20.0)
        stereo = np.tanh(stereo / c) * c
        stereo *= 10.0 ** ((lufs - meter.integrated_loudness(stereo)) / 20.0)
    peak = float(np.max(np.abs(stereo)))
    if peak > 0.97:
        stereo *= 0.97 / peak
    return stereo.astype(np.float32)


# Same anchors the engine's neutral curve uses, read through its public
# function so the fixture tracks any retuning of config.
_ANCHORS = [(f, neutral_curve_db(f)) for f in np.geomspace(20.0, 21000.0, 60)]
