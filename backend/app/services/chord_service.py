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


# 4/4 assumed. RhythmExtractor2013 gives beats but not downbeats, and
# guessing a meter from beat intervals alone is unreliable; 4/4 covers the
# overwhelming majority of the popular material this tool is used on. The
# UI treats this as a display grouping only — nothing in the analysis
# depends on it being right.
_BEATS_PER_BAR = 4

# How far a boundary may be pulled, as a FRACTION of the local beat
# interval — not an absolute number of seconds.
#
# An absolute tolerance cannot work: at 120 bpm beats are 0.5 s apart, so
# any constant of 0.25 s means every possible timestamp is within reach of
# some beat and the guard never fires — syncopation gets flattened onto
# the grid along with the jitter. As a fraction, a change on the "and"
# (half a beat away) is always safely outside the window at any tempo,
# while detector jitter of a few tens of milliseconds is always inside it.
_SNAP_TOLERANCE_BEATS = 0.25


def _snap_segments_to_beats(segments: list[dict], beats: list[float]) -> list[dict]:
    """Quantise chord boundaries onto detected beats.

    The chord recogniser reports where the harmony actually changed in the
    audio, which is rarely exactly on a beat. Rendered on a grid those few
    tens of milliseconds read as the chart sliding against the song. This
    pulls each boundary to its nearest beat when one is close enough,
    leaving genuinely off-beat changes where they are.

    Returns segments with boundaries still non-overlapping and ordered;
    zero-length results are left for _drop_short_segments to remove.
    """
    if not segments or len(beats) < 2:
        return segments

    import bisect

    def nearest_beat(t: float) -> float:
        i = bisect.bisect_left(beats, t)
        candidates = []
        if i > 0:
            candidates.append(beats[i - 1])
        if i < len(beats):
            candidates.append(beats[i])
        if not candidates:
            return t
        best = min(candidates, key=lambda b: abs(b - t))
        # Local interval, not a global average: live/human tempo drifts,
        # and a window sized from the wrong part of the song would snap
        # too eagerly in fast sections and not at all in slow ones.
        j = beats.index(best)
        neighbours = [abs(best - beats[k]) for k in (j - 1, j + 1) if 0 <= k < len(beats)]
        interval = min(neighbours) if neighbours else 0.5
        return best if abs(best - t) <= interval * _SNAP_TOLERANCE_BEATS else t

    snapped = [dict(seg) for seg in segments]
    for seg in snapped:
        seg["start"] = round(nearest_beat(float(seg["start"])), 3)
        seg["end"] = round(nearest_beat(float(seg["end"])), 3)

    # Re-seal the timeline: a boundary that moved must move for both the
    # segment that ends there and the one that starts there, or the grid
    # develops gaps and overlaps that are visible as flicker during
    # playback.
    for i in range(len(snapped) - 1):
        if snapped[i]["end"] != snapped[i + 1]["start"]:
            snapped[i]["end"] = snapped[i + 1]["start"]
    return [seg for seg in snapped if seg["end"] > seg["start"]]


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

    # beats were previously discarded as `_beats`. They are the single most
    # useful thing this extractor produces for display: chord boundaries
    # from the recogniser are raw acoustic timings that land wherever the
    # model happened to switch, typically a few tens of milliseconds off
    # the actual beat. Shown on a grid, that reads as the chart drifting
    # against the music. Snapping to these beats is what a Chordify-style
    # view is really doing.
    tempo, beats, beat_confidence, _, _intervals = es.RhythmExtractor2013(method="multifeature")(audio)
    tempo = float(tempo)
    beats = [float(b) for b in beats]

    key, scale, key_strength = es.KeyExtractor()(audio)
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
    # Order matters: snap first (so boundaries sit on beats), then drop
    # shorts again — snapping can collapse a segment to zero length when
    # two changes fall either side of one beat.
    segments = _drop_short_segments(_snap_segments_to_beats(segments, beats))

    return {
        "bpm": round(tempo, 1),
        # Exposed so the UI can lay chords on a real beat/bar grid instead
        # of a flat wrapping list. Rounded to ms — anything finer is below
        # the accuracy of the detector and just inflates the payload.
        "beats": [round(b, 3) for b in beats],
        "beats_per_bar": _BEATS_PER_BAR,
        "key": key_label,
        "duration": round(duration, 2),
        "chords": segments,
        # Confidence the analyzers themselves report, normalised to 0..1.
        # RhythmExtractor2013's multifeature confidence runs 0..5.32
        # (Essentia docs: >3.5 is very reliable); KeyExtractor's strength
        # is already 0..1.
        "bpm_confidence": round(min(max(float(beat_confidence) / 5.32, 0.0), 1.0), 3),
        "key_confidence": round(min(max(float(key_strength), 0.0), 1.0), 3),
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
