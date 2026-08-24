"use client";

import { useEffect, useState } from "react";

import ChordDetector from "@/components/audio/ChordDetector";
import FileDropzone from "@/components/ui/FileDropzone";
import { useMasteringStore } from "@/store/masteringStore";

export default function ChordsPanel({ onOpenBilling, onMasterThisSong }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
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
    <div className="mx-auto w-full max-w-[760px]">
      <h1 className="m-0 font-[var(--font-title)] text-[26px]">Show Chords</h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-300">Detect BPM, key, and chords, then play along in sync.</p>

      <div className="mt-6">
        <FileDropzone
          id="chordsFileInput"
          fileName={file?.name}
          onChange={(event) => setFile(event.target.files?.[0] || null)}
          onRemove={() => setFile(null)}
        />
      </div>

      <div className="mt-4">
        <ChordDetector file={file} previewUrl={previewUrl} onOpenBilling={onOpenBilling} onMasterThisSong={masterThisSong} />
      </div>
    </div>
  );
}
