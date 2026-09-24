"use client";

import { useState } from "react";

import { trackEvent } from "@/lib/analytics";

/**
 * "My track is on my computer" — most people browsing on a phone don't
 * have their mix on it. Hands this exact page to their other device via
 * the native share sheet (AirDrop, Messages, Mail to self), or copies the
 * link where there's no share sheet. The utm tag makes the return visit
 * countable.
 */
export default function SendToDesktop({ className = "" }) {
  const [copied, setCopied] = useState(false);

  const send = async () => {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("utm_source", "send_to_desktop");
    url.searchParams.set("utm_medium", "mobile");
    const link = url.toString();
    const method = navigator.share ? "share" : "copy";
    trackEvent("cta_click", { cta_id: "send_to_desktop", location: window.location.pathname, method });
    if (navigator.share) {
      try {
        await navigator.share({ title: "Auralith Forge", text: "Open on my computer to master my track", url: link });
      } catch {
        // dismissed the share sheet
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy this link", link);
    }
  };

  return (
    <button
      type="button"
      onClick={send}
      className={`inline-flex items-center gap-1.5 text-[12px] font-semibold text-text-primary underline decoration-black/20 underline-offset-4 ${className}`}
    >
      {copied ? "Link copied — open it on your computer" : "Track on your computer? Send this page there →"}
    </button>
  );
}
