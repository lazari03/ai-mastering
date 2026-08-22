"use client";

import { useMemo, useRef, useState } from "react";

import { postAnalyzeChords, postCheckout } from "@/network/http/client";
import { useEntitlementsStore } from "@/store/entitlementsStore";
import { CHORD_DETECTION } from "@/lib/pricing";
import { trackEvent } from "@/lib/analytics";
import { Spinner } from "@/components/ui/Spinner";

export default function ChordDetector({ file, previewUrl, onOpenBilling }) {
  const [analysis, setAnalysis] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [buyBusy, setBuyBusy] = useState(false);
  const audioRef = useRef(null);

  const { plan, chordQuota, extraChordCredits, refresh } = useEntitlementsStore();

  // Unlimited on All-Access, same as before. Everyone else: the free
  // lifetime trial (never resets), then a purchased credit. Not derived
  // from plan alone anymore — see entitlementsStore's planUnlocksShare
  // comment for why chords split off from that pattern.
  const chordsUnlimited = plan === "pro";
  const hasTrialLeft = Boolean(chordQuota?.remaining > 0);
  const hasCredit = Number(extraChordCredits || 0) > 0;
  const chordsAvailable = chordsUnlimited || hasTrialLeft || hasCredit;

  const detect = async () => {
    if (!file || !chordsAvailable) return;
    setIsLoading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await postAnalyzeChords(formData);
      setAnalysis(result);
      // A trial/credit may have just been spent server-side — refresh so
      // the balance shown here (and everywhere else) reflects it
      // immediately, same discipline as a real master completing.
      if (!chordsUnlimited) refresh();
    } catch (err) {
      setError(err?.message || "Chord detection failed");
    } finally {
      setIsLoading(false);
    }
  };

  // Always a real one-time checkout, standalone product — never routed
  // through a plan-change flow, same reasoning as BillingPanel's
  // buySingleMaster.
  const buyOne = async () => {
    setBuyBusy(true);
    trackEvent("begin_checkout", {
      currency: "EUR",
      value: Number(String(CHORD_DETECTION.price).replace(/[^\d.]/g, "")) || 0,
      items: [{ item_id: CHORD_DETECTION.item, item_name: "chord_detection" }],
    });
    try {
      const successUrl = `${window.location.origin}/thank-you?plan=chord_detection&item=${encodeURIComponent(CHORD_DETECTION.item)}&price=${encodeURIComponent(CHORD_DETECTION.price)}`;
      const { url } = await postCheckout(CHORD_DETECTION.item, successUrl);
      window.location.href = url;
    } catch (err) {
      setBuyBusy(false);
      setError(err?.message || "Failed to start checkout.");
    }
  };

  const onTimeUpdate = () => {
    const chords = analysis?.chords;
    const t = audioRef.current?.currentTime;
    if (!chords || t == null) return;
    // ponytail: linear scan over beat-length list, fine at this size. Binary search if tracks get much longer.
    const idx = chords.findIndex((c) => t >= c.start && t < c.end);
    if (idx !== activeIndex) setActiveIndex(idx);
  };

  const chordChips = useMemo(() => analysis?.chords || [], [analysis]);

  return (
    <div>
      <button
        type="button"
        onClick={detect}
        disabled={!file || isLoading || !chordsAvailable}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ember px-5 py-4 text-sm font-bold uppercase tracking-[0.16em] text-[#100b08] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? (
          <>
            <Spinner size={15} /> Analyzing…
          </>
        ) : chordsUnlimited ? (
          "Detect Chords"
        ) : hasTrialLeft ? (
          `Detect Chords — ${chordQuota.remaining}/${chordQuota.limit} free left`
        ) : hasCredit ? (
          `Detect Chords — using 1 credit (${extraChordCredits} left)`
        ) : (
          "Detect Chords — buy or upgrade"
        )}
      </button>
      <p className="mt-1.5 text-[11px] text-zinc-500">
        {chordsUnlimited
          ? "Unlimited on your plan."
          : hasTrialLeft
            ? `Free trial — ${chordQuota.remaining} of ${chordQuota.limit} left, one-time, doesn't renew.`
            : hasCredit
              ? `${extraChordCredits} purchased credit${extraChordCredits === 1 ? "" : "s"} left.`
              : `${CHORD_DETECTION.blurb}`}
      </p>

      {!chordsUnlimited && !hasTrialLeft && !hasCredit ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={buyOne}
            disabled={buyBusy}
            className="flex items-center gap-2 rounded-full border border-white/15 bg-black/20 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-200 hover:border-white/30 disabled:opacity-50"
          >
            {buyBusy ? (
              <>
                <Spinner size={12} /> Redirecting…
              </>
            ) : (
              `Buy one (${CHORD_DETECTION.price})`
            )}
          </button>
          {onOpenBilling ? (
            <button type="button" onClick={onOpenBilling} className="text-[11px] text-brass underline hover:text-ember">
              or get unlimited with All-Access
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

      {analysis ? (
        <div className="mt-5 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-center">
              <p className="m-0 text-[11px] uppercase tracking-[0.12em] text-zinc-400">Key</p>
              <p className="mt-1.5 text-xl font-bold">{analysis.key}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-center">
              <p className="m-0 text-[11px] uppercase tracking-[0.12em] text-zinc-400">BPM</p>
              <p className="mt-1.5 text-xl font-bold">{analysis.bpm}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-center">
              <p className="m-0 text-[11px] uppercase tracking-[0.12em] text-zinc-400">Time Sig.</p>
              <p className="mt-1.5 text-xl font-bold">4/4</p>
            </div>
          </div>

          <p className="text-[11px] text-zinc-500">
            Estimated from the audio, not ground truth — a starting point for the key and chords, not a guaranteed-accurate transcription.
          </p>

          <audio ref={audioRef} src={previewUrl} controls onTimeUpdate={onTimeUpdate} className="w-full" />

          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="m-0 mb-2.5 text-[11px] uppercase tracking-[0.12em] text-zinc-400">Chord Progression</p>
            <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
              {chordChips.map((c, idx) => (
                <span
                  key={`${c.start}-${c.chord}`}
                  className={`rounded-lg border px-3.5 py-2 text-sm font-semibold transition ${
                    idx === activeIndex
                      ? "border-brass bg-brass/[0.18] text-brass"
                      : "border-white/15 bg-black/20 text-zinc-300"
                  }`}
                >
                  {c.chord}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-zinc-400">
          {file ? "Detect BPM, key, and chords, then play along." : "Choose an audio file first."}
        </p>
      )}
    </div>
  );
}
