import { create } from "zustand";

import { fetchCatalog, importPreset, runMasteringJob } from "@/domain/mastering/masteringDomain";

const EMPTY_TWEAKS = {
  low_end: 0,
  punch: 0,
  presence: 0,
  brightness: 0,
  warmth: 0,
  width: 0,
  loudness: 0,
};

export const useMasteringStore = create((set, get) => ({
  isBootstrapping: true,
  isSubmitting: false,
  isImportingPreset: false,
  error: "",
  status: "",
  result: null,
  importError: "",

  file: null,
  genres: [],
  tags: [],
  styles: [],
  presets: [],

  selectedGenre: "",
  selectedStyle: "modern",
  selectedPreset: "",
  selectedTags: [],
  useStemSeparation: false,
  tweaks: { ...EMPTY_TWEAKS },
  tier: "standard",

  async bootstrap() {
    set({ isBootstrapping: true, error: "" });

    try {
      const catalog = await fetchCatalog();
      set({
        genres: catalog.genres,
        tags: catalog.tags,
        styles: catalog.styles,
        presets: catalog.presets,
        selectedGenre: catalog.genres[0] || "",
        selectedStyle: catalog.styles[0] || "modern",
        selectedPreset: "",
        isBootstrapping: false,
      });
    } catch (err) {
      set({
        isBootstrapping: false,
        error: err.message || "Failed to load mastering catalog",
      });
    }
  },

  setFile(file) {
    set({ file, result: null, error: "" });
  },

  setGenre(selectedGenre) {
    set({ selectedGenre, selectedPreset: "" });
  },

  setStyle(selectedStyle) {
    set({ selectedStyle, selectedPreset: "" });
  },

  setPreset(selectedPreset) {
    const preset = get().presets.find((item) => item.name === selectedPreset);
    if (!preset) {
      set({ selectedPreset: "" });
      return;
    }

    set({
      selectedPreset,
      selectedGenre: preset.genre || get().selectedGenre,
      selectedStyle: preset.style || get().selectedStyle,
      selectedTags: preset.tags || [],
      tweaks: { ...EMPTY_TWEAKS, ...(preset.tweaks || {}) },
      useStemSeparation: Boolean(preset.use_stem_separation),
    });
  },

  toggleTag(tag) {
    const selectedTags = get().selectedTags;
    if (selectedTags.includes(tag)) {
      set({ selectedTags: selectedTags.filter((item) => item !== tag), selectedPreset: "" });
      return;
    }

    set({ selectedTags: [...selectedTags, tag], selectedPreset: "" });
  },

  setUseStemSeparation(useStemSeparation) {
    set({ useStemSeparation, selectedPreset: "" });
  },

  setTweak(key, value) {
    const numeric = Number(value);
    set({
      tweaks: {
        ...get().tweaks,
        [key]: Number.isFinite(numeric) ? numeric : 0,
      },
      selectedPreset: "",
    });
  },

  setTier(tier) {
    set({ tier: tier === "professional" ? "professional" : "standard" });
  },

  async importPreset(file) {
    if (!file) return;
    set({ isImportingPreset: true, importError: "" });

    try {
      const preset = await importPreset(file);
      const catalog = await fetchCatalog();
      set({
        presets: catalog.presets,
        selectedPreset: preset.name,
        selectedGenre: preset.genre || get().selectedGenre,
        selectedStyle: preset.style || get().selectedStyle,
        selectedTags: preset.tags || [],
        tweaks: { ...EMPTY_TWEAKS, ...(preset.tweaks || {}) },
        useStemSeparation: Boolean(preset.use_stem_separation),
        isImportingPreset: false,
      });
    } catch (err) {
      set({ isImportingPreset: false, importError: err.message || "Preset import failed" });
    }
  },

  async submit() {
    const state = get();

    if (!state.file) {
      set({ error: "Select an audio file before mastering." });
      return;
    }

    if (!state.selectedGenre && !state.selectedPreset) {
      set({ error: "Select a genre or mixing preset." });
      return;
    }

    set({ isSubmitting: true, status: "Analyzing and mastering...", error: "", result: null });

    try {
      const response = await runMasteringJob({
        file: state.file,
        genre: state.selectedGenre,
        style: state.selectedStyle,
        tags: state.selectedTags,
        tweaks: state.tweaks,
        useStemSeparation: state.useStemSeparation,
        mixPreset: state.selectedPreset || null,
        tier: state.tier,
      });

      set({
        isSubmitting: false,
        status: "Mastering complete.",
        result: response,
      });
    } catch (err) {
      set({
        isSubmitting: false,
        status: "",
        error: err.message || "Mastering failed",
      });
    }
  },
}));
