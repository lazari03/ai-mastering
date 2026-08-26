"use client";

import { useMemo, useRef, useState } from "react";

import { postAnalyzeChords, postCheckout } from "@/network/http/client";
import { useEntitlementsStore } from "@/store/entitlementsStore";
import { CHORD_DETECTION, CHORDS_MONTHLY } from "@/lib/pricing";
import { trackEvent } from "@/lib/analytics";
import { Spinner } from "@/components/ui/Spinner";
import { useLanguage } from "@/lib/i18n";

export default function ChordDetector({ file, previewUrl, onOpenBilling, onMasterThisSong }) {
  const { t } = useLanguage();
  const [analysis, setAnalysis] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [buyBusy, setBuyBusy] = useState("");
  const audioRef = useRef(null);

  const { plan, chordQuota, extraChordCredits, chordSubscriptionActive, refresh } = useEntitlementsStore();

  // Unlimited two ways: bundled on All-Access, or a standalone Chords
  // Monthly subscription (for anyone who wants unlimited chords without a
  // mastering plan at all). Everyone else: the free lifetime trial (never
  // resets), then a purchased credit. Not derived from plan alone — see
  // entitlementsStore's planUnlocksShare comment for why chords split off
  // from that pattern.
  const chordsUnlimited = plan === "pro" || chordSubscriptionActive;
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
      setError(err?.message || t("chordDetector.failed"));
    } finally {
      setIsLoading(false);
    }
  };

  // Always a real checkout, never routed through the plan-change flow —
  // true for both the one-time credit and the standalone monthly
  // subscription, same reasoning as BillingPanel's buyOneTime (chords
  // subscribing/unsubscribing is independent of the main mastering plan,
  // never a "switch" between tiers).
  const buy = async (product, planLabel) => {
    setBuyBusy(product.item);
    trackEvent("begin_checkout", {
      currency: "EUR",
      value: Number(String(product.price).replace(/[^\d.]/g, "")) || 0,
      items: [{ item_id: product.item, item_name: planLabel }],
    });
    try {
      const successUrl = `${window.location.origin}/thank-you?plan=${planLabel}&item=${encodeURIComponent(product.item)}&price=${encodeURIComponent(product.price)}`;
      const { url } = await postCheckout(product.item, successUrl);
      window.location.href = url;
    } catch (err) {
      setBuyBusy("");
      setError(err?.message || t("chordDetector.checkoutFailed"));
    }
  };

  const onTimeUpdate = () => {
    const chords = analysis?.chords;
    const currentTime = audioRef.current?.currentTime;
    if (!chords || currentTime == null) return;
    // ponytail: linear scan over beat-length list, fine at this size. Binary search if tracks get much longer.
    const idx = chords.findIndex((c) => currentTime >= c.start && currentTime < c.end);
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
            <Spinner size={15} /> {t("chordDetector.analyzing")}
          </>
        ) : chordsUnlimited ? (
          t("chordDetector.detect")
        ) : hasTrialLeft ? (
          t("chordDetector.detectFreeLeft", { remaining: chordQuota.remaining, limit: chordQuota.limit })
        ) : hasCredit ? (
          t("chordDetector.detectCredit", { n: extraChordCredits })
        ) : (
          t("chordDetector.detectBuyUpgrade")
        )}
      </button>
      <p className="mt-1.5 text-[11px] text-zinc-500">
        {chordsUnlimited
          ? t("chordDetector.unlimitedPlan")
          : hasTrialLeft
            ? t("chordDetector.freeTrialLeft", { remaining: chordQuota.remaining, limit: chordQuota.limit })
            : hasCredit
              ? t("chordDetector.creditsLeft", { n: extraChordCredits, s: extraChordCredits === 1 ? "" : "s" })
              : CHORD_DETECTION.blurb}
      </p>

      {!chordsUnlimited && !hasTrialLeft && !hasCredit ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => buy(CHORD_DETECTION, "chord_detection")}
            disabled={Boolean(buyBusy)}
            className="flex items-center gap-2 rounded-full border border-white/15 bg-black/20 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-200 hover:border-white/30 disabled:opacity-50"
          >
            {buyBusy === CHORD_DETECTION.item ? (
              <>
                <Spinner size={12} /> {t("chordDetector.redirecting")}
              </>
            ) : (
              t("chordDetector.buyOne", { price: CHORD_DETECTION.price })
            )}
          </button>
          <button
            type="button"
            onClick={() => buy(CHORDS_MONTHLY, "chords_monthly")}
            disabled={Boolean(buyBusy)}
            className="flex items-center gap-2 rounded-full border border-brass/40 bg-brass/[0.1] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-brass hover:bg-brass/20 disabled:opacity-50"
          >
            {buyBusy === CHORDS_MONTHLY.item ? (
              <>
                <Spinner size={12} /> {t("chordDetector.redirecting")}
              </>
            ) : (
              t("chordDetector.unlimitedPrice", { price: CHORDS_MONTHLY.price })
            )}
          </button>
          {onOpenBilling ? (
            <button type="button" onClick={onOpenBilling} className="text-[11px] text-zinc-400 underline hover:text-zinc-200">
              {t("chordDetector.seeAllPlans")}
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

      {analysis ? (
        <div className="mt-5 space-y-3">
          {/* gap/padding/type scale down a notch below sm: — three cells
              share ~340px there, and "F# minor" at text-xl inside p-4
              padding was wrapping awkwardly per-word. */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-center sm:p-4">
              <p className="m-0 text-[11px] uppercase tracking-[0.12em] text-zinc-400">{t("chordDetector.key")}</p>
              <p className="mt-1.5 text-lg font-bold sm:text-xl">{analysis.key}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-center sm:p-4">
              <p className="m-0 text-[11px] uppercase tracking-[0.12em] text-zinc-400">{t("chordDetector.bpm")}</p>
              <p className="mt-1.5 text-lg font-bold sm:text-xl">{analysis.bpm}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-center sm:p-4">
              <p className="m-0 text-[11px] uppercase tracking-[0.12em] text-zinc-400">{t("chordDetector.timeSig")}</p>
              <p className="mt-1.5 text-lg font-bold sm:text-xl">4/4</p>
            </div>
          </div>

          <p className="text-[11px] text-zinc-500">{t("chordDetector.estimatedNote")}</p>

          <audio ref={audioRef} src={previewUrl} controls onTimeUpdate={onTimeUpdate} className="w-full" />

          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="m-0 mb-2.5 text-[11px] uppercase tracking-[0.12em] text-zinc-400">{t("chordDetector.chordProgression")}</p>
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

          {onMasterThisSong ? (
            // The cross-sell moment — right after the answer they came for,
            // not before it. Reuses the same File object already in memory
            // (see ChordsPanel.jsx), so this jumps straight into the
            // Master tab with the track already attached, no re-upload.
            <div className="rounded-xl border border-brass/30 bg-brass/[0.06] p-4 text-center">
              <button
                type="button"
                onClick={() => {
                  trackEvent("chord_detector_master_cta");
                  onMasterThisSong();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brass px-5 py-3.5 text-sm font-bold uppercase tracking-[0.12em] text-[#100b08] transition hover:brightness-110"
              >
                {t("chordDetector.masterThisSong")}
              </button>
              <p className="mt-2 text-[11px] text-zinc-500">{t("chordDetector.sameFileNote")}</p>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-xs text-zinc-400">
          {file ? t("chordDetector.emptyWithFile") : t("chordDetector.emptyNoFile")}
        </p>
      )}
    </div>
  );
}
