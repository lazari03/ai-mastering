"use client";

import { useEffect, useMemo, useState } from "react";

import LiveMasteringPanel from "@/components/audio/LiveMasteringPanel";
import ProcessingSummary from "@/components/audio/ProcessingSummary";
import SignalVisualizer from "@/components/audio/SignalVisualizer";
import Threads from "@/components/reactbits/Threads";
import { useMasteringStore } from "@/store/masteringStore";

export default function MasteringConsole() {
  const [activeStep, setActiveStep] = useState(0);
  const [inputPreviewUrl, setInputPreviewUrl] = useState("");
  const [masteringProgress, setMasteringProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [progressLogs, setProgressLogs] = useState([]);

  const {
    isBootstrapping,
    isSubmitting,
    isImportingPreset,
    error,
    importError,
    status,
    result,
    file,
    genres,
    tags,
    styles,
    presets,
    selectedGenre,
    selectedStyle,
    selectedPreset,
    selectedTags,
    useStemSeparation,
    tweaks,
    tier,
    bootstrap,
    setFile,
    setGenre,
    setStyle,
    setPreset,
    toggleTag,
    setUseStemSeparation,
    setTweak,
    setTier,
    submit,
    importPreset,
  } = useMasteringStore();

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
          setProgressLogs((prev) => {
            const next = [...prev, { ts: Date.now(), text: `${new Date().toLocaleTimeString()}  ${text}` }];
            return next.slice(-8);
          });
        }
      }, 900);

      return () => clearInterval(id);
    }

    if (result) {
      setMasteringProgress(100);
      setProgressMessage("Mastering complete");
      setProgressLogs((prev) => [...prev.slice(-7), { ts: Date.now(), text: `${new Date().toLocaleTimeString()}  Mastering complete` }]);
      return;
    }

    if (error) {
      setProgressMessage("Mastering stopped");
      setProgressLogs((prev) => [...prev.slice(-7), { ts: Date.now(), text: `${new Date().toLocaleTimeString()}  Mastering stopped` }]);
      return;
    }

    setMasteringProgress(0);
    setProgressMessage("");
    setProgressLogs([]);
  }, [isSubmitting, result, error]);

  const steps = useMemo(
    () => [
      { key: "choose", label: "Choose" },
      { key: "tweak", label: "Tweak" },
      { key: "Review", label: "Review" },
    ],
    []
  );

  const progress = ((activeStep + 1) / steps.length) * 100;
  const selectedPresetMeta = useMemo(() => presets.find((preset) => preset.name === selectedPreset) || null, [presets, selectedPreset]);

  const canGoNextFromChoose = Boolean(file && selectedGenre);
  const nextStep = () => {
    if (activeStep === 0 && !canGoNextFromChoose) return;
    setActiveStep((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const prevStep = () => {
    setActiveStep((prev) => Math.max(prev - 1, 0));
  };

  return (
    <section className="mx-auto grid w-full max-w-7xl items-start gap-4 lg:gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <article className="glass-panel reveal min-w-0 overflow-hidden rounded-3xl p-3 sm:p-5 md:p-8">
        <div className="mb-6 rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-ember to-brass transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {steps.map((step, idx) => {
              const isActive = idx === activeStep;
              const isDone = idx < activeStep;
              return (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => setActiveStep(idx)}
                  className={`rounded-lg border px-3 py-2 text-left text-[11px] uppercase tracking-[0.12em] transition sm:text-center ${
                    isActive
                      ? "bg-ember/20 text-ember border-ember/50"
                      : isDone
                        ? "bg-brass/20 text-brass border-brass/40"
                        : "bg-black/20 text-zinc-400 border-white/10"
                  }`}
                >
                  {idx + 1}. {step.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="relative mb-6 h-44 overflow-hidden rounded-2xl border border-white/10 bg-black/20 sm:h-56 md:h-64">
          <Threads
            color={[0.92, 0.55, 0.26]}
            amplitude={1.1}
            distance={0.12}
            enableMouseInteraction
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/70" />
          <div className="absolute left-3 right-3 top-3 max-w-[min(90%,42rem)] sm:left-5 sm:right-auto sm:top-5">
            <p className="text-[10px] uppercase tracking-[0.16em] text-brass/90 sm:text-xs sm:tracking-[0.2em]">AI Mastering Studio</p>
            <h1 className="mt-2 font-[var(--font-title)] text-[clamp(1.3rem,6vw,2.35rem)] leading-tight">
              Production Mastering
              <span className="block text-ember">for Real Releases</span>
            </h1>
          </div>
        </div>

        <div className="reveal reveal-delay-1 space-y-6">
          {activeStep === 0 ? (
            <>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-zinc-400">Current Selection</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-white/15 px-2.5 py-1 text-zinc-200">Preset: {selectedPresetMeta?.display_name || "Custom"}</span>
                  <span className="rounded-full border border-white/15 px-2.5 py-1 text-zinc-200">Genre: {selectedGenre || "None"}</span>
                  <span className="rounded-full border border-white/15 px-2.5 py-1 text-zinc-200">Style: {selectedStyle || "None"}</span>
                  <span className="rounded-full border border-white/15 px-2.5 py-1 text-zinc-200">Tags: {selectedTags.length}</span>
                  <span className="rounded-full border border-white/15 px-2.5 py-1 text-zinc-200">Stem: {useStemSeparation ? "On" : "Off"}</span>
                </div>
              </div>

              <label className="block space-y-2">
                <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-zinc-300">Audio File</span>
                <input
                  type="file"
                  accept="audio/*"
                  className="block w-full rounded-xl border border-white/15 bg-black/20 p-3 text-sm"
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                />
                <span className="mt-2 block break-all text-xs text-zinc-400">{file ? file.name : "No file selected"}</span>
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="min-w-0 space-y-2">
                  <span className="block text-xs uppercase tracking-[0.18em] text-zinc-300">Mix Preset</span>
                  <select
                    value={selectedPreset}
                    onChange={(event) => setPreset(event.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-black/20 p-3 text-sm"
                  >
                    <option value="">Custom</option>
                    {presets.map((preset) => (
                      <option key={preset.name} value={preset.name}>
                        {preset.display_name || preset.name}
                      </option>
                    ))}
                  </select>
                  <span className="mt-2 block text-xs text-zinc-400">{presets.length} preset profiles loaded</span>
                  {selectedPresetMeta ? (
                    <span className="mt-2 block break-words text-xs text-brass/90">{selectedPresetMeta.description}</span>
                  ) : null}

                  <div className="mt-2 rounded-lg border border-dashed border-white/15 bg-black/10 p-2">
                    <span className="block text-[10px] uppercase tracking-[0.14em] text-zinc-400">Import a Professional Preset</span>
                    <input
                      type="file"
                      accept="application/json,.json"
                      disabled={isImportingPreset}
                      onChange={(event) => {
                        const importFile = event.target.files?.[0];
                        if (importFile) importPreset(importFile);
                        event.target.value = "";
                      }}
                      className="mt-1 block w-full text-xs text-zinc-300 file:mr-2 file:rounded-lg file:border file:border-brass/40 file:bg-brass/20 file:px-2 file:py-1 file:text-[11px] file:uppercase file:tracking-[0.1em] file:text-brass"
                    />
                    <span className="mt-1 block text-[10px] text-zinc-500">
                      {isImportingPreset
                        ? "Importing..."
                        : "A full preset JSON — e.g. one you asked ChatGPT to generate — with name, genre, and a processing spec (highpass, eq, compressor, dynamic EQ, saturation, stereo, clipper, limiter). It runs exactly as written, not just approximated from genre + tags."}
                    </span>
                    {importError ? <span className="mt-1 block text-[10px] text-red-300">{importError}</span> : null}
                  </div>
                </label>

                <div className="space-y-2">
                  <span className="block text-xs uppercase tracking-[0.18em] text-zinc-300">Genre</span>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {genres.map((genre) => (
                      <button
                        key={genre}
                        type="button"
                        aria-pressed={selectedGenre === genre}
                        onClick={() => setGenre(genre)}
                        className={`w-full rounded-xl border px-3 py-2 text-center text-xs uppercase tracking-[0.14em] transition ${
                          selectedGenre === genre
                            ? "border-ember bg-ember/15 text-ember"
                            : "border-white/15 bg-black/20 text-zinc-200 hover:border-white/30"
                        }`}
                      >
                        {genre}
                      </button>
                    ))}
                  </div>
                  <span className="mt-2 block text-xs text-zinc-400">{genres.length} genres available</span>
                </div>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-xs uppercase tracking-[0.18em] text-zinc-300">Mastering Style</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {styles.map((style) => (
                    <button
                      key={style}
                      type="button"
                      aria-pressed={selectedStyle === style}
                      onClick={() => setStyle(style)}
                      className={`rounded-xl border px-3 py-2 text-left text-[11px] uppercase tracking-[0.12em] transition sm:text-xs sm:tracking-[0.14em] ${
                        selectedStyle === style
                          ? "border-ember bg-ember/15 text-ember"
                          : "border-white/15 bg-black/20 text-zinc-300 hover:border-white/30"
                      }`}
                    >
                      {style.replaceAll("_", " ")}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="space-y-2 pt-1">
                <legend className="text-xs uppercase tracking-[0.18em] text-zinc-300">Adjustment Tags</legend>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => {
                    const active = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleTag(tag)}
                        className={`rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.1em] transition sm:text-xs sm:tracking-[0.12em] ${
                          active
                            ? "border-brass bg-brass/20 text-brass"
                            : "border-white/15 bg-black/20 text-zinc-300 hover:border-white/30"
                        }`}
                      >
                        {tag.replaceAll("_", " ")}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <label className="mt-1 flex items-center justify-between rounded-xl border border-white/15 bg-black/20 p-3 text-sm">
                <span>Stem Separation</span>
                <input
                  type="checkbox"
                  checked={useStemSeparation}
                  onChange={(event) => setUseStemSeparation(event.target.checked)}
                  className="h-4 w-4"
                />
              </label>

              <fieldset className="space-y-2 pt-1">
                <legend className="text-xs uppercase tracking-[0.18em] text-zinc-300">Mastering Engine</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    aria-pressed={tier === "standard"}
                    onClick={() => setTier("standard")}
                    className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                      tier === "standard"
                        ? "border-ember bg-ember/15 text-ember"
                        : "border-white/15 bg-black/20 text-zinc-300 hover:border-white/30"
                    }`}
                  >
                    <span className="block uppercase tracking-[0.14em]">Standard</span>
                    <span className="mt-1 block text-[11px] text-zinc-400">Free. The default engine.</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={tier === "professional"}
                    onClick={() => setTier("professional")}
                    className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                      tier === "professional"
                        ? "border-brass bg-brass/15 text-brass"
                        : "border-white/15 bg-black/20 text-zinc-300 hover:border-white/30"
                    }`}
                  >
                    <span className="block uppercase tracking-[0.14em]">Professional</span>
                    <span className="mt-1 block text-[11px] text-zinc-400">
                      Split sub/punch bass bands + true-peak-aware limiting.
                    </span>
                  </button>
                </div>
              </fieldset>
            </>
          ) : null}

          {activeStep === 1 ? (
            <div>
              <h2 className="mb-3 text-xs uppercase tracking-[0.18em] text-zinc-300">Fine Tune — Live Preview</h2>
              {file ? (
                <LiveMasteringPanel file={file} previewUrl={inputPreviewUrl} tweaks={tweaks} onChangeTweak={setTweak} />
              ) : (
                <p className="text-xs text-zinc-400">Choose an audio file first to enable the live preview.</p>
              )}
            </div>
          ) : null}

          {activeStep === 2 ? (
            <div className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm text-zinc-300">Ready to master with your selected profile and tweaks. Run mastering, then check the report panel.</p>
              <button
                type="button"
                onClick={submit}
                disabled={isSubmitting || isBootstrapping || !file}
                className="w-full rounded-xl bg-ember px-5 py-4 text-sm font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-brass disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "Mastering..." : "Master Track"}
              </button>
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <button
              type="button"
              onClick={prevStep}
              disabled={activeStep === 0}
              className="w-full rounded-xl border border-white/20 bg-black/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-200 disabled:opacity-40 sm:w-auto"
            >
              Back
            </button>
            <button
              type="button"
              onClick={nextStep}
              disabled={activeStep === steps.length - 1 || (activeStep === 0 && !canGoNextFromChoose)}
              className="w-full rounded-xl border border-brass/40 bg-brass/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-brass disabled:opacity-40 sm:w-auto"
            >
              Next
            </button>
          </div>

          {activeStep !== 2 ? (
            <button
              type="button"
              onClick={submit}
              disabled={isSubmitting || isBootstrapping || !file}
              className="w-full rounded-xl bg-ember px-5 py-4 text-sm font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-brass disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Mastering..." : "Quick Master (Any Step)"}
            </button>
          ) : null}

          {isSubmitting ? (
            <div className="space-y-3 rounded-2xl border border-brass/25 bg-black/25 p-4">
              <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.14em]">
                <span className="text-brass">Mastering In Progress</span>
                <span className="text-zinc-200">{masteringProgress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-ember to-brass transition-all duration-500"
                  style={{ width: `${masteringProgress}%` }}
                />
              </div>
              <p className="text-sm text-zinc-200">{progressMessage}</p>
              <div className="max-h-28 overflow-y-auto rounded-xl border border-white/10 bg-black/25 p-3">
                {progressLogs.map((log) => (
                  <p key={`${log.ts}-${log.text}`} className="text-xs text-zinc-400">
                    {log.text}
                  </p>
                ))}
              </div>
            </div>
          ) : null}

          {isBootstrapping ? <p className="text-xs text-zinc-400">Loading catalog...</p> : null}
          {status ? <p className="text-sm text-brass">{status}</p> : null}
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
        </div>
      </article>

      <aside className="glass-panel reveal reveal-delay-2 min-w-0 rounded-3xl p-3 sm:p-5 md:p-8">
        <h2 className="font-[var(--font-title)] text-2xl">Mastering Report</h2>
        {!result ? (
          <div className="mt-3 space-y-4 text-sm text-zinc-300">
            <p>Submit a track to see before/after loudness, processing metadata, and instant A/B playback.</p>
            {inputPreviewUrl ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="mb-2 text-xs uppercase tracking-[0.14em] text-zinc-400">Input Signal Preview</p>
                <SignalVisualizer src={inputPreviewUrl} />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 space-y-4 text-sm">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">Before LUFS</p>
                <p className="mt-1 text-lg font-semibold">{result.before_lufs}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">After LUFS</p>
                <p className="mt-1 text-lg font-semibold text-brass">{result.after_lufs}</p>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="mb-2 text-xs uppercase tracking-[0.14em] text-zinc-400">Original Signal</p>
              <SignalVisualizer src={result.originalUrl} />
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="mb-2 text-xs uppercase tracking-[0.14em] text-zinc-400">Mastered Signal</p>
              <SignalVisualizer src={result.masteredUrl} barColor="#dfc95a" />
              <a
                href={result.masteredUrl}
                download
                className="mt-3 inline-flex w-full justify-center rounded-lg border border-brass/40 bg-brass/20 px-3 py-2 text-xs uppercase tracking-[0.14em] text-brass hover:bg-brass/30"
              >
                Download Master
              </a>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <p className="mb-2 text-xs uppercase tracking-[0.14em] text-zinc-400">Processing Summary</p>
              <ProcessingSummary result={result} />
            </div>
          </div>
        )}
      </aside>
    </section>
  );
}
