import { listCustomPresets, getCustomPreset } from "./customPresetsService.js";
import { listBuiltInPresets } from "./builtinPresetsService.js";

const PRESET_DISPLAY_NAMES = {
  streaming_pop_glue: "Streaming Pop Glue",
  rock_impact_analog: "Rock Impact Analog",
  edm_loud_wide: "EDM Loud Wide",
  vocal_master_focus: "Vocal Master Focus",
  podcast_voice_clean: "Podcast Voice Clean",
  hiphop_lowend_lock: "Hip-Hop Low End Lock",
  trap_808_forward: "Trap 808 Forward",
  drill_dark_density: "Drill Dark Density",
  rock_radio_punch: "Rock Radio Punch",
  metal_modern_glue: "Metal Modern Glue",
  edm_festival_hype: "EDM Festival Hype",
  house_club_translator: "House Club Translator",
  techno_dark_floor: "Techno Dark Floor",
  acoustic_natural_space: "Acoustic Natural Space",
  singer_songwriter_focus: "Singer-Songwriter Focus",
  lofi_vinyl_haze: "Lo-Fi Vinyl Haze",
  classical_dynamic_preserve: "Classical Dynamic Preserve",
  youtube_voice_present: "YouTube Voice Present",
};

function titleizePresetKey(key) {
  return key
    .split("_")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

export function normalizePreset(name, value, extra = {}) {
  return {
    name,
    display_name: value?.display_name || PRESET_DISPLAY_NAMES[name] || titleizePresetKey(name),
    description: value?.description || "",
    genre: value?.genre || "",
    style: value?.style || "modern",
    tags: Array.isArray(value?.tags) ? value.tags : [],
    tweaks: value?.tweaks || {},
    use_stem_separation: Boolean(value?.use_stem_separation),
    output_format: value?.output_format || "wav",
    // Passed through, not flattened away: when present, /master routes this
    // preset to the full preset_dsp_engine instead of the genre-based one.
    processing: value?.processing || null,
    quality_control: value?.quality_control || null,
    output: value?.output || null,
    ...extra,
  };
}

// uid is optional — an anonymous/unauthenticated caller (shouldn't happen
// given requireAuth gates every route, but keep this safe standalone) just
// gets the built-in list with no Saved Artists.
export async function listMixPresets(uid) {
  const [builtIn, custom] = await Promise.all([listBuiltInPresets(), listCustomPresets(uid)]);
  return [...builtIn, ...custom];
}

export async function getMixPresetByName(name, uid) {
  const builtIn = (await listBuiltInPresets()).find((item) => item.name === name);
  if (builtIn) return builtIn;
  return getCustomPreset(name, uid);
}
