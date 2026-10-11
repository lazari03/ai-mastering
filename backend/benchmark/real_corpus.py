"""Real-audio corpus for the regression gate (`regression --real`).

Sources, in order:
  1. MANIFEST below: committed, licensed audio (decoded to wav with the
     engine's own loader, so the gate sees exactly what an upload sees).
  2. Any <id>/mix.wav + meta.json found in the git-ignored
     backend/benchmark/corpus/. meta.json MUST carry a non-empty "license"
     field; entries without one are skipped and reported.

Adding a licensed track (e.g. "Dune Slinger") - product owner:
  mkdir -p backend/benchmark/corpus/dune_slinger
  cp <the mix, wav> backend/benchmark/corpus/dune_slinger/mix.wav
  echo '{"genre":"rock","license":"owned by <name>; internal QA use"}' > backend/benchmark/corpus/dune_slinger/meta.json
  python -m benchmark.regression --real --write benchmark/baselines/real.json   # REVIEWED re-baseline
Never commit the audio itself (the directory is git-ignored). A baseline
written with extra tracks only gates runs that also have those tracks;
tracks missing from the current run show up as drift ("presence"), so for CI
(which lacks private audio) keep the committed baseline to MANIFEST tracks.
Use --only-manifest to build only the committed sources.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import sys
from pathlib import Path

import soundfile as sf

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
REPO = BACKEND.parent
USER_CORPUS = BACKEND / "benchmark" / "corpus"

from ai_mastering.audio_utils import _load_audio  # noqa: E402

MANIFEST: dict[str, dict] = {
    "pop_homepage_demo": {
        "path": "frontend/public/audio/demos/pop-before.mp3",
        "meta": {"genre": "pop", "license": "project-owned homepage demo"},
    },
}


def _sha16(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def build(dest: Path, include_user: bool = True) -> tuple[Path, dict]:
    """Assemble `dest` (<id>/mix.wav + meta.json). Returns (dest, info) where
    info lists included sources (with source hashes) and skipped entries."""
    dest.mkdir(parents=True, exist_ok=True)
    info: dict = {"included": {}, "skipped": {}}
    for tid, entry in MANIFEST.items():
        src = REPO / entry["path"]
        if not src.exists():
            info["skipped"][tid] = f"missing committed source {entry['path']}"
            continue
        audio, sr = _load_audio(src)  # (samples, channels) float32, the engine's decode
        (dest / tid).mkdir(exist_ok=True)
        sf.write(str(dest / tid / "mix.wav"), audio, sr, format="WAV", subtype="FLOAT")
        (dest / tid / "meta.json").write_text(json.dumps(entry["meta"]))
        info["included"][tid] = {"source": entry["path"], "sha256_16": _sha16(src), "license": entry["meta"]["license"], "origin": "manifest"}
    if include_user and USER_CORPUS.exists():
        for d in sorted(p for p in USER_CORPUS.iterdir() if (p / "mix.wav").exists()):
            if d.name in info["included"]:
                info["skipped"][d.name] = "id collides with a manifest track"
                continue
            try:
                meta = json.loads((d / "meta.json").read_text())
            except Exception:
                meta = {}
            lic = meta.get("license") if isinstance(meta, dict) else None
            if not (isinstance(lic, str) and lic.strip()):
                info["skipped"][d.name] = "meta.json has no 'license' field"
                continue
            (dest / d.name).mkdir(exist_ok=True)
            shutil.copy2(d / "mix.wav", dest / d.name / "mix.wav")
            (dest / d.name / "meta.json").write_text(json.dumps(meta))
            info["included"][d.name] = {"source": f"benchmark/corpus/{d.name}/mix.wav", "sha256_16": _sha16(d / "mix.wav"), "license": lic, "origin": "user"}
    return dest, info
