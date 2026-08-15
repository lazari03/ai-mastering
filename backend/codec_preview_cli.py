from __future__ import annotations

import argparse
import json
import sys

from app.services.codec_preview_service import SUPPORTED_CODECS, simulate_codec


def main() -> int:
    parser = argparse.ArgumentParser(description="Round-trip a wav through a lossy codec, write preview wav, emit JSON")
    parser.add_argument("--input", required=True, help="Mastered wav path")
    parser.add_argument("--output", required=True, help="Preview wav path (decoded back from the lossy codec)")
    parser.add_argument("--codec", default="mp3_128", choices=sorted(SUPPORTED_CODECS))
    args = parser.parse_args()

    try:
        result = simulate_codec(args.input, args.output, args.codec)
        sys.stdout.write(json.dumps(result))
        return 0
    except Exception as exc:
        sys.stderr.write(f"codec_preview_error: {type(exc).__name__}: {exc}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
