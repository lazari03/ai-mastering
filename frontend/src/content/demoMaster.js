// Real engine output for the homepage demo (public/audio/demos/pop-before.mp3 ->
// pop-after.mp3), captured by running backend ai_mastering.mastering.master_track
// (genre "pop", default style) on the demo source. Regenerate this AND the
// after file together whenever the engine changes, or the page describes a
// master visitors aren't hearing. Numbers are from the full-resolution master;
// the MP3 used for playback is a lossy encode of it.
export const DEMO_MASTER = {
 "track": "pop-before.mp3",
 "genre": "pop",
 "before_lufs": -15.89,
 "after_lufs": -10.1,
 "analysis_before": {
  "integrated_lufs": -15.888,
  "true_peak_db": -2.965
 },
 "analysis_after": {
  "integrated_lufs": -10.101,
  "true_peak_db": -1.0
 },
 "processing_applied": {
  "mastering_diagnostics": {
   "engine": "adaptive_plan_v2",
   "source_profile": {
    "integrated_lufs": -15.888,
    "true_peak_db": -2.965,
    "lra_lu": 2.206,
    "plr_db": 12.923,
    "crest_db": 16.198,
    "stereo_correlation": 0.6259,
    "stereo_width": 0.4798
   },
   "detected_problems": {
    "insufficient_sub": {
     "kind": "insufficient_sub",
     "category": "tonal",
     "severity": 1.0,
     "confidence": 0.667,
     "center_hz": 24.5,
     "actionable": true
    },
    "thin_body": {
     "kind": "thin_body",
     "category": "tonal",
     "severity": 0.464,
     "confidence": 0.779,
     "center_hz": 134.342,
     "actionable": true
    },
    "harsh_upper_mids": {
     "kind": "harsh_upper_mids",
     "category": "tonal",
     "severity": 0.079,
     "confidence": 0.234,
     "center_hz": 4130.079,
     "actionable": true
    },
    "excessive_brightness": {
     "kind": "excessive_brightness",
     "category": "tonal",
     "severity": 0.254,
     "confidence": 0.562,
     "center_hz": 11233.459,
     "actionable": true
    },
    "below_loudness_range": {
     "kind": "below_loudness_range",
     "category": "loudness",
     "severity": 0.211,
     "confidence": 0.95,
     "center_hz": null,
     "actionable": true
    }
   },
   "mastering_plan": {
    "eq_decisions": [
     {
      "filter_type": "bell",
      "frequency_hz": 35.0,
      "gain_db": 1.0,
      "q": 2.5,
      "confidence": 0.667,
      "reason": "measured_insufficient_sub",
      "problem": "insufficient_sub"
     },
     {
      "filter_type": "bell",
      "frequency_hz": 134.342,
      "gain_db": 0.869,
      "q": 0.5,
      "confidence": 0.779,
      "reason": "measured_thin_body",
      "problem": "thin_body"
     },
     {
      "filter_type": "bell",
      "frequency_hz": 11233.459,
      "gain_db": -0.715,
      "q": 1.757,
      "confidence": 0.562,
      "reason": "measured_excessive_brightness",
      "problem": "excessive_brightness"
     }
    ],
    "dynamic_eq_decisions": [
     {
      "frequency_hz": 1090.92,
      "center_hz": null,
      "max_reduction_db": 1.504,
      "gain_db": null,
      "problem": null,
      "reason": "intermittent excess around 1091 Hz (hot in 28% of segments)",
      "confidence": 0.658
     }
    ],
    "compression": {
     "enabled": false,
     "multiband": {
      "enabled": false
     },
     "glue": {
      "enabled": false
     }
    },
    "stereo": {
     "lf_mono": {
      "enabled": false
     },
     "side_gain_db": 0.0,
     "side_high_shelf_db": 0.0,
     "side_shelf_hz": 1500.0,
     "reasons": [
      "stereo image within limits: no width processing"
     ],
     "enabled": false
    },
    "loudness": {
     "source_lufs": -15.89,
     "preferred_lufs": -10.0,
     "acceptable_min_lufs": -13.78,
     "acceptable_max_lufs": -9.0,
     "desired_lufs": -10.0,
     "achievable_lufs_by_budget": -7.8,
     "target_lufs": -10.0,
     "constrained_by_limiter_budget": false,
     "notes": []
    },
    "rejected_decisions": [
     {
      "stage": "eq",
      "problem": "harsh_upper_mids",
      "reason": "confidence 0.23 below cut gate 0.42"
     },
     {
      "stage": "compression",
      "problem": "micro_dynamics",
      "reason": "need 0.00 below 0.20 (limiter alone reaches -7.8 LUFS vs acceptable min -13.8; transient health 0.53; already-limited 0.00)"
     },
     {
      "stage": "glue_compression",
      "problem": "macro_dynamics",
      "reason": "need 0.00 below 0.25 (LRA 2.2 LU)"
     },
     {
      "stage": "saturation",
      "problem": null,
      "reason": "amount 0.017 below 0.03 (allowance 0.100, factors {'hf_suitability': 0.27, 'transient_protection': 0.724, 'not_already_limited': 1.0, 'not_clipped': 1.0, 'identity': 0.89})"
     },
     {
      "stage": "clipper",
      "problem": null,
      "reason": "limiter budget sufficient"
     }
    ]
   },
   "evaluation": {
    "regions": {
     "sub_30_55": {
      "actual_db": 0.497,
      "planned_db": 0.741,
      "collateral_db": -0.243
     },
     "low_end_40_120": {
      "actual_db": 0.553,
      "planned_db": 0.579,
      "collateral_db": -0.027
     },
     "low_mid_120_500": {
      "actual_db": 0.591,
      "planned_db": 0.444,
      "collateral_db": 0.147
     },
     "mid_500_4k": {
      "actual_db": -0.13,
      "planned_db": -0.087,
      "collateral_db": -0.043
     },
     "hf_4k_14k": {
      "actual_db": -0.258,
      "planned_db": -0.362,
      "collateral_db": 0.105
     },
     "air_14k_up": {
      "actual_db": -0.1,
      "planned_db": -0.19,
      "collateral_db": 0.091
     }
    },
    "dynamics": {
     "crest_before_db": 16.198,
     "crest_after_db": 12.044,
     "crest_change_db": -4.154,
     "short_term_crest_change_db": -1.071,
     "short_term_crest_before_db": 12.523,
     "short_term_crest_after_db": 11.452,
     "lra_before_lu": 2.206,
     "lra_after_lu": 1.856,
     "plr_before_db": 12.923,
     "plr_after_db": 9.101
    },
    "stereo": {
     "width_before": 0.4798,
     "width_after": 0.468,
     "correlation_before": 0.6259,
     "correlation_after": 0.6408,
     "low_end_width_before": 0.0569,
     "low_end_width_after": 0.0591
    },
    "limiter": {
     "gr_at_p995_peaks_db": 3.331,
     "budget_db": 4.619,
     "max_gr_db": 4.087
    },
    "loudness": {
     "integrated_lufs": -10.101,
     "target_lufs": -10.0,
     "acceptable_min_lufs": -13.78,
     "acceptable_max_lufs": -9.0,
     "in_acceptable_range": true
    },
    "true_peak_db": -1.0,
    "problem_outcomes": {
     "insufficient_sub": {
      "outside_window_before_db": 17.849,
      "outside_window_after_db": 17.602,
      "improved": true,
      "unchanged": false
     },
     "thin_body": {
      "outside_window_before_db": 2.816,
      "outside_window_after_db": 2.181,
      "improved": true,
      "unchanged": false
     },
     "harsh_upper_mids": {
      "outside_window_before_db": 0.484,
      "outside_window_after_db": 0.419,
      "improved": false,
      "unchanged": true
     },
     "excessive_brightness": {
      "outside_window_before_db": 1.455,
      "outside_window_after_db": 1.037,
      "improved": true,
      "unchanged": false
     }
    },
    "flags": [],
    "passed": true
   },
   "backoff_applied": false
  }
 }
};
