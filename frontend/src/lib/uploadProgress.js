import { formatMb } from "@/lib/format";

// Button/status text for a free tool while its file is in flight: real
// upload progress while bytes are still going up (the slow part on mobile
// data), then the tool's own "Analyzing…" once the server has the file.
export function uploadStatusText(t, progress, analyzingText) {
  if (!progress?.total || progress.done || progress.loaded >= progress.total) return analyzingText;
  return t("upload.progress", {
    pct: Math.round((progress.loaded / progress.total) * 100),
    loaded: formatMb(progress.loaded),
    total: formatMb(progress.total),
  });
}
