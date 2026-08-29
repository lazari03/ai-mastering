"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import ChordDetector from "./ChordDetector";
import ChordAuthGate from "./ChordAuthGate";
import FileDropzone from "@/components/ui/FileDropzone";
import { useAuthStore } from "@/store/authStore";
import { useEntitlementsStore } from "@/store/entitlementsStore";
import { stashPendingChordResult } from "@/lib/chordHandoff";
import { useLanguage } from "@/lib/i18n";

/**
 * The public, logged-out-friendly chord detector on /chord-detector —
 * upload and analysis both run before any account exists, only the
 * RESULT is gated behind signing up (or logging in). How that works:
 *
 * 1. On mount, silently sign in anonymously (see authStore.ensureAnonymous)
 *    if nobody's signed in yet — a real Firebase user, no form, so
 *    /analyze-chords (which requires a valid token like every other
 *    route) works exactly as it does inside the app, same quota system,
 *    same everything, zero backend changes.
 * 2. Drop a file, hit Analyse — ChordDetector.jsx (the same component the
 *    in-app Chords tab uses, unmodified apart from the optional
 *    onAnalysisResult/initialAnalysis props) runs the real request.
 * 3. If the signed-in user is still anonymous once a result exists,
 *    ChordAuthGate covers the ENTIRE page (not just this card) with a
 *    login/signup prompt — "still free," not "pay to see it."
 * 4. Signing up links the anonymous session to the new real account IN
 *    PLACE (same uid — see authStore.claimWithEmail/claimWithGoogle), so
 *    the quota already spent under the anonymous session carries over.
 *    Either way (new account via linking, or logging into an existing
 *    returning one — a genuinely different uid), the browser then
 *    navigates into the actual app instead of revealing the result on
 *    this marketing page: the result JSON is stashed client-side (see
 *    lib/chordHandoff.js — there's no server-side "job" to fetch by id,
 *    chord analysis has never been persisted) and the in-app Chords tab
 *    picks it up on landing. The raw audio file can't survive a real
 *    page navigation, only the parsed result can — so the destination
 *    shows the key/BPM/chord progression, without the live-playback
 *    highlighting a same-session result gets.
 */
export default function PublicChordDetector() {
  const { t } = useLanguage();
  const router = useRouter();
  const { user, loading } = useAuthStore();
  const fetchEntitlements = useEntitlementsStore((s) => s.fetch);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      useAuthStore.getState().ensureAnonymous();
      return;
    }
    fetchEntitlements();
  }, [loading, user, fetchEntitlements]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return undefined;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const showGate = Boolean(result) && user?.isAnonymous;
  const ready = !loading && Boolean(user);

  return (
    <div className="relative">
      <FileDropzone
        id="publicChordFileInput"
        fileName={file?.name}
        onChange={(event) => {
          setResult(null);
          setFile(event.target.files?.[0] || null);
        }}
        onRemove={() => {
          setResult(null);
          setFile(null);
        }}
      />

      <div className="mt-4">
        {ready ? (
          <ChordDetector file={file} previewUrl={previewUrl} onAnalysisResult={setResult} />
        ) : (
          <p className="mt-3 text-xs text-zinc-500">{t("chordDetector.preparingUpload")}</p>
        )}
      </div>

      {showGate ? (
        <ChordAuthGate
          onDone={() => {
            stashPendingChordResult(result, file?.name);
            router.push("/app?tab=chords");
          }}
        />
      ) : null}
    </div>
  );
}
