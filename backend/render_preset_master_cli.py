from __future__ import annotations

import argparse
import json
import sys

from app.services.preset_dsp_engine import render_preset_master


def main() -> int:
    parser = argparse.ArgumentParser(description="Render a full professional-preset JSON spec against audio, emit JSON")
    parser.add_argument("--input", required=True, help="Decoded audio path")
    parser.add_argument("--output", required=True, help="Output wav path")
    parser.add_argument("--preset-file", required=True, help="Path to the preset JSON (one preset object)")
    args = parser.parse_args()

    try:
        with open(args.preset_file, "r", encoding="utf-8") as handle:
            preset = json.load(handle)
        result = render_preset_master(args.input, args.output, preset)
        sys.stdout.write(json.dumps(result))
        return 0
    except Exception as exc:
        sys.stderr.write(f"preset_dsp_error: {type(exc).__name__}: {exc}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
