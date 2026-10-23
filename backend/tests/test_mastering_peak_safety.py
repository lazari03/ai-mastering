"""Regression checks for peak processing and the reported gain reduction."""

import numpy as np

from ai_mastering.audio_utils import _true_peak_db
from ai_mastering.bus_processing import _limiter_reduction_db, _soft_clip, _true_peak_limiter


def test_limiter_does_not_fade_in_when_later_peak_needs_limiting():
    sr = 48000
    audio = np.full((sr // 5, 2), 0.4, dtype=np.float32)
    audio[sr // 10] = 1.1
    limited = _true_peak_limiter(audio, sr)
    assert limited[0, 0] > 0.38
    assert _true_peak_db(limited) <= -0.99


def test_adaptive_clipper_leaves_quiet_audio_alone_and_obeys_peak_budget():
    sr = 48000
    t = np.arange(sr // 2) / sr
    quiet = np.stack([0.4 * np.sin(2 * np.pi * 440 * t)] * 2, axis=1).astype(np.float32)
    np.testing.assert_array_equal(_soft_clip(quiet, max_reduction_db=1.0), quiet)
    loud = quiet.copy()
    loud[sr // 4] = 1.4
    clipped = _soft_clip(loud, max_reduction_db=1.0)
    reduction = _true_peak_db(loud) - _true_peak_db(clipped)
    assert 0 <= reduction <= 1.03
    assert np.max(np.abs(clipped[:sr // 8] - loud[:sr // 8])) < 1e-3


def test_limiter_measure_does_not_include_clipper_reduction():
    audio = np.full((100, 2), 0.4, dtype=np.float32)
    assert _limiter_reduction_db(audio, audio) == 0
    assert abs(_limiter_reduction_db(audio, audio * 0.5) - 6.0206) < 0.01


def test_limiter_attack_ramps_instead_of_stepping():
    """The gain used to drop as a step before each peak — measured +11-13
    dB added distortion and +32-38 dB >8 kHz splatter (clicks). It must
    ramp across the (1 ms) lookahead, and still hold the ceiling."""
    from scipy.signal import butter, sosfiltfilt

    from ai_mastering.audio_utils import _true_peak_db
    from ai_mastering.bus_processing import _true_peak_limiter
    from ai_mastering.evaluation.distortion import added_distortion_db
    from synthetic import SR, make_mix

    x = make_mix(seconds=10.0, seed=4, offsets_db=[(40, 250, 6.0)], drum_level=1.2)
    x = sosfiltfilt(butter(8, 4000, fs=SR, output="sos"), x, axis=0).astype(np.float32)
    x = x * 10 ** ((-1.0 - _true_peak_db(x) + 6.0) / 20)  # 6 dB into the limiter
    y = _true_peak_limiter(x, SR, ceiling_db=-1.0, release_ms=60.0)
    assert _true_peak_db(y, oversample_factor=16) <= -1.0 + 0.02
    gain = np.abs(y[:, 0]) / np.maximum(np.abs(x[:, 0]), 1e-6)
    active = np.abs(x[:, 0]) > 0.05
    # No near-instant gain drops: the step limiter measured 0.028 per
    # sample at p99.99, the 1 ms ramp 0.010.
    drops = -np.diff(gain[active])
    assert float(np.percentile(drops, 99.99)) < 0.02
    assert added_distortion_db(x, y, SR)["worst_db"] < -22.0
    # Input is band-limited below 4 kHz: energy the limiter adds above
    # 8 kHz is splatter from its gain changes (Hann-windowed Welch, so the
    # bass doesn't leak into the HF bins). Step attack measured +83 dB
    # relative to the source; the 1 ms ramp +58 dB.
    from scipy.signal import welch

    f, p_in = welch(x.mean(axis=1), SR, nperseg=8192)
    _, p_out = welch(y.mean(axis=1), SR, nperseg=8192)
    hf_added = 10 * np.log10(p_out[f > 8000].sum() / p_in[f > 8000].sum())
    assert hf_added < 70.0, hf_added
