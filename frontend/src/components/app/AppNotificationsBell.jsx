"use client";

import { useEffect, useRef, useState } from "react";

import { useMasteringStore } from "@/store/masteringStore";
import { useLanguage } from "@/lib/i18n";
import { IconBell } from "@/components/app/icons";

// A real bell, not a decorative icon — reuses the exact same mastering-job
// state NotificationBanner.jsx already tracks (isSubmitting/result/error)
// rather than a separate fabricated notification feed. There's no
// persistent server-side notification history for end users (only the
// admin dashboard has that, see adminNotificationService.js) — this is
// deliberately scoped to what's actually real: the current render's status.
export default function AppNotificationsBell({ onViewResult }) {
  const { t } = useLanguage();
  const { isSubmitting, result, error } = useMasteringStore();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const hasActivity = Boolean(isSubmitting || result || error);

  useEffect(() => {
    const onClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("app.tab.help")}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:bg-black/[0.04] hover:text-text-primary"
      >
        <IconBell />
        {hasActivity ? <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" /> : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-72 overflow-hidden rounded-xl border border-border-subtle bg-bg shadow-[0_12px_32px_rgba(0,0,0,0.08)]">
          {isSubmitting ? (
            <p className="px-4 py-3 text-sm text-text-primary">{t("notif.inProgress")}</p>
          ) : error ? (
            <p className="px-4 py-3 text-sm text-text-primary">{t("notif.failed")}</p>
          ) : result ? (
            <button
              type="button"
              onClick={() => {
                onViewResult();
                setOpen(false);
              }}
              className="block w-full px-4 py-3 text-left text-sm text-text-primary hover:bg-black/[0.03]"
            >
              {t("notif.masterReady")}
            </button>
          ) : (
            <p className="px-4 py-3 text-sm text-text-secondary">{t("app.home.noNotifications")}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
