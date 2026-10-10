"""Output-side guardrails: did the rendered master damage the track?

This runs on the ACTUAL rendered signal, measured with the same functions
used on the input (band_levels.py), at MATCHED LOUDNESS. It answers one
question per guardrail and reports the measured reason it failed.

These are guardrails, not a definition of a good master. Every threshold
is a field on GuardrailConfig and is expected to be tuned per deployment.
There is deliberately no single "correct" LUFS target here: loudness is
checked against whatever target the caller decided for this track, with a
tolerance, not against a fixed number baked into the engine.

A failure names the processing stage most likely responsible, so the
caller can reduce that stage and re-render rather than guessing.

Plan awareness
--------------
A deliberate, measured correction (e.g. a 2.5 dB cut of a boomy 80 Hz)
is not damage. When the caller passes `planned_deltas_db` — the same
measurement taken on the source with ONLY the planned static EQ applied —
the per-band limits apply to the UNPLANNED movement (measured - planned).
Independently of the plan, `absolute_*` caps bound the total movement in
the two directions this engine has historically got wrong (bass down,
highs up), so a planner bug cannot excuse itself by planning the damage.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict

import numpy as np

from .band_levels import BAND_EDGES_HZ

# Bands where losing level is a loss of musical weight rather than a
# cleanup. subsonic_20_35hz is deliberately EXCLUDED: cutting genuinely
# subsonic rumble is legitimate and shouldn't be flagged as damage.
LOW_END_MUSICAL_BANDS = ("sub_bass_35_60hz", "kick_bass_60_120hz", "upper_bass_120_250hz")
HIGH_BANDS = ("presence_4000_6000hz", "high_6000_20000hz")
# Bands the tilt fit runs over (subsonic excluded for the same reason).
TILT_BANDS = tuple(b for b in BAND_EDGES_HZ if b != "subsonic_20_35hz")


@dataclass
class GuardrailConfig:
    """Tunable limits. Not universal truths — deployment guardrails."""

    # Max dB a musical low band may drop, loudness-matched, before the
    # render is considered to have gutted the low end.
    max_low_end_loss_db: float = 2.0
    # Max dB the high bands may rise, loudness-matched. Catches a master
    # that bought "clarity" by tilting the whole track bright.
    max_high_boost_db: float = 2.5
    # Max dB ANY band may move, loudness-matched. Broad backstop for a
    # stage that went badly wrong in a band the specific rules don't name.
    max_any_band_change_db: float = 4.0
    # True peak ceiling. Above this, the export can clip on lossy decode.
    max_true_peak_dbtp: float = -0.8
    # How far the render may land from the loudness target the caller
    # chose for THIS track. Not a fixed platform number.
    loudness_tolerance_lu: float = 1.5
    # Max fraction of transient punch that may be lost, loudness-matched.
    max_transient_loss: float = 0.12
    # Max UNPLANNED spectral tilt change, dB/octave (least-squares slope of
    # the unplanned band deltas over log2 frequency, 35 Hz - 20 kHz).
    # Positive = brighter. "Highs up AND bass down" by small amounts each
    # can stay under every per-band limit and still be clearly audible as a
    # tilt; this catches the combination.
    max_tilt_drift_db_per_oct: float = 0.3
    # Plan-independent caps on TOTAL movement (planned + unplanned) in the
    # historically-wrong directions. Above the planner's own maxima
    # (EQ_MAX_CUT_DB 3 dB blind, 4 dB reference-driven; 1 dB HF budget),
    # so only a runaway plan or stage reaches them.
    absolute_max_low_end_loss_db: float = 4.5
    absolute_max_high_boost_db: float = 3.5


@dataclass
class GuardrailFailure:
    name: str
    measured: float
    limit: float
    band: str | None
    # The pipeline stage to reduce on the next attempt.
    blame_stage: str
    detail: str
    # "unplanned" (measured - planned) or "total" (absolute cap, plan or not).
    basis: str = "unplanned"


@dataclass
class ValidationResult:
    passed: bool
    failures: list[GuardrailFailure] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {"passed": self.passed, "failures": [asdict(f) for f in self.failures]}

    def blamed_stages(self) -> list[str]:
        """Distinct stages to reduce, worst-first by how far over the limit."""
        ordered = sorted(self.failures, key=lambda f: abs(f.measured) - abs(f.limit), reverse=True)
        seen, stages = set(), []
        for f in ordered:
            if f.blame_stage not in seen:
                seen.add(f.blame_stage)
                stages.append(f.blame_stage)
        return stages


def validate_render(
    band_deltas_db: dict[str, float],
    true_peak_dbtp: float,
    rendered_lufs: float,
    target_lufs: float,
    transient_delta: float,
    config: GuardrailConfig | None = None,
    planned_deltas_db: dict[str, float] | None = None,
    user_deltas_db: dict[str, float] | None = None,
) -> ValidationResult:
    """Check a rendered master against the guardrails.

    band_deltas_db MUST be loudness-matched (see
    band_levels.loudness_matched_band_deltas) — raw deltas would fail
    everything on any master that is louder than its source, which is
    every master.

    planned_deltas_db: the planned static EQ's effect on the same
    measurement (see module docstring). user_deltas_db: the part of it the
    USER asked for (tweaks) — exempt from the absolute caps, because an
    explicit "more bass / less bass" request is not a planner error.
    """
    cfg = config or GuardrailConfig()
    failures: list[GuardrailFailure] = []
    planned = planned_deltas_db or {}
    user = user_deltas_db or {}

    def unplanned(band: str) -> float:
        return float(band_deltas_db.get(band, 0.0)) - float(planned.get(band, 0.0))

    def automatic(band: str) -> float:
        return float(band_deltas_db.get(band, 0.0)) - float(user.get(band, 0.0))

    # --- low end gutted -------------------------------------------------
    for band in LOW_END_MUSICAL_BANDS:
        delta = unplanned(band)
        if delta < -cfg.max_low_end_loss_db:
            failures.append(
                GuardrailFailure(
                    name="low_end_loss",
                    measured=round(delta, 2),
                    limit=-cfg.max_low_end_loss_db,
                    band=band,
                    # Low end is taken out by the high-pass, by multiband
                    # compression squashing the low band, or by a low-shelf
                    # cut. The EQ stage is the one to reduce first because
                    # it is the only one that cuts a band deliberately.
                    blame_stage="eq_low_shelf_and_highpass",
                    detail=f"{band} fell {abs(delta):.2f} dB more than planned at matched loudness (limit {cfg.max_low_end_loss_db} dB)",
                )
            )
        total = automatic(band)
        if total < -cfg.absolute_max_low_end_loss_db:
            failures.append(
                GuardrailFailure(
                    name="low_end_loss",
                    measured=round(total, 2),
                    limit=-cfg.absolute_max_low_end_loss_db,
                    band=band,
                    blame_stage="eq_low_shelf_and_highpass",
                    detail=f"{band} fell {abs(total):.2f} dB in total at matched loudness (absolute cap {cfg.absolute_max_low_end_loss_db} dB, plan or not)",
                    basis="total",
                )
            )

    # --- tilted bright --------------------------------------------------
    for band in HIGH_BANDS:
        delta = unplanned(band)
        if delta > cfg.max_high_boost_db:
            failures.append(
                GuardrailFailure(
                    name="high_frequency_boost",
                    measured=round(delta, 2),
                    limit=cfg.max_high_boost_db,
                    band=band,
                    blame_stage="eq_high_shelf_and_saturation",
                    detail=f"{band} rose {delta:.2f} dB more than planned at matched loudness (limit {cfg.max_high_boost_db} dB)",
                )
            )
        total = automatic(band)
        if total > cfg.absolute_max_high_boost_db:
            failures.append(
                GuardrailFailure(
                    name="high_frequency_boost",
                    measured=round(total, 2),
                    limit=cfg.absolute_max_high_boost_db,
                    band=band,
                    blame_stage="eq_high_shelf_and_saturation",
                    detail=f"{band} rose {total:.2f} dB in total at matched loudness (absolute cap {cfg.absolute_max_high_boost_db} dB, plan or not)",
                    basis="total",
                )
            )

    # --- tilt drift (small highs-up + small bass-down adds up) ----------
    tilt = unplanned_tilt_db_per_oct(band_deltas_db, planned)
    if abs(tilt) > cfg.max_tilt_drift_db_per_oct:
        failures.append(
            GuardrailFailure(
                name="tilt_drift",
                measured=round(tilt, 3),
                limit=cfg.max_tilt_drift_db_per_oct if tilt > 0 else -cfg.max_tilt_drift_db_per_oct,
                band=None,
                blame_stage="eq_high_shelf_and_saturation" if tilt > 0 else "eq_low_shelf_and_highpass",
                detail=f"unplanned spectral tilt {tilt:+.2f} dB/oct ({'brighter' if tilt > 0 else 'darker'}; limit ±{cfg.max_tilt_drift_db_per_oct})",
            )
        )

    # --- broad backstop -------------------------------------------------
    # subsonic_20_35hz is exempt for the same reason it's absent from
    # LOW_END_MUSICAL_BANDS: a deep cut there is a legitimate cleanup, and
    # high-passing rumble routinely exceeds any sane "excessive change"
    # limit. Without this exemption the backstop silently contradicts the
    # deliberate exemption above and fails every correctly-cleaned track.
    for band in BAND_EDGES_HZ:
        if band == "subsonic_20_35hz":
            continue
        delta = unplanned(band)
        if abs(delta) > cfg.max_any_band_change_db:
            failures.append(
                GuardrailFailure(
                    name="excessive_band_change",
                    measured=round(delta, 2),
                    limit=cfg.max_any_band_change_db,
                    band=band,
                    blame_stage="multiband_compression",
                    detail=f"{band} moved {delta:+.2f} dB beyond plan at matched loudness (limit ±{cfg.max_any_band_change_db} dB)",
                )
            )

    # --- export safety --------------------------------------------------
    if true_peak_dbtp > cfg.max_true_peak_dbtp:
        failures.append(
            GuardrailFailure(
                name="true_peak_over_ceiling",
                measured=round(float(true_peak_dbtp), 2),
                limit=cfg.max_true_peak_dbtp,
                band=None,
                blame_stage="limiter_ceiling",
                detail=f"true peak {true_peak_dbtp:.2f} dBTP exceeds {cfg.max_true_peak_dbtp} dBTP",
            )
        )

    # --- loudness vs the target chosen for THIS track --------------------
    loudness_miss = abs(float(rendered_lufs) - float(target_lufs))
    if loudness_miss > cfg.loudness_tolerance_lu:
        failures.append(
            GuardrailFailure(
                name="loudness_target_missed",
                measured=round(float(rendered_lufs), 2),
                limit=round(float(target_lufs), 2),
                band=None,
                blame_stage="loudness_gain_stage",
                detail=f"landed {loudness_miss:.2f} LU from this track's target of {target_lufs:.2f} LUFS",
            )
        )

    # --- punch ----------------------------------------------------------
    if transient_delta < -cfg.max_transient_loss:
        failures.append(
            GuardrailFailure(
                name="transient_loss",
                measured=round(float(transient_delta), 3),
                limit=-cfg.max_transient_loss,
                band=None,
                blame_stage="limiter_and_clipper",
                detail=f"punch fell {abs(transient_delta):.3f} at matched loudness (limit {cfg.max_transient_loss})",
            )
        )

    return ValidationResult(passed=not failures, failures=failures)


def unplanned_tilt_db_per_oct(band_deltas_db: dict[str, float], planned_deltas_db: dict[str, float] | None = None) -> float:
    """Least-squares slope (dB per octave) of the unplanned band deltas
    against log2 of each band's geometric centre. Positive = brighter."""
    planned = planned_deltas_db or {}
    xs, ys = [], []
    for band in TILT_BANDS:
        lo, hi = BAND_EDGES_HZ[band]
        xs.append(np.log2(np.sqrt(lo * hi)))
        ys.append(float(band_deltas_db.get(band, 0.0)) - float(planned.get(band, 0.0)))
    x = np.asarray(xs) - np.mean(xs)
    y = np.asarray(ys) - np.mean(ys)
    return float(np.sum(x * y) / max(float(np.sum(x * x)), 1e-9))
