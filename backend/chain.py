"""
Builds the FFmpeg -af filter chain string from a merged parameter dict.
Order matters: EQ -> saturation (analog warmth) -> vocal presence ->
compression -> stereo width -> loudness normalize -> limiter.
"""

from params import VOCAL_BAND_HZ


def build_filter_chain(params: dict) -> str:
    filters = []

    # 1. Clean up sub-sonic rumble
    filters.append("highpass=f=30")

    # 2. Tonal EQ (4-band, matches genre preset gains)
    filters.append(f"equalizer=f=100:width_type=o:width=2:g={params['bass_gain']}")
    filters.append(f"equalizer=f=400:width_type=o:width=2:g={params['low_mid_gain']}")
    filters.append(f"equalizer=f=2500:width_type=o:width=2:g={params['high_mid_gain']}")
    filters.append(f"equalizer=f=8000:width_type=o:width=2:g={params['treble_gain']}")

    # 3. Analog warmth (harmonic saturation via soft clipper)
    #    saturation param 0-0.6 maps to asoftclip's drive-ish behavior via
    #    a pre-gain push into the clipper, then compensate level after.
    sat = params.get("saturation", 0)
    if sat > 0.01:
        pre_gain_db = round(sat * 10, 2)  # push signal harder into the curve
        filters.append(f"volume={pre_gain_db}dB")
        filters.append("asoftclip=type=tanh:threshold=0.9")
        filters.append(f"volume={-pre_gain_db * 0.6}dB")  # partial makeup, keep some effect audible

    # 4. Vocal presence boost (band-targeted, not true isolation)
    vocal_gain = params.get("vocal_gain", 0)
    if vocal_gain and vocal_gain != 0:
        filters.append(f"equalizer=f={VOCAL_BAND_HZ}:width_type=o:width=1.3:g={vocal_gain}")
    if params.get("vocal_deesser"):
        # gentle high-shelf dip around sibilance range as a simple de-esser stand-in
        filters.append("equalizer=f=6500:width_type=o:width=1.2:g=-2.5")

    # 5. Compression (glue / dynamics control)
    ratio = max(1, params["compression_ratio"])
    filters.append(f"acompressor=ratio={ratio}:attack=20:release=250:makeup=1")

    # 6. Stereo width
    width = params.get("stereo_width", 0)
    if width and width > 0:
        filters.append(f"extrastereo=m={width}")

    # 7. Loudness normalization to target LUFS
    filters.append(f"loudnorm=I={params['loudness_lufs']}:TP=-1:LRA=11")

    # 8. Final safety limiter
    filters.append("alimiter=limit=0.95")

    return ",".join(filters)
