from __future__ import annotations

import warnings
from pathlib import Path

import librosa
import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from scipy.signal import resample_poly

EPS = 1e-9
MASTER_SR = 44100

ANALYSIS_BANDS = {
    "sub_bass_20_60hz": (20.0, 60.0),
    "bass_60_250hz": (60.0, 250.0),
    "low_mid_250_500hz": (250.0, 500.0),
    "mid_500_2000hz": (500.0, 2000.0),
    "high_mid_2000_4000hz": (2000.0, 4000.0),
    "presence_4000_6000hz": (4000.0, 6000.0),
    "brilliance_6000_20000hz": (6000.0, 20000.0),
}

PROCESS_BANDS = {
    "low": (20.0, 250.0),
    "low_mid": (250.0, 2000.0),
    "high_mid": (2000.0, 6000.0),
    "high": (6000.0, 20000.0),
}


def _ensure_stereo(audio: np.ndarray) -> np.ndarray:
    if audio.ndim == 1:
        return np.stack([audio, audio], axis=1)
    if audio.ndim == 2 and audio.shape[1] == 1:
        return np.repeat(audio, 2, axis=1)
    if audio.ndim == 2 and audio.shape[1] >= 2:
        return audio[:, :2]
    raise ValueError(f"Unsupported audio shape: {audio.shape}")


def _load_audio(path: str | Path, sr: int = MASTER_SR) -> tuple[np.ndarray, int]:
    path = str(path)
    loaded_sr = sr

    try:
        # Prefer libsndfile path to avoid librosa->audioread deprecation/fallback warnings.
        data, loaded_sr = sf.read(path, dtype="float32", always_2d=True)
        y = data.T
    except Exception:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            warnings.simplefilter("ignore", FutureWarning)
            y, loaded_sr = librosa.load(path, sr=None, mono=False)
            if y.ndim == 1:
                y = np.stack([y, y], axis=0)

    if y.shape[0] > 2:
        y = y[:2, :]
    if y.shape[0] == 1:
        y = np.repeat(y, 2, axis=0)

    if int(loaded_sr) != int(sr):
        y = np.vstack([librosa.resample(ch, orig_sr=loaded_sr, target_sr=sr) for ch in y]).astype(np.float32)
        loaded_sr = sr

    return y.T.astype(np.float32), int(loaded_sr)


def _db(val: float) -> float:
    return 20.0 * np.log10(max(val, EPS))


def _rms(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(x), dtype=np.float64) + EPS))


def _safe_float(value: float, fallback: float = 0.0) -> float:
    value = float(value)
    return value if np.isfinite(value) else float(fallback)


def _true_peak_db(audio_stereo: np.ndarray, oversample_factor: int = 4) -> float:
    """
    Approximate true peak with oversampling to better capture inter-sample peaks.
    """
    max_peak = 0.0
    for ch in range(audio_stereo.shape[1]):
        channel = np.asarray(audio_stereo[:, ch], dtype=np.float32)
        upsampled = resample_poly(channel, oversample_factor, 1)
        ch_peak = float(np.max(np.abs(upsampled)))
        if ch_peak > max_peak:
            max_peak = ch_peak
    return _db(max_peak)


def _short_term_lufs_series(audio_stereo: np.ndarray, sr: int) -> list[float]:
    """
    Compute a short-term LUFS series using 3s windows and 1s hop.
    """
    meter = pyln.Meter(sr)
    window = int(3.0 * sr)
    hop = int(1.0 * sr)
    if audio_stereo.shape[0] < window:
        try:
            return [float(meter.integrated_loudness(audio_stereo))]
        except Exception:
            mono = np.mean(audio_stereo, axis=1)
            return [float(meter.integrated_loudness(mono))]

    series: list[float] = []
    for start in range(0, audio_stereo.shape[0] - window + 1, hop):
        chunk = audio_stereo[start : start + window]
        try:
            val = float(meter.integrated_loudness(chunk))
        except Exception:
            val = float(meter.integrated_loudness(np.mean(chunk, axis=1)))
        if np.isfinite(val):
            series.append(val)

    if not series:
        try:
            series = [float(meter.integrated_loudness(audio_stereo))]
        except Exception:
            series = [float(meter.integrated_loudness(np.mean(audio_stereo, axis=1)))]

    return series


def _momentary_lufs_series(audio_stereo: np.ndarray, sr: int) -> list[float]:
    """
    Spec-correct momentary LUFS per ITU-R BS.1770 / EBU R128: 400ms window,
    updated every 100ms. Distinct from _short_term_lufs_series above (that's
    the "S" 3s-window meter also defined by the same spec) — momentary is
    the fast-responding one mastering engineers watch for individual hits/
    transients, short-term is the slower one for phrase-level loudness.
    """
    meter = pyln.Meter(sr)
    window = int(0.4 * sr)
    hop = int(0.1 * sr)
    if audio_stereo.shape[0] < window:
        try:
            return [float(meter.integrated_loudness(audio_stereo))]
        except Exception:
            mono = np.mean(audio_stereo, axis=1)
            return [float(meter.integrated_loudness(mono))]

    series: list[float] = []
    for start in range(0, audio_stereo.shape[0] - window + 1, hop):
        chunk = audio_stereo[start : start + window]
        try:
            val = float(meter.integrated_loudness(chunk))
        except Exception:
            val = float(meter.integrated_loudness(np.mean(chunk, axis=1)))
        if np.isfinite(val):
            series.append(val)

    if not series:
        try:
            series = [float(meter.integrated_loudness(audio_stereo))]
        except Exception:
            series = [float(meter.integrated_loudness(np.mean(audio_stereo, axis=1)))]

    return series


def _smooth_envelope(signal: np.ndarray, sr: int, window_ms: float = 60.0) -> np.ndarray:
    window = max(16, int(sr * (window_ms / 1000.0)))
    kernel = np.ones(window, dtype=np.float32) / float(window)
    env = np.convolve(np.abs(signal).astype(np.float32), kernel, mode="same")
    return np.maximum(env, EPS)


def _analysis_from_audio(audio_stereo: np.ndarray, sr: int) -> dict:
    audio_stereo = _ensure_stereo(audio_stereo).astype(np.float32)
    left = audio_stereo[:, 0]
    right = audio_stereo[:, 1]
    mono = (left + right) * 0.5

    meter = pyln.Meter(sr)
    try:
        integrated_lufs = float(meter.integrated_loudness(audio_stereo))
    except Exception:
        integrated_lufs = float(meter.integrated_loudness(mono))

    sample_peak = float(np.max(np.abs(audio_stereo)))
    peak_level_db = _db(sample_peak)
    true_peak_db = _true_peak_db(audio_stereo)

    mono_rms = _rms(mono)
    rms_db = _db(mono_rms)
    crest_factor_db = max(0.0, peak_level_db - rms_db)
    dynamic_range_db = crest_factor_db

    n_fft = 4096
    hop = 1024
    stft = librosa.stft(mono, n_fft=n_fft, hop_length=hop)
    power = np.abs(stft) ** 2
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)

    band_energy = {}
    total_energy = 0.0
    for band, (lo, hi) in ANALYSIS_BANDS.items():
        idx = np.where((freqs >= lo) & (freqs < min(hi, sr / 2.0)))[0]
        if idx.size == 0:
            energy = 0.0
        else:
            energy = float(np.mean(power[idx, :]))
        band_energy[band] = energy
        total_energy += energy

    if total_energy <= EPS:
        spectral_balance = {k: 0.0 for k in ANALYSIS_BANDS.keys()}
    else:
        spectral_balance = {k: float(v / total_energy) for k, v in band_energy.items()}

    mid = (left + right) * 0.5
    side = (left - right) * 0.5
    mid_rms = _rms(mid)
    side_rms = _rms(side)
    stereo_width_estimate = float(side_rms / max(mid_rms, EPS))

    lr_avg_rms = 0.5 * (_rms(left) + _rms(right))
    mono_drop_db = _db(mono_rms) - _db(lr_avg_rms)
    mono_compatibility_risk = bool(mono_drop_db < -3.0)

    if _rms(left) < 1e-6 or _rms(right) < 1e-6:
        lr_correlation = 1.0
    else:
        lr_correlation = float(np.corrcoef(left, right)[0, 1])
        if not np.isfinite(lr_correlation):
            lr_correlation = 0.0
    lr_correlation = float(np.clip(lr_correlation, -1.0, 1.0))

    tempo, _ = librosa.beat.beat_track(y=mono, sr=sr)
    tempo_arr = np.asarray(tempo).reshape(-1)
    tempo_val = float(tempo_arr[0]) if tempo_arr.size else 0.0
    tempo_bpm = tempo_val if np.isfinite(tempo_val) else 0.0

    clipping_detected = bool(np.any(np.abs(audio_stereo) >= 0.9999))

    vocal_band = spectral_balance["mid_500_2000hz"] + spectral_balance["high_mid_2000_4000hz"]
    vocal_presence_estimate = float(vocal_band)

    short_term_series = _short_term_lufs_series(audio_stereo, sr)
    short_term_lufs = float(np.mean(short_term_series)) if short_term_series else integrated_lufs
    short_term_lufs_max = float(np.max(short_term_series)) if short_term_series else integrated_lufs
    short_term_lufs_min = float(np.min(short_term_series)) if short_term_series else integrated_lufs

    momentary_series = _momentary_lufs_series(audio_stereo, sr)
    momentary_lufs = float(np.mean(momentary_series)) if momentary_series else integrated_lufs
    momentary_lufs_max = float(np.max(momentary_series)) if momentary_series else integrated_lufs
    momentary_lufs_min = float(np.min(momentary_series)) if momentary_series else integrated_lufs

    try:
        loudness_range_lu = float(meter.loudness_range(audio_stereo))
    except Exception:
        loudness_range_lu = float(np.percentile(short_term_series, 95) - np.percentile(short_term_series, 10))

    return {
        "integrated_lufs": float(round(integrated_lufs, 3)),
        "short_term_lufs": float(round(_safe_float(short_term_lufs, integrated_lufs), 3)),
        "short_term_lufs_max": float(round(_safe_float(short_term_lufs_max, integrated_lufs), 3)),
        "short_term_lufs_min": float(round(_safe_float(short_term_lufs_min, integrated_lufs), 3)),
        "momentary_lufs": float(round(_safe_float(momentary_lufs, integrated_lufs), 3)),
        "momentary_lufs_max": float(round(_safe_float(momentary_lufs_max, integrated_lufs), 3)),
        "momentary_lufs_min": float(round(_safe_float(momentary_lufs_min, integrated_lufs), 3)),
        "loudness_range_lu": float(round(_safe_float(loudness_range_lu, 0.0), 3)),
        "peak_level_db": float(round(peak_level_db, 3)),
        "true_peak_db": float(round(true_peak_db, 3)),
        "rms_db": float(round(rms_db, 3)),
        "crest_factor_db": float(round(crest_factor_db, 3)),
        "dynamic_range_db": float(round(dynamic_range_db, 3)),
        "spectral_balance": {k: round(float(v), 6) for k, v in spectral_balance.items()},
        "frequency_balance": {k: round(float(v), 6) for k, v in spectral_balance.items()},
        "stereo_width_estimate": float(round(stereo_width_estimate, 4)),
        "stereo_correlation": float(round(lr_correlation, 4)),
        "phase_correlation": float(round(lr_correlation, 4)),
        "mono_compatibility_risk": mono_compatibility_risk,
        "tempo_bpm": float(round(tempo_bpm, 2)),
        "clipping_detected": clipping_detected,
        "vocal_presence_estimate": float(round(vocal_presence_estimate, 6)),
    }


def analyze_track(path: str | Path, sr: int = MASTER_SR) -> dict:
    audio_stereo, loaded_sr = _load_audio(path, sr=sr)
    return _analysis_from_audio(audio_stereo, loaded_sr)
