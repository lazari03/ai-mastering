"use client";

import { useState } from "react";

import SendToDesktop from "@/components/ui/SendToDesktop";
import { useCoarsePointer } from "@/lib/useCoarsePointer";

// Explicit extensions alongside the wildcard, not "audio/*" alone — the
// bare MIME wildcard is exactly what made .mp3 files unselectable
// (greyed out) in some OS file pickers: the picker filters on the OS's
// MIME registration for each file, and mp3's (audio/mpeg) is missing or
// misregistered often enough in the wild (notably on Windows) that the
// most common audio format failed the "audio picker"'s own filter.
// Extensions match by name, no MIME lookup involved, so listing them
// makes every named format selectable everywhere; the wildcard stays for
// anything audio-typed beyond the list.
const DEFAULT_ACCEPT = "audio/*,.mp3,.wav,.flac,.aiff,.aif,.m4a,.aac,.ogg,.opus,.wma";

// What the upload pipeline can decode (backend-node AUDIO_DECODE_EXTS plus
// the natively-read WAV/AIFF/FLAC). Drag-and-drop bypasses the picker's
// `accept` filter, so a dropped PDF or image would otherwise go all the way
// to the server before failing — it's caught here with a clear message.
const SUPPORTED_EXT = /\.(wav|wave|aiff?|flac|mp3|m4a|aac|ogg|oga|opus|wma|mp4|webm)$/i;
function isSupportedAudio(file) {
  if (!file) return true;
  if (SUPPORTED_EXT.test(file.name || "")) return true;
  return /^audio\//.test(file.type || "");
}

export default function FileDropzone({ id, label, fileName, onChange, onRemove, accept = DEFAULT_ACCEPT, compact = false }) {
  const selected = Boolean(fileName);
  // True while a file is being dragged over the zone — drives the visual
  // "yes, you can drop here" affordance. dragenter/dragleave fire on every
  // child crossing, so a depth counter (not a boolean) is what keeps the
  // highlight from flickering as the cursor moves across inner elements.
  const [dragDepth, setDragDepth] = useState(0);
  const dragging = dragDepth > 0;
  const [rejected, setRejected] = useState("");
  // Phones: no drag-and-drop, "click" is a tap, and the file is often not
  // on the device at all — the copy and help below follow that.
  const touch = useCoarsePointer();
  // Only read once `touch` is true, i.e. after mount — navigator exists.
  const ios = touch && /iPhone|iPad|iPod/.test(navigator.userAgent || "");

  // Every selection (picker or drop) goes through here: unsupported files
  // are stopped with an explanation instead of reaching the caller.
  const accept_ = (event) => {
    const file = event?.target?.files?.[0];
    if (file && !isSupportedAudio(file)) {
      setRejected(file.name || "file");
      return;
    }
    setRejected("");
    onChange(event);
  };

  // The copy on this component has always said "Drop an audio file" — this
  // makes that actually true. The dropped file is handed to the same
  // onChange callers already pass (they read event.target.files), so no
  // call-site changes anywhere.
  const handleDrop = (event) => {
    event.preventDefault();
    setDragDepth(0);
    const files = event.dataTransfer?.files;
    if (files?.length) {
      accept_({ target: { files } });
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
          ? "border-accent bg-accent/[0.08] shadow-[0_0_20px_rgba(130,117,255,0.2)]"
          : selected
            ? "border-border-subtle bg-black/[0.045]"
            : "border-dashed border-border-subtle bg-black/[0.02]"
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
        onChange={accept_}
        className="hidden"
      />
      {compact ? (
        <div className="flex items-center gap-2">
          <label htmlFor={id} className="block min-w-0 flex-1 cursor-pointer">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
              {selected ? <span className="text-accent">✓</span> : null}
              {label}
            </span>
            <span className="mt-1.5 block truncate text-[11px] text-text-secondary">{fileName || "No file selected"}</span>
          </label>
          {selected && onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${label}`}
              className="shrink-0 rounded-full border border-border-subtle bg-black/[0.045] px-2 py-1 text-xs text-text-secondary hover:border-red-400/50 hover:text-red-700"
            >
              ✕
            </button>
          ) : null}
        </div>
      ) : (
        <div className="inline-flex flex-col items-center gap-2.5">
          <label htmlFor={id} className="inline-flex cursor-pointer flex-col items-center gap-2.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-border-subtle bg-black/[0.045] text-xl text-text-primary">
              {selected ? "✓" : "↑"}
            </span>
            <span className="text-[13px] font-semibold text-text-primary">
              {dragging
                ? "Drop it here"
                : selected
                  ? `Selected — ${touch ? "tap" : "click"} to replace`
                  : touch
                    ? "Tap to choose an audio file"
                    : "Drop an audio file, or click to browse"}
            </span>
            <span className="break-all text-xs text-text-secondary">{fileName || "No file selected"}</span>
          </label>
          {selected && onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="rounded-full border border-border-subtle bg-black/[0.045] px-3 py-1 text-[11px] uppercase tracking-[0.1em] text-text-secondary hover:border-red-400/50 hover:text-red-700"
            >
              Remove
            </button>
          ) : null}
        </div>
      )}
      {touch && !compact && !selected ? (
        <div className="mt-4 flex flex-col items-center gap-2 border-t border-border-subtle pt-4">
          {ios ? (
            <p className="m-0 max-w-[36ch] text-[11px] leading-relaxed text-text-secondary">
              Recorded in Voice Memos? Tap Share → Save to Files, then choose it here.
            </p>
          ) : null}
          <SendToDesktop />
        </div>
      ) : null}
      {rejected ? (
        <p role="alert" className="mx-auto mt-3 max-w-[46ch] rounded-xl border border-red-600/25 bg-red-600/[0.05] px-3 py-2 text-left text-xs leading-relaxed text-red-800">
          <strong className="font-semibold">{rejected}</strong> isn&apos;t an audio file we can read. Use WAV, AIFF, FLAC, MP3, M4A, AAC, OGG,
          WMA, MP4 or WebM.
        </p>
      ) : null}
    </div>
  );
}
