"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { takePendingToolFile } from "@/lib/toolHandoff";
import AdaptiveControlsPanel from "@/components/audio/AdaptiveControlsPanel";
import PresetSaveBar from "@/components/audio/PresetSaveBar";
import ProcessingSummary from "@/components/audio/ProcessingSummary";
import MasteringDecisions from "@/components/audio/MasteringDecisions";
import ProParamsPanel from "@/components/audio/ProParamsPanel";
import SoundControls from "@/components/audio/SoundControls";
import SignalVisualizer from "@/components/audio/SignalVisualizer";
import FileDropzone from "@/components/ui/FileDropzone";
import { previewCodec } from "@/domain/mastering/masteringDomain";
import { downloadFileSafely, postCheckout } from "@/network/http/client";
import { useMasteringStore } from "@/store/masteringStore";
import { useEntitlementsStore, planUnlocksProfessional } from "@/store/entitlementsStore";
import { STEM_SEPARATION } from "@/lib/pricing";
import { DELIVERY_TARGETS } from "@/lib/deliveryTargets";
import { trackEvent } from "@/lib/analytics";
import { useMasteringProgress } from "@/lib/useMasteringProgress";
import { Spinner } from "@/components/ui/Spinner";
import { useLanguage } from "@/lib/i18n";
import InlineAlert from "@/components/ui/InlineAlert";
import { masteringErrorText, localizeSourceWarnings } from "@/lib/masteringErrors";

// Codec names are format labels, not language-dependent text — same on
// every locale, nothing to localize here.
const CODEC_OPTIONS = [
  { value: "mp3_128", label: "MP3 128kbps" },
  { value: "mp3_320", label: "MP3 320kbps" },
  { value: "aac_128", label: "AAC 128kbps" },
  { value: "aac_256", label: "AAC 256kbps" },
  { value: "opus_128", label: "Opus 128kbps" },
];

const CHIP_BASE = "border-border-subtle bg-black/[0.045] text-text-secondary";
const CHIP_EMBER = "border-accent bg-accent/[0.15] text-accent";
const CHIP_BRASS = "border-accent bg-black/[0.05] text-accent";

function SectionLabel({ n, children, hint }) {
  return (
    <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
      <h2 className="m-0 text-[13px] font-bold text-text-primary">
        {n ? <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] text-bg" aria-hidden="true">{n}</span> : null}
        {children}
      </h2>
      {hint ? <span className="text-[11px] text-text-secondary">{hint}</span> : null}
    </div>
  );
}

const HIDDEN_FIELD = "text-[11px] uppercase tracking-[0.1em] text-text-secondary";

export default function MasteringConsole({ onOpenHelp, onOpenBilling, onOpenPresets }) {
  const { t } = useLanguage();
  const [moreOpen, setMoreOpen] = useState(false);
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
    errorCode,
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
    direction,
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
    setDelivery,
    selectedDelivery,
    setCategory,
    setFlavour,
    setPreset,
    toggleTag,
    setUseStemSeparation,
    setTweak,
    setDirection,
    resetDirection,
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

  // Picks up a file handed off from a free tool (currently just the LUFS
  // Meter — see PublicLufsMeter.jsx/lib/toolHandoff.js) after signing up
  // from there, so "Master This Track" never makes someone re-upload the
  // exact same file they just analyzed. Runs once; consume-once by design
  // (takePendingToolFile deletes what it reads), same StrictMode-safe ref
  // guard as ChordsPanel.jsx's equivalent pickup.
  const fetchedToolFileRef = useRef(false);
  useEffect(() => {
    if (fetchedToolFileRef.current || file) return;
    fetchedToolFileRef.current = true;
    takePendingToolFile().then((handedOffFile) => {
      if (handedOffFile) setFile(handedOffFile, "lufs_meter");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        ? t("console.masterTrackDefault")
        : hasCredit
          ? t("console.masterTrackCredit")
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
      checkout_source: "studio",
    });
    try {
      const successUrl = `${window.location.origin}/thank-you?plan=stem_separation&item=${encodeURIComponent(STEM_SEPARATION.item)}&price=${encodeURIComponent(STEM_SEPARATION.price)}`;
      const { url } = await postCheckout(STEM_SEPARATION.item, successUrl);
      window.location.href = url;
    } catch {
      setStemBuyBusy(false);
    }
  };

  const chipClass = (active, tone = "ember") =>
    `rounded-xl border px-3 py-1.5 text-xs font-semibold capitalize transition ${active ? (tone === "brass" ? CHIP_BRASS : CHIP_EMBER) : `${CHIP_BASE} hover:border-text-primary/30`}`;

  const keptClarity = tags.includes("clearer");
  // Merged controls (old tag/objective chips) have no UI of their own any
  // more, but a preset or imported preset can still set them — say so, and
  // let the user clear them with the same store actions the chips used.
  const extraTags = selectedTags.filter((tag) => tag !== "clearer");
  const extras = [...extraTags.map((tag) => tag.replaceAll("_", " ")), ...(selectedCategory ? [[selectedCategory, selectedFlavour].filter(Boolean).join(" · ").replaceAll("_", " ")] : [])];
  const clearExtras = () => {
    extraTags.forEach((tag) => toggleTag(tag));
    if (selectedCategory) setCategory("");
  };
  const adjustedCount = ["loudness", "punch", "low_end", "warmth", "brightness", "presence", "width"].filter((k) => Number(tweaks[k]) !== 0).length + (selectedTags.includes("clearer") ? 1 : 0);
  const needGenre = !referenceMode && !selectedGenre && !selectedPreset;
  const field = "w-full rounded-[10px] border border-border-subtle bg-black/[0.045] p-2.5 text-[13px] text-text-primary";
  const box = "rounded-xl border border-border-subtle bg-black/[0.045] p-3";

  const stemToggle = (
    <div>
      <label className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-black/[0.045] p-3 text-sm">
        <span className="flex items-center gap-2">
          {t("console.stemSeparation")}
          {!stemUnlocked ? (
            <span className="rounded-full border border-border-subtle bg-accent/[0.12] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-accent">{t("console.premium")}</span>
          ) : null}
        </span>
        <input type="checkbox" checked={useStemSeparation} disabled={!stemUnlocked} onChange={(event) => setUseStemSeparation(event.target.checked)} className="h-4 w-4 disabled:opacity-40" />
      </label>
      {!stemUnlocked ? (
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <p className="m-0 text-[11px] text-text-secondary">{plan === "pro" ? t("console.stemUsedUp") : t("console.stemIncluded")}</p>
          <button type="button" onClick={buyStemSeparation} disabled={stemBuyBusy} className="shrink-0 rounded-full border border-border-subtle bg-accent/[0.1] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-accent hover:bg-black/[0.05] disabled:opacity-50">
            {stemBuyBusy ? t("console.redirecting") : stemBuyLabel}
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] [&>*]:min-w-0">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="m-0 text-[24px]">{t("mc.title")}</h1>
          <p className="mt-1 text-sm text-text-secondary">{t("mc.subtitle")}</p>
        </div>

        {/* 1. Upload */}
        <section className="glass-panel rounded-2xl p-4" aria-labelledby="mc-s1">
          <div id="mc-s1"><SectionLabel n="1">{t("mc.step.upload")}</SectionLabel></div>
          <FileDropzone
            id="masterFileInput"
            compact
            label={t("console.audioFile")}
            fileName={file?.name}
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            onRemove={() => setFile(null)}
          />
        </section>

        {referenceMode ? (
          <section className="glass-panel rounded-2xl p-4" aria-labelledby="mc-ref">
            <div id="mc-ref"><SectionLabel n="2">{t("mc.reference.active")}</SectionLabel></div>
            <p className="m-0 text-sm text-text-secondary">
              <strong className="text-accent">{t("console.referenceIsActive")}</strong> {t("console.referenceAnalyze")}{" "}
              <span className="text-text-primary">{referenceFile.name}</span> {t("console.referenceBody2")}
            </p>
            <p className="mt-2 text-xs text-text-secondary">{t("console.referenceBody3")}</p>
            <button type="button" onClick={() => setReferenceFile(null)} className="mt-3 rounded-lg border border-border-subtle bg-black/[0.045] px-4 py-2 text-[11px] uppercase tracking-[0.1em] text-text-primary hover:border-text-primary/30">
              {t("console.switchManual")}
            </button>
          </section>
        ) : (
          <>
            {/* 2. Genre */}
            <section className="glass-panel rounded-2xl p-4" aria-labelledby="mc-s2">
              <div id="mc-s2"><SectionLabel n="2" hint={t("mc.genre.hint")}>{t("mc.step.genre")}</SectionLabel></div>
              <div className="flex flex-wrap gap-1.5">
                {genres.map((genre) => (
                  <button key={genre} type="button" aria-pressed={selectedGenre === genre} onClick={() => setGenre(genre)} className={chipClass(selectedGenre === genre)}>
                    {genre.replaceAll("_", " ")}
                  </button>
                ))}
              </div>
              {selectedPresetMeta ? (
                <p className="mb-0 mt-2 break-words text-[11px] text-accent/90">
                  {t("mc.genre.presetActive", { name: selectedPresetMeta.display_name || selectedPresetMeta.name })} {selectedPresetMeta.description}
                </p>
              ) : null}
            </section>

            {/* 3. Sound (optional) */}
            <section className="glass-panel rounded-2xl p-4" aria-labelledby="mc-s3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div id="mc-s3"><SectionLabel n="3" hint={`(${t("mc.optional")}) ${adjustedCount ? t("mc.sound.adjusted", { n: adjustedCount }) : t("mc.sound.untouched")}`}>{t("mc.step.sound")}</SectionLabel></div>
                {mode === "quick" && adjustedCount ? (
                  <button type="button" onClick={resetDirection} className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary hover:text-accent">{t("mc.sound.reset")}</button>
                ) : null}
              </div>
              <p className="mb-3 mt-0 text-[11px] text-text-secondary">{mode === "pro" ? t("mc.sound.proNote") : t("mc.sound.body")}</p>
              <SoundControls
                tweaks={tweaks}
                onTweak={setTweak}
                styles={styles}
                selectedStyle={selectedStyle}
                onStyle={setStyle}
                hasClarity={keptClarity}
                clarityOn={selectedTags.includes("clearer")}
                onToggleClarity={() => toggleTag("clearer")}
                hideSliders={mode === "pro"}
              />
              {extras.length ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border-subtle p-2.5">
                  <p className="m-0 min-w-0 break-words text-[11px] text-text-secondary">{t("mc.extras.title", { list: extras.join(", ") })}</p>
                  <button type="button" onClick={clearExtras} className="shrink-0 text-[11px] font-semibold text-accent underline">{t("mc.extras.clear")}</button>
                </div>
              ) : null}
            </section>
          </>
        )}

        {/* More options: advanced controls, progressively disclosed */}
        <section className="glass-panel rounded-2xl">
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-controls="mc-more"
            onClick={() => setMoreOpen((v) => !v)}
            className="flex w-full items-center gap-3 rounded-2xl p-4 text-left"
          >
            <span className={`inline-block text-lg transition-transform ${moreOpen ? "rotate-90" : ""}`} aria-hidden="true">›</span>
            <span className="min-w-0">
              <span className="block text-[13px] font-bold text-text-primary">{t("mc.more")}</span>
              <span className="block text-[11px] text-text-secondary">{t("mc.more.summary")}</span>
            </span>
          </button>
          {moreOpen ? (
            <div id="mc-more" className="flex flex-col gap-5 border-t border-border-subtle p-4">
              {!referenceMode ? (
                <div>
                  <span className={`mb-2 block ${HIDDEN_FIELD}`}>{t("mc.more.delivery")}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {DELIVERY_TARGETS.map((target) => (
                      <button key={target} type="button" aria-pressed={selectedDelivery === target} onClick={() => setDelivery(target)} className={chipClass(selectedDelivery === target)}>
                        {t(`delivery.${target}`)}
                      </button>
                    ))}
                  </div>
                  <p className="mb-0 mt-2 text-[11px] text-text-secondary">{t(`delivery.${selectedDelivery}.hint`)}</p>
                </div>
              ) : null}

              <div>
                <span className={`mb-2 block ${HIDDEN_FIELD}`}>{t("mc.more.reference")}</span>
                <FileDropzone
                  id="refFileInput"
                  compact
                  label={t("console.referenceTrack")}
                  fileName={referenceFile?.name}
                  onChange={(event) => setReferenceFile(event.target.files?.[0] || null)}
                  onRemove={() => setReferenceFile(null)}
                />
                <p className="mb-0 mt-2 text-[11px] text-text-secondary">{referenceMode ? t("console.referenceActive") : t("console.referenceHint")}</p>
              </div>

              {!referenceMode ? (
                <>
                  <div>
                    <span className={`mb-2 block ${HIDDEN_FIELD}`}>{t("mc.more.presets")}</span>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-[11px] text-text-secondary">{t("console.preset")}</span>
                        <select value={builtInPresets.some((p) => p.name === selectedPreset) ? selectedPreset : ""} onChange={(event) => setPreset(event.target.value)} className={field}>
                          <option value="">{t("console.custom")}</option>
                          {builtInPresets.map((preset) => (
                            <option key={preset.name} value={preset.name}>{preset.display_name || preset.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] text-text-secondary">{t("console.savedArtists")}</span>
                        <div className="flex gap-2">
                          <select value={savedArtistPresets.some((p) => p.name === selectedPreset) ? selectedPreset : ""} onChange={(event) => setPreset(event.target.value)} className={`${field} min-w-0 flex-1`}>
                            <option value="">{savedArtistPresets.length ? t("console.chooseArtist") : t("console.noSavedArtists")}</option>
                            {savedArtistPresets.map((preset) => (
                              <option key={preset.name} value={preset.name}>{preset.display_name || preset.name}</option>
                            ))}
                          </select>
                          {savedArtistPresets.some((p) => p.name === selectedPreset) ? (
                            <button type="button" onClick={() => deletePreset(selectedPreset)} className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.1em] text-red-700 hover:border-red-400/50">{t("console.remove")}</button>
                          ) : null}
                        </div>
                      </label>
                    </div>

                    <div className="mt-3 rounded-lg border border-dashed border-border-subtle bg-black/10 p-3">
                      <span className="block text-[10px] uppercase tracking-[0.14em] text-text-secondary">{t("console.importPresetJson")}</span>
                      <span className="mt-1 block text-[11px] text-text-secondary">{t("console.importPresetBody")}</span>
                      {onOpenHelp ? (
                        <button type="button" onClick={onOpenHelp} className="mt-1 block text-[11px] text-accent hover:text-accent">{t("console.getTemplate")}</button>
                      ) : null}
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <input type="text" value={importArtistName} onChange={(event) => setImportArtistName(event.target.value)} placeholder={t("console.artistNamePlaceholder")} aria-label={t("console.artistNamePlaceholder")} disabled={isImportingPreset} className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-black/[0.045] px-3 py-2 text-xs text-text-primary placeholder:text-text-secondary" />
                        <label htmlFor="presetImportInput" className="flex flex-1 cursor-pointer items-center justify-center rounded-lg border border-border-subtle bg-accent/[0.12] px-3 py-2 text-xs text-accent hover:bg-black/[0.05]">
                          {importFilePending ? importFilePending.name : t("console.choosePresetFile")}
                        </label>
                        <input id="presetImportInput" type="file" accept="application/json,.json" disabled={isImportingPreset} onClick={(event) => { event.currentTarget.value = ""; }} onChange={(event) => setImportFilePending(event.target.files?.[0] || null)} className="hidden" />
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
                          className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-black/[0.05] px-3 py-2 text-[11px] uppercase tracking-[0.1em] text-accent disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {isImportingPreset ? (<><Spinner size={11} /> {t("console.importing")}</>) : t("console.importSave")}
                        </button>
                        {importFilePending ? (
                          <button type="button" onClick={() => setImportFilePending(null)} className="rounded-lg border border-border-subtle bg-black/[0.045] px-3 py-2 text-[11px] uppercase tracking-[0.1em] text-text-secondary hover:border-text-primary/30">{t("console.clear")}</button>
                        ) : null}
                      </div>
                      {importError ? <InlineAlert size="xs" className="mt-2">{importError}</InlineAlert> : null}
                    </div>
                  </div>

                  {mode === "quick" ? (
                    <div>
                      <span className={`block ${HIDDEN_FIELD}`}>{t("mc.more.start")}</span>
                      <p className="m-0 text-[11px] text-text-secondary">{t("mc.more.start.body")}</p>
                      <AdaptiveControlsPanel
                        tweaks={tweaks}
                        onTweak={setTweak}
                        direction={direction}
                        onDirection={setDirection}
                        onReset={resetDirection}
                        footer={<PresetSaveBar onOpenPresets={onOpenPresets} />}
                        analysis={analysis}
                        livePreviewParams={livePreviewParams}
                        isAnalyzing={isAnalyzing}
                        isPreviewLoading={isPreviewLoading}
                        previewUnavailable={previewUnavailable}
                        previewError={previewError}
                        compactDirection
                      />
                    </div>
                  ) : null}
                </>
              ) : null}

              <div>
                <span className={`mb-2 block ${HIDDEN_FIELD}`}>{t("mc.more.quality")}</span>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-text-secondary">{t("console.engine")}</span>
                    <select value={tier} onChange={(event) => setTier(event.target.value)} className={field}>
                      <option value="standard">{t("console.standard")}</option>
                      <option value="professional" disabled={!professionalUnlocked}>
                        {t("console.professionalOption")}{!professionalUnlocked ? t("console.studioPlanSuffix") : ""}
                      </option>
                    </select>
                    {!professionalUnlocked ? <span className="mt-1 block text-[11px] text-text-secondary">{t("console.needsStudio")}</span> : null}
                  </label>
                  <div className="sm:self-end">{stemToggle}</div>
                </div>
              </div>

              {!referenceMode ? (
                <div>
                  <span className={`mb-2 block ${HIDDEN_FIELD}`}>{t("mc.more.mode")}</span>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {[["quick", "mc.mode.auto"], ["pro", "mc.mode.pro"]].map(([value, key]) => (
                      <button key={value} type="button" onClick={() => setMode(value)} aria-pressed={mode === value} className={`rounded-xl border p-3 text-left transition ${mode === value ? "border-accent bg-accent/[0.1]" : "border-border-subtle bg-black/[0.045] hover:border-text-primary/30"}`}>
                        <span className="block text-[13px] font-bold text-text-primary">{t(key)}</span>
                        <span className="mt-0.5 block text-[11px] text-text-secondary">{t(`${key}.line`)}</span>
                      </button>
                    ))}
                  </div>
                  {mode === "pro" ? (
                    <div className="mt-3">
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
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* 4. Master */}
        <section className="glass-panel rounded-2xl p-4" aria-labelledby="mc-s4">
          <div id="mc-s4"><SectionLabel n="4">{t("mc.step.master")}</SectionLabel></div>
          <p className="m-0 mb-3 break-words text-[12px] text-text-secondary">
            {!file
              ? t("mc.master.needFile")
              : needGenre
                ? t("mc.master.needGenre")
                : `${t("mc.master.ready", { file: file.name })} — ${referenceMode ? t("console.referenceLabel", { name: referenceFile.name }) : t("mc.master.summary", { genre: selectedGenre || selectedPresetMeta?.display_name || t("console.notSet"), delivery: t(`delivery.${selectedDelivery}`), engine: tier })}${useStemSeparation ? ` · ${t("console.stemsOn")}` : ""}`}
          </p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => submit(true)}
              disabled={isSubmitting || isBootstrapping || !file}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border-subtle bg-black/[0.045] px-5 py-3.5 text-xs font-bold uppercase tracking-[0.14em] text-text-primary transition hover:border-text-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (<><Spinner size={13} /> {t("console.rendering")}</>) : t("console.previewFree")}
            </button>
            <button
              type="button"
              onClick={() => submit(false)}
              disabled={isSubmitting || isBootstrapping || !file || (masterQuota && !masterUnlocked)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-text-primary px-5 py-3.5 text-sm font-bold uppercase tracking-[0.18em] text-bg transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? <Spinner size={14} /> : null}
              {masterButtonLabel}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-text-secondary">{t("console.previewNote")}</p>
          {masterQuota && masterQuota.remaining <= 0 && !hasCredit && onOpenBilling ? (
            <p className="mt-2 text-[11px] text-accent">
              {masterQuota.resets ? t("console.outOfMastersMonth") : t("console.usedFreeMasters")}{" "}
              <button type="button" onClick={onOpenBilling} className="underline hover:text-accent">{t("console.buySingleMaster")}</button>{" "}
              {masterQuota.resets ? t("console.orUpgrade") : t("console.orSubscribe")}
            </p>
          ) : null}
          {isBootstrapping ? (
            <p className="mt-3 flex items-center gap-2 text-xs text-text-secondary"><Spinner size={12} /> {t("console.loadingCatalog")}</p>
          ) : null}
          {status ? <p className="mt-3 text-sm text-accent" role="status">{status}</p> : null}
          {error ? <InlineAlert size="sm" className="mt-3">{masteringErrorText(t, error, errorCode)}</InlineAlert> : null}
        </section>
      </div>

      <aside className="glass-panel min-w-0 rounded-[20px] p-[18px] lg:sticky lg:top-6">
        <h2 className="m-0 text-lg">{t("console.reviewCompare")}</h2>

        {isSubmitting ? (
          <div className="mt-4 flex items-center gap-2 text-xs text-text-secondary"><Spinner size={12} /> {progressMessage}</div>
        ) : null}

        {!isSubmitting && result ? (
          <div className="mt-3 flex flex-col gap-3">
            {localizeSourceWarnings(t, result.source_warnings, result.processing_applied).map((warning, i) => (
              <div key={`${i}-${warning}`} className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-900">⚠ {warning}</div>
            ))}

            <div className="grid grid-cols-2 gap-2.5">
              <div className={box}>
                <p className="m-0 text-[10px] uppercase tracking-[0.1em] text-text-secondary">{t("console.beforeLufs")}</p>
                <p className="mt-1 text-[17px] font-bold">{result.before_lufs}</p>
              </div>
              <div className={box}>
                <p className="m-0 text-[10px] uppercase tracking-[0.1em] text-text-secondary">{t("console.afterLufs")}</p>
                <p className="mt-1 text-[17px] font-bold text-accent">{result.after_lufs}</p>
              </div>
            </div>

            {result.ab_gain_match ? (
              <p className="m-0 text-[11px] text-text-secondary">
                {t("console.abMatched", {
                  detail:
                    result.ab_gain_match.before_gain_db !== 0
                      ? t("console.abOriginal", { db: result.ab_gain_match.before_gain_db })
                      : t("console.abMastered", { db: result.ab_gain_match.after_gain_db }),
                })}
              </p>
            ) : null}

            <div className={box}>
              <p className="m-0 mb-2 text-[11px] font-bold text-text-primary">{t("mc.res.compare")}</p>
              <p className="m-0 mb-1 text-[10px] uppercase tracking-[0.1em] text-text-secondary">{t("console.originalSignal")}</p>
              <SignalVisualizer src={result.originalUrl} gainDb={result.ab_gain_match?.before_gain_db || 0} />
              <p className="m-0 mb-1 mt-3 text-[10px] uppercase tracking-[0.1em] text-text-secondary">{t("console.masteredSignal")}</p>
              <SignalVisualizer src={result.previewUrl || result.masteredUrl} barColor="#dfc95a" gainDb={result.ab_gain_match?.after_gain_db || 0} />
              <button
                type="button"
                onClick={async () => {
                  setDownloadError("");
                  setDownloading(true);
                  try {
                    await downloadFileSafely(result.masteredUrl, `mastered_${result.job_id}.${result.download_url?.split(".").pop() || "wav"}`);
                    trackEvent("download_completed", { source: "console" });
                  } catch (err) {
                    setDownloadError(err?.message || t("console.downloadFailed"));
                  } finally {
                    setDownloading(false);
                  }
                }}
                disabled={downloading}
                className="mt-3 inline-flex w-full justify-center rounded-lg border border-border-subtle bg-black/[0.05] px-3 py-2.5 text-xs uppercase tracking-[0.1em] text-accent hover:bg-black/[0.06] disabled:opacity-50"
              >
                {downloading ? t("console.downloading") : t("console.downloadMaster")}
              </button>
              {downloadError ? <InlineAlert size="xs" className="mt-2">{downloadError}</InlineAlert> : null}
            </div>

            <MasteringDecisions result={result} source="console" />

            <details className={box}>
              <summary className="cursor-pointer text-[12px] font-semibold text-text-primary">{t("console.processingSummary")}</summary>
              <div className="mt-3"><ProcessingSummary result={result} /></div>
            </details>

            <details className={box}>
              <summary className="cursor-pointer text-[12px] font-semibold text-text-primary">{t("mc.res.codec")}</summary>
              <p className="mb-3 mt-2 text-[11px] text-text-secondary">{t("console.codecPreviewBody")}</p>
              <div className="flex flex-wrap items-center gap-2">
                <select value={codecChoice} onChange={(e) => setCodecChoice(e.target.value)} aria-label={t("console.codecPreview")} className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-black/[0.045] px-2 py-2 text-xs text-text-primary">
                  {CODEC_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                </select>
                <button type="button" onClick={handleCodecPreview} disabled={codecPreviewLoading} className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-black/[0.05] px-3.5 py-2 text-[11px] uppercase tracking-[0.1em] text-accent hover:bg-black/[0.06] disabled:opacity-50">
                  {codecPreviewLoading ? (<><Spinner size={11} /> {t("console.encoding")}</>) : t("console.preview")}
                </button>
              </div>
              {codecPreviewError ? <InlineAlert size="xs" className="mt-2">{codecPreviewError}</InlineAlert> : null}
              {codecPreview ? (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[["console.truePeakDelta", codecPreview.true_peak_delta_db], ["console.lufsDelta", codecPreview.lufs_delta_db], ["console.highFreqDelta", codecPreview.high_frequency_change_db]].map(([k, v]) => (
                      <div key={k} className="rounded-lg border border-border-subtle bg-black/[0.045] p-2">
                        <p className="m-0 text-[10px] uppercase tracking-[0.1em] text-text-secondary">{t(k)}</p>
                        <p className="mt-1 text-sm font-semibold">{v > 0 ? "+" : ""}{v} dB</p>
                      </div>
                    ))}
                  </div>
                  <SignalVisualizer src={codecPreview.previewUrl} barColor="#8fb3ff" />
                </div>
              ) : null}
            </details>
          </div>
        ) : null}

        {!isSubmitting && !result ? (
          <div className="mt-3 space-y-3 text-sm text-text-secondary">
            <p className="m-0">{t("console.emptyReview")}</p>
            {inputPreviewUrl ? (
              <div className={box}>
                <p className="m-0 mb-2 text-xs uppercase tracking-[0.1em] text-text-secondary">{t("console.inputSignalPreview")}</p>
                <SignalVisualizer src={inputPreviewUrl} />
              </div>
            ) : null}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
