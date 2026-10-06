"""Blind A/B: one mix mastered at every correction calibration (and, with
--engines, on both engines), for choosing by ear.

The calibrations differ only in how readily and how far the engine
corrects measured tonal problems (planning/config.py: CALIBRATIONS). What
the measurements cannot settle is which one SOUNDS right, so this renders
each and hands you level-matched files with neutral names.

Usage (from backend/):
  python -m benchmark.calibration_ab path/to/mix.wav --genre pop
  python -m benchmark.calibration_ab mix1.wav mix2.wav --genre rock --style modern --engines
  python -m benchmark.calibration_ab mix.wav --excerpt 60,40      # listen to 1:00-1:40 only

Writes, per track, under --out (default benchmark/results/calibration-<date>/):
  <track>/listening/A.wav, B.wav, ...   every version incl. the raw mix,
                                         gain-matched to one loudness
  <track>/key.json                       which letter is which + what each
                                         version's plan decided (keep it
                                         away from the listening)
  BALLOT.md                              what to listen for and what to send back

Loudness is matched with gain only (benchmark.run_benchmark.listening_set),
so no version wins by being louder; nothing is limited or altered.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import tempfile
from datetime import date
from pathlib import Path

import soundfile as sf

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from ai_mastering.mastering import master_track  # noqa: E402
from ai_mastering.planning import config as C  # noqa: E402
from benchmark.metrics import compare  # noqa: E402
from benchmark.run_benchmark import SR, listening_set, load  # noqa: E402

BALLOT = """# Calibration listening test

Each folder under this one is one mix. Inside `listening/`, every file is
the same mix: the raw mix plus one master per calibration{engines}. All are
gain-matched to the same loudness, so judge tone and punch, not volume.

Do NOT open the `key.json` files until you have written your answers down.

For each track, listen on the system you trust (and ideally on earbuds
too) and note:

1. **Ranking**, best to worst (e.g. `C > A > D > B`).
2. For each master: is the tonal correction **too little**, **right** or
   **too much**? Anything that sounds worse than the raw mix?
3. Drums: any version that sounds smaller or softer than the others?

Send the answers back as-is; the key maps each letter to its calibration
and lists exactly which EQ moves that version made.
"""


def summarize(result: dict) -> dict:
    diag = result["processing_applied"]["mastering_diagnostics"]
    plan = diag["mastering_plan"]
    return {
        "eq_decisions": [
            f"{e['filter_type']} {e['frequency_hz']:.0f} Hz {e['gain_db']:+.2f} dB ({e.get('problem') or e['reason']})" for e in plan["eq_decisions"]
        ],
        "rejected": [f"{r['stage']}: {r['reason']}" for r in plan["rejected_decisions"] if r["stage"] in ("eq", "dynamic_eq", "deesser")],
        "target_lufs": plan["loudness"]["target_lufs"],
        "backoff_applied": diag["backoff_applied"],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("mixes", nargs="+")
    parser.add_argument("--genre", default="pop")
    parser.add_argument("--style", default="modern")
    parser.add_argument("--tags", default="", help="comma-separated")
    parser.add_argument("--tier", default="standard", choices=["standard", "professional"])
    parser.add_argument("--engines", action="store_true", help="also render the default calibration on the other engine")
    parser.add_argument("--out", default=None)
    parser.add_argument("--seed", type=int, default=None, help="letter shuffle seed (default: random)")
    parser.add_argument("--excerpt", default=None, metavar="START,SECONDS", help="trim the LISTENING files (mastering still runs on the full mix), e.g. 60,40")
    args = parser.parse_args()

    out = Path(args.out) if args.out else BACKEND / "benchmark/results" / f"calibration-{date.today().isoformat()}"
    out.mkdir(parents=True, exist_ok=True)
    rng = random.Random(args.seed)
    tags = [t for t in args.tags.split(",") if t]
    other_tier = "professional" if args.tier == "standard" else "standard"

    for mix_path in map(Path, args.mixes):
        track = mix_path.stem
        print(f"== {track}")
        source = load(mix_path)
        versions = {"raw mix": source}
        details = {}
        jobs = [(cal, args.tier) for cal in C.CALIBRATIONS]
        if args.engines:
            jobs.append((C.DEFAULT_CALIBRATION, other_tier))
        with tempfile.TemporaryDirectory() as tmp:
            src_wav = Path(tmp) / "src.wav"
            sf.write(str(src_wav), source, SR, subtype="FLOAT")
            for cal, tier in jobs:
                name = f"{cal} / {tier}"
                master_wav = Path(tmp) / f"{cal}_{tier}.wav"
                with C.calibration(cal):
                    result = master_track(str(src_wav), str(master_wav), args.genre, tags, style=args.style, tier=tier)
                audio = load(master_wav)
                versions[name] = audio
                metrics = compare(source, audio, SR)
                details[name] = {**summarize(result), "punch_loss": metrics.get("punch_loss"), "benchmark_flags": metrics["failures"]}
                print(f"   {name:28s} {len(details[name]['eq_decisions'])} EQ moves, punch loss {details[name]['punch_loss']}")
        if args.excerpt:
            start_s, dur_s = (float(v) for v in args.excerpt.split(","))
            a, b = int(start_s * SR), int((start_s + dur_s) * SR)
            versions = {k: v[a:b] for k, v in versions.items()}
        matched = listening_set(versions, out / track / "listening", rng)
        key = {"track": str(mix_path), "genre": args.genre, "style": args.style, "tags": tags, "matched_lufs": matched["matched_lufs"], "letters": {}}
        for letter, name in matched["key"].items():
            key["letters"][letter] = {"version": name, **details.get(name, {})}
        (out / track / "key.json").write_text(json.dumps(key, indent=2))

    (out / "BALLOT.md").write_text(BALLOT.format(engines=" (and the default calibration on the other engine)" if args.engines else ""))
    print(f"\nListening sets: {out}\nRead {out / 'BALLOT.md'} first; keep key.json closed until you have ranked.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
