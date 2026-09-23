from __future__ import annotations

import warnings
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
from scipy.signal import butter, firwin, sosfiltfilt, upfirdn

from .analysis.dynamics import bpm_confidence, clipping_evidence, peak_percentile_db
from .analysis.loudness import FastMeter, full_loudness_analysis, loudness_series
from .analysis.spectral import analyze_spectrum, sibilance_evidence

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


# Representative center frequency per ANALYSIS_BANDS key, used only for
# fitting spectral tilt (log2(center_hz) vs that band's energy in dB).
_TILT_BAND_CENTER_HZ = {
    "sub_bass_20_60hz": 40.0,
    "bass_60_250hz": 125.0,
    "low_mid_250_500hz": 354.0,
    "mid_500_2000hz": 1000.0,
    "high_mid_2000_4000hz": 2828.0,
    "presence_4000_6000hz": 4899.0,
    "brilliance_6000_20000hz": 10954.0,
}


def _tilt_from_band_shares(band_shares: dict) -> float:
    """Overall spectral slope in dB/octave — a single scalar summarizing
    "is this track dark/bass-heavy or bright/thin overall", distinct from
    spectral_balance's 7 fixed-band energy shares (though it's fit from
    exactly those same 7 shares). Real music sits around -3 to -6 dB/octave
    (natural pink-noise-ish rolloff); a strongly positive or unusually
    flat/steep tilt is audible as "off" independent of any single band
    being wrong.

    Deliberately fit from the 7 band-averaged shares, not a per-bin
    regression over the raw STFT — an FFT's bins are linearly spaced, so a
    per-bin fit against log2(frequency) is dominated by however many
    thousand bins happen to fall in the top octave vs. a handful in the
    bottom one, which biases the slope toward high-frequency behavior. This
    version is what both a measured track's spectral_balance and a genre's
    target_spectral_balance get fit with, so the two numbers are actually
    comparable.
    """
    freqs, shares = [], []
    for band, center_hz in _TILT_BAND_CENTER_HZ.items():
        share = float(band_shares.get(band, 0.0))
        if share > 0:
            freqs.append(np.log2(center_hz))
            shares.append(10.0 * np.log10(share + EPS))
    if len(freqs) < 2:
        return 0.0
    slope, _intercept = np.polyfit(freqs, shares, 1)
    return float(slope) if np.isfinite(slope) else 0.0


def _ab_gain_match(before_lufs: float, after_lufs: float) -> dict:
    """Gain to apply to each side of a before/after A/B comparison so both
    play back at the same perceived loudness. Without this, the mastered
    file is almost always louder than the original — and a louder mix
    reliably sounds "better" to a listener regardless of whether it
    actually is (the well-known loudness bias), which makes an unmatched
    A/B comparison misleading by construction.

    Always attenuates the louder side down to the quieter side's level
    rather than boosting anything — boosting the quieter side risks
    clipping on playback and isn't necessary to make the comparison fair.
    """
    before_lufs = float(before_lufs)
    after_lufs = float(after_lufs)
    target_lufs = min(before_lufs, after_lufs)
    return {
        "reference_lufs": round(target_lufs, 3),
        "before_gain_db": round(target_lufs - before_lufs, 3),
        "after_gain_db": round(target_lufs - after_lufs, 3),
    }


# 4x oversampling for true-peak detection: a 48-tap windowed-sinc
# interpolator (12 taps per phase, the structure ITU-R BS.1770 Annex 2
# describes) applied to all channels in one vectorised polyphase pass.
# ~2x cheaper than resample_poly's default 81-tap design with the same
# purpose; the limiter's final true-peak guard uses the same meter.
_TP_OVERSAMPLE = 4
_TP_TAPS = firwin(48, 0.94 / _TP_OVERSAMPLE, window=("kaiser", 7.0)) * _TP_OVERSAMPLE
_TP_DELAY = (len(_TP_TAPS) - 1) // 2


def _oversample4(audio: np.ndarray) -> np.ndarray:
    """(n, ch) -> (4n, ch) interpolated, delay-compensated."""
    x = np.asarray(audio, dtype=np.float32)
    if x.ndim == 1:
        x = x[:, np.newaxis]
    up = upfirdn(_TP_TAPS.astype(np.float32), x, up=_TP_OVERSAMPLE, axis=0)
    return up[_TP_DELAY : _TP_DELAY + x.shape[0] * _TP_OVERSAMPLE]


def _true_peak_db(audio_stereo: np.ndarray, oversample_factor: int = 4) -> float:
    """Approximate true peak with 4x oversampling to capture inter-sample
    peaks (oversample_factor kept for signature compatibility)."""
    return _db(float(np.max(np.abs(_oversample4(audio_stereo)))))


def _short_term_lufs_series(audio_stereo: np.ndarray, sr: int) -> list[float]:
    """Short-term LUFS series: 3 s windows, 1 s hop (vectorised; see
    analysis/loudness.py)."""
    if audio_stereo.shape[0] < int(3.0 * sr):
        try:
            return [float(FastMeter(sr).integrated_loudness(audio_stereo))]
        except ValueError:
            return []
    return loudness_series(audio_stereo, sr)[1]


def _momentary_lufs_series(audio_stereo: np.ndarray, sr: int) -> list[float]:
    """Momentary LUFS per ITU-R BS.1770 / EBU R128: 400 ms window every
    100 ms (vectorised; see analysis/loudness.py)."""
    if audio_stereo.shape[0] < int(0.4 * sr):
        return []
    return loudness_series(audio_stereo, sr)[0]


def _smooth_envelope(signal: np.ndarray, sr: int, window_ms: float = 60.0) -> np.ndarray:
    window = max(16, int(sr * (window_ms / 1000.0)))
    kernel = np.ones(window, dtype=np.float32) / float(window)
    env = np.convolve(np.abs(signal).astype(np.float32), kernel, mode="same")
    return np.maximum(env, EPS)


def _transient_metrics(audio_stereo: np.ndarray, sr: int) -> dict:
    """Waveform/envelope-based transient estimate — deliberately NOT drum
    separation (no kick/snare-specific stems; stem_separation.py's split is
    vocal/accompaniment only, and the spec for this is explicit: don't
    attempt semantic drum separation without an existing reliable
    mechanism). This estimates percussive/transient behavior the same way a
    mastering engineer's meter would: short-window envelope, onset = a fast
    rise in that envelope, strength = how far each onset peaks above the
    track's own sustained baseline. Two passes — full mix, and a 60-150Hz
    band standing in for kick/bass-note "punch," the one frequency region
    fast attacks and mastering low-end processing both concentrate in.

    Every returned value is normalized to roughly 0-1 via a saturating
    curve, not a raw physical unit — these are relative "how much of this
    does the track have" scores for the mastering engine's own budget
    logic to compare against, not measurements meant to be read in
    isolation the way dB values are.
    """
    n = audio_stereo.shape[0]
    empty = {
        "transient_density": 0.0,
        "transient_strength": 0.0,
        "transient_contrast": 0.0,
        "drum_punch_estimate": 0.0,
        "low_end_impact": 0.0,
        "short_term_crest_db": 0.0,
    }
    if n < sr // 2:
        return empty  # too short for a meaningful windowed estimate — neutral/safe, never blocks a render

    mono = ((audio_stereo[:, 0] + audio_stereo[:, 1]) * 0.5).astype(np.float64)

    def _onset_strength(signal: np.ndarray, win_s: float = 0.01) -> tuple[float, float]:
        win = max(1, int(sr * win_s))
        n_frames = signal.shape[0] // win
        if n_frames < 4:
            return 0.0, 0.0
        frames = signal[: n_frames * win].reshape(n_frames, win)
        envelope_db = 20.0 * np.log10(np.sqrt(np.mean(frames**2, axis=1)) + EPS)
        rise_db = np.diff(envelope_db, prepend=envelope_db[0])
        onsets = rise_db > 6.0  # a >6dB envelope jump within one 10ms frame is a genuine attack, not vibrato/tremolo
        onset_count = int(np.sum(onsets))
        duration_s = signal.shape[0] / sr
        density = float(1.0 - np.exp(-(onset_count / max(duration_s, 0.1)) / 2.0))
        if onset_count == 0:
            return density, 0.0
        baseline_db = float(np.percentile(envelope_db, 40.0))  # robust "typical sustained level" for this signal
        strength_db = np.clip(envelope_db[onsets] - baseline_db, 0.0, 24.0)
        strength = float(np.clip(np.mean(strength_db) / 18.0, 0.0, 1.0))
        return density, strength

    transient_density, transient_strength = _onset_strength(mono)
    transient_contrast = float(np.clip(transient_density * transient_strength * 1.4, 0.0, 1.0))

    try:
        sos = butter(2, [60.0 / (sr * 0.5), 150.0 / (sr * 0.5)], btype="band", output="sos")
        low_band = sosfiltfilt(sos, mono)
        _, low_end_impact = _onset_strength(low_band)
    except Exception:
        low_end_impact = 0.0

    drum_punch_estimate = float(np.clip(0.55 * transient_strength + 0.45 * low_end_impact, 0.0, 1.0))

    # Short-term crest factor — peak-vs-RMS averaged over ~400ms blocks,
    # distinct from the whole-file crest_factor_db already computed
    # elsewhere: a track can have a healthy whole-file crest factor while
    # every individual bar is already squashed (or vice versa on a source
    # with one huge isolated peak) — this is the micro-dynamics reading the
    # budget logic actually needs.
    block = max(1, int(sr * 0.4))
    n_blocks = mono.shape[0] // block
    if n_blocks >= 2:
        blocks = mono[: n_blocks * block].reshape(n_blocks, block)
        block_peak_db = 20.0 * np.log10(np.max(np.abs(blocks), axis=1) + EPS)
        block_rms_db = 20.0 * np.log10(np.sqrt(np.mean(blocks**2, axis=1)) + EPS)
        short_term_crest_db = float(np.clip(np.mean(block_peak_db - block_rms_db), 0.0, 30.0))
    else:
        short_term_crest_db = 0.0

    return {
        "transient_density": round(transient_density, 4),
        "transient_strength": round(transient_strength, 4),
        "transient_contrast": round(transient_contrast, 4),
        "drum_punch_estimate": round(drum_punch_estimate, 4),
        "low_end_impact": round(low_end_impact, 4),
        "short_term_crest_db": round(short_term_crest_db, 3),
    }


def _analysis_from_audio(audio_stereo: np.ndarray, sr: int) -> dict:
    audio_stereo = _ensure_stereo(audio_stereo).astype(np.float32)
    left = audio_stereo[:, 0]
    right = audio_stereo[:, 1]
    mono = (left + right) * 0.5

    # One K-weighting pass + one cumulative sum for integrated loudness,
    # LRA and the momentary/short-term series (analysis/loudness.py).
    loud = full_loudness_analysis(audio_stereo, sr)
    integrated_lufs = float(loud["integrated_lufs"])
    if not np.isfinite(integrated_lufs):
        integrated_lufs = float(full_loudness_analysis(mono, sr)["integrated_lufs"])

    sample_peak = float(np.max(np.abs(audio_stereo)))
    peak_level_db = _db(sample_peak)
    true_peak_db = _true_peak_db(audio_stereo)

    mono_rms = _rms(mono)
    rms_db = _db(mono_rms)
    crest_factor_db = max(0.0, peak_level_db - rms_db)
    dynamic_range_db = crest_factor_db

    # One shared STFT pass (analysis/spectral.py) supplies the legacy
    # 7-band shares, the centroid, and the hi-res spectrum used by the
    # SourceProfile — instead of three separate transforms.
    spectral = analyze_spectrum(audio_stereo, sr)
    spectral_balance = spectral["legacy_shares"]
    spectral_tilt_db_per_octave = _tilt_from_band_shares(spectral_balance)

    # PLR (peak-to-loudness ratio) — true peak against *integrated* loudness,
    # a standard mastering-report metric distinct from crest_factor_db
    # (which is peak against short-window RMS, a micro-dynamics measure).
    # A very low PLR (<6dB) is the classic brickwalled-master signature.
    plr_db = float(round(true_peak_db - integrated_lufs, 3))

    # Spectral centroid — energy-weighted mean frequency over active frames.
    spectral_centroid_hz = float(spectral["spectral_centroid_hz"])

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

    tempo, beat_frames = librosa.beat.beat_track(y=mono, sr=sr)
    tempo_arr = np.asarray(tempo).reshape(-1)
    tempo_val = float(tempo_arr[0]) if tempo_arr.size else 0.0
    tempo_bpm = tempo_val if np.isfinite(tempo_val) else 0.0
    tempo_confidence = bpm_confidence(librosa.frames_to_time(beat_frames, sr=sr)) if tempo_bpm > 0 else 0.0

    clipping_detected = bool(np.any(np.abs(audio_stereo) >= 0.9999))

    vocal_band = spectral_balance["mid_500_2000hz"] + spectral_balance["high_mid_2000_4000hz"]
    vocal_presence_estimate = float(vocal_band)

    transient_metrics = _transient_metrics(audio_stereo, sr)

    short_term_series = loud["short_term"] if audio_stereo.shape[0] >= int(3.0 * sr) else _short_term_lufs_series(audio_stereo, sr)
    short_term_lufs = float(np.mean(short_term_series)) if short_term_series else integrated_lufs
    short_term_lufs_max = float(np.max(short_term_series)) if short_term_series else integrated_lufs
    short_term_lufs_min = float(np.min(short_term_series)) if short_term_series else integrated_lufs

    momentary_series = loud["momentary"]
    momentary_lufs = float(np.mean(momentary_series)) if momentary_series else integrated_lufs
    momentary_lufs_max = float(np.max(momentary_series)) if momentary_series else integrated_lufs
    momentary_lufs_min = float(np.min(momentary_series)) if momentary_series else integrated_lufs

    try:
        loudness_range_lu = float(loud["loudness_range_lu"])
        if not np.isfinite(loudness_range_lu):
            raise ValueError("LRA undefined")
    except Exception:
        loudness_range_lu = float(np.percentile(short_term_series, 95) - np.percentile(short_term_series, 10))

    result = {
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
        "plr_db": plr_db,
        "spectral_centroid_hz": float(round(spectral_centroid_hz, 1)),
        "spectral_balance": {k: round(float(v), 6) for k, v in spectral_balance.items()},
        "spectral_tilt_db_per_octave": float(round(spectral_tilt_db_per_octave, 3)),
        "frequency_balance": {k: round(float(v), 6) for k, v in spectral_balance.items()},
        "stereo_width_estimate": float(round(stereo_width_estimate, 4)),
        "stereo_correlation": float(round(lr_correlation, 4)),
        "phase_correlation": float(round(lr_correlation, 4)),
        # True mono source (or a "stereo" file that's really one mic printed
        # to both channels — common from phone recordings) measures
        # correlation ~1.0 and width ~0. No EQ/compression/M-S width scaling
        # can create real stereo separation from a source that never had
        # any — width_adjustment gets applied to an already-zero side
        # channel and stays zero. Surfaced so that's visible as "nothing to
        # widen here" instead of silently looking like mastering did nothing.
        "near_mono_source": bool(lr_correlation > 0.98 or stereo_width_estimate < 0.02),
        "mono_compatibility_risk": mono_compatibility_risk,
        "tempo_bpm": float(round(tempo_bpm, 2)),
        "clipping_detected": clipping_detected,
        "vocal_presence_estimate": float(round(vocal_presence_estimate, 6)),
        "tempo_confidence": float(round(tempo_confidence, 3)),
        **transient_metrics,
    }
    # Additive: the full measurement set the plan-driven engine decides
    # from (analysis/profile.py). JSON-serialisable so it survives the
    # /analyze -> /preview-params round trip through the frontend.
    from .analysis.profile import build_source_profile

    result["source_profile"] = build_source_profile(
        analysis=result,
        spectral=spectral,
        sibilance=sibilance_evidence(audio_stereo, sr),
        peak_p995_db=peak_percentile_db(audio_stereo, sr),
        clipping=clipping_evidence(audio_stereo),
        bpm_conf=tempo_confidence,
        sr=sr,
        duration_s=audio_stereo.shape[0] / float(sr),
    ).to_dict()
    return result


def reference_spectrum_only(audio_stereo: np.ndarray, sr: int) -> dict:
    """Hi-res relative spectrum of a reference track (plus the legacy
    7-band shares) from one STFT pass — the reference's loudness/dynamics
    are deliberately not measured, they must not leak into the render."""
    spectral = analyze_spectrum(_ensure_stereo(audio_stereo).astype(np.float32), sr)
    return {"relative_db": spectral["relative_db"], "legacy_shares": spectral["legacy_shares"]}


def analyze_track(path: str | Path, sr: int = MASTER_SR) -> dict:
    audio_stereo, loaded_sr = _load_audio(path, sr=sr)
    return _analysis_from_audio(audio_stereo, loaded_sr)
