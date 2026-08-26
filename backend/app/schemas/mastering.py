from __future__ import annotations

from pydantic import BaseModel


class MasterResponse(BaseModel):
    job_id: str
    download_url: str
    before_lufs: float
    after_lufs: float
    analysis_before: dict
    analysis_after: dict
    ab_gain_match: dict | None = None
    ab_analysis: dict | None = None
    source_warnings: list[str] = []
    quality_control: dict | None = None
    processing_applied: dict
    target_profile_used: dict


class CodecPreviewResponse(BaseModel):
    codec: str
    format: str
    bitrate: str
    analysis_original: dict
    analysis_codec_preview: dict
    true_peak_delta_db: float
    lufs_delta_db: float
    spectral_balance_change_db: dict
    high_frequency_change_db: float
    lossy_file_size_bytes: int
    preview_download_url: str


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


class AnalyzeResponse(BaseModel):
    analysis: dict
    input_validation: dict


class PreviewParamsResponse(BaseModel):
    processing_params: dict


class PresetSummary(BaseModel):
    name: str
    description: str
    genre: str
    style: str
    tags: list[str]
    tweaks: dict
    use_stem_separation: bool
    output_format: str
