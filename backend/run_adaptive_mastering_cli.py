from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from adaptive_mastering import master_track


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run adaptive DSP mastering and emit JSON")
    parser.add_argument("--input", required=True, help="Input audio path")
    parser.add_argument("--output", required=True, help="Output wav path")
    parser.add_argument("--genre", required=True)
    parser.add_argument("--style", default="modern")
    parser.add_argument("--tags-json", default="[]")
    parser.add_argument("--tweaks-json", default="{}")
    parser.add_argument("--use-stem-separation", action="store_true")
    parser.add_argument("--tier", default="standard", choices=["standard", "professional"])
    parser.add_argument("--reference", default=None, help="Optional reference track path for spectral matching")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    try:
        tags = json.loads(args.tags_json)
        tweaks = json.loads(args.tweaks_json)
        if not isinstance(tags, list):
            raise ValueError("tags-json must decode to a list")
        if not isinstance(tweaks, dict):
            raise ValueError("tweaks-json must decode to an object")

        result = master_track(
            input_path=str(Path(args.input)),
            output_path=str(Path(args.output)),
            genre=args.genre,
            tags=tags,
            tweaks=tweaks,
            style=args.style,
            enable_stem_separation=bool(args.use_stem_separation),
            tier=args.tier,
            reference_track_path=str(Path(args.reference)) if args.reference else None,
        )

        sys.stdout.write(json.dumps(result))
        return 0
    except Exception as exc:
        sys.stderr.write(f"adaptive_dsp_error: {type(exc).__name__}: {exc}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
