from __future__ import annotations

from pydantic import BaseModel


class MasterResponse(BaseModel):
    job_id: str
    download_url: str
    before_lufs: float
    after_lufs: float
    analysis_before: dict
    analysis_after: dict
    processing_applied: dict
    target_profile_used: dict


class CleanResponse(BaseModel):
    job_id: str
    download_url: str
    before_lufs: float
    after_lufs: float


class ChordSegment(BaseModel):
    start: float
    end: float
    chord: str


class ChordAnalysisResponse(BaseModel):
    bpm: float
    key: str
    duration: float
    chords: list[ChordSegment]


class PresetSummary(BaseModel):
    name: str
    description: str
    genre: str
    style: str
    tags: list[str]
    tweaks: dict
    use_stem_separation: bool
    output_format: str
