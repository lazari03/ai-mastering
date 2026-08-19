export default function FileDropzone({ id, label, fileName, onChange, onRemove, accept = "audio/*", compact = false }) {
  const selected = Boolean(fileName);

  return (
    <div
      className={`rounded-2xl border text-center transition ${
        selected ? "border-brass/40 bg-brass/[0.06]" : "border-dashed border-white/20 bg-black/[0.15]"
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
              {selected ? "Selected — click to replace" : "Drop an audio file, or click to browse"}
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
