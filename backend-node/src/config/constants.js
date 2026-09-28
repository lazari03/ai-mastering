// Mirrors backend/params.py:GENRE_TARGET_PROFILES keys exactly — kept in
// sync by hand (same pattern already used for STYLES/TAGS below), not
// fetched at request time. /genres on the Python side exists for the
// frontend's UI catalog fetch; this static list is what /master actually
// validates against before ever reaching Python.
export const GENRES = [
  "pop",
  "hiphop",
  "rock",
  "edm",
  "acoustic",
  "lofi",
  "podcast",
  "classical",
  "metal",
  "trap",
  "rnb",
  "reggaeton",
  "latin",
  "house",
  "techno",
  "dnb",
  "afrobeats",
  "singer_songwriter",
  "jazz",
  "cinematic",
];

// Mirrors backend/params.py:MASTERING_STYLE_PROFILES keys exactly.
export const STYLES = [
  "modern",
  "rock_90s",
  "rock_2000s",
  "rock_modern",
  "electronic_modern",
  "stock_mastering_strip",
  "vintage_analog",
  "cd_loudness_war",
  "vinyl_master",
  "streaming_safe",
  "hiphop_golden_era",
  "hiphop_modern_trap",
  "pop_80s",
  "edm_festival",
  "acoustic_natural",
  "cinematic_score",
];

export const TAGS = [
  "better_vocals",
  "deeper",
  "brighter",
  "warmer",
  "louder",
  "wider",
  "punchier_drums",
  "clearer",
  "softer",
];

// Mirrors backend/params.py:MASTERING_CATEGORY_PROFILES / MASTERING_FLAVOURS
// — the optional musical-objective layer (Clean, Modern, Club, ...). Omitting
// both on a request is unchanged behavior; category with no flavour is valid
// (each category has sensible defaults with no flavour selected).
export const CATEGORIES = [
  "clean",
  "modern",
  "dynamic",
  "punch",
  "club",
  "warm",
  "bright",
  "vocal_focus",
  "bass_control",
];

export const FLAVOURS_BY_CATEGORY = {
  clean: ["transparent", "detailed", "balanced"],
  modern: ["competitive", "punchy", "dense"],
  dynamic: ["open", "natural", "wide"],
  punch: ["transient", "impact", "forward"],
  club: ["powerful", "deep", "aggressive"],
  warm: ["analog", "smooth", "saturated"],
  bright: ["airy", "crisp"],
  vocal_focus: ["intimate", "present"],
  bass_control: ["tight", "controlled"],
};

export const AUDIO_DECODE_EXTS = new Set([".mp3", ".m4a", ".aac", ".ogg", ".wma", ".mp4", ".webm"]);

// Where the master is going — mirrors backend/params.py:DELIVERY_TARGETS.
// Streaming services play everything at a reference loudness (Spotify,
// YouTube, Tidal, Amazon -14 LUFS; Apple Music -16) and turn louder masters
// down; the engine also drops the true-peak ceiling to -2 dBTP for any
// master louder than -14 LUFS, per Spotify's transcoding guidance.
export const DELIVERY_TARGETS = [
  { key: "auto", label: "Genre best practice", referenceLufs: null },
  { key: "streaming", label: "Streaming (Spotify, YouTube, Tidal, Amazon)", referenceLufs: -14 },
  { key: "apple", label: "Apple Music", referenceLufs: -16 },
  { key: "loud", label: "Loud (club / DJ)", referenceLufs: null },
];
export const DELIVERY_KEYS = DELIVERY_TARGETS.map((d) => d.key);
