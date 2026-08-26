import { create } from "zustand";

import { fetchCatalog, importPreset, deletePreset, runMasteringJob, analyzeAudio, previewParams } from "@/domain/mastering/masteringDomain";
import { mapAdaptiveParamsToProParams } from "@/domain/mastering/adaptiveToProParams";

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

// Debounce for the live parameter preview — module-level (not store state)
// since it's pure plumbing, not something any component reads. 350ms: long
// enough that a fast run across genre chips or a dragged tweak knob only
// fires the request once it settles, short enough that it still reads as
// "live" rather than laggy.
let previewDebounceTimer = null;
const PREVIEW_DEBOUNCE_MS = 350;

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

  // Live "adaptive controls" preview (Quick mode) — analysis is the
  // one-time real-audio measurement of the current file (see
  // analyzeAudio()); livePreviewParams is what compute_processing_params
  // would actually do with the current genre/style/category/flavour/
  // tweaks selection against THAT analysis, refreshed via
  // refreshPreviewParams() below every time one of those changes. null
  // livePreviewParams before the first successful preview, or whenever
  // analysis itself is stale/missing — components should treat that as
  // "no live values yet", not an error.
  analysis: null,
  isAnalyzing: false,
  analyzeError: "",
  livePreviewParams: null,
  isPreviewLoading: false,
  previewError: "",
  // Set true on a 501 from the server (ffmpeg-fallback engine, no
  // adaptive parameter model to preview) — sticky for the session so
  // components can just hide the panel instead of retrying a dead feature
  // on every selection change.
  previewUnavailable: false,

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
    // New file invalidates any analysis/preview from the previous one —
    // clear both immediately (stale numbers for a track that's no longer
    // selected are worse than no numbers) rather than waiting for the new
    // analysis to land.
    set({
      file,
      result: null,
      error: "",
      analysis: null,
      livePreviewParams: null,
      analyzeError: "",
      previewUnavailable: false,
    });
    if (file) get().analyzeCurrentFile();
  },

  // Fires once per file selection — the one real audio-decode call the
  // whole live-preview feature needs. Everything after this (every genre/
  // style/category/flavour/tweak change) is pure math against the result,
  // via refreshPreviewParams() below.
  async analyzeCurrentFile() {
    const file = get().file;
    if (!file) return;
    set({ isAnalyzing: true, analyzeError: "" });
    try {
      const analysis = await analyzeAudio(file);
      // The file could have changed again while this was in flight —
      // don't clobber a newer selection's (possibly still-loading) state
      // with a stale response.
      if (get().file !== file) return;
      set({ analysis, isAnalyzing: false });
      get().refreshPreviewParams();
    } catch (err) {
      if (get().file !== file) return;
      const unavailable = err?.status === 501;
      set({
        isAnalyzing: false,
        previewUnavailable: unavailable,
        analyzeError: unavailable ? "" : err.message || "Couldn't analyze this file for live preview.",
      });
    }
  },

  // Debounced live-preview refresh — called after every genre/style/
  // category/flavour/tweak change (see those actions below). No-ops
  // silently when there's no analysis yet (nothing uploaded, still
  // analyzing, or the server doesn't support it) rather than erroring —
  // this is a bonus preview, never a blocker for actually mastering.
  refreshPreviewParams() {
    if (!get().analysis || get().previewUnavailable) return;
    if (previewDebounceTimer) clearTimeout(previewDebounceTimer);
    previewDebounceTimer = setTimeout(() => {
      get()._refreshPreviewParamsNow();
    }, PREVIEW_DEBOUNCE_MS);
  },

  async _refreshPreviewParamsNow() {
    const state = get();
    const analysis = state.analysis;
    if (!analysis) return;
    set({ isPreviewLoading: true, previewError: "" });
    try {
      const params = await previewParams({
        analysis,
        genre: state.selectedGenre,
        style: state.selectedStyle,
        tags: state.selectedTags,
        tweaks: state.tweaks,
        category: state.selectedCategory,
        flavour: state.selectedFlavour,
      });
      // The selection could have moved on again while this was in
      // flight — a stale response would flash outdated numbers for a
      // moment before the next debounced call lands. Simplest guard:
      // only apply if analysis is still the same object (set again only
      // by a fresh upload, which itself invalidates any in-flight call
      // via the file-identity check in analyzeCurrentFile).
      if (get().analysis !== analysis) return;
      set({ livePreviewParams: params, isPreviewLoading: false });
      // In Pro mode, a fresh objective/tag/genre/style selection reseeds
      // the manual knobs with the newly-computed values — see
      // applyPreviewParamsToProParams's own comment for why this is a
      // one-time seed, not a continuous link.
      if (get().mode === "pro") get().applyPreviewParamsToProParams(params);
    } catch (err) {
      if (get().analysis !== analysis) return;
      const unavailable = err?.status === 501;
      set({
        isPreviewLoading: false,
        previewUnavailable: unavailable,
        previewError: unavailable ? "" : err.message || "Couldn't refresh live preview.",
      });
    }
  },

  // Uploading a reference track is its own workflow (see submit()) — it
  // does NOT clear the main file, and clearing the reference (back button)
  // does not touch the main file either, so switching between manual and
  // reference mastering never loses the user's uploaded audio.
  setReferenceFile(referenceFile) {
    set({ referenceFile });
  },

  setMode(mode) {
    const next = mode === "pro" ? "pro" : "quick";
    set({ mode: next });
    // Switching into Pro with an objective/tag already selected (and a
    // live preview already computed for it) seeds the manual knobs with
    // those real values right away, instead of only the next time the
    // selection changes — see adaptiveToProParams.js.
    if (next === "pro" && get().livePreviewParams) {
      get().applyPreviewParamsToProParams(get().livePreviewParams);
    }
  },

  // Applies the adaptive engine's live-computed values (real numbers for
  // the current track + genre/style/category/flavour/tags selection, not
  // generic defaults) to Pro Master's manual knobs — a one-time seed, not
  // a continuous link, so hand-tuning a knob afterward sticks until the
  // objective/tag selection itself changes again. See
  // adaptiveToProParams.js for the actual field mapping and why it's not
  // a clean 1:1 translation.
  applyPreviewParamsToProParams(params) {
    set({ proParams: mapAdaptiveParamsToProParams(params, get().proParams) });
  },

  setGenre(selectedGenre) {
    set({ selectedGenre, selectedPreset: "" });
    get().refreshPreviewParams();
  },

  setStyle(selectedStyle) {
    set({ selectedStyle, selectedPreset: "" });
    get().refreshPreviewParams();
  },

  setCategory(selectedCategory) {
    // Switching category resets flavour — flavours are scoped to their
    // parent category (see FLAVOURS_BY_CATEGORY), a stale flavour name from
    // a different category would silently do nothing server-side.
    set({ selectedCategory, selectedFlavour: "", selectedPreset: "" });
    get().refreshPreviewParams();
  },

  setFlavour(selectedFlavour) {
    set({ selectedFlavour, selectedPreset: "" });
    get().refreshPreviewParams();
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
      // A preset without its own literal spec doesn't touch mode/proParams
      // here (unlike the hasProcessing branch just below) — the
      // refreshPreviewParams() call after this set() is what seeds Pro
      // Master's knobs for it instead, same as picking a genre/tag/
      // objective chip does. Skipped entirely for a full preset (below):
      // that one already IS a literal spec, re-seeding it from the
      // adaptive engine's guess would overwrite the exact values the
      // preset was saved with.
      // A saved preset with a full "processing" spec IS a professional
      // preset — selecting it switches to Pro mode and populates the
      // manual control panel with its actual values, so the UI reflects
      // exactly what will run rather than just a name in a dropdown.
      ...(hasProcessing
        ? { mode: "pro", proParams: { ...cloneProParams(DEFAULT_PRO_PARAMS), ...preset.processing } }
        : {}),
    });
    if (!hasProcessing) get().refreshPreviewParams();
  },

  toggleTag(tag) {
    const selectedTags = get().selectedTags;
    if (selectedTags.includes(tag)) {
      set({ selectedTags: selectedTags.filter((item) => item !== tag), selectedPreset: "" });
    } else {
      set({ selectedTags: [...selectedTags, tag], selectedPreset: "" });
    }
    get().refreshPreviewParams();
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
    get().refreshPreviewParams();
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

  // Called from the dedicated result page's "Master Another Track" —
  // clears the just-finished result (and file) so returning to the Master
  // tab starts clean rather than showing stale before/after data. Does NOT
  // touch genre/style/category/tweaks — those stay as the user left them,
  // same convenience as re-mastering a similar track.
  clearResult() {
    set({ result: null, file: null, referenceFile: null, status: "", error: "" });
  },

  // Called by AppClient's auto-navigation effect the moment it has actually
  // pushed the user to /app?job=:jobId for a finished real (non-preview)
  // master — NOT a general-purpose reset like clearResult() above. The
  // result view is a query param on AppClient's one persistent page
  // instance now (a separate /app/masters/:jobId route was tried and
  // reverted — it remounted the whole shell on every visit, a visible
  // regression), so a `lastAutoNavJobId` ref in that same effect is what
  // actually stops it from re-firing; this just tidies the store's
  // "unseen finished result" signal away once it's been acted on, mostly
  // so NotificationBanner's "your master is ready" toast doesn't linger
  // for a result the user is already looking at. Deliberately leaves
  // file/genre/tweaks/status alone (unlike clearResult) since the user
  // hasn't chosen to start over — they just got auto-routed to see their
  // finished master.
  acknowledgeResult() {
    set({ result: null });
  },
}));
