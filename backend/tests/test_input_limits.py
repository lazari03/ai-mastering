"""Inputs too long to master safely are refused before any decode.

The upload-size cap alone doesn't bound the work: 200 MB of MP3 is ~3 hours
of audio, decoded in full and rendered several times. Every route that loads
audio (master, its reference, analyze, chords) goes through
_decode_input_if_required, which now checks the duration first."""

from __future__ import annotations

import dataclasses
import subprocess

import numpy as np
import pytest
import soundfile as sf
from fastapi import HTTPException

from app.services import mastering_service as ms

SR = 44100


def _wav(path, seconds):
    sf.write(str(path), (0.1 * np.sin(2 * np.pi * 440 * np.arange(int(SR * seconds)) / SR)).astype(np.float32), SR)
    return path


@pytest.fixture
def limit(monkeypatch, tmp_path):
    def set_limit(minutes):
        monkeypatch.setattr(ms, "settings", dataclasses.replace(ms.settings, max_duration_minutes=minutes, upload_dir=tmp_path))
    return set_limit


def test_over_limit_wav_is_refused_with_a_clear_413_and_removed(limit, tmp_path):
    limit(0.05)  # 3 s
    src = _wav(tmp_path / "long_input.wav", 5.0)
    with pytest.raises(HTTPException) as err:
        ms._decode_input_if_required("j1", src, ".wav")
    assert err.value.status_code == 413
    assert "minutes long" in err.value.detail and "limit is 0.05 minutes" in err.value.detail
    assert not src.exists(), "a refused upload must not linger until the 48 h sweep"


def test_over_limit_mp3_is_refused_before_ffmpeg_decodes_it(limit, tmp_path, monkeypatch):
    limit(0.05)
    wav = _wav(tmp_path / "tmp.wav", 5.0)
    mp3 = tmp_path / "long_input.mp3"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), str(mp3)], check=True)
    real_run = subprocess.run
    decodes = []

    def spy(cmd, *a, **k):
        if cmd and cmd[0] == "ffmpeg":
            decodes.append(cmd)
        return real_run(cmd, *a, **k)

    monkeypatch.setattr(ms.subprocess, "run", spy)
    with pytest.raises(HTTPException) as err:
        ms._decode_input_if_required("j2", mp3, ".mp3")
    assert err.value.status_code == 413
    assert decodes == [], "the duration check must run before the decode"


def test_reference_track_message_names_the_reference(limit, tmp_path):
    limit(0.05)
    with pytest.raises(HTTPException) as err:
        ms._decode_input_if_required("j3", _wav(tmp_path / "ref.wav", 5.0), ".wav", label="reference")
    assert "reference track" in err.value.detail


def test_under_limit_passes_and_zero_disables(limit, tmp_path):
    limit(0.05)
    short = _wav(tmp_path / "short.wav", 2.0)
    assert ms._decode_input_if_required("j4", short, ".wav") == short
    limit(0)
    long = _wav(tmp_path / "long.wav", 5.0)
    assert ms._decode_input_if_required("j5", long, ".wav") == long


def test_default_limit_is_fifteen_minutes():
    assert ms.settings.max_duration_minutes == 15.0


# --- one silent channel -------------------------------------------------

from ai_mastering.mastering import master_track  # noqa: E402
from ai_mastering.quality_control import InvalidAudioError, validate_input_signal  # noqa: E402
from synthetic import make_mix  # noqa: E402


def test_mono_exported_to_one_side_is_mastered_as_mono_with_a_warning(tmp_path):
    """Used to fail every candidate (channel balance, low-end, tilt) and
    deliver nothing. Now delivered on both sides, and the user is told."""
    mix = make_mix(seconds=12.0, seed=1)
    src = np.stack([mix[:, 0], np.zeros(len(mix), np.float32)], axis=1)
    sf.write(str(tmp_path / "in.wav"), src, SR)
    result = master_track(str(tmp_path / "in.wav"), str(tmp_path / "out.wav"), "pop", [])
    out, _ = sf.read(str(tmp_path / "out.wav"), always_2d=True)
    rms = np.sqrt(np.mean(out**2, axis=0))
    assert rms.min() > 0.5 * rms.max(), "both sides carry the music"
    assert any("right channel of this file was silent" in w for w in result["source_warnings"])
    # Each warning has a localizable twin (code + params + identical text).
    codes = result["processing_applied"]["source_warning_codes"]
    assert [c["text"] for c in codes] == result["source_warnings"]
    assert any(c["code"] == "silent_channel_restored" and c["params"] == {"channel": "right"} for c in codes)


def test_normal_stereo_is_not_touched_by_the_silent_channel_rule():
    mix = make_mix(seconds=6.0, seed=2)
    report = validate_input_signal(mix, SR)
    assert report["silent_channel_restored"] is None
    np.testing.assert_array_equal(report["_corrected_audio"], mix.astype(np.float32))


def test_both_channels_silent_is_still_refused():
    with pytest.raises(InvalidAudioError):
        validate_input_signal(np.zeros((SR * 2, 2), np.float32), SR)


def test_very_quiet_audio_is_not_called_digital_silence():
    # Same stop threshold as before; only the wording differs.
    import numpy as np
    from ai_mastering.quality_control import InvalidAudioError, validate_input_signal

    quiet = (np.random.default_rng(0).standard_normal((44100, 2)) * 10 ** (-80 / 20)).astype(np.float32)
    try:
        validate_input_signal(quiet, 44100)
        raise AssertionError("expected InvalidAudioError")
    except InvalidAudioError as exc:
        assert "too quiet" in str(exc) and "silence" not in str(exc)
    try:
        validate_input_signal(np.zeros((44100, 2), np.float32), 44100)
        raise AssertionError("expected InvalidAudioError")
    except InvalidAudioError as exc:
        assert "digital silence" in str(exc)
