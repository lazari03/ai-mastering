import {
  getGenres,
  getMixPresets,
  getStyles,
  getTags,
  postMaster,
  postImportPreset,
  postCodecPreview,
  getOriginalUrl,
  toAbsoluteUrl,
} from "@/network/http/client";

const TWEAK_KEYS = ["low_end", "punch", "presence", "brightness", "warmth", "width", "loudness"];

const FALLBACK_CATALOG = {
  genres: ["pop", "hiphop", "rock", "edm", "acoustic", "lofi", "podcast", "classical"],
  tags: ["better_vocals", "deeper", "brighter", "warmer", "louder", "wider", "punchier_drums", "clearer", "softer"],
  styles: ["modern", "rock_90s", "rock_2000s", "rock_modern", "electronic_modern", "stock_mastering_strip"],
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
    presets: catalog.presets?.length ? catalog.presets : FALLBACK_CATALOG.presets,
  };
}

export async function fetchCatalog() {
  try {
    const [genresResponse, tagsResponse, stylesResponse, presetsResponse] = await Promise.all([
      getGenres(),
      getTags(),
      getStyles(),
      getMixPresets(),
    ]);

    return withFallback({
      genres: genresResponse.genres || [],
      tags: tagsResponse.tags || [],
      styles: stylesResponse.styles || [],
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

export async function importPreset(file) {
  const formData = new FormData();
  formData.append("file", file);
  return postImportPreset(formData);
}

export async function previewCodec(jobId, codec) {
  const response = await postCodecPreview(jobId, codec);
  return {
    ...response,
    previewUrl: toAbsoluteUrl(response.preview_download_url),
  };
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

  if (input.mixPreset) {
    formData.append("mix_preset", input.mixPreset);
  }

  if (input.referenceFile) {
    formData.append("reference_file", input.referenceFile);
  }

  const response = await postMaster(formData);

  return {
    ...response,
    originalUrl: getOriginalUrl(response.job_id),
    masteredUrl: toAbsoluteUrl(response.download_url),
  };
}
