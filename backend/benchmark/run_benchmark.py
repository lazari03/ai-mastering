"""Listening benchmark: Auralith vs. reference masters on licensed mixes.

Corpus layout (see benchmark/__init__.py):
  corpus/<track_id>/meta.json        {"genre": "rock", "tags": ["rock_drums", "loud_source"], "license": "..."}
  corpus/<track_id>/mix.wav          the unmastered mix
  corpus/<track_id>/refs/<name>.wav  other masters of the same mix (emastered.wav, human.wav, ...)

For each track this masters mix.wav with the current engine, then measures
every version (Auralith + each ref) against the mix at matched loudness
(benchmark/metrics.py): loudness, true peak, PLR, band balance, punch,
pumping, and the four heard-failure flags.

Outputs, under --out (default benchmark/results/<date>):
  report.json          every number
  report.md            one table per track + a failure summary
  listening/<track>/   every version gain-matched to the same loudness
                       (gain only, never limited) with neutral names A, B, C…
  listening_key.json   which letter is which — keep it away from listeners

Usage (from backend/):
  python -m benchmark.run_benchmark --corpus benchmark/corpus
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import tempfile
from datetime import date
from pathlib import Path

import numpy as np
import pyloudnorm as pyln
import soundfile as sf

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from ai_mastering.audio_utils import _load_audio, _true_peak_db  # noqa: E402
from ai_mastering.mastering import master_track  # noqa: E402
from benchmark.metrics import compare  # noqa: E402

SR = 44100
LISTENING_PEAK_CEILING_DBTP = -1.0


def load(path: Path) -> np.ndarray:
    audio, _ = _load_audio(str(path), sr=SR)
    return np.asarray(audio, dtype=np.float32)


def listening_set(versions: dict[str, np.ndarray], out_dir: Path, rng: random.Random) -> dict[str, str]:
    """Gain-match every version to one loudness — the quietest one, lowered
    further if needed so no version's true peak exceeds the ceiling after
    matching. Gain only: nothing is limited, so no version is altered."""
    meter = pyln.Meter(SR)
    lufs = {k: float(meter.integrated_loudness(v)) for k, v in versions.items()}
    target = min(lufs.values())
    for k, v in versions.items():
        tp_after = float(_true_peak_db(v)) + (target - lufs[k])
        if tp_after > LISTENING_PEAK_CEILING_DBTP:
            target -= tp_after - LISTENING_PEAK_CEILING_DBTP
    names = list(versions)
    rng.shuffle(names)
    out_dir.mkdir(parents=True, exist_ok=True)
    key = {}
    for i, name in enumerate(names):
        letter = chr(ord("A") + i)
        gain = 10 ** ((target - lufs[name]) / 20.0)
        sf.write(str(out_dir / f"{letter}.wav"), versions[name] * gain, SR, subtype="PCM_24")
        key[letter] = name
    return {"matched_lufs": round(target, 2), "key": key}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus", default=str(BACKEND / "benchmark/corpus"))
    parser.add_argument("--out", default=None)
    parser.add_argument("--tier", default="standard", choices=["standard", "professional"])
    parser.add_argument("--seed", type=int, default=0, help="shuffles the listening letters")
    args = parser.parse_args()

    corpus = Path(args.corpus)
    tracks = sorted(p for p in corpus.iterdir() if (p / "mix.wav").exists()) if corpus.exists() else []
    if not tracks:
        raise SystemExit(f"No tracks in {corpus} — see benchmark/__init__.py for the layout.")
    out = Path(args.out or BACKEND / "benchmark/results" / date.today().isoformat())
    out.mkdir(parents=True, exist_ok=True)
    rng = random.Random(args.seed)

    report, keys = {"date": date.today().isoformat(), "tier": args.tier, "tracks": {}}, {}
    for track in tracks:
        meta = json.loads((track / "meta.json").read_text()) if (track / "meta.json").exists() else {}
        mix = load(track / "mix.wav")
        with tempfile.TemporaryDirectory() as tmp:
            mastered_path = Path(tmp) / "auralith.wav"
            master_track(
                input_path=str(track / "mix.wav"),
                output_path=str(mastered_path),
                genre=meta.get("genre", "pop"),
                tags=[],
                tweaks={},
                style=meta.get("style", "modern"),
                tier=args.tier,
            )
            versions = {"auralith": load(mastered_path)}
        for ref in sorted((track / "refs").glob("*.wav")) if (track / "refs").exists() else []:
            versions[ref.stem] = load(ref)

        results = {name: compare(mix, audio, SR) for name, audio in versions.items()}
        listening = listening_set({"mix": mix, **versions}, out / "listening" / track.name, rng)
        keys[track.name] = listening["key"]
        report["tracks"][track.name] = {"meta": meta, "versions": results, "listening_matched_lufs": listening["matched_lufs"]}
        flags = {n: [f["kind"] for f in r["failures"]] for n, r in results.items()}
        print(f"{track.name}: " + ", ".join(f"{n} {'ok' if not f else '/'.join(f)}" for n, f in flags.items()))

    (out / "report.json").write_text(json.dumps(report, indent=1))
    (out / "listening_key.json").write_text(json.dumps(keys, indent=1))
    (out / "report.md").write_text(render_markdown(report))
    print(f"\nWrote {out}/report.md, report.json, listening/ and listening_key.json")
    return 0


def render_markdown(report: dict) -> str:
    cols = ["lufs", "true_peak_dbtp", "plr_db", "low_end_change_db", "high_change_db", "punch_loss", "pumping_db"]
    lines = [f"# Mastering benchmark — {report['date']} ({report['tier']} tier)", ""]
    totals: dict[str, dict[str, int]] = {}
    for track, data in report["tracks"].items():
        tags = ", ".join(data["meta"].get("tags", []))
        lines += [f"## {track}" + (f" ({tags})" if tags else ""), "", "| version | " + " | ".join(cols) + " | failures |", "|" + "---|" * (len(cols) + 2)]
        for name, r in data["versions"].items():
            kinds = [f["kind"] for f in r["failures"]]
            lines.append(f"| {name} | " + " | ".join(str(r[c]) for c in cols) + f" | {', '.join(kinds) or '—'} |")
            t = totals.setdefault(name, {"tracks": 0, "clean": 0})
            t["tracks"] += 1
            t["clean"] += 0 if kinds else 1
        lines.append("")
    lines += ["## Summary", "", "| version | tracks with no heard-failure flags |", "|---|---|"]
    lines += [f"| {n} | {t['clean']} / {t['tracks']} |" for n, t in totals.items()]
    lines += ["", "All measurements at matched loudness against the unmastered mix. Flags are guardrails, not a verdict — the blind listening results decide."]
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    raise SystemExit(main())
