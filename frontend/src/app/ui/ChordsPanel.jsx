"use client";

import { useEffect, useState } from "react";

import ChordDetector from "@/components/audio/ChordDetector";

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
    <section className="mx-auto grid w-full max-w-4xl gap-4">
      <article className="glass-panel reveal rounded-3xl p-4 sm:p-6 md:p-8">
        <h1 className="font-[var(--font-title)] text-2xl">Show Chords</h1>
        <p className="mt-2 text-sm text-zinc-300">Detect BPM, key, and chords, then play along in sync.</p>

        <label className="mt-5 block space-y-2">
          <span className="block text-xs uppercase tracking-[0.18em] text-zinc-300">Audio File</span>
          <input
            type="file"
            accept="audio/*"
            className="block w-full rounded-xl border border-white/15 bg-black/20 p-3 text-sm"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
          <span className="mt-2 block break-all text-xs text-zinc-400">{file ? file.name : "No file selected"}</span>
        </label>

        <div className="mt-4">
          <ChordDetector file={file} previewUrl={previewUrl} />
        </div>
      </article>
    </section>
  );
}
