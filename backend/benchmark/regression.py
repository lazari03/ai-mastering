"""Corpus regression + calibration for the adaptive engine.

The listening benchmark (run_benchmark.py) answers "does it sound better
than the alternatives?". This answers the two questions every engine
change has to survive:

  1. Regression — did this change move any delivered master's objective
     numbers, and by how much?  `--baseline` compares against a stored
     snapshot and exits non-zero on drift beyond tolerance.
  2. Calibration — how close do real tracks sit to each verdict
     threshold?  The guardrail limits (2 dB low-end, 2.5 dB HF, 0.3 dB/oct
     tilt, ...) are hand-authored; the margin distribution over a real
     corpus is the evidence for tightening or loosening them.

Corpus layout is the listening benchmark's (benchmark/corpus/<id>/mix.wav
+ optional meta.json {"genre", "style", "tier", "tags"}); refs are ignored
here. Real, licensed mixes only — the corpus is git-ignored. Baselines
contain numbers only and are meant to be committed
(benchmark/baselines/<name>.json).

Usage (from backend/):
  python -m benchmark.regression --corpus benchmark/corpus --write benchmark/baselines/main.json
  python -m benchmark.regression --corpus benchmark/corpus --baseline benchmark/baselines/main.json
  python -m benchmark.regression --synthetic --baseline benchmark/baselines/synthetic.json   # CI gate
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
from datetime import date
from pathlib import Path

import numpy as np

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from ai_mastering.mastering import master_track  # noqa: E402
from ai_mastering.output_validation import GuardrailConfig, unplanned_tilt_db_per_oct  # noqa: E402
from ai_mastering.planning import config as C  # noqa: E402

# Absolute tolerance per metric before a change counts as drift. Small
# enough to catch a real behaviour change, large enough to ignore float
# noise between runs/platforms.
TOLERANCES = {
    "master_lufs": 0.3,
    "true_peak_dbtp": 0.2,
    "plr_db": 0.4,
    "short_term_crest_change_db": 0.5,
    "lra_change_lu": 0.5,
    "transient_retention": 0.03,
    "low_end_actual_db": 0.3,
    "low_end_collateral_db": 0.3,
    "hf_actual_db": 0.3,
    "hf_collateral_db": 0.3,
    "unplanned_low_end_min_db": 0.3,
    "unplanned_hf_max_db": 0.3,
    "tilt_drift_db_per_oct": 0.05,
    "stereo_correlation": 0.03,
    "limiter_gr_p995_db": 0.5,
    "limiter_max_gr_db": 0.75,
    "added_distortion_db": 1.0,
}
# Below this many tracks a genre's numbers are reported but not treated as
# calibration evidence.
MIN_TRACKS_PER_GENRE = 5
# Categorical fields: any change is reported.
EXACT = ("delivered_candidate", "renders", "initial_failures", "final_warnings")


def measure(result: dict) -> dict:
    """The per-track record, read from master_track()'s own report (the
    numbers the verdict decided on), so nothing is re-measured differently."""
    before, after = result["analysis_before"], result["analysis_after"]
    diag = result["mastering_diagnostics"]
    ev = diag["evaluation"]
    lvl = result["level_diagnostics"]
    measured, planned = lvl["loudness_matched_band_deltas_db"], lvl["planned_band_deltas_db"]
    unplanned = {b: measured[b] - planned[b] for b in measured}
    trans = ev["transients"]
    src_t = float(trans["source_transient_score"])
    return {
        "source_lufs": round(float(before["integrated_lufs"]), 2),
        "master_lufs": round(float(after["integrated_lufs"]), 2),
        "requested_lufs": diag["verdict"]["loudness"]["requested_target_lufs"],
        "true_peak_dbtp": round(float(after["true_peak_db"]), 2),
        "plr_db": round(float(ev["dynamics"]["plr_after_db"]), 2),
        "short_term_crest_change_db": round(float(ev["dynamics"]["short_term_crest_change_db"]), 2),
        "lra_change_lu": round(float(ev["dynamics"]["lra_after_lu"]) - float(ev["dynamics"]["lra_before_lu"]), 2),
        "transient_retention": round(float(trans["master_transient_score"]) / src_t, 3) if src_t > 1e-6 else 1.0,
        "low_end_actual_db": ev["regions"]["low_end_40_120"]["actual_db"],
        "low_end_collateral_db": ev["regions"]["low_end_40_120"]["collateral_db"],
        "hf_actual_db": ev["regions"]["hf_4k_14k"]["actual_db"],
        "hf_collateral_db": ev["regions"]["hf_4k_14k"]["collateral_db"],
        "unplanned_low_end_min_db": round(min(unplanned[b] for b in ("sub_bass_35_60hz", "kick_bass_60_120hz", "upper_bass_120_250hz")), 2),
        "unplanned_hf_max_db": round(max(unplanned[b] for b in ("presence_4000_6000hz", "high_6000_20000hz")), 2),
        "tilt_drift_db_per_oct": round(unplanned_tilt_db_per_oct(measured, planned), 3),
        "stereo_correlation": round(float(after.get("stereo_correlation", 1.0)), 3),
        "limiter_gr_p995_db": round(float(ev["limiter"]["gr_at_p995_peaks_db"]), 2),
        "limiter_max_gr_db": round(float(ev["limiter"]["max_gr_db"]), 2),
        "added_distortion_db": round(float(diag["added_distortion"]["worst_db"]), 2),
        "delivered_candidate": diag["delivered_candidate"],
        "renders": int(diag["renders"]),
        "initial_failures": sorted(f"{f['source']}:{f['kind']}" for f in (diag["initial_verdict"] or diag["verdict"])["failures"]),
        "final_warnings": sorted(f"{w['source']}:{w['kind']}" for w in diag["verdict"]["warnings"]),
    }


def run_corpus(corpus: Path, tier_override: str | None = None) -> dict:
    tracks = sorted(p for p in corpus.iterdir() if (p / "mix.wav").exists()) if corpus.exists() else []
    if not tracks:
        raise SystemExit(f"No tracks in {corpus} — see benchmark/__init__.py for the layout.")
    out = {}
    for track in tracks:
        meta = json.loads((track / "meta.json").read_text()) if (track / "meta.json").exists() else {}
        with tempfile.TemporaryDirectory() as tmp:
            try:
                result = master_track(
                    input_path=str(track / "mix.wav"),
                    output_path=str(Path(tmp) / "master.wav"),
                    genre=meta.get("genre", "pop"),
                    tags=list(meta.get("tags_for_engine", [])),
                    tweaks={},
                    style=meta.get("style", "modern"),
                    tier=tier_override or meta.get("tier", "standard"),
                )
                out[track.name] = {"genre": meta.get("genre", "pop"), **measure(result)}
            except Exception as exc:  # a rejected master is a result, not a crash
                out[track.name] = {"error": f"{type(exc).__name__}: {exc}"[:400]}
        print(f"{track.name}: {_one_line(out[track.name])}", flush=True)
    return out


def _one_line(m: dict) -> str:
    if "error" in m:
        return f"ERROR {m['error']}"
    return (
        f"{m['source_lufs']:+.1f} -> {m['master_lufs']:+.1f} LUFS (req {m['requested_lufs']:+.1f}), TP {m['true_peak_dbtp']:+.1f}, "
        f"tilt {m['tilt_drift_db_per_oct']:+.2f}, {m['delivered_candidate']} x{m['renders']}"
        + (f", first failed: {','.join(m['initial_failures'])}" if m["initial_failures"] else "")
    )


def compare(current: dict, baseline: dict) -> list[dict]:
    """Every metric that moved beyond tolerance, every categorical change,
    and every track added/removed/now erroring."""
    drift = []
    for track in sorted(set(current) | set(baseline)):
        cur, base = current.get(track), baseline.get(track)
        if cur is None or base is None:
            drift.append({"track": track, "metric": "presence", "baseline": base is not None, "current": cur is not None})
            continue
        if ("error" in cur) != ("error" in base):
            drift.append({"track": track, "metric": "error", "baseline": base.get("error"), "current": cur.get("error")})
            continue
        if "error" in cur:
            continue
        for metric, tol in TOLERANCES.items():
            a, b = cur.get(metric), base.get(metric)
            if a is None or b is None:
                continue
            if abs(float(a) - float(b)) > tol:
                drift.append({"track": track, "metric": metric, "baseline": b, "current": a, "delta": round(float(a) - float(b), 3), "tolerance": tol})
        for metric in EXACT:
            if cur.get(metric) != base.get(metric):
                drift.append({"track": track, "metric": metric, "baseline": base.get(metric), "current": cur.get(metric)})
    return drift


def calibration(tracks: dict) -> dict:
    """How close the corpus sits to each threshold. headroom = how far the
    worst-direction value is from failing (negative = beyond the limit)."""
    g = GuardrailConfig()
    checks = {
        "unplanned_low_end_min_db": (lambda m: m["unplanned_low_end_min_db"] + g.max_low_end_loss_db, f"guardrail max_low_end_loss_db={g.max_low_end_loss_db}"),
        "unplanned_hf_max_db": (lambda m: g.max_high_boost_db - m["unplanned_hf_max_db"], f"guardrail max_high_boost_db={g.max_high_boost_db}"),
        "tilt_drift_db_per_oct": (lambda m: g.max_tilt_drift_db_per_oct - abs(m["tilt_drift_db_per_oct"]), f"guardrail max_tilt_drift_db_per_oct={g.max_tilt_drift_db_per_oct}"),
        "low_end_collateral_db": (lambda m: m["low_end_collateral_db"] + C.LOW_END_COLLATERAL_TOLERANCE_DB, f"evaluation LOW_END_COLLATERAL_TOLERANCE_DB={C.LOW_END_COLLATERAL_TOLERANCE_DB}"),
        "hf_collateral_db": (lambda m: C.HF_COLLATERAL_TOLERANCE_DB - m["hf_collateral_db"], f"evaluation HF_COLLATERAL_TOLERANCE_DB={C.HF_COLLATERAL_TOLERANCE_DB}"),
        "plr_db": (lambda m: m["plr_db"] - 4.0, "QC plr fail < 4.0 dB"),
        "limiter_max_gr_db": (lambda m: 6.0 - m["limiter_max_gr_db"], "QC limiter_gain_reduction fail > 6.0 dB"),
        "added_distortion_db": (lambda m: C.MAX_ADDED_DISTORTION_DB - m["added_distortion_db"], f"verdict MAX_ADDED_DISTORTION_DB={C.MAX_ADDED_DISTORTION_DB}"),
    }
    ok = [m for m in tracks.values() if "error" not in m]

    def summarise(rows: list[dict]) -> dict:
        res = {}
        for name, (headroom, rule) in checks.items():
            vals = np.array([headroom(m) for m in rows if m.get(name) is not None], dtype=float)
            if not vals.size:
                continue
            res[name] = {
                "rule": rule,
                "headroom_p5": round(float(np.percentile(vals, 5)), 3),
                "headroom_p50": round(float(np.percentile(vals, 50)), 3),
                "headroom_min": round(float(vals.min()), 3),
                "beyond_limit": int(np.sum(vals < 0)),
                "tracks": int(vals.size),
            }
        return res

    out = summarise(ok)
    # Per genre: the evidence for genre-specific thresholds (a limit that
    # every rock track sits on and every acoustic track clears by 6 dB is
    # one limit too few). Small groups are reported but flagged.
    by_genre = {}
    for genre in sorted({m.get("genre", "pop") for m in ok}):
        rows = [m for m in ok if m.get("genre", "pop") == genre]
        by_genre[genre] = {"tracks": len(rows), "too_few_to_calibrate": len(rows) < MIN_TRACKS_PER_GENRE, "thresholds": summarise(rows)}
    cand: dict[str, int] = {}
    fails: dict[str, int] = {}
    for m in ok:
        cand[m["delivered_candidate"]] = cand.get(m["delivered_candidate"], 0) + 1
        for f in m["initial_failures"]:
            fails[f] = fails.get(f, 0) + 1
    return {
        "thresholds": out,
        "by_genre": by_genre,
        "delivered_candidates": cand,
        "initial_failure_kinds": dict(sorted(fails.items(), key=lambda kv: -kv[1])),
        "rejected_tracks": sorted(t for t, m in tracks.items() if "error" in m),
        "avg_renders": round(float(np.mean([m["renders"] for m in ok])), 2) if ok else None,
    }


def render_markdown(snapshot: dict, drift: list[dict] | None) -> str:
    lines = [f"# Engine regression — {snapshot['date']}", "", f"{len(snapshot['tracks'])} tracks.", ""]
    cal = snapshot["calibration"]
    lines += ["## Candidates", "", f"Delivered: {cal['delivered_candidates']} · avg renders {cal['avg_renders']} · rejected: {cal['rejected_tracks'] or 'none'}", ""]
    if cal["initial_failure_kinds"]:
        lines += ["First-render failures: " + ", ".join(f"{k} ×{v}" for k, v in cal["initial_failure_kinds"].items()), ""]
    lines += ["## Threshold calibration (headroom before failing; negative = beyond)", "", "| metric | rule | min | p5 | p50 | beyond |", "|---|---|---|---|---|---|"]
    for name, c in cal["thresholds"].items():
        lines.append(f"| {name} | {c['rule']} | {c['headroom_min']} | {c['headroom_p5']} | {c['headroom_p50']} | {c['beyond_limit']}/{c['tracks']} |")
    if cal.get("by_genre"):
        lines += ["", "## Per-genre headroom (min / p50)", "", "| genre | tracks | " + " | ".join(cal["thresholds"]) + " |", "|---|---|" + "---|" * len(cal["thresholds"])]
        for genre, g in cal["by_genre"].items():
            cells = [f"{g['thresholds'][k]['headroom_min']} / {g['thresholds'][k]['headroom_p50']}" if k in g["thresholds"] else "—" for k in cal["thresholds"]]
            lines.append(f"| {genre}{' (few)' if g['too_few_to_calibrate'] else ''} | {g['tracks']} | " + " | ".join(cells) + " |")
    if drift is not None:
        lines += ["", f"## Drift vs baseline: {len(drift)}", ""]
        lines += [f"- {d['track']} · {d['metric']}: {d.get('baseline')} -> {d.get('current')}" + (f" (Δ {d['delta']}, tol {d['tolerance']})" if "delta" in d else "") for d in drift] or ["none"]
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus", default=str(BACKEND / "benchmark/corpus"))
    parser.add_argument("--baseline", help="snapshot to compare against; exit 1 on drift")
    parser.add_argument("--write", help="write this run's snapshot here (e.g. benchmark/baselines/main.json)")
    parser.add_argument("--out", default=None, help="report dir (default benchmark/results/regression-<date>)")
    parser.add_argument("--tier", default=None, choices=["standard", "professional"], help="override every track's tier")
    parser.add_argument("--synthetic", action="store_true", help="run the deterministic synthetic corpus (benchmark/synthetic_corpus.py) instead of --corpus")
    args = parser.parse_args(argv)

    if args.synthetic:
        from benchmark.synthetic_corpus import build

        with tempfile.TemporaryDirectory() as tmp:
            tracks = run_corpus(build(Path(tmp) / "synthetic"), args.tier)
    else:
        tracks = run_corpus(Path(args.corpus), args.tier)
    snapshot = {"date": date.today().isoformat(), "tolerances": TOLERANCES, "tracks": tracks, "calibration": calibration(tracks)}
    drift = None
    if args.baseline:
        drift = compare(tracks, json.loads(Path(args.baseline).read_text())["tracks"])
    out = Path(args.out or BACKEND / "benchmark/results" / f"regression-{snapshot['date']}")
    out.mkdir(parents=True, exist_ok=True)
    (out / "snapshot.json").write_text(json.dumps(snapshot, indent=1))
    (out / "report.md").write_text(render_markdown(snapshot, drift))
    if args.write:
        Path(args.write).parent.mkdir(parents=True, exist_ok=True)
        Path(args.write).write_text(json.dumps(snapshot, indent=1))
    print(f"\nWrote {out}/report.md and snapshot.json" + (f"; baseline {args.write}" if args.write else ""))
    if drift:
        print(f"{len(drift)} metric(s) drifted beyond tolerance — see report.md")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
