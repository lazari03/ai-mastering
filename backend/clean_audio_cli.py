from __future__ import annotations

import argparse
import json
import sys

from app.services.clean_service import clean_audio_to_wav


def main() -> int:
    parser = argparse.ArgumentParser(description="Clean/denoise audio, write wav, emit JSON")
    parser.add_argument("--input", required=True, help="Decoded audio path")
    parser.add_argument("--output", required=True, help="Output wav path")
    args = parser.parse_args()

    try:
        result = clean_audio_to_wav(args.input, args.output)
        sys.stdout.write(json.dumps(result))
        return 0
    except Exception as exc:
        sys.stderr.write(f"clean_audio_error: {type(exc).__name__}: {exc}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
