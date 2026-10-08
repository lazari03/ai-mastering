"""Regression tests for the low-severity audit fixes."""

from __future__ import annotations

import shutil

import numpy as np
import pytest
import soundfile as sf

from ai_mastering.audio_utils import _load_audio
from ai_mastering.dsp_filters import _active_percentile_db, _envelope_db
from ai_mastering.mastering import master_track
from ai_mastering.quality_control import lr_balance_db
from synthetic import SR, make_mix


def test_detector_attacks_fast_and_releases_slowly():
    """Attack used to equal the 70 ms release: a 10 ms sibilant was half
    over before the de-esser/dynamic EQ reacted."""
    x = np.zeros(SR)
    t = np.arange(441) / SR
    x[22050 : 22050 + 441] = np.sin(2 * np.pi * 7000 * t)
    env = _envelope_db(x, SR, release_ms=70.0)
    assert env[22050 + 220] > env.max() - 3.0, "within 3 dB of peak 5 ms into the burst"
    # ...and still releases on the slow constant afterwards.
    assert env[22050 + 441 + int(0.02 * SR)] > env.max() - 6.0


def test_threshold_ignores_silence():
    rng = np.random.default_rng(0)
    active = 20 * np.log10(np.abs(rng.normal(0.3, 0.05, 20000)))
    silence = np.full(80000, -180.0)
    with_silence = np.concatenate([active, silence])
    assert _active_percentile_db(with_silence, 75) == pytest.approx(float(np.percentile(active, 75)), abs=0.01)


def test_surround_wav_is_downmixed_not_truncated(tmp_path):
    x = np.zeros((4410, 6), np.float32)
    x[:, 2] = 0.5  # centre only (the vocal on a 5.1 mix)
    path = tmp_path / "51.wav"
    sf.write(str(path), x, 44100)
    y, _ = _load_audio(path)
    assert y.shape[1] == 2
    assert np.allclose(np.sqrt(np.mean(y**2, axis=0)), 0.5 * 0.7071, atol=1e-3)


def test_deliberately_lopsided_mix_keeps_its_balance(tmp_path):
    """A mix with the left channel 8 dB hotter is the artist's balance: it
    must neither fail QC nor be flattened to 0 dB."""
    mix = make_mix(seconds=10.0, seed=3, healthy_variation_db=1.0)
    mix[:, 1] *= 10 ** (-8 / 20)
    src = tmp_path / "lopsided.wav"
    sf.write(str(src), mix, SR, subtype="FLOAT")
    result = master_track(str(src), str(tmp_path / "out.wav"), "pop", [])
    out, _ = sf.read(str(tmp_path / "out.wav"), dtype="float32", always_2d=True)
    assert abs(lr_balance_db(out) - lr_balance_db(mix)) < 1.0
    check = next(c for c in result["quality_control"]["checks"] if c["id"] == "channel_balance")
    assert check["status"] != "fail"
    assert not any("channel_balance" in c for c in result["quality_control"].get("corrections_applied", []))


def test_loudness_recovery_reports_why_it_stopped(tmp_path):
    src = tmp_path / "in.wav"
    sf.write(str(src), make_mix(seconds=10.0, seed=5, drum_level=1.2), SR)
    result = master_track(str(src), str(tmp_path / "out.wav"), "rock", [])
    reason = result["processing_applied"]["limiter"]["loudness_recovery_stop_reason"]
    assert reason in {"target_reached", "crest_floor", "diminishing_returns", "max_iterations"}


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="needs ffmpeg")
def test_codec_preview_aligns_aac_priming(tmp_path):
    from app.services.codec_preview_service import simulate_codec

    src = tmp_path / "m.wav"
    sf.write(str(src), make_mix(seconds=6.0, seed=2) * 0.5, SR)
    aac = simulate_codec(str(src), str(tmp_path / "aac.wav"), "aac_128")
    mp3 = simulate_codec(str(src), str(tmp_path / "mp3.wav"), "mp3_128")
    assert aac["alignment_lag_samples"] > 500  # AAC priming, now removed
    assert abs(mp3["alignment_lag_samples"]) <= 2  # gapless decode
