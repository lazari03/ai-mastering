"use client";

import { useEffect, useMemo, useState } from "react";

import ProcessingSummary from "@/components/audio/ProcessingSummary";
import ProParamsPanel from "@/components/audio/ProParamsPanel";
import SignalVisualizer from "@/components/audio/SignalVisualizer";
import FileDropzone from "@/components/ui/FileDropzone";
import { previewCodec } from "@/domain/mastering/masteringDomain";
import { downloadFileSafely } from "@/network/http/client";
import { useMasteringStore } from "@/store/masteringStore";
import { useEntitlementsStore, planUnlocksProAndStems } from "@/store/entitlementsStore";
import { Spinner } from "@/components/ui/Spinner";

const CODEC_OPTIONS = [
  { value: "mp3_128", label: "MP3 128kbps" },
  { value: "mp3_320", label: "MP3 320kbps" },
  { value: "aac_128", label: "AAC 128kbps" },
  { value: "aac_256", label: "AAC 256kbps" },
  { value: "opus_128", label: "Opus 128kbps" },
];

const CHIP_BASE = "border-white/15 bg-black/20 text-zinc-300";
const CHIP_EMBER = "border-ember bg-ember/[0.15] text-ember";
const CHIP_BRASS = "border-brass bg-brass/[0.18] text-brass";

function SectionLabel({ children }) {
  return <h2 className="m-0 mb-2.5 text-xs uppercase tracking-[0.14em] text-brass">{children}</h2>;
}

export default function MasteringConsole({ onOpenHelp }) {
  const [activeStep, setActiveStep] = useState(0);
  const [inputPreviewUrl, setInputPreviewUrl] = useState("");
  const [masteringProgress, setMasteringProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [progressLogs, setProgressLogs] = useState([]);
  const [codecChoice, setCodecChoice] = useState("mp3_128");
  const [codecPreview, setCodecPreview] = useState(null);
  const [codecPreviewLoading, setCodecPreviewLoading] = useState(false);
  const [codecPreviewError, setCodecPreviewError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [downloading, setDownloading] = useState(false);

  const {
    isBootstrapping,
    isSubmitting,
    isImportingPreset,
    error,
    importError,
    status,
    result,
    file,
    referenceFile,
    genres,
    tags,
    styles,
    presets,
    selectedGenre,
    selectedStyle,
    selectedPreset,
    selectedTags,
    useStemSeparation,
    tier,
    mode,
    proParams,
    bootstrap,
    setFile,
    setReferenceFile,
    setGenre,
    setStyle,
    setPreset,
    toggleTag,
    setUseStemSeparation,
    setTier,
    setMode,
    setProSection,
    addProBand,
    updateProBand,
    removeProBand,
    addStereoBand,
    updateStereoBand,
    removeStereoBand,
    resetProParams,
    submit,
    importPreset,
    deletePreset,
  } = useMasteringStore();

  const referenceMode = Boolean(referenceFile);

  // Centralized — AppClient fetches this once and refreshes it after every
  // real master and every tab switch, so this component just reads it
  // rather than keeping its own independent (and easily stale) copy.
  const { plan, masterQuota } = useEntitlementsStore();

  const [importArtistName, setImportArtistName] = useState("");
  const [importFilePending, setImportFilePending] = useState(null);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!file) {
      setInputPreviewUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setInputPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  useEffect(() => {
    setCodecPreview(null);
    setCodecPreviewError("");
  }, [result?.job_id]);

  const handleCodecPreview = async () => {
    if (!result?.job_id) return;
    setCodecPreviewLoading(true);
    setCodecPreviewError("");
    try {
      const preview = await previewCodec(result.job_id, codecChoice);
      setCodecPreview(preview);
    } catch (err) {
      setCodecPreviewError(err?.message || "Codec preview failed");
    } finally {
      setCodecPreviewLoading(false);
    }
  };

  useEffect(() => {
    const phases = [
      "Queueing mastering job",
      "Reading and validating source audio",
      "Analyzing loudness and dynamics",
      "Estimating frequency balance",
      "Applying tone and spatial correction",
      "Refining dynamics and loudness",
      "Rendering mastered output",
      "Preparing preview and download",
    ];

    if (isSubmitting) {
      let tick = 0;
      setMasteringProgress(3);
      setProgressMessage(phases[0]);
      setProgressLogs([{ ts: Date.now(), text: `${new Date().toLocaleTimeString()}  ${phases[0]}` }]);

      const id = setInterval(() => {
        tick += 1;

        setMasteringProgress((prev) => {
          if (prev < 55) return Math.min(55, prev + 6);
          if (prev < 78) return Math.min(78, prev + 3);
          return Math.min(94, prev + 1);
        });

        const phaseIndex = Math.min(phases.length - 1, Math.floor(tick / 2));
        const text = phases[phaseIndex];
        setProgressMessage(text);

        if (tick % 2 === 0) {
          setProgressLogs((prev) => [...prev, { ts: Date.now(), text: `${new Date().toLocaleTimeString()}  ${text}` }].slice(-8));
        }
      }, 900);

      return () => clearInterval(id);
    }

    if (result) {
      setMasteringProgress(100);
      setProgressMessage("Mastering complete");
      return;
    }

    if (error) {
      setProgressMessage("Mastering stopped");
      return;
    }

    setMasteringProgress(0);
    setProgressMessage("");
    setProgressLogs([]);
  }, [isSubmitting, result, error]);

  const steps = useMemo(() => ["Audio", "Mode", "Master"], []);
  const wizardProgress = ((activeStep + 1) / steps.length) * 100;

  const selectedPresetMeta = useMemo(() => presets.find((preset) => preset.name === selectedPreset) || null, [presets, selectedPreset]);
  const builtInPresets = useMemo(() => presets.filter((preset) => !preset.custom), [presets]);
  const savedArtistPresets = useMemo(() => presets.filter((preset) => preset.custom), [presets]);

  // Reflects real entitlement state so the button/controls don't just
  // discover "you can't do this" via a 402 after the render already ran.
  // Professional tier and stem separation are Studio+ only, gated by plan
  // alone. Every plan (including paid ones) also has a monthly master
  // quota now — Free 3, Studio 50, All-Access 250 (see lib/pricing.js) —
  // so "unlocked" here just means "not out of masters this month," not
  // "unlimited." Disabled in the UI (not just hidden) so a Free user can
  // never toggle Professional/stems client-side; the backend enforces the
  // exact same checks independently either way (masteringRoutes.js).
  const planUnlocked = planUnlocksProAndStems(plan);
  const masterUnlocked = Boolean(masterQuota?.remaining > 0);
  const masterButtonLabel = isSubmitting
    ? "Mastering…"
    : masterQuota
      ? masterUnlocked
        ? `Master Track — ${masterQuota.remaining}/${masterQuota.limit} left`
        : "Master Track — Quota used, upgrade"
      : "Master Track";

  const professionalUnlocked = planUnlocked;
  const stemUnlocked = planUnlocked;
  useEffect(() => {
    if (!stemUnlocked && useStemSeparation) setUseStemSeparation(false);
    if (!professionalUnlocked && tier === "professional") setTier("standard");
  }, [stemUnlocked, professionalUnlocked]); // eslint-disable-line react-hooks/exhaustive-deps

  const canGoNextFromAudio = Boolean(file);
  const canGoNextFromMode = referenceMode || mode === "pro" || Boolean(selectedGenre || selectedPreset);
  const nextStep = () => {
    if (activeStep === 0 && !canGoNextFromAudio) return;
    if (activeStep === 1 && !canGoNextFromMode) return;
    setActiveStep((prev) => Math.min(prev + 1, steps.length - 1));
  };
  const prevStep = () => setActiveStep((prev) => Math.max(prev - 1, 0));

  const chipClass = (active, tone = "ember") =>
    `rounded-xl border px-3.5 py-2 text-xs font-semibold capitalize transition ${active ? (tone === "brass" ? CHIP_BRASS : CHIP_EMBER) : `${CHIP_BASE} hover:border-white/30`}`;

  return (
    <div className="grid w-full max-w-[1280px] items-start gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div>
        <h1 className="m-0 font-[var(--font-title)] text-[26px]">Master Audio</h1>
        <p className="mt-2 text-sm text-zinc-300">Choose audio → choose mastering mode → master → review.</p>

        <div className="glass-panel mt-5 rounded-2xl p-4">
          <div className="mb-3.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-ember to-brass transition-all duration-300"
              style={{ width: `${wizardProgress}%` }}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {steps.map((label, idx) => {
              const isActive = idx === activeStep;
              const isDone = idx < activeStep;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setActiveStep(idx)}
                  className={`rounded-[10px] border px-2.5 py-2.5 text-[11px] font-bold uppercase tracking-[0.1em] transition ${
                    isActive ? CHIP_EMBER : isDone ? CHIP_BRASS : CHIP_BASE
                  }`}
                >
                  {idx + 1}. {label}
                </button>
              );
            })}
          </div>
        </div>

        {activeStep === 0 ? (
          <div className="mt-5 flex flex-col gap-5">
            <section>
              <SectionLabel>Files</SectionLabel>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FileDropzone
                  id="masterFileInput"
                  compact
                  label="Audio File *"
                  fileName={file?.name}
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                  onRemove={() => setFile(null)}
                />
                <FileDropzone
                  id="refFileInput"
                  compact
                  label="Reference Track (optional)"
                  fileName={referenceFile?.name}
                  onChange={(event) => setReferenceFile(event.target.files?.[0] || null)}
                  onRemove={() => setReferenceFile(null)}
                />
              </div>
              {referenceMode ? (
                <p className="mt-2 text-[11px] text-brass/90">
                  Reference Mastering active — your master will be matched to this track&apos;s tonal balance automatically. Set up in the next step.
                </p>
              ) : (
                <p className="mt-2 text-[11px] text-zinc-500">
                  Add a reference track to switch into Reference Mastering — no manual setup needed, the engine matches its tone automatically.
                </p>
              )}
            </section>
          </div>
        ) : null}

        {activeStep === 1 ? (
          <div className="mt-5 flex flex-col gap-5">
            {referenceMode ? (
              <section className="glass-panel rounded-2xl p-5">
                <SectionLabel>Reference Mastering</SectionLabel>
                <p className="text-sm text-zinc-300">
                  <strong className="text-brass">Reference Mastering is active.</strong> We analyze{" "}
                  <span className="text-white">{referenceFile.name}</span> and automatically shape your master&apos;s
                  tonal balance to match it — no manual EQ, genre, or style selection needed.
                </p>
                <p className="mt-2 text-xs text-zinc-500">
                  Loudness and dynamics still use our standard mastering profile; only the tonal balance is matched to
                  your reference.
                </p>
                <button
                  type="button"
                  onClick={() => setReferenceFile(null)}
                  className="mt-3 rounded-lg border border-white/15 bg-black/20 px-4 py-2 text-[11px] uppercase tracking-[0.1em] text-zinc-200 hover:border-white/30"
                >
                  Switch to manual mastering
                </button>

                <div className="mt-4">
                  <label className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.12] bg-black/20 p-3.5 text-sm">
                    <span className="flex items-center gap-2">
                      Stem separation
                      {!stemUnlocked ? (
                        <span className="rounded-full border border-brass/40 bg-brass/[0.12] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-brass">
                          Premium
                        </span>
                      ) : null}
                    </span>
                    <input
                      type="checkbox"
                      checked={useStemSeparation}
                      disabled={!stemUnlocked}
                      onChange={(event) => setUseStemSeparation(event.target.checked)}
                      className="h-4 w-4 disabled:opacity-40"
                    />
                  </label>
                  {!stemUnlocked ? (
                    <p className="mt-1.5 text-[11px] text-zinc-500">
                      Included with the Studio plan or higher — upgrade in Settings → Billing.
                    </p>
                  ) : null}
                </div>
              </section>
            ) : (
              <>
                <section>
                  <SectionLabel>Mastering Mode</SectionLabel>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setMode("quick")}
                      aria-pressed={mode === "quick"}
                      className={`relative rounded-2xl border p-4 text-left transition ${mode === "quick" ? "border-ember bg-ember/[0.1]" : "border-white/12 bg-black/20 hover:border-white/25"}`}
                    >
                      {mode === "quick" ? (
                        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-ember text-[11px] font-bold text-[#100b08]">✓</span>
                      ) : null}
                      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/30 text-base">🎚️</span>
                      <p className="m-0 mt-2.5 text-sm font-bold uppercase tracking-[0.1em] text-white">Quick Master</p>
                      <p className="mt-1.5 text-xs text-zinc-400">Automatic — pick a genre and style, the DSP engine sets everything else for you. Fastest path, no dials to touch.</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("pro")}
                      aria-pressed={mode === "pro"}
                      className={`relative rounded-2xl border p-4 text-left transition ${mode === "pro" ? "border-brass bg-brass/[0.1]" : "border-white/12 bg-black/20 hover:border-white/25"}`}
                    >
                      {mode === "pro" ? (
                        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-brass text-[11px] font-bold text-[#100b08]">✓</span>
                      ) : null}
                      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/30 text-base">🎛️</span>
                      <p className="m-0 mt-2.5 text-sm font-bold uppercase tracking-[0.1em] text-white">Pro Master</p>
                      <p className="mt-1.5 text-xs text-zinc-400">Hands-on knobs for EQ, dynamics, multiband, saturation, stereo, and the limiter. Same engine, full control.</p>
                    </button>
                  </div>
                </section>

                <section>
                  <SectionLabel>Profile</SectionLabel>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-[11px] uppercase tracking-[0.1em] text-zinc-300">Preset</span>
                      <select
                        value={builtInPresets.some((p) => p.name === selectedPreset) ? selectedPreset : ""}
                        onChange={(event) => setPreset(event.target.value)}
                        className="w-full rounded-[10px] border border-white/15 bg-black/25 p-2.5 text-[13px] text-white"
                      >
                        <option value="">Custom</option>
                        {builtInPresets.map((preset) => (
                          <option key={preset.name} value={preset.name}>
                            {preset.display_name || preset.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[11px] uppercase tracking-[0.1em] text-zinc-300">Engine</span>
                      <select
                        value={tier}
                        onChange={(event) => setTier(event.target.value)}
                        className="w-full rounded-[10px] border border-white/15 bg-black/25 p-2.5 text-[13px] text-white"
                      >
                        <option value="standard">Standard</option>
                        <option value="professional" disabled={!professionalUnlocked}>
                          Professional (true-peak limiting){!professionalUnlocked ? " — Studio plan" : ""}
                        </option>
                      </select>
                      {!professionalUnlocked ? (
                        <span className="mt-1 block text-[10px] text-zinc-500">Needs the Studio plan or higher.</span>
                      ) : null}
                    </label>
                  </div>
                  {selectedPresetMeta ? (
                    <p className="mt-2 break-words text-xs text-brass/90">{selectedPresetMeta.description}</p>
                  ) : null}

                  <div className="mt-3.5">
                    <span className="mb-2 block text-[11px] uppercase tracking-[0.1em] text-zinc-300">Genre</span>
                    <div className="flex flex-wrap gap-2">
                      {genres.map((genre) => (
                        <button key={genre} type="button" onClick={() => setGenre(genre)} className={chipClass(selectedGenre === genre)}>
                          {genre}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3.5">
                    <span className="mb-2 block text-[11px] uppercase tracking-[0.1em] text-zinc-300">Mastering Style</span>
                    <div className="flex flex-wrap gap-2">
                      {styles.map((style) => (
                        <button key={style} type="button" onClick={() => setStyle(style)} className={chipClass(selectedStyle === style)}>
                          {style.replaceAll("_", " ")}
                        </button>
                      ))}
                    </div>
                  </div>

                  {mode === "quick" ? (
                    <div className="mt-3.5">
                      <span className="mb-2 block text-[11px] uppercase tracking-[0.1em] text-zinc-300">Tags</span>
                      <div className="flex flex-wrap gap-2">
                        {tags.map((tag) => (
                          <button key={tag} type="button" onClick={() => toggleTag(tag)} className={`${chipClass(selectedTags.includes(tag), "brass")} rounded-full lowercase`}>
                            {tag.replaceAll("_", " ")}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4">
                    <label className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.12] bg-black/20 p-3.5 text-sm">
                      <span className="flex items-center gap-2">
                        Stem separation
                        {!stemUnlocked ? (
                          <span className="rounded-full border border-brass/40 bg-brass/[0.12] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-brass">
                            Premium
                          </span>
                        ) : null}
                      </span>
                      <input
                        type="checkbox"
                        checked={useStemSeparation}
                        disabled={!stemUnlocked}
                        onChange={(event) => setUseStemSeparation(event.target.checked)}
                        className="h-4 w-4 disabled:opacity-40"
                      />
                    </label>
                    {!stemUnlocked ? (
                      <p className="mt-1.5 text-[11px] text-zinc-500">
                        Included with the Studio plan or higher — upgrade in Settings → Billing.
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3.5">
                    <span className="block text-[11px] uppercase tracking-[0.1em] text-zinc-300">Saved Artists</span>
                    <span className="mt-1 block text-[11px] text-zinc-500">
                      Pick a previously-imported artist master and it&apos;s applied exactly as saved. Private to your account.
                    </span>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select
                        value={savedArtistPresets.some((p) => p.name === selectedPreset) ? selectedPreset : ""}
                        onChange={(event) => setPreset(event.target.value)}
                        className="min-w-[10rem] flex-1 rounded-[10px] border border-white/15 bg-black/25 p-2.5 text-[13px] text-white"
                      >
                        <option value="">{savedArtistPresets.length ? "Choose an artist…" : "No saved artists yet"}</option>
                        {savedArtistPresets.map((preset) => (
                          <option key={preset.name} value={preset.name}>
                            {preset.display_name || preset.name}
                          </option>
                        ))}
                      </select>
                      {savedArtistPresets.some((p) => p.name === selectedPreset) ? (
                        <button
                          type="button"
                          onClick={() => deletePreset(selectedPreset)}
                          className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.1em] text-red-300 hover:border-red-400/50"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>

                    <div className="mt-3 rounded-lg border border-dashed border-white/15 bg-black/10 p-3">
                      <span className="block text-[10px] uppercase tracking-[0.14em] text-zinc-400">Import Preset JSON</span>
                      <span className="mt-1 block text-[10px] text-zinc-500">
                        Pick a JSON file, give it an artist name, and it&apos;s saved to your account and applied
                        immediately — including full professional presets with an EQ/dynamics/limiter spec, which
                        switch you into Pro mode with those exact values.
                      </span>
                      {onOpenHelp ? (
                        <button
                          type="button"
                          onClick={onOpenHelp}
                          className="mt-1 block text-[10px] text-brass hover:text-ember"
                        >
                          Don&apos;t have a preset file? Get a template + how-to →
                        </button>
                      ) : null}

                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <input
                          type="text"
                          value={importArtistName}
                          onChange={(event) => setImportArtistName(event.target.value)}
                          placeholder="Artist name (e.g. The Weeknd)"
                          disabled={isImportingPreset}
                          className="flex-1 rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500"
                        />
                        <label
                          htmlFor="presetImportInput"
                          className="flex flex-1 cursor-pointer items-center justify-center rounded-lg border border-brass/40 bg-brass/[0.12] px-3 py-2 text-xs text-brass hover:bg-brass/20"
                        >
                          {importFilePending ? importFilePending.name : "Choose preset JSON file…"}
                        </label>
                        <input
                          id="presetImportInput"
                          type="file"
                          accept="application/json,.json"
                          disabled={isImportingPreset}
                          onClick={(event) => {
                            event.currentTarget.value = "";
                          }}
                          onChange={(event) => setImportFilePending(event.target.files?.[0] || null)}
                          className="hidden"
                        />
                      </div>

                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isImportingPreset || !importFilePending}
                          onClick={() => {
                            importPreset(importFilePending, importArtistName.trim());
                            setImportFilePending(null);
                            setImportArtistName("");
                          }}
                          className="flex items-center gap-1.5 rounded-lg border border-brass/40 bg-brass/20 px-3 py-2 text-[11px] uppercase tracking-[0.1em] text-brass disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {isImportingPreset ? (
                            <>
                              <Spinner size={11} /> Importing…
                            </>
                          ) : (
                            "Import & Save Artist Master"
                          )}
                        </button>
                        {importFilePending ? (
                          <button
                            type="button"
                            onClick={() => setImportFilePending(null)}
                            className="rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-[11px] uppercase tracking-[0.1em] text-zinc-300 hover:border-white/30"
                          >
                            Clear
                          </button>
                        ) : null}
                      </div>
                      {importError ? <span className="mt-2 block text-[11px] text-red-300">⚠ {importError}</span> : null}
                    </div>
                  </div>
                </section>

                {mode === "pro" ? (
                  <section>
                    <SectionLabel>Professional Controls</SectionLabel>
                    <ProParamsPanel
                      proParams={proParams}
                      setSection={setProSection}
                      addBand={addProBand}
                      updateBand={updateProBand}
                      removeBand={removeProBand}
                      addStereoBand={addStereoBand}
                      updateStereoBand={updateStereoBand}
                      removeStereoBand={removeStereoBand}
                      onReset={resetProParams}
                    />
                  </section>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {activeStep === 2 ? (
          <div className="glass-panel mt-5 rounded-2xl p-5">
            <SectionLabel>Master</SectionLabel>
            <div className="mb-4 flex flex-wrap gap-2">
              <span className="rounded-lg border border-white/15 px-3 py-1.5 text-xs">File: {file?.name || "None"}</span>
              {referenceMode ? (
                <span className="rounded-lg border border-brass/40 bg-brass/[0.1] px-3 py-1.5 text-xs text-brass">Reference: {referenceFile.name}</span>
              ) : (
                <>
                  <span className="rounded-lg border border-white/15 px-3 py-1.5 text-xs">Mode: {mode === "pro" ? "Pro" : "Quick"}</span>
                  <span className="rounded-lg border border-white/15 px-3 py-1.5 text-xs">Genre: {selectedGenre || "Not set"}</span>
                  <span className="rounded-lg border border-white/15 px-3 py-1.5 text-xs">Style: {selectedStyle || "Not set"}</span>
                </>
              )}
              <span className="rounded-lg border border-white/15 px-3 py-1.5 text-xs">Engine: {tier}</span>
              {useStemSeparation ? <span className="rounded-lg border border-brass/40 bg-brass/[0.1] px-3 py-1.5 text-xs text-brass">Stems on</span> : null}
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => submit(true)}
                disabled={isSubmitting || isBootstrapping || !file}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-black/20 px-5 py-4 text-xs font-bold uppercase tracking-[0.14em] text-zinc-200 transition hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Spinner size={13} /> Rendering…
                  </>
                ) : (
                  "Preview — Free"
                )}
              </button>
              <button
                type="button"
                onClick={() => submit(false)}
                disabled={isSubmitting || isBootstrapping || !file || (masterQuota && !masterUnlocked)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ember px-5 py-4 text-sm font-bold uppercase tracking-[0.18em] text-[#100b08] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? <Spinner size={14} /> : null}
                {masterButtonLabel}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">
              Preview renders the first 30s with the Standard engine, free and unlimited. Master Track renders the
              full file — 3/month on Free, 50/month on Studio, 250/month on All-Access
              {useStemSeparation ? " (stems need Studio or higher)" : ""}. Full result and A/B comparison appear on
              the right once it&apos;s done.
            </p>
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={prevStep}
            disabled={activeStep === 0}
            className="rounded-xl border border-white/[0.15] bg-black/20 px-[22px] py-3 text-xs font-bold uppercase tracking-[0.12em] text-zinc-200 disabled:opacity-40"
          >
            Back
          </button>
          {activeStep < steps.length - 1 ? (
            <button
              type="button"
              onClick={nextStep}
              disabled={(activeStep === 0 && !canGoNextFromAudio) || (activeStep === 1 && !canGoNextFromMode)}
              className="rounded-xl border border-brass/[0.55] bg-brass/[0.18] px-[22px] py-3 text-xs font-bold uppercase tracking-[0.12em] text-brass disabled:opacity-40"
            >
              Next
            </button>
          ) : null}
        </div>

        {activeStep !== 2 ? (
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={isSubmitting || isBootstrapping || !file}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/20 px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300 transition hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? (
              <>
                <Spinner size={12} /> Rendering…
              </>
            ) : (
              "Quick Preview — Free (Any Step)"
            )}
          </button>
        ) : null}

        {isBootstrapping ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
            <Spinner size={12} /> Loading catalog…
          </p>
        ) : null}
        {status ? <p className="mt-3 text-sm text-brass">{status}</p> : null}
        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      </div>

      <aside className="glass-panel sticky top-6 min-w-0 rounded-[20px] p-[22px]">
        <h2 className="m-0 font-[var(--font-title)] text-lg">Review / Compare</h2>

        {isSubmitting ? (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.1em]">
              <span className="text-brass">Processing</span>
              <span>{masteringProgress}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-ember to-brass transition-all duration-500"
                style={{ width: `${masteringProgress}%` }}
              />
            </div>
            <p className="mt-3 text-[13px] text-zinc-300">{progressMessage}</p>
            <div className="mt-3 max-h-28 overflow-y-auto rounded-xl border border-white/10 bg-black/25 p-3">
              {progressLogs.map((log) => (
                <p key={`${log.ts}-${log.text}`} className="text-xs text-zinc-500">
                  {log.text}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        {!isSubmitting && result ? (
          <div className="mt-4 flex flex-col gap-3.5">
            {(result.source_warnings || []).map((warning) => (
              <div key={warning} className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
                ⚠ {warning}
              </div>
            ))}

            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="m-0 text-[10px] uppercase tracking-[0.1em] text-zinc-400">Before LUFS</p>
                <p className="mt-1.5 text-[17px] font-bold">{result.before_lufs}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="m-0 text-[10px] uppercase tracking-[0.1em] text-zinc-400">After LUFS</p>
                <p className="mt-1.5 text-[17px] font-bold text-brass">{result.after_lufs}</p>
              </div>
            </div>

            {result.ab_gain_match ? (
              <p className="text-[11px] text-zinc-500">
                Playback levels matched for a fair A/B ({result.ab_gain_match.before_gain_db !== 0
                  ? `original ${result.ab_gain_match.before_gain_db} dB`
                  : `mastered ${result.ab_gain_match.after_gain_db} dB`}
                ) — loudness alone won&apos;t make one side sound better.
              </p>
            ) : null}

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="m-0 mb-2 text-[10px] uppercase tracking-[0.1em] text-zinc-400">Original Signal</p>
              <SignalVisualizer src={result.originalUrl} gainDb={result.ab_gain_match?.before_gain_db || 0} />
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="m-0 mb-2 text-[10px] uppercase tracking-[0.1em] text-zinc-400">Mastered Signal</p>
              <SignalVisualizer src={result.masteredUrl} barColor="#dfc95a" gainDb={result.ab_gain_match?.after_gain_db || 0} />
              <button
                type="button"
                onClick={async () => {
                  setDownloadError("");
                  setDownloading(true);
                  try {
                    await downloadFileSafely(result.masteredUrl, `mastered_${result.job_id}.${result.download_url?.split(".").pop() || "wav"}`);
                  } catch (err) {
                    setDownloadError(err?.message || "Download failed");
                  } finally {
                    setDownloading(false);
                  }
                }}
                disabled={downloading}
                className="mt-3 inline-flex w-full justify-center rounded-lg border border-brass/40 bg-brass/[0.18] px-3 py-2.5 text-xs uppercase tracking-[0.1em] text-brass hover:bg-brass/25 disabled:opacity-50"
              >
                {downloading ? "Downloading…" : "Download Master"}
              </button>
              {downloadError ? <p className="mt-2 text-xs text-red-300">⚠ {downloadError}</p> : null}
            </div>

            <div className="rounded-xl border border-white/10 bg-black/25 p-3">
              <p className="m-0 mb-2 text-[10px] uppercase tracking-[0.1em] text-zinc-400">Codec Preview</p>
              <p className="mb-3 text-[11px] text-zinc-500">
                Hear what actually reaches a listener after streaming compression — real encode/decode round-trip.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={codecChoice}
                  onChange={(e) => setCodecChoice(e.target.value)}
                  className="flex-1 rounded-lg border border-white/[0.12] bg-black/30 px-2 py-2 text-xs text-zinc-100"
                >
                  {CODEC_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleCodecPreview}
                  disabled={codecPreviewLoading}
                  className="flex items-center gap-1.5 rounded-lg border border-brass/40 bg-brass/[0.18] px-3.5 py-2 text-[11px] uppercase tracking-[0.1em] text-brass hover:bg-brass/25 disabled:opacity-50"
                >
                  {codecPreviewLoading ? (
                    <>
                      <Spinner size={11} /> Encoding…
                    </>
                  ) : (
                    "Preview"
                  )}
                </button>
              </div>

              {codecPreviewError ? <p className="mt-2 text-xs text-red-300">{codecPreviewError}</p> : null}

              {codecPreview ? (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg border border-white/10 bg-black/30 p-2">
                      <p className="m-0 text-[10px] uppercase tracking-[0.1em] text-zinc-500">True Peak Δ</p>
                      <p className="mt-1 text-sm font-semibold">{codecPreview.true_peak_delta_db > 0 ? "+" : ""}{codecPreview.true_peak_delta_db} dB</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/30 p-2">
                      <p className="m-0 text-[10px] uppercase tracking-[0.1em] text-zinc-500">LUFS Δ</p>
                      <p className="mt-1 text-sm font-semibold">{codecPreview.lufs_delta_db > 0 ? "+" : ""}{codecPreview.lufs_delta_db} dB</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/30 p-2">
                      <p className="m-0 text-[10px] uppercase tracking-[0.1em] text-zinc-500">High-Freq Δ</p>
                      <p className="mt-1 text-sm font-semibold">{codecPreview.high_frequency_change_db > 0 ? "+" : ""}{codecPreview.high_frequency_change_db} dB</p>
                    </div>
                  </div>
                  <SignalVisualizer src={codecPreview.previewUrl} barColor="#8fb3ff" />
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <p className="m-0 mb-2 text-[10px] uppercase tracking-[0.1em] text-zinc-400">Processing Summary</p>
              <ProcessingSummary result={result} />
            </div>
          </div>
        ) : null}

        {!isSubmitting && !result ? (
          <div className="mt-4 space-y-3.5 text-sm text-zinc-300">
            <p className="m-0">Master a track to see before/after loudness, processing metadata, and instant A/B playback here.</p>
            {inputPreviewUrl ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="m-0 mb-2 text-xs uppercase tracking-[0.1em] text-zinc-400">Input Signal Preview</p>
                <SignalVisualizer src={inputPreviewUrl} />
              </div>
            ) : null}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
