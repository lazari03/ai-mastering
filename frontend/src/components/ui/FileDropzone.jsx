"use client";

import { useState } from "react";

export default function FileDropzone({ id, label, fileName, onChange, onRemove, accept = "audio/*", compact = false }) {
  const selected = Boolean(fileName);
  // True while a file is being dragged over the zone — drives the visual
  // "yes, you can drop here" affordance. dragenter/dragleave fire on every
  // child crossing, so a depth counter (not a boolean) is what keeps the
  // highlight from flickering as the cursor moves across inner elements.
  const [dragDepth, setDragDepth] = useState(0);
  const dragging = dragDepth > 0;

  // The copy on this component has always said "Drop an audio file" — this
  // makes that actually true. The dropped file is handed to the same
  // onChange callers already pass (they read event.target.files), so no
  // call-site changes anywhere.
  const handleDrop = (event) => {
    event.preventDefault();
    setDragDepth(0);
    const files = event.dataTransfer?.files;
    if (files?.length) {
      onChange({ target: { files } });
    }
  };

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        setDragDepth((d) => d + 1);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragDepth((d) => Math.max(0, d - 1));
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      className={`rounded-2xl border text-center transition ${
        dragging
          ? "border-ember bg-ember/[0.08] shadow-[0_0_20px_rgba(232,93,42,0.25)]"
          : selected
            ? "border-brass/40 bg-brass/[0.06]"
            : "border-dashed border-white/20 bg-black/[0.15]"
      } ${compact ? "p-[18px]" : "p-7"}`}
    >
      <input
        id={id}
        type="file"
        accept={accept}
        // Clearing the value before opening the picker means re-choosing
        // the SAME file still fires onChange — without this a user can't
        // pick the identical file again after removing it.
        onClick={(event) => {
          event.currentTarget.value = "";
        }}
        onChange={onChange}
        className="hidden"
      />
      {compact ? (
        <div className="flex items-center gap-2">
          <label htmlFor={id} className="block min-w-0 flex-1 cursor-pointer">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
              {selected ? <span className="text-brass">✓</span> : null}
              {label}
            </span>
            <span className="mt-1.5 block truncate text-[11px] text-zinc-400">{fileName || "No file selected"}</span>
          </label>
          {selected && onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${label}`}
              className="shrink-0 rounded-full border border-white/15 bg-black/30 px-2 py-1 text-xs text-zinc-300 hover:border-red-400/50 hover:text-red-300"
            >
              ✕
            </button>
          ) : null}
        </div>
      ) : (
        <div className="inline-flex flex-col items-center gap-2.5">
          <label htmlFor={id} className="inline-flex cursor-pointer flex-col items-center gap-2.5">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-full text-xl"
              style={{ background: "rgba(232,93,42,.15)", border: "1px solid rgba(232,93,42,.4)", color: "var(--ember)" }}
            >
              {selected ? "✓" : "↑"}
            </span>
            <span className="text-[13px] font-semibold text-white">
              {dragging ? "Drop it here" : selected ? "Selected — click to replace" : "Drop an audio file, or click to browse"}
            </span>
            <span className="break-all text-xs text-zinc-400">{fileName || "No file selected"}</span>
          </label>
          {selected && onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="rounded-full border border-white/15 bg-black/30 px-3 py-1 text-[11px] uppercase tracking-[0.1em] text-zinc-300 hover:border-red-400/50 hover:text-red-300"
            >
              Remove
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
