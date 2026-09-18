"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { useLanguage } from "@/lib/i18n";

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
  const { t } = useLanguage();
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
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border-subtle bg-bg px-4 py-4 sm:px-6">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <p className="m-0 text-xs text-text-secondary sm:text-sm">
          {t("cookie.body")}{" "}
          <Link href="/privacy" className="text-text-primary underline decoration-border-subtle underline-offset-4 hover:text-accent">
            {t("cookie.privacyLink")}
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => choose("declined")}
            className="rounded-full border border-border-subtle px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-primary hover:border-text-primary/40"
          >
            {t("cookie.decline")}
          </button>
          <button
            type="button"
            onClick={() => choose("accepted")}
            className="rounded-full bg-text-primary px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-bg hover:opacity-85"
          >
            {t("cookie.accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
