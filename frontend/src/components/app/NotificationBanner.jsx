"use client";

import { useEffect, useRef, useState } from "react";

import { useMasteringStore } from "@/store/masteringStore";

// Lives in the app shell (not inside MasteringConsole) so it survives
// switching to Show Chords/etc while a render is in flight —
// masteringStore's isSubmitting/result state is global already, but the
// detailed progress UI is local to MasteringConsole and disappears the
// moment that tab unmounts. This is the persistent, tab-agnostic version.
//
// Honest scope: this covers "left the tab" (switched to another in-app
// section, or the browser tab is open but backgrounded) via the
// Notification API. It does NOT cover the browser tab being fully closed —
// /master is a single long-blocking request, so closing the tab genuinely
// kills it client-side. Real closed-tab notification needs a job queue +
// Web Push (service worker, VAPID keys) — a separate, bigger piece of work.
export default function NotificationBanner({ activeTab, onView }) {
  const { isSubmitting, result, error } = useMasteringStore();
  const [dismissed, setDismissed] = useState(false);
  const wasSubmitting = useRef(false);
  const notifiedJobId = useRef(null);

  useEffect(() => {
    if (isSubmitting && typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
    wasSubmitting.current = isSubmitting;
  }, [isSubmitting]);

  useEffect(() => {
    if (!result?.job_id || result.job_id === notifiedJobId.current) return;
    notifiedJobId.current = result.job_id;
    setDismissed(false);

    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("Your master is ready", {
        body: `${result.before_lufs} LUFS → ${result.after_lufs} LUFS`,
        tag: result.job_id,
      });
    }
  }, [result]);

  if (activeTab === "master" || dismissed) return null;
  if (!isSubmitting && !result && !error) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:max-w-sm">
      <div className="glass-panel flex items-start gap-3 rounded-2xl border border-white/10 p-4">
        {isSubmitting ? (
          <>
            <span className="mt-0.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-brass" />
            <div className="min-w-0 flex-1">
              <p className="m-0 text-sm font-semibold text-white">Mastering in progress…</p>
              <p className="mt-0.5 text-xs text-zinc-400">This can take a minute or two.</p>
            </div>
          </>
        ) : error ? (
          <>
            <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-red-400" />
            <div className="min-w-0 flex-1">
              <p className="m-0 text-sm font-semibold text-white">Mastering failed</p>
              <p className="mt-0.5 truncate text-xs text-zinc-400">{error}</p>
            </div>
          </>
        ) : (
          <>
            <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-ember" />
            <div className="min-w-0 flex-1">
              <p className="m-0 text-sm font-semibold text-white">Your master is ready</p>
              <button
                type="button"
                onClick={() => {
                  onView();
                  setDismissed(true);
                }}
                className="mt-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-brass hover:text-ember"
              >
                View result →
              </button>
            </div>
          </>
        )}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="shrink-0 text-zinc-500 hover:text-zinc-300"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
