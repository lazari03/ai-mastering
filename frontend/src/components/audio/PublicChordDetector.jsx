"use client";

import { useEffect, useState } from "react";

import ChordDetector from "./ChordDetector";
import ChordAuthGate from "./ChordAuthGate";
import FileDropzone from "@/components/ui/FileDropzone";
import { useAuthStore } from "@/store/authStore";
import { useEntitlementsStore } from "@/store/entitlementsStore";
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
 *    onAnalysisResult callback below) runs the real request.
 * 3. If the signed-in user is still anonymous once a result exists,
 *    ChordAuthGate covers the result with a login/signup prompt instead
 *    of hiding the request entirely — "still free," not "pay to see it."
 * 4. Signing up links the anonymous session to the new real account IN
 *    PLACE (same uid — see authStore.claimWithEmail/claimWithGoogle), so
 *    the result already sitting in ChordDetector's own React state is
 *    already "theirs" the instant the gate closes: no re-fetch, no
 *    server-side transfer, nothing to move (chord analysis has never
 *    been a persisted "job" the way mastering is — the result IS the
 *    response body, held client-side). Logging into an existing
 *    (returning) account instead switches the session to that real uid;
 *    the result stays visible exactly the same way, since it was never
 *    tied to the anonymous uid it was computed under in the first place.
 */
export default function PublicChordDetector() {
  const { t } = useLanguage();
  const { user, loading } = useAuthStore();
  const fetchEntitlements = useEntitlementsStore((s) => s.fetch);
  const refreshEntitlements = useEntitlementsStore((s) => s.refresh);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [hasResult, setHasResult] = useState(false);

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

  const showGate = hasResult && user?.isAnonymous;
  const ready = !loading && Boolean(user);

  return (
    <div className="relative">
      <FileDropzone
        id="publicChordFileInput"
        fileName={file?.name}
        onChange={(event) => {
          setHasResult(false);
          setFile(event.target.files?.[0] || null);
        }}
        onRemove={() => {
          setHasResult(false);
          setFile(null);
        }}
      />

      <div className="mt-4">
        {ready ? (
          <ChordDetector
            file={file}
            previewUrl={previewUrl}
            onAnalysisResult={() => setHasResult(true)}
          />
        ) : (
          <p className="mt-3 text-xs text-zinc-500">{t("chordDetector.preparingUpload")}</p>
        )}
      </div>

      {showGate ? (
        <ChordAuthGate
          onDone={() => {
            // Whatever plan/quota state existed under the anonymous uid
            // is gone the moment the session switches to a real account
            // (new or returning) — refresh so the result view's own
            // quota-aware copy (ChordDetector's button label, etc.)
            // reflects the real account immediately.
            refreshEntitlements();
          }}
        />
      ) : null}
    </div>
  );
}
