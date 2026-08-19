from __future__ import annotations

import json
import subprocess
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

from adaptive_mastering import master_track as run_adaptive_mastering
from params import list_genres, list_styles, list_tags

from app.core.config import settings
from app.services.preset_dsp_engine import render_preset_master
from app.services.presets_service import get_mixing_preset

ALLOWED_TIERS = {"standard", "professional"}


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


def resolve_mastering_config(
    genre: str | None,
    style: str | None,
    tags: list,
    tweaks: dict,
    use_stem_separation: bool,
    output_format: str,
    mix_preset: str | None,
    tier: str = "standard",
) -> dict:
    resolved = {
        "genre": genre,
        "style": style or "modern",
        "tags": list(tags),
        "tweaks": _normalized_tweaks(tweaks),
        "use_stem_separation": use_stem_separation,
        "output_format": output_format,
        "tier": tier if tier in ALLOWED_TIERS else "standard",
        # Only set when mix_preset resolves to a full preset spec (has a
        # "processing" block) — routes process_mastering_request() to the
        # preset DSP engine instead of the genre-based adaptive one. Mirrors
        # backend-node/src/services/masteringService.js:resolveConfig().
        "full_preset": None,
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
            resolved["full_preset"] = {
                "name": mix_preset,
                "genre": resolved["genre"],
                "style": resolved["style"],
                "processing": preset["processing"],
                "quality_control": preset.get("quality_control"),
                "output": preset.get("output"),
            }

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
        decode_cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(input_path),
            "-ac",
            "2",
            "-ar",
            "44100",
            "-codec:a",
            "pcm_s16le",
            str(decoded_wav_path),
        ]
        decode_result = subprocess.run(decode_cmd, capture_output=True, text=True, timeout=180)
        if decode_result.returncode != 0:
            raise HTTPException(500, f"Input decode failed: {decode_result.stderr[-800:]}")
        processing_input_path = decoded_wav_path

    return processing_input_path


def _convert_output(wav_mastered_path: Path, output_path: Path, output_ext: str) -> None:
    if output_ext == "mp3":
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(wav_mastered_path),
            "-codec:a",
            "libmp3lame",
            "-b:a",
            "320k",
            str(output_path),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        if result.returncode != 0:
            raise HTTPException(500, f"FFmpeg MP3 conversion failed: {result.stderr[-800:]}")
    else:
        wav_mastered_path.replace(output_path)


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
            )
        except Exception as exc:  # pragma: no cover
            raise HTTPException(500, f"Adaptive mastering failed: {type(exc).__name__}: {exc}") from exc

    _convert_output(wav_mastered_path, output_path, output_ext)

    before_lufs = mastering_result["analysis_before"]["integrated_lufs"]
    after_lufs = mastering_result["analysis_after"]["integrated_lufs"]

    return {
        "job_id": job_id,
        "download_url": f"/download/{job_id}.{output_ext}",
        "before_lufs": round(before_lufs, 1),
        "after_lufs": round(after_lufs, 1),
        "analysis_before": mastering_result["analysis_before"],
        "analysis_after": mastering_result["analysis_after"],
        "ab_gain_match": mastering_result.get("ab_gain_match"),
        "source_warnings": mastering_result.get("source_warnings", []),
        "quality_control": mastering_result.get("quality_control"),
        "processing_applied": mastering_result["processing_applied"],
        "target_profile_used": mastering_result["target_profile_used"],
        "resolved_config": config,
    }
