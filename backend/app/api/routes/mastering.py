from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.core.config import settings
from app.schemas.mastering import CodecPreviewResponse, MasterResponse, PresetSummary
from app.services.codec_preview_service import SUPPORTED_CODECS, simulate_codec
from app.services.mastering_service import (
    parse_json_array,
    parse_json_object,
    process_mastering_request,
    resolve_mastering_config,
)
from app.services.presets_service import list_mixing_presets
from params import list_genres, list_styles, list_tags

router = APIRouter(tags=["mastering"])


@router.get("/genres")
def get_genres() -> dict:
    return {"genres": list_genres()}


@router.get("/tags")
def get_tags() -> dict:
    return {"tags": list_tags()}


@router.get("/styles")
def get_styles() -> dict:
    return {"styles": list_styles()}


@router.get("/mix-presets", response_model=list[PresetSummary])
def get_mix_presets() -> list[dict]:
    presets = list_mixing_presets()
    return [
        {
            "name": name,
            "description": value.get("description", ""),
            "genre": value.get("genre", ""),
            "style": value.get("style", "modern"),
            "tags": list(value.get("tags", [])),
            "tweaks": value.get("tweaks", {}),
            "use_stem_separation": bool(value.get("use_stem_separation", False)),
            "output_format": value.get("output_format", "wav"),
        }
        for name, value in presets.items()
    ]


@router.post("/master", response_model=MasterResponse)
def master_track(
    file: UploadFile = File(...),
    genre: str | None = Form(None),
    style: str = Form("modern"),
    use_stem_separation: bool = Form(False),
    tags: str = Form("[]"),
    tweaks: str = Form("{}"),
    output_format: str = Form("wav"),
    mix_preset: str | None = Form(None),
    tier: str = Form("standard"),
    # A caller that has already fully resolved a preset itself (Node does,
    # for both its curated and user-imported-custom presets — see
    # backend-node/src/services/presetsService.js) can send the resolved
    # spec directly instead of a mix_preset name for this service to look
    # up in its own mixing_presets.json. Takes priority over mix_preset
    # when present. This is what keeps Node's custom-presets feature
    # (backend-node-only, this service has no knowledge of it) working
    # without duplicating preset-resolution logic on both sides.
    full_preset_json: str | None = Form(None),
    reference_file: UploadFile | None = File(None),
) -> dict:
    tag_list = parse_json_array(tags, "tags")
    tweak_values = parse_json_object(tweaks, "tweaks")

    resolved_config = resolve_mastering_config(
        genre=genre,
        style=style,
        tags=tag_list,
        tweaks=tweak_values,
        use_stem_separation=use_stem_separation,
        output_format=output_format,
        mix_preset=mix_preset,
        tier=tier,
    )

    if full_preset_json:
        try:
            resolved_config["full_preset"] = json.loads(full_preset_json)
        except json.JSONDecodeError as exc:
            raise HTTPException(400, "full_preset_json must be valid JSON") from exc

    result = process_mastering_request(file=file, config=resolved_config, reference_file=reference_file)
    return {
        "job_id": result["job_id"],
        "download_url": result["download_url"],
        "before_lufs": result["before_lufs"],
        "after_lufs": result["after_lufs"],
        "analysis_before": result["analysis_before"],
        "analysis_after": result["analysis_after"],
        "ab_gain_match": result.get("ab_gain_match"),
        "source_warnings": result.get("source_warnings", []),
        "quality_control": result.get("quality_control"),
        "processing_applied": result["processing_applied"],
        "target_profile_used": result["target_profile_used"],
    }


@router.get("/download/{job_id}.{ext}")
def download(job_id: str, ext: str):
    path = settings.output_dir / f"{job_id}_mastered.{ext}"
    if not path.exists():
        raise HTTPException(404, "File not found")
    return FileResponse(path, filename=f"mastered_{job_id}.{ext}")


@router.get("/original/{job_id}")
def get_original(job_id: str):
    matches = list(settings.upload_dir.glob(f"{job_id}_input.*"))
    if not matches:
        raise HTTPException(404, "Original not found")
    return FileResponse(matches[0])


@router.delete("/files/{job_id}")
def delete_job_files(job_id: str) -> dict:
    # Every file this job ever produced (input, decoded intermediates,
    # mastered output in every format, codec-preview renders) is named
    # "{job_id}_..." in either upload_dir or output_dir — same convention
    # storage_cleanup.py's automatic 48h sweep relies on, just triggered
    # immediately instead of waiting for the age-based sweep. No ownership
    # check here — Node's DELETE /jobs/:jobId already verified the
    # requester owns this job_id before ever calling this.
    removed = 0
    for directory in (settings.upload_dir, settings.output_dir):
        for path in directory.glob(f"{job_id}_*"):
            if path.is_file():
                path.unlink(missing_ok=True)
                removed += 1
    return {"removed": removed}


@router.post("/codec-preview", response_model=CodecPreviewResponse)
def codec_preview(job_id: str = Form(...), codec: str = Form("mp3_128")) -> dict:
    if codec not in SUPPORTED_CODECS:
        raise HTTPException(400, f"Unknown codec '{codec}'. Options: {sorted(SUPPORTED_CODECS)}")

    mastered_wav = settings.output_dir / f"{job_id}_mastered.wav"
    if not mastered_wav.exists():
        raise HTTPException(404, f"No mastered wav found for job '{job_id}' — run /master first")

    preview_wav = settings.output_dir / f"{job_id}_codec_{codec}.wav"
    try:
        result = simulate_codec(str(mastered_wav), str(preview_wav), codec)
    except Exception as exc:  # pragma: no cover
        raise HTTPException(500, f"Codec preview failed: {type(exc).__name__}: {exc}") from exc

    return {**result, "preview_download_url": f"/download-codec-preview/{job_id}/{codec}"}


@router.get("/download-codec-preview/{job_id}/{codec}")
def download_codec_preview(job_id: str, codec: str):
    path = settings.output_dir / f"{job_id}_codec_{codec}.wav"
    if not path.exists():
        raise HTTPException(404, "Codec preview not found — run /codec-preview first")
    return FileResponse(path)
