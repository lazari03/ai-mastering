from __future__ import annotations

import uuid
from pathlib import Path

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from fastapi import HTTPException, UploadFile
from pedalboard import Compressor, Gain, HighpassFilter, NoiseGate, Pedalboard
from scipy.signal import istft, stft

from ai_mastering.audio_utils import MASTER_SR, _load_audio

from app.core.config import settings
from app.services.mastering_service import _convert_output, _decode_input_if_required

# Instagram/Reels-style social loudness target. No resampling or time-stretch
# anywhere in this chain, so pitch never moves.
TARGET_LUFS = -14.0
ALLOWED_OUTPUT_FORMATS = {"wav", "mp3"}


def _spectral_denoise(mono: np.ndarray, sr: int, oversubtraction: float = 4.0, spectral_floor: float = 0.02) -> np.ndarray:
    # Berouti-style spectral subtraction: build the noise profile from the
    # quietest frames actually in this recording (not a fixed percentile mixed
    # in with voice-active frames), then subtract it back out of every frame
    # with headroom (oversubtraction) so hiss/hum/room tone drops well below
    # the voice instead of just ducking under an arbitrary threshold. A small
    # spectral floor keeps the "musical noise" chirping artifacts down.
    _, _, spectrum = stft(mono, fs=sr, nperseg=2048)
    magnitude, phase = np.abs(spectrum), np.angle(spectrum)

    frame_energy = np.mean(magnitude**2, axis=0)
    quietest_count = max(1, int(0.15 * magnitude.shape[1]))
    quietest_frames = np.argsort(frame_energy)[:quietest_count]
    noise_profile = np.mean(magnitude[:, quietest_frames], axis=1, keepdims=True)

    subtracted = magnitude - oversubtraction * noise_profile
    floor = spectral_floor * magnitude
    cleaned_magnitude = np.maximum(subtracted, floor)

    _, cleaned = istft(cleaned_magnitude * np.exp(1j * phase), fs=sr, nperseg=2048)
    if len(cleaned) < len(mono):
        cleaned = np.pad(cleaned, (0, len(mono) - len(cleaned)))
    return cleaned[: len(mono)].astype(np.float32)


def _adaptive_gate_threshold_db(signal: np.ndarray, sr: int, percentile: float = 25.0, window_ms: float = 50.0) -> float:
    # A fixed dBFS gate threshold is fragile — recordings vary a lot in
    # absolute level. Instead, look at this signal's own short-window RMS
    # distribution and gate everything below the quiet end of it (a few dB
    # under the Nth percentile), which adapts per-recording instead of
    # guessing a constant.
    window = max(1, int(sr * window_ms / 1000))
    mono = signal if signal.ndim == 1 else signal.mean(axis=1)
    n = len(mono) // window
    if n < 4:
        return -35.0
    rms = np.array([np.sqrt(np.mean(mono[i * window : (i + 1) * window] ** 2) + 1e-12) for i in range(n)])
    threshold_db = float(np.percentile(20 * np.log10(rms + 1e-12), percentile)) - 2.0
    return float(np.clip(threshold_db, -55.0, -20.0))


def clean_audio_to_wav(input_path: str, wav_path: str) -> dict:
    """Pure path-in, wav-out cleanup. Shared by the FastAPI route and the
    standalone CLI the Node backend shells out to."""
    stereo, sr = _load_audio(input_path, sr=MASTER_SR)

    meter = pyln.Meter(sr)
    before_lufs = float(meter.integrated_loudness(stereo))

    denoised = np.stack([_spectral_denoise(stereo[:, ch], sr) for ch in range(stereo.shape[1])], axis=1)

    # Phone-recording cleanup: cut rumble, even out levels, *then* gate.
    # The gate runs after compression on purpose — compression narrows the
    # gap between voice and residual noise (it turns quiet parts up too), so
    # gating first just lets the compressor re-lift whatever noise survived
    # spectral subtraction. Gating last catches it after leveling instead,
    # with a threshold calibrated to this recording's own level distribution.
    pre_gate = Pedalboard(
        [
            HighpassFilter(cutoff_frequency_hz=80.0),
            Compressor(threshold_db=-18.0, ratio=3.0, attack_ms=5.0, release_ms=120.0),
        ]
    )
    compressed = pre_gate(denoised.T, sr).T
    gate_threshold_db = _adaptive_gate_threshold_db(compressed, sr)

    post_gate = Pedalboard(
        [
            NoiseGate(threshold_db=gate_threshold_db, ratio=8.0, attack_ms=2.0, release_ms=200.0),
            Gain(gain_db=0.0),
        ]
    )
    processed = post_gate(np.ascontiguousarray(compressed.T), sr).T

    loudness = float(meter.integrated_loudness(processed))
    if np.isfinite(loudness):
        processed = pyln.normalize.loudness(processed, loudness, TARGET_LUFS)

    # Peak safety only ever turns gain down, never up. pedalboard's Limiter
    # applies makeup gain toward its ceiling, which would undo the LUFS target
    # just set above, so a plain headroom clamp is used instead.
    peak = float(np.max(np.abs(processed))) if processed.size else 0.0
    ceiling = 10 ** (-1.0 / 20)
    if peak > ceiling:
        processed = processed * (ceiling / peak)

    after_lufs = float(meter.integrated_loudness(processed))

    sf.write(str(wav_path), processed, sr, subtype="PCM_24")

    return {"before_lufs": round(before_lufs, 1), "after_lufs": round(after_lufs, 1)}


def clean_audio(file: UploadFile, output_format: str = "mp3") -> dict:
    if output_format not in ALLOWED_OUTPUT_FORMATS:
        raise HTTPException(400, f"output_format must be one of {sorted(ALLOWED_OUTPUT_FORMATS)}")
    if file.size and file.size > settings.max_upload_size_mb * 1024 * 1024:
        raise HTTPException(413, f"Uploaded file exceeds {settings.max_upload_size_mb}MB limit")

    job_id = str(uuid.uuid4())[:8]
    input_ext = Path(file.filename or "").suffix or ".wav"
    input_path = settings.upload_dir / f"{job_id}_clean_input{input_ext}"
    output_path = settings.output_dir / f"{job_id}_mastered.{output_format}"
    wav_path = settings.output_dir / f"{job_id}_mastered.wav"

    with input_path.open("wb") as handle:
        handle.write(file.file.read())

    decoded_path = _decode_input_if_required(job_id, input_path, input_ext)

    try:
        result = clean_audio_to_wav(str(decoded_path), str(wav_path))
    except Exception as exc:  # pragma: no cover
        raise HTTPException(500, f"Could not decode audio: {exc}") from exc

    _convert_output(wav_path, output_path, output_format)

    return {
        "job_id": job_id,
        "download_url": f"/download/{job_id}.{output_format}",
        **result,
    }
