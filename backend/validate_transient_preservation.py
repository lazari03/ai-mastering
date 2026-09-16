"""Regression suite for the transient-aware mastering architecture
(deadband/HF-presence budget work + transient budget / clipper-bypass /
compression-damping / post-render transient QC).

Same convention as validate_mastering.py — a standalone script, not pytest
(this repo has no pytest infra), run manually:
    python3 validate_transient_preservation.py

Uses SYNTHETIC sources, not one specific test track — per the brief this
was written against ("do not overfit to the current test song... do not
add track-specific conditions"), every scenario below is generated
programmatically from parameters (transient sharpness, bed level, existing
compression), so nothing here can accidentally encode one waveform's
fingerprint. Real diverse genre-labeled audio isn't available in this
sandbox; this validates the DECISION ARCHITECTURE (does the budget actually
shrink/grow the way it should, does the clipper/compressor actually bypass
when the spec says it should) across a deliberately varied set of
synthetic sources, not final audible quality — that still needs real
material and ears (see the engineering report's "remaining weaknesses").
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ai_mastering.mastering import master_track, analyze_for_preview
from ai_mastering.mastering_params import compute_processing_params

SR = 44100
TMP = Path(tempfile.mkdtemp(prefix="af_transient_validate_"))


def _make_source(
    duration_s: float = 15.0,
    bpm: float = 120.0,
    bed_level: float = 0.15,
    hit_decay_s: float = 0.15,
    hit_level: float = 0.9,
    pre_limited: bool = False,
    wide: bool = True,
) -> np.ndarray:
    """Synthetic drum+bed source, parameterized so every scenario below is
    a deliberate, documented choice of these knobs — not a real file."""
    n = int(SR * duration_s)
    t = np.linspace(0, duration_s, n, endpoint=False)
    beat_s = 60.0 / bpm
    audio = np.zeros(n, dtype=np.float64)
    bed = bed_level * np.sin(2 * np.pi * 220 * t) + (bed_level * 0.5) * np.sin(2 * np.pi * 440 * t)
    rng = np.random.default_rng(1234)
    for beat_i in range(int(duration_s / beat_s)):
        onset_sample = int(beat_i * beat_s * SR)
        if onset_sample >= n:
            break
        is_kick = beat_i % 2 == 0
        dur_samples = min(int(hit_decay_s * SR * 4), n - onset_sample)
        if dur_samples <= 0:
            continue
        tt = np.arange(dur_samples) / SR
        freq = 60.0 if is_kick else 200.0
        envelope = np.exp(-tt / hit_decay_s)
        click = rng.standard_normal(dur_samples) * 0.3
        tone = np.sin(2 * np.pi * freq * tt)
        hit = (tone * 0.7 + click * 0.3) * envelope * hit_level
        audio[onset_sample : onset_sample + dur_samples] += hit
    audio = audio + bed
    if pre_limited:
        # Simulate an already-compressed/limited source: soft-clip hard,
        # then normalize — collapses crest factor the same way real
        # over-limited source material does.
        audio = np.tanh(audio * 4.0) / np.tanh(4.0)
    peak = np.max(np.abs(audio)) or 1.0
    audio = audio / peak * 0.85
    right = audio * (0.98 if wide else 1.0)
    return np.stack([audio, right], axis=1).astype(np.float32)


def _write(name: str, audio: np.ndarray) -> str:
    path = str(TMP / f"{name}.wav")
    sf.write(path, audio, SR, subtype="PCM_24")
    return path


SCENARIOS = {
    "transient_heavy_rock": dict(bed_level=0.05, hit_decay_s=0.06, hit_level=1.0, genre="rock"),
    "heavily_compressed_rock": dict(bed_level=0.3, hit_decay_s=0.15, hit_level=0.6, pre_limited=True, genre="rock"),
    "soft_rock": dict(bed_level=0.35, hit_decay_s=0.3, hit_level=0.4, genre="rock"),
    "metal_transient_heavy": dict(bed_level=0.06, hit_decay_s=0.05, hit_level=1.0, bpm=160, genre="metal"),
    "pop_moderate": dict(bed_level=0.2, hit_decay_s=0.15, hit_level=0.7, genre="pop"),
    "edm_strong_kick": dict(bed_level=0.25, hit_decay_s=0.12, hit_level=0.85, bpm=128, genre="edm"),
    "hiphop_strong_kick_snare": dict(bed_level=0.15, hit_decay_s=0.1, hit_level=0.9, bpm=95, genre="hiphop"),
    "acoustic_natural_drums": dict(bed_level=0.3, hit_decay_s=0.2, hit_level=0.6, genre="acoustic"),
    "already_mastered_loud": dict(bed_level=0.3, hit_decay_s=0.1, hit_level=0.7, pre_limited=True, genre="pop"),
    "highly_dynamic": dict(bed_level=0.08, hit_decay_s=0.25, hit_level=0.9, genre="classical"),
    "weak_flat_drums": dict(bed_level=0.4, hit_decay_s=0.4, hit_level=0.15, genre="pop"),
    "bass_heavy": dict(bed_level=0.5, hit_decay_s=0.2, hit_level=0.6, genre="hiphop"),
}


def run() -> int:
    failures = []
    print(f"{'scenario':32s} {'genre':10s} {'health':>7s} {'comp_bg':>8s} {'clip_bg':>8s} {'clipper':>8s} {'glue':>6s} {'tp_ok':>6s} {'dr_ok':>6s} {'tqc':>5s}")
    for name, cfg in SCENARIOS.items():
        genre = cfg.pop("genre")
        audio = _make_source(**cfg)
        path = _write(name, audio)

        preview = analyze_for_preview(path)
        params = compute_processing_params(preview["analysis"], genre=genre, tags=[], style="modern")
        budgets = params["transient_budgets"]

        out_path = str(TMP / f"{name}_mastered.wav")
        try:
            result = master_track(path, out_path, genre=genre, tags=[], style="modern", tier="professional")
        except Exception as exc:  # pragma: no cover - failure path
            failures.append((name, genre, f"EXCEPTION: {exc}"))
            continue

        tp = result["analysis_after"]["true_peak_db"]
        dr_change = result["ab_analysis"]["dynamics"]["change_db"]
        tqc = result["processing_applied"]["transient_qc"]

        tp_ok = np.isfinite(tp) and tp <= -0.85
        dr_ok = dr_change is None or (np.isfinite(dr_change) and dr_change > -10.0)

        print(
            f"{name:32s} {genre:10s} {budgets['source_health']:7.2f} {budgets['compression_budget']:8.2f} "
            f"{budgets['clipper_budget']:8.2f} {str(params['clipper_enabled']):>8s} {str(params['glue_enabled']):>6s} "
            f"{str(tp_ok):>6s} {str(dr_ok):>6s} {str(tqc['passed']):>5s}"
        )

        if not (tp_ok and dr_ok):
            failures.append((name, genre, f"tp={tp} dr_change={dr_change}"))

    # ---------------------------------------------------------------------
    # Architecture assertions — not "every song must reach the same LUFS/
    # spectral target" (explicitly out of scope per the brief), but that
    # the DECISION MECHANISM actually differentiates the way it's supposed
    # to.
    # ---------------------------------------------------------------------
    def budgets_for(name: str, genre: str) -> dict:
        cfg = dict(SCENARIOS[name])
        cfg.pop("genre", None)
        audio = _make_source(**cfg)
        path = _write(f"_check_{name}", audio)
        preview = analyze_for_preview(path)
        return compute_processing_params(preview["analysis"], genre=genre, tags=[], style="modern")["transient_budgets"]

    checks = []

    # 1. A genuinely transient-heavy, healthy source in Rock must get a
    #    materially SMALLER compression budget than a soft/mellow source in
    #    the SAME genre — proves the budget is source-driven, not just a
    #    fixed "rock = X" lookup.
    heavy = budgets_for("transient_heavy_rock", "rock")
    soft = budgets_for("soft_rock", "rock")
    checks.append(("transient-heavy rock gets smaller compression budget than soft rock", heavy["compression_budget"] < soft["compression_budget"]))

    # 2. The SAME transient-heavy audio must get a LARGER budget in a genre
    #    that doesn't prioritize transients as highly (proves genre context
    #    matters, not just the waveform in isolation).
    heavy_in_house = budgets_for("transient_heavy_rock", "house")
    checks.append(("same transient-heavy source gets more budget in House than Rock", heavy_in_house["compression_budget"] > heavy["compression_budget"]))

    # 3. An already heavily-compressed/limited source should not have glue
    #    compression stacked on top of it.
    audio = _make_source(**{k: v for k, v in SCENARIOS["heavily_compressed_rock"].items() if k != "genre"})
    path = _write("_check_glue", audio)
    preview = analyze_for_preview(path)
    params = compute_processing_params(preview["analysis"], genre="rock", tags=[], style="modern")
    checks.append(("already-compressed source does not get glue compression stacked on top", params["glue_enabled"] is False))

    print()
    for desc, ok in checks:
        print(f"[{'PASS' if ok else 'FAIL'}] {desc}")
        if not ok:
            failures.append(("architecture_check", "-", desc))

    print()
    print(f"Scenarios run: {len(SCENARIOS)}  Architecture checks: {len(checks)}  Failures: {len(failures)}")
    for f in failures:
        print("FAIL:", f)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(run())
