from __future__ import annotations

from fastapi import APIRouter, File, UploadFile

from app.schemas.mastering import ChordAnalysisResponse
from app.services.chord_service import analyze_chords

router = APIRouter(tags=["chords"])


@router.post("/analyze-chords", response_model=ChordAnalysisResponse)
def analyze_chords_route(file: UploadFile = File(...)) -> dict:
    return analyze_chords(file)
