import {
  getCategories,
  getGenres,
  getMixPresets,
  getStyles,
  getTags,
  postMaster,
  postImportPreset,
  deleteCustomPreset,
  postCodecPreview,
  postAnalyzeAudio,
  postPreviewParams,
  toAuthedDownloadUrl,
} from "@/network/http/client";

const TWEAK_KEYS = ["low_end", "punch", "presence", "brightness", "warmth", "width", "loudness"];

const FALLBACK_CATALOG = {
  genres: [
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
  ],
  tags: ["better_vocals", "deeper", "brighter", "warmer", "louder", "wider", "punchier_drums", "clearer", "softer"],
  styles: [
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
  ],
  categories: ["clean", "modern", "dynamic", "punch", "club", "warm", "bright", "vocal_focus", "bass_control"],
  flavours: {
    clean: ["transparent", "detailed", "balanced"],
    modern: ["competitive", "punchy", "dense"],
    dynamic: ["open", "natural", "wide"],
    punch: ["transient", "impact", "forward"],
    club: ["powerful", "deep", "aggressive"],
    warm: ["analog", "smooth", "saturated"],
    bright: ["airy", "crisp"],
    vocal_focus: ["intimate", "present"],
    bass_control: ["tight", "controlled"],
  },
  presets: [
    { name: "streaming_pop_glue", display_name: "Streaming Pop Glue", description: "Balanced modern pop polish.", genre: "pop", style: "modern", tags: ["better_vocals", "clearer"] },
    { name: "hiphop_lowend_lock", display_name: "Hip-Hop Low End Lock", description: "Tight 808 and vocal pocket.", genre: "hiphop", style: "modern", tags: ["deeper", "louder"] },
    { name: "rock_impact_analog", display_name: "Rock Impact Analog", description: "Rock bus glue with impact.", genre: "rock", style: "rock_modern", tags: ["punchier_drums", "warmer"] },
    { name: "edm_loud_wide", display_name: "EDM Loud Wide", description: "Big width and controlled loudness.", genre: "edm", style: "electronic_modern", tags: ["wider", "brighter", "louder"] },
    { name: "podcast_voice_clean", display_name: "Podcast Voice Clean", description: "Speech-first clarity and control.", genre: "podcast", style: "modern", tags: ["better_vocals", "softer"] },
  ],
};

function withFallback(catalog) {
  return {
    genres: catalog.genres?.length ? catalog.genres : FALLBACK_CATALOG.genres,
    tags: catalog.tags?.length ? catalog.tags : FALLBACK_CATALOG.tags,
    styles: catalog.styles?.length ? catalog.styles : FALLBACK_CATALOG.styles,
    categories: catalog.categories?.length ? catalog.categories : FALLBACK_CATALOG.categories,
    flavours: catalog.flavours && Object.keys(catalog.flavours).length ? catalog.flavours : FALLBACK_CATALOG.flavours,
    presets: catalog.presets?.length ? catalog.presets : FALLBACK_CATALOG.presets,
  };
}

export async function fetchCatalog() {
  try {
    const [genresResponse, tagsResponse, stylesResponse, categoriesResponse, presetsResponse] = await Promise.all([
      getGenres(),
      getTags(),
      getStyles(),
      getCategories(),
      getMixPresets(),
    ]);

    return withFallback({
      genres: genresResponse.genres || [],
      tags: tagsResponse.tags || [],
      styles: stylesResponse.styles || [],
      categories: categoriesResponse.categories || [],
      flavours: categoriesResponse.flavours || {},
      presets: presetsResponse || [],
    });
  } catch {
    return FALLBACK_CATALOG;
  }
}

function normalizeTweaks(rawTweaks) {
  return TWEAK_KEYS.reduce((acc, key) => {
    const value = Number(rawTweaks?.[key] ?? 0);
    acc[key] = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
    return acc;
  }, {});
}

export async function importPreset(file, displayName) {
  const formData = new FormData();
  formData.append("file", file);
  if (displayName) {
    formData.append("display_name", displayName);
  }
  return postImportPreset(formData);
}

export async function deletePreset(name) {
  return deleteCustomPreset(name);
}

export async function previewCodec(jobId, codec) {
  const response = await postCodecPreview(jobId, codec);
  return {
    ...response,
    previewUrl: await toAuthedDownloadUrl(response.preview_download_url),
  };
}

// One-time, real-audio-decode analysis of the uploaded file — the input
// preview_params() below needs. 501s cleanly (see the Node route) when the
// server is running the ffmpeg-fallback engine instead of the adaptive
// Python one; callers treat that the same as "preview unavailable", not
// an error to surface.
export async function analyzeAudio(file) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await postAnalyzeAudio(formData);
  return response.analysis;
}

// Pure computation — real per-band EQ/compression/loudness values for the
// CURRENT genre/style/category/flavour/tweaks selection against the
// already-analyzed track, via the exact same compute_processing_params +
// _apply_user_tweaks calls a real render uses (see backend/ai_mastering/
// mastering.py:preview_processing_params). Cheap enough to call on every
// chip click or tweak drag — callers debounce anyway, this doesn't.
export async function previewParams({ analysis, genre, style, tags, tweaks, category, flavour }) {
  const formData = new FormData();
  formData.append("analysis", JSON.stringify(analysis));
  formData.append("genre", genre);
  formData.append("style", style || "modern");
  formData.append("tags", JSON.stringify(tags || []));
  formData.append("tweaks", JSON.stringify(normalizeTweaks(tweaks || {})));
  if (category) {
    formData.append("category", category);
    if (flavour) formData.append("flavour", flavour);
  }
  const response = await postPreviewParams(formData);
  return response.processing_params;
}

export async function runMasteringJob(input) {
  const formData = new FormData();
  formData.append("file", input.file);

  if (input.genre) {
    formData.append("genre", input.genre);
  }

  formData.append("style", input.style || "modern");
  formData.append("use_stem_separation", String(Boolean(input.useStemSeparation)));
  formData.append("tags", JSON.stringify(input.tags || []));
  formData.append("tweaks", JSON.stringify(normalizeTweaks(input.tweaks || {})));
  formData.append("output_format", "wav");
  formData.append("tier", input.tier === "professional" ? "professional" : "standard");
  // Free, unlimited, 30s-truncated Standard-only render — see PRICING.md.
  // A full-length master (any tier) is the paid action.
  formData.append("preview", String(Boolean(input.preview)));

  if (input.mixPreset) {
    formData.append("mix_preset", input.mixPreset);
  }

  if (input.category) {
    formData.append("category", input.category);
    if (input.flavour) {
      formData.append("flavour", input.flavour);
    }
  }

  if (input.processing) {
    formData.append("processing", JSON.stringify(input.processing));
  }

  if (input.referenceFile) {
    formData.append("reference_file", input.referenceFile);
  }

  const response = await postMaster(formData);

  const [originalUrl, masteredUrl, previewUrl] = await Promise.all([
    toAuthedDownloadUrl(`/original/${response.job_id}`),
    toAuthedDownloadUrl(response.download_url),
    // Always 16-bit PCM WAV, purely for in-browser <audio> playback — see
    // backend's /preview route. masteredUrl (the real deliverable, at its
    // actual bit depth) stays what "Download Master" uses; this is what
    // any on-page player should point at instead.
    toAuthedDownloadUrl(`/preview/${response.job_id}`),
  ]);

  return {
    ...response,
    originalUrl,
    masteredUrl,
    previewUrl,
    // Threaded through so the app shell can tell "just finished a real
    // master" from "just finished a preview" and only auto-navigate to My
    // Masters for the former (see AppClient.jsx).
    preview: Boolean(input.preview),
  };
}
