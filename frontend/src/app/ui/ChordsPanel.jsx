"use client";

import { useEffect, useState } from "react";

import ChordDetector from "@/components/audio/ChordDetector";
import FileDropzone from "@/components/ui/FileDropzone";

export default function ChordsPanel() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");

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
        <FileDropzone id="chordsFileInput" fileName={file?.name} onChange={(event) => setFile(event.target.files?.[0] || null)} />
      </div>

      <div className="mt-4">
        <ChordDetector file={file} previewUrl={previewUrl} />
      </div>
    </div>
  );
}
