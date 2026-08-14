from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.core.config import settings
from app.schemas.mastering import MasterResponse, PresetSummary
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
    )

    result = process_mastering_request(file=file, config=resolved_config)
    return {
        "job_id": result["job_id"],
        "download_url": result["download_url"],
        "before_lufs": result["before_lufs"],
        "after_lufs": result["after_lufs"],
        "analysis_before": result["analysis_before"],
        "analysis_after": result["analysis_after"],
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
