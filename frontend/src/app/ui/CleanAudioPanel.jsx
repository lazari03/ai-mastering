"use client";

import { useEffect, useState } from "react";

import SignalVisualizer from "@/components/audio/SignalVisualizer";
import FileDropzone from "@/components/ui/FileDropzone";
import { postClean, toAuthedDownloadUrl, downloadFileSafely } from "@/network/http/client";

export default function CleanAudioPanel() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const submit = async () => {
    if (!file) return;
    setIsSubmitting(true);
    setError("");
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("output_format", "mp3");
      const response = await postClean(formData);
      setResult(response);
      setDownloadUrl(await toAuthedDownloadUrl(response.download_url));
    } catch (err) {
      setError(err?.message || "Cleanup failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[760px]">
      <h1 className="m-0 font-[var(--font-title)] text-[26px]">Clean Audio</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-300">
        Fix rough phone recordings: noise reduction, level compression, and loudness tuned for Instagram/Reels
        (-14 LUFS). Pitch is never touched.
      </p>

      <div className="mt-6">
        <FileDropzone
          id="cleanFileInput"
          fileName={file?.name}
          onChange={(event) => {
            setFile(event.target.files?.[0] || null);
            setResult(null);
            setDownloadUrl("");
          }}
          onRemove={() => {
            setFile(null);
            setResult(null);
            setDownloadUrl("");
          }}
        />
      </div>

      <div className="mt-4">
        {previewUrl ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="mb-2 text-xs uppercase tracking-[0.14em] text-zinc-400">Original</p>
            <SignalVisualizer src={previewUrl} />
          </div>
        ) : null}

        <button
          type="button"
          onClick={submit}
          disabled={!file || isSubmitting}
          className="mt-4 w-full rounded-xl bg-ember px-5 py-4 text-sm font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-brass disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Cleaning..." : "Clean Audio"}
        </button>

        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

        {result ? (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">Before LUFS</p>
                <p className="mt-1 text-lg font-semibold">{result.before_lufs}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">After LUFS</p>
                <p className="mt-1 text-lg font-semibold text-brass">{result.after_lufs}</p>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="mb-2 text-xs uppercase tracking-[0.14em] text-zinc-400">Cleaned Signal</p>
              <SignalVisualizer src={downloadUrl} barColor="#dfc95a" />
              <button
                type="button"
                onClick={async () => {
                  setDownloadError("");
                  setDownloading(true);
                  try {
                    await downloadFileSafely(downloadUrl, `cleaned.${result.download_url?.split(".").pop() || "mp3"}`);
                  } catch (err) {
                    setDownloadError(err?.message || "Download failed");
                  } finally {
                    setDownloading(false);
                  }
                }}
                disabled={downloading}
                className="mt-3 inline-flex w-full justify-center rounded-lg border border-brass/40 bg-brass/20 px-3 py-2 text-xs uppercase tracking-[0.14em] text-brass hover:bg-brass/30 disabled:opacity-50"
              >
                {downloading ? "Downloading…" : "Download Cleaned Audio"}
              </button>
              {downloadError ? <p className="mt-2 text-xs text-red-300">⚠ {downloadError}</p> : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
