"""Every tunable constant of the adaptive (plan-driven) mastering engine.

Nothing in analysis/, diagnostics/, planning/, processing/ or evaluation/
should hardcode a threshold that changes a processing decision — it lives
here, with the reason it has the value it has. Values are deployment
defaults, not universal truths; tests exercise behaviour relative to them.

Conventions
-----------
* "relative spectrum" values are dB of power per OCTAVE, normalised so the
  300 Hz - 3 kHz region averages 0 dB. Pink noise is flat (0 dB everywhere).
* Confidence and severity are 0..1.
* Gains are dB.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# High-resolution spectral analysis
# ---------------------------------------------------------------------------

# Band edges (Hz). Roughly 1/2-octave in the low end where masking and
# mastering damage is most localised, widening to ~1/2-2/3 octave up top.
# Bands above Nyquist are dropped at analysis time (never assumed to exist).
HIRES_BAND_EDGES_HZ: tuple[float, ...] = (
    20, 30, 40, 55, 70, 90, 120, 160, 220, 300, 400, 550, 750,
    1000, 1400, 2000, 2800, 4000, 5500, 7500, 10000, 14000, 18000, 20000,
)

# 8192 at 44.1/48 kHz gives ~5.4 Hz bins — enough to put >=2 bins in the
# 20-30 Hz band. Hop = n_fft (no overlap): the long-term average spectrum
# does not benefit from overlap, and it halves the cost of the analysis.
SPECTRAL_N_FFT = 8192
SPECTRAL_HOP = 8192
# Frames processed per rfft batch — bounds peak memory on full-length songs.
SPECTRAL_CHUNK_FRAMES = 128

# A frame this far below the loudest frame is silence/fade and excluded.
SPECTRAL_GATE_REL_DB = -60.0

# Frames per "segment" used for temporal persistence statistics
# (8 x 8192 samples ~= 1.5 s at 44.1 kHz). Short enough for a 3-minute song
# to give ~120 segments, long enough to average over a bar of music.
PERSISTENCE_SEGMENT_FRAMES = 8

# The normalisation reference region for the relative spectrum.
RELATIVE_REF_LOW_HZ = 300.0
RELATIVE_REF_HIGH_HZ = 3000.0

# Stereo analysis regions (Hz), requested explicitly by the spec.
STEREO_REGIONS_HZ: dict[str, tuple[float, float]] = {
    "low_20_120hz": (20.0, 120.0),
    "low_mid_120_500hz": (120.0, 500.0),
    "mid_500_2000hz": (500.0, 2000.0),
    "high_mid_2000_6000hz": (2000.0, 6000.0),
    "high_6000hz_up": (6000.0, 22050.0),
}

# Resonance search: 1/12-octave grid compared with a 1-octave smoothed
# version of itself. A narrow peak must stand this far above its local
# octave average AND be present in this fraction of segments.
RESONANCE_MIN_HZ = 90.0
RESONANCE_MAX_HZ = 10000.0
RESONANCE_MIN_PROMINENCE_DB = 3.5
RESONANCE_MIN_PERSISTENCE = 0.6
RESONANCE_MAX_REPORTED = 6

# Sibilance: time-domain band envelopes at 20 ms. Sibilants are short,
# centred, and jump in 5-9 kHz WITHOUT an equal jump above 10 kHz (a crash
# cymbal jumps in both).
SIBILANCE_FRAME_S = 0.02
SIBILANCE_CANDIDATE_BANDS_HZ: tuple[tuple[float, float], ...] = ((4500.0, 6500.0), (6500.0, 8500.0), (8500.0, 11000.0))
SIBILANCE_PRESENCE_BAND_HZ = (1500.0, 4000.0)
SIBILANCE_AIR_BAND_HZ = (11000.0, 16000.0)
SIBILANCE_EVENT_PERCENTILE = 97.0

# Lossy-codec low-pass detection: a cliff this steep between adjacent top
# bands means content above it was removed by an encoder, not mixed quiet.
CODEC_CUTOFF_CLIFF_DB = 18.0

# ---------------------------------------------------------------------------
# Neutral target curve (heuristic — see planning/target_model.py)
# ---------------------------------------------------------------------------
# Relative per-octave level of a tonally balanced full mix. Approximates the
# long-term average spectra reported for commercial popular music (roughly
# flat-to-rising from 40-150 Hz relative to 1 kHz, then falling ~3 dB/oct
# through the mids and ~4-5 dB/oct above 3 kHz). It is a HEURISTIC anchor:
# tolerances below are deliberately wide, and every tonal decision also
# requires temporal persistence, so a source differing moderately from this
# curve is left alone.
NEUTRAL_CURVE_ANCHORS_DB: tuple[tuple[float, float], ...] = (
    (25.0, 2.0), (35.0, 5.5), (47.0, 7.5), (62.0, 8.5), (80.0, 8.5), (105.0, 8.0),
    (140.0, 7.0), (190.0, 5.5), (260.0, 4.0), (350.0, 2.8), (470.0, 1.8), (640.0, 1.0),
    (870.0, 0.3), (1180.0, -0.5), (1670.0, -1.6), (2370.0, -3.0), (3350.0, -4.6),
    (4700.0, -6.2), (6400.0, -8.0), (8700.0, -10.0), (11800.0, -12.5), (15900.0, -16.5),
    (19000.0, -22.0),
)

# Acceptable +/- window around the target, by band centre (Hz upper bound).
# Wider where real mixes legitimately vary most (sub, extreme air).
TONAL_TOLERANCE_DB: tuple[tuple[float, float], ...] = (
    (45.0, 5.0), (120.0, 3.5), (500.0, 3.0), (2000.0, 3.0), (5000.0, 3.0),
    (10000.0, 3.5), (14000.0, 4.0), (30000.0, 5.5),
)

# Genre influence on the target curve: the genre's 7-band shares are used
# RELATIVE to the cross-genre mean (so a systematic bias in the authored
# shares cancels out), scaled and clipped — genre shifts the acceptable
# destination, it never defines it on its own.
GENRE_CURVE_SCALE = 0.5
GENRE_CURVE_MAX_OFFSET_DB = 2.0
# A reference track moves the target this fraction of the way toward the
# reference's own (octave-smoothed) curve — contextual evidence, not cloning.
REFERENCE_CURVE_WEIGHT = 0.6
# Explicit user intent (tags / category tweak_bias) shifts the target curve
# and narrows the tolerance on the requested side by this factor.
INTENT_TOLERANCE_NARROWING = 0.5
# dB of target shift per unit of category tweak_bias (tweak_bias is -1..1).
INTENT_TWEAK_TO_TARGET_DB = 2.0

# ---------------------------------------------------------------------------
# Problem detection / confidence
# ---------------------------------------------------------------------------
# Excess beyond tolerance (dB) at which magnitude confidence reaches 63%.
CONFIDENCE_MAGNITUDE_SCALE_DB = 1.75
# Excess beyond tolerance (dB) that counts as severity 1.0.
SEVERITY_FULL_SCALE_DB = 6.0
# Weight of temporal persistence in confidence (rest is the magnitude term).
CONFIDENCE_PERSISTENCE_WEIGHT = 0.65
# Bands with fewer FFT bins than this are measured less reliably.
MIN_RELIABLE_BINS = 3
# A problem must at least reach this confidence to be reported at all.
REPORT_MIN_CONFIDENCE = 0.15

# ASYMMETRIC confidence gates: removing a clearly measured excess is safer
# than adding energy, and adding HF energy is the least safe move (it is
# the historically observed failure mode of this engine).
REQUIRED_CONFIDENCE = {
    "cut": 0.42,
    "boost_low": 0.58,
    "boost_mid": 0.66,
    "boost_high": 0.74,
    "dynamic_eq": 0.5,
    "deesser": 0.55,
}

# ---------------------------------------------------------------------------
# EQ planning
# ---------------------------------------------------------------------------
EQ_CUT_FRACTION = 0.6          # correct 60% of the measured excess...
EQ_BOOST_FRACTION = 0.4        # ...but only 40% of a measured deficit
EQ_MAX_CUT_DB = 3.0
EQ_MAX_BOOST_DB = {"low": 1.5, "mid": 1.0, "high": 1.0}
EQ_MAX_AUTOMATED_NODES = 6
EQ_MIN_NODE_GAIN_DB = 0.15     # smaller moves are dropped as inaudible
EQ_Q_RANGE = (0.5, 2.5)        # broad mastering moves only
# Cumulative HF boost budget: max positive EQ response anywhere >= 4 kHz,
# summed over every automated filter.
HF_BOOST_BUDGET_DB = 1.0
HF_BUDGET_START_HZ = 4000.0
# A filter may not push a band the diagnosis flagged in the OPPOSITE
# direction by more than this (e.g. an air shelf leaking into harsh 7 kHz).
EQ_MAX_OPPOSING_BLEED_DB = 0.2
# Healthy low-end bands may not lose more than this to a neighbouring cut.
EQ_MAX_LOW_END_COLLATERAL_DB = 0.35
LOW_END_PROTECT_RANGE_HZ = (40.0, 120.0)

# ---------------------------------------------------------------------------
# Change budget (source identity preservation)
# ---------------------------------------------------------------------------
CHANGE_BUDGET_MIN = 0.12
# Total automated EQ movement (sum of |gain| x bandwidth weight) allowed
# at change budget 0 and 1 respectively.
EQ_BUDGET_MIN_DB = 0.6
EQ_BUDGET_MAX_DB = 5.0

# ---------------------------------------------------------------------------
# Dynamics
# ---------------------------------------------------------------------------
# Compression is enabled only when measured need exceeds this.
COMPRESSION_MIN_NEED = 0.2
COMPRESSION_MAX_RATIO = 2.0
# Micro-dynamics need = how far (LU) the ACCEPTABLE loudness range is out
# of reach using only the limiter damage budget; 0 LU -> need 0, 6 LU -> 1.
# A pre-master's crest factor is always far above a finished master's, so
# comparing the two directly would make compression look "needed" on every
# upload; what matters is whether the limiter alone can get there safely.
COMPRESSION_LOUDNESS_SHORTFALL_RANGE_LU = (0.0, 6.0)
# LRA (LU) mapping to macro-dynamics (glue) need 0 / 1.
GLUE_LRA_RANGE_LU = (7.0, 14.0)
GLUE_MIN_NEED = 0.25
# Attack (ms): base, plus up to this much extra for strong transients.
COMPRESSOR_BASE_ATTACK_MS = 25.0
COMPRESSOR_TRANSIENT_ATTACK_EXTRA_MS = 30.0
COMPRESSOR_RELEASE_RANGE_MS = (60.0, 400.0)
BPM_MIN_CONFIDENCE = 0.5

# Limiter damage budget (dB of gain reduction at the 99.5th-percentile
# 10 ms peak level — i.e. on "typical loud hits", not one isolated spike).
LIMITER_BUDGET_MAX_DB = 6.0
LIMITER_BUDGET_MIN_DB = 0.5
LIMITER_TRANSIENT_PENALTY_DB = 3.5
LIMITER_CEILING_DBTP = -1.0
# Clipper absorbs at most this much in front of the limiter.
CLIPPER_MAX_SHARE_DB = 1.0

# Loudness is a RANGE around the preferred target.
LOUDNESS_WINDOW_ABOVE_LU = 1.0
LOUDNESS_WINDOW_BELOW_LU = 2.5
LOUDNESS_DYNAMIC_PRIORITY_EXTRA_LU = 1.5

# ---------------------------------------------------------------------------
# Saturation / stereo / de-essing
# ---------------------------------------------------------------------------
SATURATION_MAX_AMOUNT = 0.25
SATURATION_MIN_AMOUNT = 0.03    # below this (~0.36 dB drive on the loud hits) the stage is disabled outright
SATURATION_DRIVE_PER_AMOUNT_DB = 12.0
SATURATION_MAX_DRIVE_DB = 3.0
# Brightness/harshness score above which saturation is disabled.
SATURATION_HF_BLOCK_SCORE = 0.5

LOW_END_WIDTH_LIMIT = 0.15      # side/mid amplitude ratio in 20-120 Hz
LOW_END_CORRELATION_LIMIT = 0.85
NARROW_WIDTH_LIMIT = 0.12       # side/mid above 500 Hz considered narrow
EXCESS_WIDTH_CORRELATION = 0.15
MAX_WIDEN_DB = 1.5
MAX_NARROW_DB = -3.0
SAFE_MIN_CORRELATION = 0.2

DEESSER_MAX_STRENGTH = 0.7

# ---------------------------------------------------------------------------
# Evaluation / backoff
# ---------------------------------------------------------------------------
LOW_END_COLLATERAL_TOLERANCE_DB = 1.0
HF_COLLATERAL_TOLERANCE_DB = 1.0
ANY_BAND_COLLATERAL_TOLERANCE_DB = 2.0
LIMITER_BUDGET_OVERSHOOT_TOLERANCE_DB = 1.0
LRA_COLLAPSE_FRACTION = 0.5
BACKOFF_MIN_SEVERITY = 0.3
MAX_BACKOFF_RENDERS = 1
