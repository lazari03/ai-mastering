export default function FileDropzone({ id, label, fileName, onChange, accept = "audio/*", compact = false }) {
  return (
    <div
      className={`rounded-2xl border border-dashed border-white/20 bg-black/[0.15] text-center ${compact ? "p-[18px]" : "p-7"}`}
    >
      <input id={id} type="file" accept={accept} onChange={onChange} className="hidden" />
      {compact ? (
        <label htmlFor={id} className="block cursor-pointer">
          <span className="block text-xs font-semibold text-white">{label}</span>
          <span className="mt-1.5 block break-all text-[11px] text-zinc-400">{fileName || "No file selected"}</span>
        </label>
      ) : (
        <label htmlFor={id} className="inline-flex cursor-pointer flex-col items-center gap-2.5">
          <span
            className="flex h-11 w-11 items-center justify-center rounded-full text-xl"
            style={{ background: "rgba(232,93,42,.15)", border: "1px solid rgba(232,93,42,.4)", color: "var(--ember)" }}
          >
            ↑
          </span>
          <span className="text-[13px] font-semibold text-white">Drop an audio file, or click to browse</span>
          <span className="break-all text-xs text-zinc-400">{fileName || "No file selected"}</span>
        </label>
      )}
    </div>
  );
}
