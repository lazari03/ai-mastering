from __future__ import annotations

from fastapi import APIRouter, File, Form, UploadFile

from app.schemas.mastering import CleanResponse
from app.services.clean_service import clean_audio

router = APIRouter(tags=["clean"])


@router.post("/clean", response_model=CleanResponse)
def clean_audio_route(
    file: UploadFile = File(...),
    output_format: str = Form("mp3"),
) -> dict:
    return clean_audio(file, output_format=output_format)
