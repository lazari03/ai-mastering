"""Record and unblind blind A/B listening preferences.

run_benchmark.py (and calibration_ab.py) write level-matched listening sets
with neutral letters plus a key that is kept away from listeners. This
closes the loop: listeners return ballots, this tallies them against the
key, and states plainly whether there is enough evidence to claim anything.

Usage (from backend/):
  python -m benchmark.blind_ab template benchmark/results/<date> --listener alice
      -> writes ballots/alice.json to fill in (one ranking per track)
  python -m benchmark.blind_ab tally benchmark/results/<date>
      -> reads ballots/*.json + listening_key.json, writes preference.json
         and preference.md; exit 0 always (status says what it supports)

Ballot (one file per listener, never edited after unblinding):
  {"listener": "alice", "tracks": {"<track>": {"ranking": ["C", "A", "B"],
   "notes": {"drums": "", "bass": "", "highs": "", "pumping": ""}}}}
  ranking = best first, every letter in that track's listening folder.

Status is "pending" until there are at least MIN_LISTENERS listeners and
MIN_TRACKS tracks with complete rankings — below that, no quality claim
may be made from the results (see docs/audits/AUDIO_VALIDATION.md).
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

MIN_LISTENERS = 3
MIN_TRACKS = 15
SUBJECT = "auralith"


def _sign_test_p(wins: int, losses: int) -> float | None:
    """Two-sided exact binomial sign test (ties dropped)."""
    n = wins + losses
    if n == 0:
        return None
    k = min(wins, losses)
    p = sum(math.comb(n, i) for i in range(k + 1)) / 2**n
    return min(1.0, 2 * p)


def load_key(results_dir: Path) -> dict[str, dict[str, str]]:
    key_path = results_dir / "listening_key.json"
    if key_path.exists():
        return json.loads(key_path.read_text())
    # calibration_ab.py layout: <track>/key.json with {"key": {...}} or a flat map
    keys = {}
    for p in sorted(results_dir.glob("*/key.json")):
        data = json.loads(p.read_text())
        keys[p.parent.name] = data.get("key", data) if isinstance(data, dict) else data
    return keys


def validate_ballot(ballot: dict, key: dict[str, dict[str, str]]) -> list[str]:
    errors = []
    if not ballot.get("listener"):
        errors.append("missing listener id")
    for track, entry in (ballot.get("tracks") or {}).items():
        letters = set(key.get(track, {}))
        if not letters:
            errors.append(f"{track}: not in the listening key")
            continue
        ranking = entry.get("ranking") or []
        if ranking and (sorted(ranking) != sorted(letters) or len(set(ranking)) != len(ranking)):
            errors.append(f"{track}: ranking {ranking} must list each of {sorted(letters)} exactly once")
    return errors


def tally(key: dict[str, dict[str, str]], ballots: list[dict]) -> dict:
    ranks: dict[str, list[int]] = {}
    firsts: dict[str, int] = {}
    pair: dict[str, list[int]] = {}  # other version -> [subject wins, subject losses]
    listeners, rated_tracks, rejected = set(), {}, []
    for ballot in ballots:
        errs = validate_ballot(ballot, key)
        if errs:
            rejected.append({"listener": ballot.get("listener"), "errors": errs})
            continue
        for track, entry in ballot["tracks"].items():
            ranking = entry.get("ranking") or []
            if not ranking:
                continue
            listeners.add(ballot["listener"])
            rated_tracks.setdefault(track, set()).add(ballot["listener"])
            names = [key[track][letter] for letter in ranking]
            firsts[names[0]] = firsts.get(names[0], 0) + 1
            for pos, name in enumerate(names, start=1):
                ranks.setdefault(name, []).append(pos)
            if SUBJECT in names:
                s = names.index(SUBJECT)
                for i, other in enumerate(names):
                    if other == SUBJECT:
                        continue
                    w = pair.setdefault(other, [0, 0])
                    w[0 if s < i else 1] += 1
    judgements = sum(len(v) for v in rated_tracks.values())
    enough = len(listeners) >= MIN_LISTENERS and len(rated_tracks) >= MIN_TRACKS
    return {
        "status": "complete" if enough else "pending",
        "why_pending": None
        if enough
        else f"needs >= {MIN_LISTENERS} listeners and >= {MIN_TRACKS} ranked tracks; have {len(listeners)} listeners, {len(rated_tracks)} tracks",
        "listeners": sorted(listeners),
        "tracks_ranked": len(rated_tracks),
        "judgements": judgements,
        "mean_rank": {n: round(sum(r) / len(r), 2) for n, r in sorted(ranks.items())},
        "first_place": dict(sorted(firsts.items())),
        "subject_vs": {
            other: {"wins": w, "losses": l, "sign_test_p": None if (p := _sign_test_p(w, l)) is None else round(p, 4)}
            for other, (w, l) in sorted(pair.items())
        },
        "rejected_ballots": rejected,
    }


def render_md(result: dict) -> str:
    lines = ["# Blind listening preference", "", f"**Status: {result['status']}**" + (f" — {result['why_pending']}" if result["why_pending"] else ""), ""]
    lines += [f"Listeners: {len(result['listeners'])} · tracks ranked: {result['tracks_ranked']} · judgements: {result['judgements']}", ""]
    lines += ["| Version | Mean rank (1 = best) | First places |", "|---|---|---|"]
    for name, mr in result["mean_rank"].items():
        lines.append(f"| {name} | {mr} | {result['first_place'].get(name, 0)} |")
    lines += ["", f"| {SUBJECT} vs | Preferred | Not preferred | Sign test p |", "|---|---|---|---|"]
    for other, r in result["subject_vs"].items():
        lines.append(f"| {other} | {r['wins']} | {r['losses']} | {r['sign_test_p']} |")
    if result["status"] != "complete":
        lines += ["", "Not enough listening data: no quality claim may be made from this table."]
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("template")
    t.add_argument("results_dir")
    t.add_argument("--listener", required=True)
    y = sub.add_parser("tally")
    y.add_argument("results_dir")
    args = parser.parse_args(argv)

    results_dir = Path(args.results_dir)
    key = load_key(results_dir)
    if not key:
        raise SystemExit(f"No listening key in {results_dir} — run benchmark.run_benchmark first.")
    ballots_dir = results_dir / "ballots"
    if args.cmd == "template":
        ballots_dir.mkdir(exist_ok=True)
        path = ballots_dir / f"{args.listener}.json"
        if path.exists():
            raise SystemExit(f"{path} exists; not overwriting a ballot.")
        # Letters only — never the names behind them.
        ballot = {"listener": args.listener, "tracks": {t: {"ranking": [], "letters": sorted(k), "notes": {"drums": "", "bass": "", "highs": "", "pumping": ""}} for t, k in sorted(key.items())}}
        path.write_text(json.dumps(ballot, indent=1))
        print(f"Wrote {path}")
        return 0
    ballots = [json.loads(p.read_text()) for p in sorted(ballots_dir.glob("*.json"))] if ballots_dir.exists() else []
    result = tally(key, ballots)
    (results_dir / "preference.json").write_text(json.dumps(result, indent=1))
    (results_dir / "preference.md").write_text(render_md(result))
    print(render_md(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
