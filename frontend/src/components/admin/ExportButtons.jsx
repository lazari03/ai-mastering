"use client";

import { useState } from "react";

import { downloadAdminExport } from "@/network/http/client";
import { Spinner } from "@/components/ui/Spinner";

/**
 * "Export CSV" / "Export PDF" buttons for an admin report — reuses the
 * exact same date-range/filter params the page already fetches its JSON
 * data with, just adds format=csv|pdf. See analyticsRoutes.js's
 * sendExport() for the matching backend half.
 */
export default function ExportButtons({ path, params = {} }) {
  const [busy, setBusy] = useState(""); // "" | "csv" | "pdf"
  const [error, setError] = useState("");

  const doExport = async (format) => {
    setBusy(format);
    setError("");
    try {
      await downloadAdminExport("/analytics/admin", path, { ...params, format });
    } catch (err) {
      setError(err?.message || "Export failed.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => doExport("csv")}
        disabled={Boolean(busy)}
        className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/20 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-300 transition hover:border-white/30 disabled:opacity-50"
      >
        {busy === "csv" ? <Spinner size={11} /> : null} Export CSV
      </button>
      <button
        type="button"
        onClick={() => doExport("pdf")}
        disabled={Boolean(busy)}
        className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/20 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-300 transition hover:border-white/30 disabled:opacity-50"
      >
        {busy === "pdf" ? <Spinner size={11} /> : null} Export PDF
      </button>
      {error ? <span className="text-[11px] text-red-300">{error}</span> : null}
    </div>
  );
}
