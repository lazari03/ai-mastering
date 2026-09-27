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
