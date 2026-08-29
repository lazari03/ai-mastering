"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import AdaptiveControlsPanel from "@/components/audio/AdaptiveControlsPanel";
import ProcessingSummary from "@/components/audio/ProcessingSummary";
import ProParamsPanel from "@/components/audio/ProParamsPanel";
import SignalVisualizer from "@/components/audio/SignalVisualizer";
import FileDropzone from "@/components/ui/FileDropzone";
import { previewCodec } from "@/domain/mastering/masteringDomain";
import { downloadFileSafely, postCheckout } from "@/network/http/client";
import { useMasteringStore } from "@/store/masteringStore";
import { useEntitlementsStore, planUnlocksProfessional } from "@/store/entitlementsStore";
import { STEM_SEPARATION } from "@/lib/pricing";
import { trackEvent } from "@/lib/analytics";
import { useMasteringProgress } from "@/lib/useMasteringProgress";
import { Spinner } from "@/components/ui/Spinner";
import { useLanguage } from "@/lib/i18n";

// Codec names are format labels, not language-dependent text — same on
// every locale, nothing to localize here.
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

// Shared step-transition motion — a quick, subtle fade/slide rather than
// an instant swap, so moving through the wizard reads as one continuous
// flow instead of the content just snapping to something else. Kept fast
// (180ms) since this fires on every Next/Back/step-tab click and a
// sluggish transition there would read as lag, not polish.
const STEP_TRANSITION = { duration: 0.18, ease: "easeOut" };
const stepMotionProps = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: STEP_TRANSITION,
};

function SectionLabel({ children }) {
  return <h2 className="m-0 mb-2.5 text-xs uppercase tracking-[0.14em] text-brass">{children}</h2>;
}

export default function MasteringConsole({ onOpenHelp, onOpenBilling }) {
  const { t } = useLanguage();
  const [activeStep, setActiveStep] = useState(0);
  const [inputPreviewUrl, setInputPreviewUrl] = useState("");
  // Progress simulation moved to a shared hook (useMasteringProgress) so
  // the fullscreen loader overlay (rendered from AppClient, above this
  // component) reads the same live timeline instead of running its own,
  // independently-drifting copy. This component only keeps the mini log
  // list for its own detail view below.
  const { phaseMessage: progressMessage } = useMasteringProgress();
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
    categories,
    flavoursByCategory,
    presets,
    selectedGenre,
    selectedStyle,
    selectedCategory,
    selectedFlavour,
    selectedPreset,
    selectedTags,
    useStemSeparation,
    tier,
    mode,
    proParams,
    tweaks,
    analysis,
    isAnalyzing,
    livePreviewParams,
    isPreviewLoading,
    previewUnavailable,
    previewError,
    bootstrap,
    setFile,
    setReferenceFile,
    setGenre,
    setStyle,
    setCategory,
    setFlavour,
    setPreset,
    toggleTag,
    setUseStemSeparation,
    setTweak,
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
  const { plan, masterQuota, extraCredits, stemQuota, extraStemCredits } = useEntitlementsStore();

  const [importArtistName, setImportArtistName] = useState("");
  const [importFilePending, setImportFilePending] = useState(null);
  const [stemBuyBusy, setStemBuyBusy] = useState(false);

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
      setCodecPreviewError(err?.message || t("console.codecPreviewFailed"));
    } finally {
      setCodecPreviewLoading(false);
    }
  };

  const steps = useMemo(
    () => [t("console.step.audio"), t("console.step.mode"), t("console.step.master")],
    [t]
  );
  const wizardProgress = ((activeStep + 1) / steps.length) * 100;

  const selectedPresetMeta = useMemo(() => presets.find((preset) => preset.name === selectedPreset) || null, [presets, selectedPreset]);
  const builtInPresets = useMemo(() => presets.filter((preset) => !preset.custom), [presets]);
  const savedArtistPresets = useMemo(() => presets.filter((preset) => preset.custom), [presets]);

  // Reflects real entitlement state so the button/controls don't just
  // discover "you can't do this" via a 402 after the render already ran.
  // Professional tier is Studio+ only, gated by plan alone. Every plan
  // (including paid ones) also has a monthly master quota now — Free 3,
  // Studio 50, All-Access 250 (see lib/pricing.js) — so "unlocked" here
  // just means "not out of masters this month," not "unlimited." Disabled
  // in the UI (not just hidden) so a Free user can never toggle
  // Professional client-side; the backend enforces the exact same checks
  // independently either way (masteringRoutes.js).
  const professionalUnlocked = planUnlocksProfessional(plan);
  // Quota exhausted isn't the end of the road — a purchased single-master
  // credit (see PlansPanel's "Buy one") covers exactly this case, and
  // the backend already falls back to one automatically (masteringRoutes.js).
  // The button has to agree with that server-side reality: gating on
  // masterQuota.remaining alone would block someone who's already paid
  // for a credit from ever reaching the render that would spend it.
  const hasCredit = Number(extraCredits || 0) > 0;
  const masterUnlocked = Boolean(masterQuota?.remaining > 0) || hasCredit;
  const masterButtonLabel = isSubmitting
    ? t("console.masteringEllipsis")
    : masterQuota
      ? masterQuota.remaining > 0
        ? t("console.masterTrackLeft", { remaining: masterQuota.remaining, limit: masterQuota.limit })
        : hasCredit
          ? t("console.masterTrackCredit", { n: extraCredits })
          : t("console.masterTrackQuotaUsed")
      : t("console.masterTrackDefault");

  // Stems no longer follow the plan alone — All-Access gets a bounded
  // monthly sub-limit (not "unlimited within plan"), Free/Studio get no
  // bundled access at all. Any plan can also hold a purchased stem
  // credit, which covers this render even with the sub-limit exhausted
  // (or with no sub-limit to begin with) — same shape as extraCredits
  // above. See entitlementsService.js's getStemQuotaStatus/
  // getExtraStemCreditCount and masteringRoutes.js's /master gating,
  // which this mirrors.
  const hasStemCredit = Number(extraStemCredits || 0) > 0;
  const stemUnlocked = (plan === "pro" && Boolean(stemQuota?.remaining > 0)) || hasStemCredit;
  const stemBuyLabel =
    plan === "pro" && stemQuota && stemQuota.remaining <= 0
      ? t("console.buyStemUsedUp")
      : t("console.buyStemPrice", { price: STEM_SEPARATION.price });
  useEffect(() => {
    if (!stemUnlocked && useStemSeparation) setUseStemSeparation(false);
    if (!professionalUnlocked && tier === "professional") setTier("standard");
  }, [stemUnlocked, professionalUnlocked]); // eslint-disable-line react-hooks/exhaustive-deps

  const buyStemSeparation = async () => {
    setStemBuyBusy(true);
    trackEvent("begin_checkout", {
      currency: "EUR",
      value: Number(String(STEM_SEPARATION.price).replace(/[^\d.]/g, "")) || 0,
      items: [{ item_id: STEM_SEPARATION.item, item_name: "stem_separation" }],
    });
    try {
      const successUrl = `${window.location.origin}/thank-you?plan=stem_separation&item=${encodeURIComponent(STEM_SEPARATION.item)}&price=${encodeURIComponent(STEM_SEPARATION.price)}`;
      const { url } = await postCheckout(STEM_SEPARATION.item, successUrl);
      window.location.href = url;
    } catch {
      setStemBuyBusy(false);
    }
  };

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
    <div className="mx-auto grid w-full max-w-[1280px] items-start gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div>
        <h1 className="m-0 font-[var(--font-title)] text-[26px]">{t("console.title")}</h1>
        <p className="mt-2 text-sm text-zinc-300">{t("console.subtitle")}</p>

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

        <AnimatePresence mode="wait">
        {activeStep === 0 ? (
          <motion.div key="step-audio" {...stepMotionProps} className="mt-5 flex flex-col gap-5">
            <section>
              <SectionLabel>{t("console.files")}</SectionLabel>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FileDropzone
                  id="masterFileInput"
                  compact
                  label={t("console.audioFile")}
                  fileName={file?.name}
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                  onRemove={() => setFile(null)}
                />
                <FileDropzone
                  id="refFileInput"
                  compact
                  label={t("console.referenceTrack")}
                  fileName={referenceFile?.name}
                  onChange={(event) => setReferenceFile(event.target.files?.[0] || null)}
                  onRemove={() => setReferenceFile(null)}
                />
              </div>
              {referenceMode ? (
                <p className="mt-2 text-[11px] text-brass/90">{t("console.referenceActive")}</p>
              ) : (
                <p className="mt-2 text-[11px] text-zinc-500">{t("console.referenceHint")}</p>
              )}
            </section>
          </motion.div>
        ) : null}

        {activeStep === 1 ? (
          <motion.div key="step-mode" {...stepMotionProps} className="mt-5 flex flex-col gap-5">
            {referenceMode ? (
              <section className="glass-panel rounded-2xl p-5">
                <SectionLabel>{t("console.referenceMastering")}</SectionLabel>
                <p className="text-sm text-zinc-300">
                  <strong className="text-brass">{t("console.referenceIsActive")}</strong> {t("console.referenceAnalyze")}{" "}
                  <span className="text-white">{referenceFile.name}</span> {t("console.referenceBody2")}
                </p>
                <p className="mt-2 text-xs text-zinc-500">{t("console.referenceBody3")}</p>
                <button
                  type="button"
                  onClick={() => setReferenceFile(null)}
                  className="mt-3 rounded-lg border border-white/15 bg-black/20 px-4 py-2 text-[11px] uppercase tracking-[0.1em] text-zinc-200 hover:border-white/30"
                >
                  {t("console.switchManual")}
                </button>

                <div className="mt-4">
                  <label className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.12] bg-black/20 p-3.5 text-sm">
                    <span className="flex items-center gap-2">
                      {t("console.stemSeparation")}
                      {!stemUnlocked ? (
                        <span className="rounded-full border border-brass/40 bg-brass/[0.12] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-brass">
                          {t("console.premium")}
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
                    <div className="mt-1.5 flex items-center justify-between gap-3">
                      <p className="m-0 text-[11px] text-zinc-500">
                        {plan === "pro" ? t("console.stemUsedUp") : t("console.stemIncluded")}
                      </p>
                      <button
                        type="button"
                        onClick={buyStemSeparation}
                        disabled={stemBuyBusy}
                        className="shrink-0 rounded-full border border-brass/40 bg-brass/[0.1] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-brass hover:bg-brass/20 disabled:opacity-50"
                      >
                        {stemBuyBusy ? t("console.redirecting") : stemBuyLabel}
                      </button>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : (
              <>
                <section>
                  <SectionLabel>{t("console.masteringMode")}</SectionLabel>
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
                      <p className="m-0 mt-2.5 text-sm font-bold uppercase tracking-[0.1em] text-white">{t("console.quickMaster")}</p>
                      <p className="mt-1.5 text-xs text-zinc-400">{t("console.quickMasterBody")}</p>
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
                      <p className="m-0 mt-2.5 text-sm font-bold uppercase tracking-[0.1em] text-white">{t("console.proMaster")}</p>
                      <p className="mt-1.5 text-xs text-zinc-400">{t("console.proMasterBody")}</p>
                    </button>
                  </div>
                </section>

                <section>
                  <SectionLabel>{t("console.profile")}</SectionLabel>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-[11px] uppercase tracking-[0.1em] text-zinc-300">{t("console.preset")}</span>
                      <select
                        value={builtInPresets.some((p) => p.name === selectedPreset) ? selectedPreset : ""}
                        onChange={(event) => setPreset(event.target.value)}
                        className="w-full rounded-[10px] border border-white/15 bg-black/25 p-2.5 text-[13px] text-white"
                      >
                        <option value="">{t("console.custom")}</option>
                        {builtInPresets.map((preset) => (
                          <option key={preset.name} value={preset.name}>
                            {preset.display_name || preset.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[11px] uppercase tracking-[0.1em] text-zinc-300">{t("console.engine")}</span>
                      <select
                        value={tier}
                        onChange={(event) => setTier(event.target.value)}
                        className="w-full rounded-[10px] border border-white/15 bg-black/25 p-2.5 text-[13px] text-white"
                      >
                        <option value="standard">{t("console.standard")}</option>
                        <option value="professional" disabled={!professionalUnlocked}>
                          {t("console.professionalOption")}{!professionalUnlocked ? t("console.studioPlanSuffix") : ""}
                        </option>
                      </select>
                      {!professionalUnlocked ? (
                        <span className="mt-1 block text-[10px] text-zinc-500">{t("console.needsStudio")}</span>
                      ) : null}
                    </label>
                  </div>
                  {selectedPresetMeta ? (
                    <p className="mt-2 break-words text-xs text-brass/90">{selectedPresetMeta.description}</p>
                  ) : null}

                  <div className="mt-3.5">
                    <span className="mb-2 block text-[11px] uppercase tracking-[0.1em] text-zinc-300">{t("console.genre")}</span>
                    <div className="flex flex-wrap gap-2">
                      {genres.map((genre) => (
                        <button key={genre} type="button" onClick={() => setGenre(genre)} className={chipClass(selectedGenre === genre)}>
                          {genre}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3.5">
                    <span className="mb-2 block text-[11px] uppercase tracking-[0.1em] text-zinc-300">{t("console.masteringStyle")}</span>
                    <div className="flex flex-wrap gap-2">
                      {styles.map((style) => (
                        <button key={style} type="button" onClick={() => setStyle(style)} className={chipClass(selectedStyle === style)}>
                          {style.replaceAll("_", " ")}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Always visible, Quick or Pro — objective/tags are a
                      real DSP-affecting choice either way now: Quick uses
                      them to bias the adaptive engine directly, Pro uses
                      them to seed the manual knobs below with real
                      computed values (see masteringStore.js's
                      applyPreviewParamsToProParams / adaptiveToProParams.js)
                      instead of always starting from flat defaults. */}
                  <div className="mt-3.5">
                    <span className="mb-2 block text-[11px] uppercase tracking-[0.1em] text-zinc-300">{t("console.masteringObjective")}</span>
                    <p className="mb-2 text-[10px] text-zinc-500">{mode === "pro" ? t("console.masteringObjectiveProHint") : t("console.masteringObjectiveHint")}</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setCategory("")} className={chipClass(!selectedCategory, "brass")}>
                        {t("console.objectiveAuto")}
                      </button>
                      {categories.map((category) => (
                        <button key={category} type="button" onClick={() => setCategory(category)} className={chipClass(selectedCategory === category, "brass")}>
                          {category.replaceAll("_", " ")}
                        </button>
                      ))}
                    </div>
                    {selectedCategory && (flavoursByCategory[selectedCategory] || []).length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" onClick={() => setFlavour("")} className={chipClass(!selectedFlavour)}>
                          {t("console.objectiveAuto")}
                        </button>
                        {flavoursByCategory[selectedCategory].map((flavour) => (
                          <button key={flavour} type="button" onClick={() => setFlavour(flavour)} className={chipClass(selectedFlavour === flavour)}>
                            {flavour}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-3.5">
                    <span className="mb-2 block text-[11px] uppercase tracking-[0.1em] text-zinc-300">{t("console.tags")}</span>
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <button key={tag} type="button" onClick={() => toggleTag(tag)} className={`${chipClass(selectedTags.includes(tag), "brass")} rounded-full lowercase`}>
                          {tag.replaceAll("_", " ")}
                        </button>
                      ))}
                    </div>
                  </div>

                  {mode === "quick" ? (
                    <AdaptiveControlsPanel
                      tweaks={tweaks}
                      onTweak={setTweak}
                      analysis={analysis}
                      livePreviewParams={livePreviewParams}
                      isAnalyzing={isAnalyzing}
                      isPreviewLoading={isPreviewLoading}
                      previewUnavailable={previewUnavailable}
                      previewError={previewError}
                    />
                  ) : null}

                  <div className="mt-4">
                    <label className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.12] bg-black/20 p-3.5 text-sm">
                      <span className="flex items-center gap-2">
                        {t("console.stemSeparation")}
                        {!stemUnlocked ? (
                          <span className="rounded-full border border-brass/40 bg-brass/[0.12] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-brass">
                            {t("console.premium")}
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
                      <div className="mt-1.5 flex items-center justify-between gap-3">
                        <p className="m-0 text-[11px] text-zinc-500">
                          {plan === "pro" ? t("console.stemUsedUp") : t("console.stemIncluded")}
                        </p>
                        <button
                          type="button"
                          onClick={buyStemSeparation}
                          disabled={stemBuyBusy}
                          className="shrink-0 rounded-full border border-brass/40 bg-brass/[0.1] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-brass hover:bg-brass/20 disabled:opacity-50"
                        >
                          {stemBuyBusy ? t("console.redirecting") : stemBuyLabel}
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3.5">
                    <span className="block text-[11px] uppercase tracking-[0.1em] text-zinc-300">{t("console.savedArtists")}</span>
                    <span className="mt-1 block text-[11px] text-zinc-500">{t("console.savedArtistsBody")}</span>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select
                        value={savedArtistPresets.some((p) => p.name === selectedPreset) ? selectedPreset : ""}
                        onChange={(event) => setPreset(event.target.value)}
                        className="min-w-[10rem] flex-1 rounded-[10px] border border-white/15 bg-black/25 p-2.5 text-[13px] text-white"
                      >
                        <option value="">{savedArtistPresets.length ? t("console.chooseArtist") : t("console.noSavedArtists")}</option>
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
                          {t("console.remove")}
                        </button>
                      ) : null}
                    </div>

                    <div className="mt-3 rounded-lg border border-dashed border-white/15 bg-black/10 p-3">
                      <span className="block text-[10px] uppercase tracking-[0.14em] text-zinc-400">{t("console.importPresetJson")}</span>
                      <span className="mt-1 block text-[10px] text-zinc-500">{t("console.importPresetBody")}</span>
                      {onOpenHelp ? (
                        <button
                          type="button"
                          onClick={onOpenHelp}
                          className="mt-1 block text-[10px] text-brass hover:text-ember"
                        >
                          {t("console.getTemplate")}
                        </button>
                      ) : null}

                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <input
                          type="text"
                          value={importArtistName}
                          onChange={(event) => setImportArtistName(event.target.value)}
                          placeholder={t("console.artistNamePlaceholder")}
                          disabled={isImportingPreset}
                          className="flex-1 rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500"
                        />
                        <label
                          htmlFor="presetImportInput"
                          className="flex flex-1 cursor-pointer items-center justify-center rounded-lg border border-brass/40 bg-brass/[0.12] px-3 py-2 text-xs text-brass hover:bg-brass/20"
                        >
                          {importFilePending ? importFilePending.name : t("console.choosePresetFile")}
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
                              <Spinner size={11} /> {t("console.importing")}
                            </>
                          ) : (
                            t("console.importSave")
                          )}
                        </button>
                        {importFilePending ? (
                          <button
                            type="button"
                            onClick={() => setImportFilePending(null)}
                            className="rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-[11px] uppercase tracking-[0.1em] text-zinc-300 hover:border-white/30"
                          >
                            {t("console.clear")}
                          </button>
                        ) : null}
                      </div>
                      {importError ? <span className="mt-2 block text-[11px] text-red-300">⚠ {importError}</span> : null}
                    </div>
                  </div>
                </section>

                {mode === "pro" ? (
                  <section>
                    <SectionLabel>{t("console.professionalControls")}</SectionLabel>
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
          </motion.div>
        ) : null}

        {activeStep === 2 ? (
          <motion.div key="step-master" {...stepMotionProps} className="glass-panel mt-5 rounded-2xl p-5">
            <SectionLabel>{t("console.master")}</SectionLabel>
            <div className="mb-4 flex flex-wrap gap-2">
              <span className="rounded-lg border border-white/15 px-3 py-1.5 text-xs">{t("console.fileLabel", { name: file?.name || t("console.none") })}</span>
              {referenceMode ? (
                <span className="rounded-lg border border-brass/40 bg-brass/[0.1] px-3 py-1.5 text-xs text-brass">{t("console.referenceLabel", { name: referenceFile.name })}</span>
              ) : (
                <>
                  <span className="rounded-lg border border-white/15 px-3 py-1.5 text-xs">{t("console.modeLabel", { mode: mode === "pro" ? t("console.pro") : t("console.quick") })}</span>
                  <span className="rounded-lg border border-white/15 px-3 py-1.5 text-xs">{t("console.genreLabel", { genre: selectedGenre || t("console.notSet") })}</span>
                  <span className="rounded-lg border border-white/15 px-3 py-1.5 text-xs">{t("console.styleLabel", { style: selectedStyle || t("console.notSet") })}</span>
                  {selectedCategory ? (
                    <span className="rounded-lg border border-brass/40 bg-brass/10 px-3 py-1.5 text-xs text-brass">
                      {selectedCategory.replaceAll("_", " ")}
                      {selectedFlavour ? ` · ${selectedFlavour}` : ""}
                    </span>
                  ) : null}
                </>
              )}
              <span className="rounded-lg border border-white/15 px-3 py-1.5 text-xs">{t("console.engineLabel", { engine: tier })}</span>
              {useStemSeparation ? <span className="rounded-lg border border-brass/40 bg-brass/[0.1] px-3 py-1.5 text-xs text-brass">{t("console.stemsOn")}</span> : null}
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
                    <Spinner size={13} /> {t("console.rendering")}
                  </>
                ) : (
                  t("console.previewFree")
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
            <p className="mt-2 text-[11px] text-zinc-500">{t("console.previewNote")}</p>
            {masterQuota && masterQuota.remaining <= 0 && !hasCredit && onOpenBilling ? (
              <p className="mt-2 text-[11px] text-brass">
                {masterQuota.resets ? t("console.outOfMastersMonth") : t("console.usedFreeMasters")}{" "}
                <button type="button" onClick={onOpenBilling} className="underline hover:text-ember">
                  {t("console.buySingleMaster")}
                </button>{" "}
                {masterQuota.resets ? t("console.orUpgrade") : t("console.orSubscribe")}
              </p>
            ) : null}
          </motion.div>
        ) : null}
        </AnimatePresence>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={prevStep}
            disabled={activeStep === 0}
            className="rounded-xl border border-white/[0.15] bg-black/20 px-[22px] py-3 text-xs font-bold uppercase tracking-[0.12em] text-zinc-200 disabled:opacity-40"
          >
            {t("console.back")}
          </button>
          {activeStep < steps.length - 1 ? (
            <button
              type="button"
              onClick={nextStep}
              disabled={(activeStep === 0 && !canGoNextFromAudio) || (activeStep === 1 && !canGoNextFromMode)}
              className="rounded-xl border border-brass/[0.55] bg-brass/[0.18] px-[22px] py-3 text-xs font-bold uppercase tracking-[0.12em] text-brass disabled:opacity-40"
            >
              {t("console.next")}
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
                <Spinner size={12} /> {t("console.rendering")}
              </>
            ) : (
              t("console.quickPreviewAnyStep")
            )}
          </button>
        ) : null}

        {isBootstrapping ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
            <Spinner size={12} /> {t("console.loadingCatalog")}
          </p>
        ) : null}
        {status ? <p className="mt-3 text-sm text-brass">{status}</p> : null}
        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      </div>

      {/* sticky only from lg: up, where this sits beside the wizard in the
          2-column grid — below that, `grid` with no column count stacks
          single-column (wizard, then this), and an unconditionally sticky
          panel there would cling to the top of the scroll container the
          moment you scroll past it instead of just flowing like the rest
          of the page. */}
      <aside className="glass-panel min-w-0 rounded-[20px] p-[22px] lg:sticky lg:top-6">
        <h2 className="m-0 font-[var(--font-title)] text-lg">{t("console.reviewCompare")}</h2>

        {/* The fullscreen loader (rendered from AppClient, above every tab)
            is the primary render-progress UI now — see
            MasteringLoaderOverlay + useMasteringProgress. This just holds
            the space open underneath it so the layout doesn't jump when
            the overlay unmounts and the result panel below takes over. */}
        {isSubmitting ? (
          <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
            <Spinner size={12} /> {progressMessage}
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
                <p className="m-0 text-[10px] uppercase tracking-[0.1em] text-zinc-400">{t("console.beforeLufs")}</p>
                <p className="mt-1.5 text-[17px] font-bold">{result.before_lufs}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="m-0 text-[10px] uppercase tracking-[0.1em] text-zinc-400">{t("console.afterLufs")}</p>
                <p className="mt-1.5 text-[17px] font-bold text-brass">{result.after_lufs}</p>
              </div>
            </div>

            {result.ab_gain_match ? (
              <p className="text-[11px] text-zinc-500">
                {t("console.abMatched", {
                  detail:
                    result.ab_gain_match.before_gain_db !== 0
                      ? t("console.abOriginal", { db: result.ab_gain_match.before_gain_db })
                      : t("console.abMastered", { db: result.ab_gain_match.after_gain_db }),
                })}
              </p>
            ) : null}

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="m-0 mb-2 text-[10px] uppercase tracking-[0.1em] text-zinc-400">{t("console.originalSignal")}</p>
              <SignalVisualizer src={result.originalUrl} gainDb={result.ab_gain_match?.before_gain_db || 0} />
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="m-0 mb-2 text-[10px] uppercase tracking-[0.1em] text-zinc-400">{t("console.masteredSignal")}</p>
              <SignalVisualizer src={result.previewUrl || result.masteredUrl} barColor="#dfc95a" gainDb={result.ab_gain_match?.after_gain_db || 0} />
              <button
                type="button"
                onClick={async () => {
                  setDownloadError("");
                  setDownloading(true);
                  try {
                    await downloadFileSafely(result.masteredUrl, `mastered_${result.job_id}.${result.download_url?.split(".").pop() || "wav"}`);
                  } catch (err) {
                    setDownloadError(err?.message || t("console.downloadFailed"));
                  } finally {
                    setDownloading(false);
                  }
                }}
                disabled={downloading}
                className="mt-3 inline-flex w-full justify-center rounded-lg border border-brass/40 bg-brass/[0.18] px-3 py-2.5 text-xs uppercase tracking-[0.1em] text-brass hover:bg-brass/25 disabled:opacity-50"
              >
                {downloading ? t("console.downloading") : t("console.downloadMaster")}
              </button>
              {downloadError ? <p className="mt-2 text-xs text-red-300">⚠ {downloadError}</p> : null}
            </div>

            <div className="rounded-xl border border-white/10 bg-black/25 p-3">
              <p className="m-0 mb-2 text-[10px] uppercase tracking-[0.1em] text-zinc-400">{t("console.codecPreview")}</p>
              <p className="mb-3 text-[11px] text-zinc-500">{t("console.codecPreviewBody")}</p>
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
                      <Spinner size={11} /> {t("console.encoding")}
                    </>
                  ) : (
                    t("console.preview")
                  )}
                </button>
              </div>

              {codecPreviewError ? <p className="mt-2 text-xs text-red-300">{codecPreviewError}</p> : null}

              {codecPreview ? (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg border border-white/10 bg-black/30 p-2">
                      <p className="m-0 text-[10px] uppercase tracking-[0.1em] text-zinc-500">{t("console.truePeakDelta")}</p>
                      <p className="mt-1 text-sm font-semibold">{codecPreview.true_peak_delta_db > 0 ? "+" : ""}{codecPreview.true_peak_delta_db} dB</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/30 p-2">
                      <p className="m-0 text-[10px] uppercase tracking-[0.1em] text-zinc-500">{t("console.lufsDelta")}</p>
                      <p className="mt-1 text-sm font-semibold">{codecPreview.lufs_delta_db > 0 ? "+" : ""}{codecPreview.lufs_delta_db} dB</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/30 p-2">
                      <p className="m-0 text-[10px] uppercase tracking-[0.1em] text-zinc-500">{t("console.highFreqDelta")}</p>
                      <p className="mt-1 text-sm font-semibold">{codecPreview.high_frequency_change_db > 0 ? "+" : ""}{codecPreview.high_frequency_change_db} dB</p>
                    </div>
                  </div>
                  <SignalVisualizer src={codecPreview.previewUrl} barColor="#8fb3ff" />
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <p className="m-0 mb-2 text-[10px] uppercase tracking-[0.1em] text-zinc-400">{t("console.processingSummary")}</p>
              <ProcessingSummary result={result} />
            </div>
          </div>
        ) : null}

        {!isSubmitting && !result ? (
          <div className="mt-4 space-y-3.5 text-sm text-zinc-300">
            <p className="m-0">{t("console.emptyReview")}</p>
            {inputPreviewUrl ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="m-0 mb-2 text-xs uppercase tracking-[0.1em] text-zinc-400">{t("console.inputSignalPreview")}</p>
                <SignalVisualizer src={inputPreviewUrl} />
              </div>
            ) : null}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
