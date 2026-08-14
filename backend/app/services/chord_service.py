from __future__ import annotations

import collections
import collections.abc
import uuid
import warnings
from pathlib import Path

import essentia.standard as es
import numpy as np
from fastapi import HTTPException, UploadFile

from app.core.config import settings
from app.services.mastering_service import _decode_input_if_required

# madmom (0.16.1, last released 2018) predates Python 3.10's collections.abc
# move and numpy's removal of the np.float/np.int/... aliases. Patch the
# missing names in before import rather than forking/patching the package.
for _name in ("MutableSequence", "MutableMapping", "Mapping", "Sequence", "Iterable", "Callable"):
    if not hasattr(collections, _name):
        setattr(collections, _name, getattr(collections.abc, _name))
for _name, _alias in (("float", float), ("int", int), ("bool", bool), ("object", object), ("complex", complex), ("str", str)):
    if not hasattr(np, _name):
        setattr(np, _name, _alias)

with warnings.catch_warnings():
    warnings.simplefilter("ignore")
    from madmom.audio.chroma import DeepChromaProcessor
    from madmom.features.chords import DeepChromaChordRecognitionProcessor

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
_NOTE_TO_PC = {
    "C": 0, "B#": 0,
    "C#": 1, "Db": 1,
    "D": 2,
    "D#": 3, "Eb": 3,
    "E": 4, "Fb": 4,
    "E#": 5, "F": 5,
    "F#": 6, "Gb": 6,
    "G": 7,
    "G#": 8, "Ab": 8,
    "A": 9,
    "A#": 10, "Bb": 10,
    "B": 11, "Cb": 11,
}

# madmom's own model ships its own frame rate; a single processor pair is
# reused across requests since loading the CNN weights is the slow part.
_CHROMA_PROCESSOR = DeepChromaProcessor()
_CHORD_PROCESSOR = DeepChromaChordRecognitionProcessor()

_MIN_SEGMENT_SECONDS = 0.3


def _madmom_label_to_display(label: str) -> str:
    if label == "N":
        return "N"
    root, _, quality = label.partition(":")
    pc = _NOTE_TO_PC.get(root)
    if pc is None:
        return label
    return NOTE_NAMES[pc] + ("m" if quality == "min" else "")


def _drop_short_segments(segments: list[dict], min_seconds: float = _MIN_SEGMENT_SECONDS) -> list[dict]:
    # Fold segments shorter than min_seconds into a neighbor (extending the
    # neighbor's boundary so total time coverage never gaps), then re-merge
    # any adjacent same-chord runs that resulted from a merge.
    segments = [dict(seg) for seg in segments]
    if len(segments) <= 1:
        return segments

    changed = True
    while changed and len(segments) > 1:
        changed = False
        for i, seg in enumerate(segments):
            if seg["end"] - seg["start"] >= min_seconds:
                continue
            if i > 0:
                segments[i - 1]["end"] = seg["end"]
                del segments[i]
            elif i + 1 < len(segments):
                segments[i + 1]["start"] = seg["start"]
                del segments[i]
            else:
                break
            changed = True
            break  # indices shifted after a delete — rescan from the top

    merged = []
    for seg in segments:
        if merged and merged[-1]["chord"] == seg["chord"]:
            merged[-1]["end"] = seg["end"]
        else:
            merged.append(dict(seg))
    return merged


def analyze_chords_from_path(audio_path: str) -> dict:
    """Pure path-in, JSON-out analysis. Chords come from madmom's
    DeepChroma + CNN/HMM chord recognizer (Korzeniowski & Widmer) — a trained
    model, not template matching, which is what actually gets this close to
    Chordify-grade output. Tempo/key stay on Essentia, which was already solid.
    Still a heuristic estimate, not ground truth — expect occasional misses on
    ambiguous or heavily produced passages."""
    audio = es.MonoLoader(filename=str(audio_path))()
    duration = float(len(audio)) / 44100.0

    tempo, _beats, _confidence, _, _intervals = es.RhythmExtractor2013(method="multifeature")(audio)
    tempo = float(tempo)

    key, scale, _key_strength = es.KeyExtractor()(audio)
    key_label = f"{key} {scale}"

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        chroma = _CHROMA_PROCESSOR(audio_path)
        raw_segments = _CHORD_PROCESSOR(chroma)

    segments = [
        {"start": round(float(start), 2), "end": round(min(float(end), duration), 2), "chord": _madmom_label_to_display(label)}
        for start, end, label in raw_segments
    ]
    segments = _drop_short_segments(segments)

    return {
        "bpm": round(tempo, 1),
        "key": key_label,
        "duration": round(duration, 2),
        "chords": segments,
    }


def analyze_chords(file: UploadFile) -> dict:
    if file.size and file.size > settings.max_upload_size_mb * 1024 * 1024:
        raise HTTPException(413, f"Uploaded file exceeds {settings.max_upload_size_mb}MB limit")

    job_id = str(uuid.uuid4())[:8]
    input_ext = Path(file.filename or "").suffix or ".wav"
    input_path = settings.upload_dir / f"{job_id}_chords_input{input_ext}"

    with input_path.open("wb") as handle:
        handle.write(file.file.read())

    decoded_path = _decode_input_if_required(job_id, input_path, input_ext)

    try:
        return analyze_chords_from_path(str(decoded_path))
    except Exception as exc:  # pragma: no cover
        raise HTTPException(500, f"Could not decode audio: {exc}") from exc
