"""Regression/validation harness for the mastering engine.

Runs every genre target profile against every genuinely distinct source file
in uploads/ (deduped by content — most of that folder is repeat uploads of
the same handful of tracks from earlier manual testing), across both tiers,
and checks each render against hard spec (no NaN, true-peak ceiling, no full
clipping) and soft sanity bounds (LUFS proximity to target, dynamic range not
collapsed). This is the "no regression testing" gap flagged earlier — a
reusable script, not another one-off.

NOTE ON SCOPE: none of the source files are genre-labeled, so this validates
engine ROBUSTNESS and SPEC COMPLIANCE across genre-profile x content
diversity — crashes, NaN, true-peak violations, wildly-off loudness — not
"does it sound authentically genre-appropriate", which needs labeled
material and/or actual listening.
"""

from __future__ import annotations

import json
import sys
import time
import traceback
from pathlib import Path

import numpy as np
import soundfile as sf

from adaptive_mastering import master_track
from params import list_genres

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
OUT_DIR = Path(__file__).resolve().parent.parent / "outputs" / "_validation"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Deduped by content (verified via file size) — every other *_input.* file in
# uploads/ is a byte-identical repeat upload of one of these six.
SOURCE_FILES = [
    "cebe2134_input.wav",  # 10s wav — very short, edge case
    "2ff21241_input.mp3",  # 21s mp3 @ 48kHz — short, tests resample path
    "0e2a92a2_input.mp3",  # 191s mp3
    "6f84542d_input.mp3",  # 196s mp3
    "0fa5b4d4_input.m4a",  # 290s m4a — longest, tests ffmpeg decode path
    "36214c2a_input.wav",  # 212s wav — the track used throughout manual testing this session
]

GENRE_TARGET_LUFS_TOLERANCE = 2.5  # LUFS — soft check, engine intentionally limits how hard it pushes
TRUE_PEAK_CEILING_STANDARD = -0.9  # dBTP, small margin over the -1.0 target for the non-true-peak-aware path
TRUE_PEAK_CEILING_PRO = -0.95  # dBTP, tighter since the pro limiter is oversampled/true-peak-accurate
MIN_DYNAMIC_RANGE_DB = 2.0  # crest factor floor — below this the master is almost certainly over-limited


def check_render(output_path: Path, target_lufs: float, tier: str) -> list[str]:
    problems = []
    audio, sr = sf.read(str(output_path), dtype="float32", always_2d=True)

    if not np.all(np.isfinite(audio)):
        problems.append("NaN/Inf in rendered audio")
        return problems  # nothing else is meaningful if this fails

    peak = float(np.max(np.abs(audio)))
    if peak >= 0.999:
        problems.append(f"full-scale clipping (peak={peak:.4f})")

    return problems


def run_case(input_path: Path, genre: str, tier: str) -> dict:
    job_id = f"{input_path.stem}_{genre}_{tier}"
    output_path = OUT_DIR / f"{job_id}.wav"
    t0 = time.time()
    problems = []

    try:
        result = master_track(
            input_path=str(input_path),
            output_path=str(output_path),
            genre=genre,
            tags=[],
            tweaks={},
            style="modern",
            enable_stem_separation=False,
            tier=tier,
        )
    except Exception as exc:  # noqa: BLE001 — deliberately broad, this is a crash detector
        return {
            "input": input_path.name,
            "genre": genre,
            "tier": tier,
            "status": "CRASH",
            "error": f"{type(exc).__name__}: {exc}",
            "traceback": traceback.format_exc(limit=6),
            "elapsed_s": round(time.time() - t0, 1),
        }

    elapsed = time.time() - t0
    after = result["analysis_after"]
    target_lufs = result["target_profile_used"]["target_lufs"]
    true_peak_db = after.get("true_peak_db")
    dynamic_range_db = after.get("dynamic_range_db")

    problems += check_render(output_path, target_lufs, tier)

    ceiling = TRUE_PEAK_CEILING_PRO if tier == "professional" else TRUE_PEAK_CEILING_STANDARD
    if true_peak_db is not None and true_peak_db > ceiling:
        problems.append(f"true peak {true_peak_db:.2f}dBTP exceeds {ceiling}dBTP ceiling")

    lufs_delta = abs(after["integrated_lufs"] - target_lufs)
    if lufs_delta > GENRE_TARGET_LUFS_TOLERANCE:
        problems.append(f"LUFS {after['integrated_lufs']:.1f} vs target {target_lufs:.1f} (delta {lufs_delta:.1f} > {GENRE_TARGET_LUFS_TOLERANCE})")

    if dynamic_range_db is not None and dynamic_range_db < MIN_DYNAMIC_RANGE_DB:
        problems.append(f"dynamic range collapsed to {dynamic_range_db:.2f}dB (floor {MIN_DYNAMIC_RANGE_DB})")

    # Cleanup rendered file — this is a validation run, not archival.
    output_path.unlink(missing_ok=True)

    return {
        "input": input_path.name,
        "genre": genre,
        "tier": tier,
        "status": "PASS" if not problems else "FAIL",
        "problems": problems,
        "integrated_lufs": round(after["integrated_lufs"], 2),
        "target_lufs": round(target_lufs, 2),
        "true_peak_db": round(true_peak_db, 2) if true_peak_db is not None else None,
        "dynamic_range_db": round(dynamic_range_db, 2) if dynamic_range_db is not None else None,
        "elapsed_s": round(elapsed, 1),
    }


def main() -> int:
    genres = list_genres()
    tier_arg = sys.argv[1] if len(sys.argv) > 1 else "standard"
    tiers = [tier_arg] if tier_arg != "both" else ["standard", "professional"]

    results = []
    total = len(SOURCE_FILES) * len(genres) * len(tiers)
    n = 0
    for tier in tiers:
        for filename in SOURCE_FILES:
            input_path = UPLOAD_DIR / filename
            if not input_path.exists():
                continue
            for genre in genres:
                n += 1
                r = run_case(input_path, genre, tier)
                results.append(r)
                status = r["status"]
                marker = "OK" if status == "PASS" else status
                print(f"[{n}/{total}] {marker:6s} {filename:24s} {genre:10s} {tier:12s} ({r['elapsed_s']}s)", flush=True)
                if status != "PASS":
                    for p in r.get("problems", [r.get("error", "")]):
                        print(f"         -> {p}", flush=True)

    report_path = Path(__file__).resolve().parent / "validation_report.json"
    with report_path.open("w") as handle:
        json.dump(results, handle, indent=2)

    passed = sum(1 for r in results if r["status"] == "PASS")
    failed = sum(1 for r in results if r["status"] == "FAIL")
    crashed = sum(1 for r in results if r["status"] == "CRASH")
    print(f"\n{passed}/{len(results)} passed, {failed} failed, {crashed} crashed. Report: {report_path}")
    return 0 if (failed == 0 and crashed == 0) else 1


if __name__ == "__main__":
    raise SystemExit(main())
