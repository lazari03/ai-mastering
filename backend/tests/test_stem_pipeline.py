"""Stem path end to end at non-44.1 kHz rates, with Demucs faked by a
subprocess stub that writes stems at the model's 44.1 kHz — exactly what
the real separator does. Before the fix a 48 kHz job summed 44.1 kHz stems
as if they were 48 kHz: ~8.8% fast, sharp, and shorter than the source."""

from __future__ import annotations

import subprocess
from pathlib import Path

import librosa
import numpy as np
import pytest
import soundfile as sf

import ai_mastering.stem_separation as stems
from ai_mastering.mastering import master_track
from ai_mastering.stem_separation import _load_stems
from synthetic import SR as SR44, make_mix

DEMUCS_SR = 44100


def _tone(sr: int, seconds: float, hz: float) -> np.ndarray:
    t = np.arange(int(sr * seconds)) / sr
    x = 0.3 * np.sin(2 * np.pi * hz * t).astype(np.float32)
    return np.stack([x, x], axis=1)


def _peak_hz(x: np.ndarray, sr: int) -> float:
    mono = x.mean(axis=1)
    spec = np.abs(np.fft.rfft(mono * np.hanning(mono.size)))
    return float(np.fft.rfftfreq(mono.size, 1.0 / sr)[np.argmax(spec)])


def test_stems_are_loaded_at_the_pipeline_rate_and_length(tmp_path):
    src_48 = _tone(48000, 3.0, 1000.0)
    stem_44 = librosa.resample(src_48.T, orig_sr=48000, target_sr=DEMUCS_SR).T
    sf.write(str(tmp_path / "vocals.wav"), stem_44, DEMUCS_SR)
    sf.write(str(tmp_path / "no_vocals.wav"), stem_44, DEMUCS_SR)
    v, a = _load_stems(tmp_path / "vocals.wav", tmp_path / "no_vocals.wav", 48000, n_samples=src_48.shape[0])
    assert v.shape == a.shape == src_48.shape
    assert _peak_hz(v, 48000) == pytest.approx(1000.0, abs=2.0), "stem pitch/time shifted by the rate ratio"


@pytest.fixture
def fake_demucs(monkeypatch):
    """Stub `python -m demucs.separate ... -o <dir> <input>`: vocals = 30%
    of the input, accompaniment = 70%, written at 44.1 kHz."""
    state = {"fail": False}

    def run(cmd, capture_output=True, text=True, timeout=None, env=None):
        if state["fail"]:
            return subprocess.CompletedProcess(cmd, 1, "", "demucs exploded")
        out_dir, model, inp = Path(cmd[cmd.index("-o") + 1]), cmd[cmd.index("-n") + 1], Path(cmd[-1])
        audio, sr = sf.read(str(inp), dtype="float32", always_2d=True)
        audio44 = librosa.resample(audio.T, orig_sr=sr, target_sr=DEMUCS_SR).T if sr != DEMUCS_SR else audio
        d = out_dir / model / inp.stem
        d.mkdir(parents=True, exist_ok=True)
        sf.write(str(d / "vocals.wav"), 0.3 * audio44, DEMUCS_SR, subtype="FLOAT")
        sf.write(str(d / "no_vocals.wav"), 0.7 * audio44, DEMUCS_SR, subtype="FLOAT")
        return subprocess.CompletedProcess(cmd, 0, "", "")

    monkeypatch.setattr(stems.subprocess, "run", run)
    return state


@pytest.mark.parametrize("rate", [48000, 44100])
def test_stem_master_keeps_rate_length_and_alignment(tmp_path, fake_demucs, rate):
    mix = make_mix(seconds=12.0, seed=9, healthy_variation_db=1.0)
    if rate != SR44:
        mix = librosa.resample(mix.T, orig_sr=SR44, target_sr=rate).T.astype(np.float32)
    src, out = tmp_path / "in.wav", tmp_path / "out.wav"
    sf.write(str(src), mix, rate)
    result = master_track(str(src), str(out), "pop", ["better_vocals"], enable_stem_separation=True)
    assert result["processing_applied"]["stem_separation"]["status"] == "applied"
    assert result["processing_applied"]["delivery"]["vocal_enhancement"] in ("applied", "unchanged")
    master, sr_out = sf.read(str(out), dtype="float32", always_2d=True)
    assert sr_out == rate
    assert master.shape[0] == mix.shape[0]
    # Time-aligned with the source: a rate mix-up decorrelates them entirely.
    corr = float(np.corrcoef(master.mean(axis=1), mix.mean(axis=1))[0, 1])
    assert corr > 0.9, corr


def test_requested_vocal_enhancement_failure_is_reported_to_the_user(tmp_path, fake_demucs):
    fake_demucs["fail"] = True
    src, out = tmp_path / "in.wav", tmp_path / "out.wav"
    sf.write(str(src), make_mix(seconds=10.0, seed=9), SR44)
    result = master_track(str(src), str(out), "pop", ["better_vocals"], enable_stem_separation=True)
    assert out.exists(), "the full-mix master is still delivered"
    assert result["processing_applied"]["stem_separation"]["status"] == "unavailable"
    assert result["processing_applied"]["delivery"]["vocal_enhancement"] == "failed"
    assert result["source_warnings"][0].startswith("Vocal enhancement was requested but could not run")
