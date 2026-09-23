// What the adaptive engine actually does with a genre choice, per genre,
// for the default "Modern" style — generated from
// backend ai_mastering/planning/target_model.py build_target_context()
// (params.py GENRE_TARGET_PROFILES + MASTERING_STYLE_PROFILES["modern"] +
// planning/config.py loudness window). Same duplication risk as
// loudnessTargets.js: change params.py, regenerate these in the same commit.
//
// preferredLufs / windowMin / windowMax: the loudness window the plan aims
//   into (a mix already inside it at/above preferred is left alone).
// crestDb: the master crest factor the loudness recovery won't go below.
// priorities: what the genre protects most (0..1), top three shown.
import { GENRE_KEYS } from "@/content/genrePages";

export const PRIORITY_LABELS = {
  transients: "Transients",
  drum_punch: "Drum punch",
  dynamic_contrast: "Dynamic contrast",
  low_end_impact: "Low-end impact",
  stereo_image: "Stereo image",
  tonal_character: "Tonal character",
};

export const GENRE_ENGINE_CONTEXT = {
  pop: { preferredLufs: -10.0, windowMin: -13.8, windowMax: -9.0, crestDb: 8.4, maxWidth: 1.25, priorities: { tonal_character: 0.8, transients: 0.75, drum_punch: 0.75 } },
  hiphop: { preferredLufs: -9.0, windowMin: -12.7, windowMax: -8.0, crestDb: 7.9, maxWidth: 1.15, priorities: { drum_punch: 0.9, low_end_impact: 0.9, transients: 0.8 } },
  rock: { preferredLufs: -11.5, windowMin: -15.6, windowMax: -10.5, crestDb: 9.9, maxWidth: 1.12, priorities: { transients: 0.92, drum_punch: 0.92, dynamic_contrast: 0.85 } },
  edm: { preferredLufs: -8.0, windowMin: -11.5, windowMax: -7.0, crestDb: 6.9, maxWidth: 1.35, priorities: { low_end_impact: 0.88, drum_punch: 0.85, stereo_image: 0.8 } },
  acoustic: { preferredLufs: -15.0, windowMin: -19.2, windowMax: -14.0, crestDb: 11.9, maxWidth: 1.1, priorities: { dynamic_contrast: 0.92, transients: 0.85, tonal_character: 0.85 } },
  lofi: { preferredLufs: -13.0, windowMin: -16.6, windowMax: -12.0, crestDb: 9.9, maxWidth: 1.0, priorities: { tonal_character: 0.65, drum_punch: 0.6, low_end_impact: 0.6 } },
  podcast: { preferredLufs: -17.0, windowMin: -20.6, windowMax: -16.0, crestDb: 7.9, maxWidth: 0.2, priorities: { tonal_character: 0.6, dynamic_contrast: 0.55, transients: 0.35 } },
  classical: { preferredLufs: -19.0, windowMin: -23.3, windowMax: -18.0, crestDb: 14.5, maxWidth: 1.2, priorities: { dynamic_contrast: 0.97, transients: 0.9, tonal_character: 0.9 } },
};

// Search-intent H1, lead and the genre-specific "what it protects" line.
export const GENRE_HERO = {
  pop: {
    h1: "Pop Mastering Online — Vocal First, Loud Enough",
    lead: "Master pop without burying the vocal. The engine measures your mix first, then shapes presence, low end and loudness only as far as your track actually needs.",
    protects: "the vocal's presence and the snap of the drums",
  },
  hiphop: {
    h1: "Hip-Hop Mastering Online — Heavy 808s, Clear Vocals",
    lead: "Master hip-hop without trading the 808 for the vocal. Your mix is measured first; the low end gets headroom before any compression decisions are made.",
    protects: "808 and kick weight while keeping the vocal on top",
  },
  rock: {
    h1: "Master Rock Without Flattening the Drums",
    lead: "Rock mastering that treats drum transients as the point. The engine reads your mix, then adds only the loudness it can reach without squashing the kit.",
    protects: "drum transients and the dynamics between verse and chorus",
  },
  edm: {
    h1: "EDM Mastering Online — Loud and Wide, Without the Distortion",
    lead: "Club loudness with true-peak-safe limiting. The engine measures how much headroom your drop really has before it decides how hard to push.",
    protects: "low-end impact, the kick and a wide but mono-safe image",
  },
  acoustic: {
    h1: "Acoustic Mastering That Keeps the Performance Breathing",
    lead: "Master acoustic and singer-songwriter tracks without compressing the performance away. A dynamic recording is allowed to stay dynamic.",
    protects: "the dynamics of the performance and the natural attack of strings and voice",
  },
  lofi: {
    h1: "Lo-Fi Mastering That Keeps the Warmth",
    lead: "Master lo-fi without cleaning the character out of it. The engine reads your mix's tone before it touches the top end or the level.",
    protects: "the warm, soft tonal character the genre is built on",
  },
  podcast: {
    h1: "Podcast Mastering Online — One Consistent Voice, Every Episode",
    lead: "Spoken-word mastering tuned for intelligibility and consistent level, near-mono by design, at podcast loudness rather than music loudness.",
    protects: "voice intelligibility and a steady, even level",
  },
  classical: {
    h1: "Classical Mastering That Preserves Every Dynamic",
    lead: "Transparent mastering for orchestral and chamber recordings. The engine does the least here on purpose — the distance between pianissimo and fortissimo is the performance.",
    protects: "the full dynamic range between the quietest and loudest passages",
  },
};

for (const g of GENRE_KEYS) {
  if (!GENRE_ENGINE_CONTEXT[g] || !GENRE_HERO[g]) throw new Error(`genreEngineContext: missing genre "${g}"`);
}
