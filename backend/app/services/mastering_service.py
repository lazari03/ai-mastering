from __future__ import annotations

import json
import logging
import subprocess
import uuid
from pathlib import Path

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from fastapi import HTTPException, UploadFile

from adaptive_mastering import analyze_for_preview, master_track as run_adaptive_mastering
from ai_mastering.audio_utils import _true_peak_db
from ai_mastering.engines import ENGINES
from ai_mastering.planning import config as engine_config
from ai_mastering.quality_control import InvalidAudioError
from ai_mastering.planning.preset_intent import is_intent_preset, resolve_genre, resolve_style
from params import list_categories, list_delivery_targets, list_flavours, list_genres, list_styles, list_tags

from app.core.config import settings
from app.services.preset_dsp_engine import render_preset_master
from app.services.presets_service import get_mixing_preset

ALLOWED_TIERS = set(ENGINES)


AUDIO_DECODE_EXTS = {".mp3", ".m4a", ".aac", ".ogg", ".wma", ".mp4", ".webm"}
ALLOWED_OUTPUT_FORMATS = {"wav", "mp3"}


def parse_json_array(raw_value: str, field_name: str) -> list:
    try:
        payload = json.loads(raw_value)
    except json.JSONDecodeError as exc:
        raise HTTPException(400, f"{field_name} must be a JSON array string") from exc

    if not isinstance(payload, list):
        raise HTTPException(400, f"{field_name} must be a JSON array string")

    return payload


def parse_json_object(raw_value: str, field_name: str) -> dict:
    try:
        payload = json.loads(raw_value)
    except json.JSONDecodeError as exc:
        raise HTTPException(400, f"{field_name} must be a JSON object string") from exc

    if not isinstance(payload, dict):
        raise HTTPException(400, f"{field_name} must be a JSON object string")

    return payload


def _normalized_tweaks(raw_tweaks: dict) -> dict:
    keys = ["low_end", "punch", "presence", "brightness", "warmth", "width", "loudness"]
    normalized = {}
    for key in keys:
        raw_val = raw_tweaks.get(key, 0.0)
        try:
            value = float(raw_val)
        except (TypeError, ValueError):
            value = 0.0
        normalized[key] = max(-1.0, min(1.0, value))
    return normalized


def attach_preset_spec(resolved: dict, spec: dict) -> dict:
    """Routes a preset spec to the engine its format was written for: an
    intent preset (the built-ins — "boost up to 0.5 dB if needed", "aim for
    -10.5 LUFS") steers the adaptive engine; a literal chain (explicit
    gain_db / target_lufs_i — an imported JSON chain or the Pro manual
    panel) runs on the manual-chain engine."""
    if is_intent_preset(spec):
        resolved["preset_intent"] = spec
        resolved["full_preset"] = None
        resolved["genre"] = resolve_genre(spec.get("genre")) or resolved.get("genre")
        resolved["style"] = resolve_style(spec.get("style")) or resolved.get("style") or "modern"
    else:
        resolved["full_preset"] = spec
        resolved["preset_intent"] = None
    return resolved


def resolve_mastering_config(
    genre: str | None,
    style: str | None,
    tags: list,
    tweaks: dict,
    use_stem_separation: bool,
    output_format: str,
    mix_preset: str | None,
    tier: str = "standard",
    category: str | None = None,
    flavour: str | None = None,
    delivery: str | None = None,
    preset_spec: dict | None = None,
) -> dict:
    resolved = {
        "genre": genre,
        "style": style or "modern",
        "tags": list(tags),
        "tweaks": _normalized_tweaks(tweaks),
        "use_stem_separation": use_stem_separation,
        "output_format": output_format,
        "tier": tier if tier in ALLOWED_TIERS else "standard",
        # Optional musical-objective layer (Clean, Modern, Club, ...) — a
        # bias on top of genre/style, only meaningful for the adaptive
        # engine (see the full_preset guard below, same reasoning as
        # reference_track_path). None means "no category selected", not
        # "unknown category" — that's still a 400 further down.
        "category": category or None,
        "flavour": flavour or None,
        # Only set when mix_preset resolves to a full preset spec (has a
        # "processing" block) — routes process_mastering_request() to the
        # preset DSP engine instead of the genre-based adaptive one. Mirrors
        # backend-node/src/services/masteringService.js:resolveConfig().
        "full_preset": None,
        # Set when the preset is written as adaptive intent (the built-in
        # presets are) — it steers the adaptive engine instead of running
        # as a literal chain. See ai_mastering/planning/preset_intent.py.
        "preset_intent": None,
        # Where the master is going: auto (genre best practice), streaming
        # (-14 LUFS), apple (-16 LUFS) or loud. See params.DELIVERY_TARGETS.
        "delivery": delivery or "auto",
    }

    if mix_preset:
        try:
            preset = get_mixing_preset(mix_preset)
        except KeyError as exc:
            raise HTTPException(400, f"Unknown mixing preset '{mix_preset}'") from exc

        resolved["genre"] = preset.get("genre", resolved["genre"])
        resolved["style"] = preset.get("style", resolved["style"])
        resolved["tags"] = list(preset.get("tags", resolved["tags"]))
        resolved["tweaks"] = _normalized_tweaks(preset.get("tweaks", resolved["tweaks"]))
        resolved["use_stem_separation"] = bool(preset.get("use_stem_separation", resolved["use_stem_separation"]))
        resolved["output_format"] = preset.get("output_format", resolved["output_format"])

        if preset.get("processing"):
            attach_preset_spec(
                resolved,
                {
                    "name": mix_preset,
                    "genre": resolved["genre"],
                    "style": resolved["style"],
                    "processing": preset["processing"],
                    "quality_control": preset.get("quality_control"),
                    "output": preset.get("output"),
                    "adaptive": preset.get("adaptive"),
                },
            )

    # An already-resolved preset spec from the caller (Node resolves both
    # curated and user presets itself) takes priority over mix_preset.
    if preset_spec:
        attach_preset_spec(resolved, preset_spec)

    # A full preset (has a "processing" block) is a self-sufficient literal
    # instruction set for preset_dsp_engine — genre/style/tags on it are
    # cosmetic labels only, not engine inputs, so an imported preset whose
    # genre/style/tags don't match this app's fixed enums (e.g. one
    # generated externally, or with no genre at all) still runs correctly
    # instead of 400ing on a validation that doesn't apply to it.
    if resolved["full_preset"] is None:
        if resolved["genre"] is None:
            raise HTTPException(400, "genre is required when mix_preset is not provided")

        if resolved["genre"] not in list_genres():
            raise HTTPException(400, f"Unknown genre '{resolved['genre']}'. Options: {list_genres()}")

        if resolved["style"] not in list_styles():
            raise HTTPException(400, f"Unknown style '{resolved['style']}'. Options: {list_styles()}")

        unknown_tags = [tag for tag in resolved["tags"] if tag not in list_tags()]
        if unknown_tags:
            raise HTTPException(400, f"Unknown tag(s) {unknown_tags}. Options: {list_tags()}")

        if resolved["category"] is not None and resolved["category"] not in list_categories():
            raise HTTPException(400, f"Unknown mastering category '{resolved['category']}'. Options: {list_categories()}")

        if resolved["flavour"] is not None:
            if resolved["category"] is None:
                raise HTTPException(400, "flavour requires a category to be set")
            valid_flavours = list_flavours(resolved["category"])
            if resolved["flavour"] not in valid_flavours:
                raise HTTPException(400, f"Unknown flavour '{resolved['flavour']}' for category '{resolved['category']}'. Options: {valid_flavours}")

    if resolved["delivery"] not in list_delivery_targets():
        raise HTTPException(400, f"Unknown delivery target '{resolved['delivery']}'. Options: {list_delivery_targets()}")

    if resolved["output_format"] not in ALLOWED_OUTPUT_FORMATS:
        raise HTTPException(400, f"output_format must be one of {sorted(ALLOWED_OUTPUT_FORMATS)}")

    return resolved


def _decode_input_if_required(job_id: str, input_path: Path, input_ext: str, label: str = "input") -> Path:
    processing_input_path = input_path

    if input_ext.lower() in AUDIO_DECODE_EXTS:
        # label distinguishes the main input's decoded file from a
        # reference track's — both can need decoding in the same request,
        # and without this they'd collide on the same output filename.
        decoded_wav_path = settings.upload_dir / f"{job_id}_{label}_internal.wav"
        # No "-ar": the source sample rate is preserved. Forcing 44100 here
        # resampled every 48 kHz upload (standard for anything cut to video,
        # and common in music sessions) before a single mastering decision
        # was made, and delivered it back at the wrong rate.
        #
        # pcm_f32le, not pcm_s16le: this is the DECODE step feeding a
        # mastering chain, so quantising to 16 bits here discards headroom
        # and adds quantisation noise ahead of every process that follows.
        # Float costs disk on a temp file that is deleted after the render.
        decode_cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(input_path),
            "-ac",
            "2",
            "-codec:a",
            "pcm_f32le",
            str(decoded_wav_path),
        ]
        decode_result = subprocess.run(decode_cmd, capture_output=True, text=True, timeout=180)
        if decode_result.returncode != 0:
            raise HTTPException(500, f"Input decode failed: {decode_result.stderr[-800:]}")
        processing_input_path = decoded_wav_path

    return processing_input_path


# The file a customer downloads is what has to be safe, not the float
# buffer QC measured before it was written or encoded. WAV: exact PCM of
# what QC saw, re-read and re-checked. MP3: lossy encoding reshapes peaks
# (overshoot of a few tenths of a dB is normal), so the encoded file is
# decoded and measured, and re-encoded slightly quieter if it overshoots.
DELIVERY_WAV_TOLERANCE_DB = 0.15
# MP3 is judged against a looser line than the WAV: the decoder's own
# reconstruction is part of the measurement, and -0.5 dBTP decoded is
# still clear of clipping on playback.
DELIVERY_MP3_TOLERANCE_DB = 0.5
DELIVERY_MP3_MAX_ENCODES = 4
CLIP_THRESHOLD = 0.9999


def _read_delivered_audio(path: Path, ext: str) -> tuple[np.ndarray, int]:
    if ext != "mp3":
        audio, sr = sf.read(str(path), dtype="float32", always_2d=True)
        return audio, int(sr)
    decoded = path.with_name(f"{path.stem}_delivery_check.wav")
    cmd = ["ffmpeg", "-y", "-i", str(path), "-c:a", "pcm_f32le", str(decoded)]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        if result.returncode != 0:
            raise HTTPException(500, f"Couldn't decode the delivered MP3 to verify it: {result.stderr[-400:]}")
        audio, sr = sf.read(str(decoded), dtype="float32", always_2d=True)
        return audio, int(sr)
    finally:
        decoded.unlink(missing_ok=True)


def _measure_delivered(audio: np.ndarray, sr: int | None = None) -> dict:
    finite = bool(np.all(np.isfinite(audio)))
    safe = np.nan_to_num(audio)
    peak = float(np.max(np.abs(safe))) if safe.size else 0.0
    lufs = None
    if sr and safe.shape[0] >= int(0.4 * sr):
        # Loudness of the file that actually ships (an MP3 trimmed for its
        # encoder overshoot is quieter than the WAV the engine measured).
        try:
            v = float(pyln.Meter(sr).integrated_loudness(safe))
            lufs = round(v, 2) if np.isfinite(v) else None
        except Exception:
            lufs = None
    return {
        "integrated_lufs": lufs,
        "finite": finite,
        "clipped_samples": int(np.count_nonzero(np.abs(safe) >= CLIP_THRESHOLD)),
        "sample_peak_dbfs": round(float(20.0 * np.log10(max(peak, 1e-12))), 2),
        "true_peak_dbtp": round(float(_true_peak_db(safe)), 2) if safe.size else -120.0,
    }


def _encode_mp3(wav_path: Path, output_path: Path, trim_db: float) -> None:
    cmd = ["ffmpeg", "-y", "-i", str(wav_path)]
    if trim_db > 0:
        cmd += ["-af", f"volume=-{trim_db:.2f}dB"]
    cmd += ["-codec:a", "libmp3lame", "-b:a", "320k", str(output_path)]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if result.returncode != 0:
        raise HTTPException(500, f"FFmpeg MP3 conversion failed: {result.stderr[-800:]}")


def deliver_and_verify(wav_mastered_path: Path, output_path: Path, output_ext: str, ceiling_db: float = engine_config.LIMITER_CEILING_DBTP) -> dict:
    """Writes the deliverable and verifies the file itself. Returns the
    check report; raises (and removes the file) if it can't be made safe."""
    if output_ext != "mp3":
        if wav_mastered_path != output_path:
            wav_mastered_path.replace(output_path)
        measured = _measure_delivered(*_read_delivered_audio(output_path, "wav"))
        passed = measured["finite"] and measured["clipped_samples"] == 0 and measured["true_peak_dbtp"] <= ceiling_db + DELIVERY_WAV_TOLERANCE_DB
        report = {"format": "wav", "checked": "written file", "ceiling_dbtp": ceiling_db, "gain_trim_db": 0.0, "encodes": 0, "passed": passed, **measured}
        if not passed:
            output_path.unlink(missing_ok=True)
            raise HTTPException(500, f"The mastered file failed its final delivery check ({report}); no master was delivered.")
        return report

    limit = ceiling_db + DELIVERY_MP3_TOLERANCE_DB
    trim_db = 0.0
    measured: dict = {}
    for encode in range(1, DELIVERY_MP3_MAX_ENCODES + 1):
        _encode_mp3(wav_mastered_path, output_path, trim_db)
        measured = _measure_delivered(*_read_delivered_audio(output_path, "mp3"))
        if measured["finite"] and measured["clipped_samples"] == 0 and measured["true_peak_dbtp"] <= limit:
            return {"format": "mp3", "checked": "decoded MP3", "ceiling_dbtp": round(limit, 2), "gain_trim_db": round(trim_db, 2), "encodes": encode, "passed": True, **measured}
        overshoot = max(measured["true_peak_dbtp"] - limit, 0.0)
        trim_db += overshoot + 0.1
    output_path.unlink(missing_ok=True)
    raise HTTPException(500, f"The encoded MP3 still overshoots after {DELIVERY_MP3_MAX_ENCODES} encodes ({measured}); no master was delivered.")


def make_browser_preview(wav_mastered_path: Path, preview_path: Path) -> None:
    # The actual mastered deliverable is written at 24-bit PCM (both DSP
    # engines — see ai_mastering/mastering.py's sf.write and
    # preset_dsp_engine.py's own output.bit_depth, which defaults to 24)
    # — real quality, worth keeping for the download. But that's also
    # exactly what was breaking in-browser playback: a plain <audio src>
    # pointed at that file (SignalVisualizer / WebGLMasterPreview, both
    # showing "MASTERED SIGNAL" with a visible player error while the
    # original — never 24-bit, whatever format the user actually
    # uploaded — played fine right next to it) is a well-known compat gap
    # for 24-bit PCM WAV specifically, unlike 16-bit which every browser's
    # native audio element handles without exception. This generates a
    # second, always-16-bit copy purely for that in-browser player —
    # same "separate file for playback than for download" pattern this
    # codebase already uses for codec-preview — while the actual
    # deliverable stays untouched at its original bit depth. Best-effort:
    # if ffmpeg fails here, playback preview is degraded, not the whole
    # render — never raises.
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(wav_mastered_path),
        "-codec:a",
        "pcm_s16le",
        str(preview_path),
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        if result.returncode != 0:
            logging.getLogger(__name__).warning("Browser-preview transcode failed for %s: %s", preview_path.name, result.stderr[-500:])
    except Exception as exc:  # pragma: no cover — best-effort, never blocks the render
        logging.getLogger(__name__).warning("Browser-preview transcode raised for %s: %s", preview_path.name, exc)


def process_mastering_request(file: UploadFile, config: dict, reference_file: UploadFile | None = None) -> dict:
    if file.size and file.size > settings.max_upload_size_mb * 1024 * 1024:
        raise HTTPException(413, f"Uploaded file exceeds {settings.max_upload_size_mb}MB limit")

    job_id = str(uuid.uuid4())[:8]
    input_ext = Path(file.filename or "").suffix or ".wav"
    output_ext = config["output_format"]

    input_path = settings.upload_dir / f"{job_id}_input{input_ext}"
    output_path = settings.output_dir / f"{job_id}_mastered.{output_ext}"
    wav_mastered_path = settings.output_dir / f"{job_id}_mastered.wav"

    with input_path.open("wb") as handle:
        handle.write(file.file.read())

    processing_input_path = _decode_input_if_required(job_id, input_path, input_ext)

    full_preset = config.get("full_preset")

    if full_preset is not None:
        try:
            mastering_result = render_preset_master(
                input_path=str(processing_input_path),
                output_wav_path=str(wav_mastered_path),
                preset=full_preset,
            )
        except InvalidAudioError as exc:
            raise HTTPException(400, str(exc)) from exc
        except Exception as exc:  # pragma: no cover
            raise HTTPException(500, f"Preset DSP engine failed: {type(exc).__name__}: {exc}") from exc
    else:
        # Spectral matching only applies to the adaptive engine — a full
        # preset spec is a literal instruction set with no "target spectral
        # balance" slot to override. Mirrors masteringService.js.
        reference_input_path = None
        if reference_file is not None:
            reference_ext = Path(reference_file.filename or "").suffix or ".wav"
            reference_path = settings.upload_dir / f"{job_id}_reference{reference_ext}"
            with reference_path.open("wb") as handle:
                handle.write(reference_file.file.read())
            reference_input_path = str(_decode_input_if_required(job_id, reference_path, reference_ext, label="reference"))

        try:
            mastering_result = run_adaptive_mastering(
                input_path=str(processing_input_path),
                output_path=str(wav_mastered_path),
                genre=config["genre"],
                tags=config["tags"],
                tweaks=config["tweaks"],
                style=config["style"],
                enable_stem_separation=config["use_stem_separation"],
                tier=config.get("tier", "standard"),
                reference_track_path=reference_input_path,
                category=config.get("category"),
                flavour=config.get("flavour"),
                preset_intent=config.get("preset_intent"),
                delivery=config.get("delivery"),
            )
        except InvalidAudioError as exc:
            # A real signal-integrity problem with the uploaded file (empty,
            # corrupt/NaN, digital silence) — the caller's fault, not the
            # engine's, so 400 (bad input) rather than 500 (server failure).
            raise HTTPException(400, str(exc)) from exc
        except Exception as exc:  # pragma: no cover
            raise HTTPException(500, f"Adaptive mastering failed: {type(exc).__name__}: {exc}") from exc

    ceiling = float((mastering_result.get("target_profile_used") or {}).get("true_peak_ceiling_dbtp", engine_config.LIMITER_CEILING_DBTP))
    delivery_check = deliver_and_verify(wav_mastered_path, output_path, output_ext, ceiling_db=ceiling)
    mastering_result.setdefault("processing_applied", {})["delivery_check"] = delivery_check
    if delivery_check["gain_trim_db"] > 0:
        mastering_result.setdefault("source_warnings", []).append(
            f"The MP3 encoder overshot the peak ceiling, so the MP3 was encoded {delivery_check['gain_trim_db']:.1f} dB quieter than the WAV master."
        )
    # wav_mastered_path still exists after deliver_and_verify either way —
    # untouched for an mp3 output_ext (ffmpeg reads it, writes a separate
    # output_path), and a same-path no-op rename for the wav case (the
    # common one: output_ext defaults to "wav", so wav_mastered_path and
    # output_path are literally the same filename).
    make_browser_preview(wav_mastered_path, settings.output_dir / f"{job_id}_preview.wav")

    before_lufs = mastering_result["analysis_before"]["integrated_lufs"]
    after_lufs = mastering_result["analysis_after"]["integrated_lufs"]
    if delivery_check.get("integrated_lufs") is not None:
        # Report the loudness of the file the user downloads.
        after_lufs = delivery_check["integrated_lufs"]

    return {
        "job_id": job_id,
        "download_url": f"/download/{job_id}.{output_ext}",
        "before_lufs": round(before_lufs, 1),
        "after_lufs": round(after_lufs, 1),
        "analysis_before": mastering_result["analysis_before"],
        "analysis_after": mastering_result["analysis_after"],
        "ab_gain_match": mastering_result.get("ab_gain_match"),
        "ab_analysis": mastering_result.get("ab_analysis"),
        "source_warnings": mastering_result.get("source_warnings", []),
        "quality_control": mastering_result.get("quality_control"),
        "processing_applied": mastering_result["processing_applied"],
        "target_profile_used": mastering_result["target_profile_used"],
        "resolved_config": config,
    }


def analyze_uploaded_track(file: UploadFile) -> dict:
    """Decode + analyze only, for the live genre/style parameter preview
    (see analyze_for_preview/preview_processing_params) — never saved
    long-term the way /master's input is (no job_id worth remembering,
    nothing to re-download later), so every file this creates gets cleaned
    up before returning rather than left for the 48h sweep."""
    if file.size and file.size > settings.max_upload_size_mb * 1024 * 1024:
        raise HTTPException(413, f"Uploaded file exceeds {settings.max_upload_size_mb}MB limit")

    scratch_id = f"preview_{uuid.uuid4().hex[:12]}"
    input_ext = Path(file.filename or "").suffix or ".wav"
    input_path = settings.upload_dir / f"{scratch_id}_input{input_ext}"

    with input_path.open("wb") as handle:
        handle.write(file.file.read())

    processing_input_path = None
    try:
        processing_input_path = _decode_input_if_required(scratch_id, input_path, input_ext)
        try:
            return analyze_for_preview(str(processing_input_path))
        except InvalidAudioError as exc:
            raise HTTPException(400, str(exc)) from exc
        except Exception as exc:  # pragma: no cover
            raise HTTPException(500, f"Analysis failed: {type(exc).__name__}: {exc}") from exc
    finally:
        input_path.unlink(missing_ok=True)
        if processing_input_path and processing_input_path != input_path:
            processing_input_path.unlink(missing_ok=True)
