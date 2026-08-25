import { create } from "zustand";

import { fetchCatalog, importPreset, deletePreset, runMasteringJob } from "@/domain/mastering/masteringDomain";

const EMPTY_TWEAKS = {
  low_end: 0,
  punch: 0,
  presence: 0,
  brightness: 0,
  warmth: 0,
  width: 0,
  loudness: 0,
};

// Mirrors exactly what backend/app/services/preset_dsp_engine.py actually
// reads out of a preset's "processing" block — every key here is a real,
// engine-processed parameter, not a decorative slider. Sensible neutral-ish
// defaults so switching into Pro mode doesn't silently do nothing (bus
// compressor and limiter are always meaningfully engaged; EQ/saturation/
// highpass/clipper start at "off"/flat so the user opts in deliberately).
export const DEFAULT_PRO_PARAMS = {
  input: { auto_gain: true, headroom_target_db: -6 },
  highpass: { enabled: false, frequency_hz: 30, slope_db_oct: 12 },
  eq: [
    { frequency_hz: 100, gain_db: 0, q: 1.0 },
    { frequency_hz: 1000, gain_db: 0, q: 1.0 },
    { frequency_hz: 8000, gain_db: 0, q: 1.0 },
  ],
  bus_compressor: { ratio: 2.0, attack_ms: 20, release_ms: 150, max_gain_reduction_db: 3 },
  dynamic_eq: [],
  saturation: { enabled: false, amount: 0.03, oversampling: 4 },
  stereo: { low_end_mono_below_hz: 120, bands: [] },
  clipper: { enabled: false, ceiling_dbtp: -1, drive_db: 0, oversampling: 4 },
  limiter: { target_lufs_i: -10, ceiling_dbtp: -1 },
  output: { bit_depth: 24, dither: "triangular" },
};

// Reference mode needs *some* genre/style so the adaptive engine's target
// profile resolves — the reference track's spectral balance is what
// actually shapes the tone (see ai_mastering/mastering.py), this is just a
// harmless baseline the user never has to think about.
const REFERENCE_MODE_DEFAULTS = { genre: "pop", style: "modern" };

function cloneProParams(params) {
  return JSON.parse(JSON.stringify(params));
}

export const useMasteringStore = create((set, get) => ({
  isBootstrapping: true,
  isSubmitting: false,
  isImportingPreset: false,
  error: "",
  status: "",
  result: null,
  importError: "",

  file: null,
  referenceFile: null,
  genres: [],
  tags: [],
  styles: [],
  categories: [],
  flavoursByCategory: {},
  presets: [],

  selectedGenre: "",
  selectedStyle: "modern",
  // Optional musical-objective layer (Clean, Modern, Club, ...) — "" means
  // "no category selected", genre + style behave exactly as without it.
  selectedCategory: "",
  selectedFlavour: "",
  selectedPreset: "",
  selectedTags: [],
  useStemSeparation: false,
  tweaks: { ...EMPTY_TWEAKS },
  tier: "standard",

  // "quick" = automatic, DSP picks everything from genre/style/tags.
  // "pro" = manual professional parameters (proParams below), still
  // rendered by the same DSP engine (preset_dsp_engine). Reference mode
  // is not a third value here — it's driven by referenceFile being set,
  // and overrides both (see submit()).
  mode: "quick",
  proParams: cloneProParams(DEFAULT_PRO_PARAMS),

  async bootstrap() {
    set({ isBootstrapping: true, error: "" });

    try {
      const catalog = await fetchCatalog();
      set({
        genres: catalog.genres,
        tags: catalog.tags,
        styles: catalog.styles,
        categories: catalog.categories || [],
        flavoursByCategory: catalog.flavours || {},
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

  // Uploading a reference track is its own workflow (see submit()) — it
  // does NOT clear the main file, and clearing the reference (back button)
  // does not touch the main file either, so switching between manual and
  // reference mastering never loses the user's uploaded audio.
  setReferenceFile(referenceFile) {
    set({ referenceFile });
  },

  setMode(mode) {
    set({ mode: mode === "pro" ? "pro" : "quick" });
  },

  setGenre(selectedGenre) {
    set({ selectedGenre, selectedPreset: "" });
  },

  setStyle(selectedStyle) {
    set({ selectedStyle, selectedPreset: "" });
  },

  setCategory(selectedCategory) {
    // Switching category resets flavour — flavours are scoped to their
    // parent category (see FLAVOURS_BY_CATEGORY), a stale flavour name from
    // a different category would silently do nothing server-side.
    set({ selectedCategory, selectedFlavour: "", selectedPreset: "" });
  },

  setFlavour(selectedFlavour) {
    set({ selectedFlavour, selectedPreset: "" });
  },

  setPreset(selectedPreset) {
    const preset = get().presets.find((item) => item.name === selectedPreset);
    if (!preset) {
      set({ selectedPreset: "" });
      return;
    }

    const hasProcessing = Boolean(preset.processing);
    set({
      selectedPreset,
      selectedGenre: preset.genre || get().selectedGenre,
      selectedStyle: preset.style || get().selectedStyle,
      selectedTags: preset.tags || [],
      tweaks: { ...EMPTY_TWEAKS, ...(preset.tweaks || {}) },
      useStemSeparation: Boolean(preset.use_stem_separation),
      // A saved preset with a full "processing" spec IS a professional
      // preset — selecting it switches to Pro mode and populates the
      // manual control panel with its actual values, so the UI reflects
      // exactly what will run rather than just a name in a dropdown.
      ...(hasProcessing
        ? { mode: "pro", proParams: { ...cloneProParams(DEFAULT_PRO_PARAMS), ...preset.processing } }
        : {}),
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

  // Shallow-merges a patch into one section of proParams, e.g.
  // setProSection("limiter", { target_lufs_i: -9 }).
  setProSection(section, patch) {
    set({
      proParams: { ...get().proParams, [section]: { ...get().proParams[section], ...patch } },
      selectedPreset: "",
    });
  },

  addProBand(section, band) {
    const proParams = get().proParams;
    set({
      proParams: { ...proParams, [section]: [...proParams[section], band] },
      selectedPreset: "",
    });
  },

  updateProBand(section, index, patch) {
    const proParams = get().proParams;
    const list = proParams[section].map((band, i) => (i === index ? { ...band, ...patch } : band));
    set({ proParams: { ...proParams, [section]: list }, selectedPreset: "" });
  },

  removeProBand(section, index) {
    const proParams = get().proParams;
    set({
      proParams: { ...proParams, [section]: proParams[section].filter((_, i) => i !== index) },
      selectedPreset: "",
    });
  },

  // Stereo bands live at proParams.stereo.bands (nested one level deeper
  // than the other band lists), so they get their own small helpers.
  addStereoBand(band) {
    const stereo = get().proParams.stereo;
    set({ proParams: { ...get().proParams, stereo: { ...stereo, bands: [...stereo.bands, band] } }, selectedPreset: "" });
  },

  updateStereoBand(index, patch) {
    const stereo = get().proParams.stereo;
    const bands = stereo.bands.map((band, i) => (i === index ? { ...band, ...patch } : band));
    set({ proParams: { ...get().proParams, stereo: { ...stereo, bands } }, selectedPreset: "" });
  },

  removeStereoBand(index) {
    const stereo = get().proParams.stereo;
    set({
      proParams: { ...get().proParams, stereo: { ...stereo, bands: stereo.bands.filter((_, i) => i !== index) } },
      selectedPreset: "",
    });
  },

  resetProParams() {
    set({ proParams: cloneProParams(DEFAULT_PRO_PARAMS) });
  },

  async importPreset(file, displayName) {
    if (!file) return;
    set({ isImportingPreset: true, importError: "" });

    try {
      const preset = await importPreset(file, displayName);
      const catalog = await fetchCatalog();
      const hasProcessing = Boolean(preset.processing);
      set({
        presets: catalog.presets,
        selectedPreset: preset.name,
        selectedGenre: preset.genre || get().selectedGenre,
        selectedStyle: preset.style || get().selectedStyle,
        selectedTags: preset.tags || [],
        tweaks: { ...EMPTY_TWEAKS, ...(preset.tweaks || {}) },
        useStemSeparation: Boolean(preset.use_stem_separation),
        isImportingPreset: false,
        ...(hasProcessing
          ? { mode: "pro", proParams: { ...cloneProParams(DEFAULT_PRO_PARAMS), ...preset.processing } }
          : {}),
      });
    } catch (err) {
      set({ isImportingPreset: false, importError: err.message || "Preset import failed" });
    }
  },

  async deletePreset(name) {
    try {
      await deletePreset(name);
      const catalog = await fetchCatalog();
      const stillSelected = catalog.presets.some((p) => p.name === get().selectedPreset);
      set({
        presets: catalog.presets,
        ...(stillSelected ? {} : { selectedPreset: "" }),
      });
    } catch (err) {
      set({ importError: err.message || "Failed to remove preset" });
    }
  },

  // preview=true is the free path (30s, Standard engine, no stems, no
  // paywall — see PRICING.md); preview=false is the paid full render.
  async submit(preview = false) {
    const state = get();

    if (!state.file) {
      set({ error: "Select an audio file before mastering." });
      return;
    }

    const referenceMode = Boolean(state.referenceFile);

    if (!referenceMode && !state.selectedGenre && !state.selectedPreset) {
      set({ error: "Select a genre or mixing preset." });
      return;
    }

    set({
      isSubmitting: true,
      status: preview ? "Rendering preview..." : "Analyzing and mastering...",
      error: "",
      result: null,
    });

    try {
      const usingSavedPreset = Boolean(state.selectedPreset);
      // Reference mode always uses the adaptive engine (spectral matching
      // against the reference) — never the manual Pro processing spec, per
      // "no manual parameter form while reference mode is active".
      const useProProcessing = !preview && !referenceMode && state.mode === "pro" && !usingSavedPreset;

      const response = await runMasteringJob({
        file: state.file,
        referenceFile: state.referenceFile,
        genre: referenceMode ? state.selectedGenre || REFERENCE_MODE_DEFAULTS.genre : state.selectedGenre,
        style: referenceMode ? state.selectedStyle || REFERENCE_MODE_DEFAULTS.style : state.selectedStyle,
        tags: referenceMode ? [] : state.selectedTags,
        tweaks: state.tweaks,
        useStemSeparation: state.useStemSeparation,
        mixPreset: state.selectedPreset || null,
        processing: useProProcessing ? state.proParams : null,
        tier: state.tier,
        // Category/flavour only make sense for the adaptive engine — never
        // sent for a saved preset (a preset is a self-sufficient literal
        // spec) or a Pro-mode manual processing spec.
        category: !preview && !usingSavedPreset && !useProProcessing ? state.selectedCategory || null : null,
        flavour: !preview && !usingSavedPreset && !useProProcessing ? state.selectedFlavour || null : null,
        preview,
      });

      set({
        isSubmitting: false,
        status: preview ? "Preview ready." : "Mastering complete.",
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
