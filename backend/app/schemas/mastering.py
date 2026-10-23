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
    # 0..1, as reported by the analyzers (see chord_service.py). Optional
    # so older clients and cached results stay valid.
    bpm_confidence: float | None = None
    key_confidence: float | None = None
    # Detected beat positions in seconds, and how many to group per bar.
    # The UI lays chords on this grid (ChordGrid.jsx) instead of a flat
    # list, and chord boundaries are snapped to these server-side.
    #
    # These MUST be declared here: FastAPI filters the handler's return
    # value through this response_model, so a field the model does not
    # know about is dropped silently — the service returned 63 beats and
    # the endpoint delivered none, with no error anywhere.
    #
    # Optional, because a track whose tempo cannot be tracked legitimately
    # has no grid, and older cached results predate these fields.
    beats: list[float] | None = None
    beats_per_bar: int | None = None


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
