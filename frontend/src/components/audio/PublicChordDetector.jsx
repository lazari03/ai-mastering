"use client";

import { useEffect, useState } from "react";

import ChordDetector from "./ChordDetector";
import ChordAuthGate from "./ChordAuthGate";
import FileDropzone from "@/components/ui/FileDropzone";
import { useAuthStore } from "@/store/authStore";
import { useEntitlementsStore } from "@/store/entitlementsStore";
import { trackEvent } from "@/lib/analytics";
import { useLanguage } from "@/lib/i18n";

/**
 * The public chord detector on /chord-detector (also the Key and BPM
 * finders). Analysis needs a registered account: anonymous sign-in is off,
 * so a signed-out visitor (or a leftover anonymous session) who hits
 * Analyse gets ChordAuthGate first. Signing up or logging in closes the
 * gate and leaves the file selected, so the next Analyse click runs it
 * here. ChordDetector.jsx is the same component the in-app Chords tab uses.
 */
export default function PublicChordDetector({ focus = "chords", sourceTool = "chord_detector" }) {
  const { t } = useLanguage();
  const { user, loading } = useAuthStore();
  const fetchEntitlements = useEntitlementsStore((s) => s.fetch);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [, setResult] = useState(null);
  const [showGate, setShowGate] = useState(false);
  const registered = Boolean(user) && !user.isAnonymous;

  useEffect(() => {
    trackEvent("free_tool_opened", { source_tool: sourceTool });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading || !registered) return;
    fetchEntitlements();
  }, [loading, registered, fetchEntitlements]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return undefined;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const ready = !loading;
  const requireAccount = () => {
    if (registered) return true;
    setShowGate(true);
    return false;
  };

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
          <ChordDetector file={file} previewUrl={previewUrl} onAnalysisResult={setResult} focus={focus} sourceTool={sourceTool} beforeDetect={requireAccount} />
        ) : (
          <p className="mt-3 text-xs text-text-secondary">{t("chordDetector.preparingUpload")}</p>
        )}
      </div>

      {showGate ? (
        <ChordAuthGate
          eyebrowKey="toolGate.eyebrow"
          titleKey="toolGate.title"
          bodyKey="toolGate.body"
          onClose={() => setShowGate(false)}
          onDone={() => setShowGate(false)}
        />
      ) : null}
    </div>
  );
}
