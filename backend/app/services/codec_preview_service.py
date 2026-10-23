from __future__ import annotations

"""Codec preview: round-trips a finished master through a real lossy
streaming codec (encode then decode back to wav via ffmpeg) so a user can
hear and measure what actually reaches a listener on Spotify/YouTube/etc,
not just the pristine master file. Real encoders, not an approximation —
mixing_presets.json has declared a `codec_preview: true` flag in every
preset's quality_control block since before this existed; this is what
makes that flag mean something.
"""

import subprocess
from pathlib import Path

import numpy as np

from ai_mastering.audio_utils import MASTER_SR, _analysis_from_audio, _load_audio

# format: ffmpeg container/muxer to use for the lossy intermediate file.
# codec/bitrate: passed straight to ffmpeg's -codec:a/-b:a.
SUPPORTED_CODECS = {
    "mp3_128": {"format": "mp3", "codec": "libmp3lame", "bitrate": "128k"},
    "mp3_320": {"format": "mp3", "codec": "libmp3lame", "bitrate": "320k"},
    "aac_128": {"format": "adts", "codec": "aac", "bitrate": "128k"},
    "aac_256": {"format": "adts", "codec": "aac", "bitrate": "256k"},
    "opus_128": {"format": "ogg", "codec": "libopus", "bitrate": "128k"},
}


def _run_ffmpeg(args: list[str], timeout: int = 120) -> None:
    result = subprocess.run(["ffmpeg", "-y", *args], capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {result.stderr[-800:]}")


def _codec_lag_samples(original: np.ndarray, roundtrip: np.ndarray, sr: int) -> int:
    """Samples by which the decoded round-trip lags the original."""
    from ai_mastering.evaluation.distortion import _align

    _, _, lag = _align(original.mean(axis=1), roundtrip.mean(axis=1), sr)
    return int(lag)


def simulate_codec(input_wav_path: str, output_wav_path: str, codec_key: str = "mp3_128") -> dict:
    if codec_key not in SUPPORTED_CODECS:
        raise ValueError(f"Unknown codec preset '{codec_key}'. Options: {sorted(SUPPORTED_CODECS)}")
    spec = SUPPORTED_CODECS[codec_key]

    input_path = Path(input_wav_path)
    output_path = Path(output_wav_path)
    lossy_ext = "aac" if spec["format"] == "adts" else spec["format"]
    lossy_path = output_path.with_suffix(f".{lossy_ext}")

    # Encode to the lossy codec, then decode straight back to wav — the
    # audible damage from the encode step survives the round-trip, which is
    # exactly what we want to hear/measure.
    _run_ffmpeg(["-i", str(input_path), "-codec:a", spec["codec"], "-b:a", spec["bitrate"], "-vn", str(lossy_path)])
    # Two decodes of the same lossy file: 16-bit for the listening copy the
    # user downloads (safest browser playback), and FLOAT for measurement.
    # Measuring the s16 decode clipped away the codec's overshoot above
    # 0 dBFS — exactly what this preview exists to show — so
    # true_peak_delta_db under-read on loud masters.
    measure_path = output_path.with_name(output_path.stem + "_measure_f32.wav")
    _run_ffmpeg(["-i", str(lossy_path), "-ac", "2", "-ar", str(MASTER_SR), "-codec:a", "pcm_s16le", str(output_path)])
    _run_ffmpeg(["-i", str(lossy_path), "-ac", "2", "-ar", str(MASTER_SR), "-codec:a", "pcm_f32le", str(measure_path)])

    original, sr = _load_audio(str(input_path), sr=MASTER_SR)
    try:
        roundtrip, _ = _load_audio(str(measure_path), sr=MASTER_SR)
    finally:
        measure_path.unlink(missing_ok=True)

    # Encoders add priming delay (AAC in ADTS: ~2112 samples, never
    # stripped on decode) — align by cross-correlation first, then trim to
    # the overlap, so both analyses cover the same audio.
    lag = _codec_lag_samples(original, roundtrip, sr)
    if lag > 0:
        roundtrip = roundtrip[lag:]
    elif lag < 0:
        original = original[-lag:]
    n = min(original.shape[0], roundtrip.shape[0])
    original = original[:n]
    roundtrip = roundtrip[:n]

    analysis_original = _analysis_from_audio(original, sr)
    analysis_preview = _analysis_from_audio(roundtrip, sr)

    spectral_balance_change_db = {}
    for band, orig_share in analysis_original["spectral_balance"].items():
        preview_share = analysis_preview["spectral_balance"].get(band, 0.0)
        spectral_balance_change_db[band] = round(float(10.0 * np.log10((preview_share + 1e-9) / (orig_share + 1e-9))), 3)

    return {
        "codec": codec_key,
        "format": spec["format"],
        "bitrate": spec["bitrate"],
        "analysis_original": analysis_original,
        "analysis_codec_preview": analysis_preview,
        "true_peak_delta_db": round(analysis_preview["true_peak_db"] - analysis_original["true_peak_db"], 3),
        "lufs_delta_db": round(analysis_preview["integrated_lufs"] - analysis_original["integrated_lufs"], 3),
        "alignment_lag_samples": lag,
        "spectral_balance_change_db": spectral_balance_change_db,
        # Signed: negative means the codec discarded high-frequency content
        # (the classic lossy-encoder artifact under bitrate pressure).
        # Small positive values happen too — this is a share-of-total-energy
        # delta, not an absolute measurement, so it can shift either way on
        # material where one band already dominates the spectrum.
        "high_frequency_change_db": spectral_balance_change_db.get("brilliance_6000_20000hz", 0.0),
        "lossy_file_size_bytes": lossy_path.stat().st_size if lossy_path.exists() else 0,
    }
