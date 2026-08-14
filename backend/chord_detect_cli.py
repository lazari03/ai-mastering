from __future__ import annotations

import argparse
import json
import sys

from app.services.chord_service import analyze_chords_from_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Detect BPM/key/chords and emit JSON")
    parser.add_argument("--input", required=True, help="Decoded audio path")
    args = parser.parse_args()

    try:
        result = analyze_chords_from_path(args.input)
        sys.stdout.write(json.dumps(result))
        return 0
    except Exception as exc:
        sys.stderr.write(f"chord_detect_error: {type(exc).__name__}: {exc}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
