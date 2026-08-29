"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";

import NewsletterWidget from "./NewsletterWidget";
import { useLanguage } from "@/lib/i18n";
import { getStoredConsent } from "@/components/CookieBanner";

const DISMISSED_KEY = "promo_popup_dismissed_at";
const SUBSCRIBED_KEY = "promo_popup_subscribed";
// A dismiss earns a long break, not a retry-tomorrow — this is a quiet
// corner card, not a growth-hack, and re-nagging someone who already said
// no is exactly the "bothering users" failure mode to avoid.
const COOLDOWN_MS = 30 * 24 * 3600 * 1000;
// Scroll-depth trigger (mobile has no exit-intent) — 60% is "genuinely
// reading this page," not "glanced and bounced."
const SCROLL_TRIGGER_RATIO = 0.6;

const EXCLUDED_PREFIXES = ["/app", "/login", "/newsletter", "/shared"];

function isEligiblePath(pathname) {
  return !EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function readLocal(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Unavailable — degrades to "may ask again this same visit," not a
    // crash, same fallback shape as CookieBanner's own storage calls.
  }
}

/**
 * A quiet, non-blocking corner card (not a full-screen modal) offering the
 * newsletter's 10%-off code — wraps the existing NewsletterWidget, no new
 * subscribe logic. Deliberately earned, not forced:
 *  - Triggered by an actual engagement signal (exit-intent on desktop,
 *    scroll depth on mobile), never a blind timer that fires whether or
 *    not anyone's actually reading.
 *  - Once per visitor, ever, once they subscribe (SUBSCRIBED_KEY) — never
 *    shown again on this device.
 *  - A dismiss without subscribing earns a 30-day break, not a retry
 *    tomorrow.
 *  - Gated behind cookie consent already being resolved, so it's never
 *    two asks stacked on a new visitor at once.
 */
export default function PromoPopup() {
  const { t } = useLanguage();
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [consentTick, setConsentTick] = useState(0);
  const triggeredRef = useRef(false);

  useEffect(() => {
    const bump = () => setConsentTick((n) => n + 1);
    window.addEventListener("cookie-consent-changed", bump);
    return () => window.removeEventListener("cookie-consent-changed", bump);
  }, []);

  useEffect(() => {
    triggeredRef.current = false;
    if (!isEligiblePath(pathname)) return undefined;
    if (readLocal(SUBSCRIBED_KEY)) return undefined;
    if (!getStoredConsent()) return undefined;

    const dismissedAt = Number(readLocal(DISMISSED_KEY)) || null;
    if (dismissedAt && Date.now() - dismissedAt < COOLDOWN_MS) return undefined;

    const trigger = () => {
      if (triggeredRef.current) return;
      triggeredRef.current = true;
      setShow(true);
    };

    // Desktop: the mouse leaving toward the browser chrome (tab bar,
    // back button, closing) — the closest thing to "about to leave" a
    // page actually gets, without invasive tracking.
    const onMouseLeave = (event) => {
      if (event.clientY <= 0) trigger();
    };
    // Mobile/fallback: real scroll engagement instead.
    const onScroll = () => {
      const scrolled = window.scrollY + window.innerHeight;
      const total = document.documentElement.scrollHeight || 1;
      if (scrolled / total >= SCROLL_TRIGGER_RATIO) trigger();
    };

    document.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("scroll", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, consentTick]);

  const dismiss = () => {
    setShow(false);
    writeLocal(DISMISSED_KEY, String(Date.now()));
  };

  const handleSubscribed = () => {
    writeLocal(SUBSCRIBED_KEY, "1");
  };

  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="fixed inset-x-3 bottom-3 z-50 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:max-w-sm"
        >
          <div className="glass-panel relative rounded-2xl border border-brass/25 p-4 sm:p-5">
            <button
              type="button"
              onClick={dismiss}
              aria-label={t("newsletter.dismiss")}
              className="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300"
            >
              ✕
            </button>
            <p className="m-0 pr-5 text-sm font-bold text-white">{t("newsletter.popup.title")}</p>
            <p className="mt-1 text-xs text-zinc-400">{t("newsletter.popup.body")}</p>
            <div className="mt-3">
              <NewsletterWidget source="popup" size="sm" onSubscribed={handleSubscribed} />
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
