"use client";

import { useEffect, useState } from "react";

import ChordDetector from "@/components/audio/ChordDetector";
import FileDropzone from "@/components/ui/FileDropzone";
import { useMasteringStore } from "@/store/masteringStore";
import { takePendingChordResult } from "@/lib/chordHandoff";
import { useLanguage } from "@/lib/i18n";

export default function ChordsPanel({ onOpenBilling, onMasterThisSong }) {
  const { t } = useLanguage();
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  // Landing here right after signing up/logging in from the public,
  // logged-out chord detector (/chord-detector) — see
  // PublicChordDetector.jsx's doc comment. Read once, synchronously, on
  // first render so ChordDetector below seeds from it immediately rather
  // than flashing its empty state first. No file/previewUrl to go with
  // it — a real page navigation happened in between, only the parsed
  // JSON result survives that, not the audio blob.
  const [handoff] = useState(() => (typeof window !== "undefined" ? takePendingChordResult() : null));
  // Hands the exact same File object already sitting in memory here over
  // to the Master tab's store, so "Master This Song" (ChordDetector.jsx)
  // never makes someone re-select the file they just uploaded — the
  // Master tab reads `file` from this same store (see MasteringConsole.jsx).
  const setMasteringFile = useMasteringStore((s) => s.setFile);

  const masterThisSong = () => {
    if (!file) return;
    setMasteringFile(file);
    onMasterThisSong?.();
  };

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <h1 className="m-0 font-[var(--font-title)] text-[26px]">{t("chordsPanel.title")}</h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-300">{t("chordsPanel.subtitle")}</p>

      {handoff ? (
        <p className="mt-4 rounded-xl border border-brass/30 bg-brass/[0.06] px-4 py-3 text-sm text-brass">
          {t("chordsPanel.handoffNote", { name: handoff.fileName || t("chordsPanel.handoffFallbackName") })}
        </p>
      ) : null}

      <div className="mt-6">
        <FileDropzone
          id="chordsFileInput"
          fileName={file?.name}
          onChange={(event) => setFile(event.target.files?.[0] || null)}
          onRemove={() => setFile(null)}
        />
      </div>

      <div className="mt-4">
        <ChordDetector
          file={file}
          previewUrl={previewUrl}
          onOpenBilling={onOpenBilling}
          onMasterThisSong={masterThisSong}
          initialAnalysis={handoff?.result || null}
        />
      </div>
    </div>
  );
}
