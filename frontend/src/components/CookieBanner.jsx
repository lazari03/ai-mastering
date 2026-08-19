"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export const CONSENT_KEY = "cookie_consent"; // "accepted" | "declined"

// Actually gates something real — Analytics.jsx below only loads the
// Plausible script once this is "accepted", it isn't just a decorative
// banner that shows once and does nothing.
export function getStoredConsent() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CONSENT_KEY);
  } catch {
    return null;
  }
}

export default function CookieBanner() {
  const [consent, setConsent] = useState(null);

  useEffect(() => {
    setConsent(getStoredConsent());
  }, []);

  const choose = (value) => {
    try {
      window.localStorage.setItem(CONSENT_KEY, value);
    } catch {
      // localStorage unavailable (private mode, etc.) — the banner still
      // dismisses for this session, it just re-asks next visit.
    }
    setConsent(value);
    // Analytics.jsx listens for this to start/skip loading immediately,
    // without needing a full page reload after the choice.
    window.dispatchEvent(new Event("cookie-consent-changed"));
  };

  if (consent) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#0b0d10]/95 px-4 py-4 backdrop-blur-md sm:px-6">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <p className="m-0 text-xs text-zinc-300 sm:text-sm">
          We use local storage to keep you signed in and, if you allow it, privacy-friendly analytics with no
          tracking cookies. See our{" "}
          <Link href="/privacy" className="text-brass hover:text-ember">
            Privacy Policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => choose("declined")}
            className="rounded-full border border-white/20 bg-black/20 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-200 hover:border-white/35"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => choose("accepted")}
            className="rounded-full bg-ember px-4 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[#100b08] hover:brightness-110"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
