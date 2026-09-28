"""The delivered file itself — WAV as written, MP3 as decoded — is what
gets the final peak/clipping check, not the buffer QC saw before export."""

import shutil

import numpy as np
import pytest
import soundfile as sf
from fastapi import HTTPException

from ai_mastering.audio_utils import _true_peak_db
from app.services.mastering_service import DELIVERY_MP3_TOLERANCE_DB, deliver_and_verify
from synthetic import SR, make_mix

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="needs ffmpeg")


def _at_peak(audio: np.ndarray, peak_dbtp: float) -> np.ndarray:
    return (audio * 10 ** ((peak_dbtp - _true_peak_db(audio)) / 20.0)).astype(np.float32)


def test_clean_wav_passes_and_is_reported(tmp_path):
    wav = tmp_path / "m.wav"
    sf.write(str(wav), _at_peak(make_mix(seconds=6.0, seed=1), -1.2), SR, subtype="PCM_24")
    report = deliver_and_verify(wav, wav, "wav")
    assert report["passed"] and report["clipped_samples"] == 0 and report["true_peak_dbtp"] <= -1.0


def test_clipped_wav_is_refused_and_removed(tmp_path):
    wav = tmp_path / "m.wav"
    audio = make_mix(seconds=6.0, seed=1)
    audio = np.clip(audio / np.max(np.abs(audio)) * 1.5, -1.0, 1.0)
    sf.write(str(wav), audio, SR, subtype="PCM_24")
    with pytest.raises(HTTPException, match="no master was delivered"):
        deliver_and_verify(wav, wav, "wav")
    assert not wav.exists()


def test_hot_mp3_is_trimmed_until_the_decoded_file_is_safe(tmp_path):
    wav = tmp_path / "m.wav"
    mp3 = tmp_path / "m.mp3"
    # A dense, loud master right at the ceiling: MP3 encoding pushes its
    # decoded peaks over, which is exactly the case the check exists for.
    sf.write(str(wav), _at_peak(make_mix(seconds=8.0, seed=2) * 4.0, -0.2), SR, subtype="PCM_24")
    report = deliver_and_verify(wav, mp3, "mp3")
    decoded_limit = -1.0 + DELIVERY_MP3_TOLERANCE_DB
    assert report["passed"] and report["checked"] == "decoded MP3"
    assert report["true_peak_dbtp"] <= decoded_limit and report["clipped_samples"] == 0
    assert report["gain_trim_db"] > 0 and report["encodes"] >= 2
    assert mp3.exists()
