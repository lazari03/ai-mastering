"use client";

import { useEffect } from "react";

import { useAuthStore } from "@/store/authStore";
import { getFirebaseAuth } from "@/lib/firebase";

// Subscribes to Firebase's auth state once, globally, for the whole app —
// mounted in the root layout so every page (including the public landing
// page) knows whether someone's signed in without each one re-subscribing.
// Also runs the client-side half of the 24h-inactivity session cap (the
// authoritative half lives server-side, requireAuth.js's lastActiveAt
// check — that's what actually blocks a stale token from working again;
// this half exists so being idle doesn't just get *quietly* rejected on
// whatever request happens next, it signs out and redirects right at the
// 24h mark, tab open or not, matching "logged out immediately" rather
// than "logged out, discovered next time you try to do something."
// Renders nothing itself.

const LAST_ACTIVITY_KEY = "lastActivityAt";
const INACTIVITY_MS = 24 * 3600 * 1000;
// How often the idle check runs — 60s means "logged out immediately" is
// accurate to within a minute, not to the millisecond; that's the right
// tradeoff here; a tighter interval buys nothing a user would notice.
const CHECK_INTERVAL_MS = 60 * 1000;
// Real interaction, not every DOM event — deliberately excludes things
// like scroll-by-inertia or a stray mousemove from a window manager
// animation counting as "the user is here."
const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "wheel"];

function recordActivity() {
  try {
    window.localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  } catch {
    // localStorage unavailable (private mode, etc.) — the server-side
    // check (requireAuth.js's lastActiveAt) is still the real backstop;
    // this client-side timer just won't fire early in that case.
  }
}

function getLastActivity() {
  try {
    const raw = window.localStorage.getItem(LAST_ACTIVITY_KEY);
    return raw ? Number(raw) : Date.now();
  } catch {
    return Date.now();
  }
}

export default function AuthInit() {
  useEffect(() => {
    const unsubscribe = useAuthStore.getState().init();
    return unsubscribe;
  }, []);

  useEffect(() => {
    // Stored per-browser (localStorage), not per-tab, and read fresh on
    // every check — this is what makes the 24h clock survive a reload or
    // the tab being closed and reopened, instead of resetting to "just
    // now" every time this component remounts.
    if (!window.localStorage.getItem(LAST_ACTIVITY_KEY)) recordActivity();

    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, recordActivity, { passive: true }));
    // Reopening/refocusing the tab counts as activity too — otherwise a
    // tab backgrounded for days, then brought back and immediately used,
    // could still get logged out on its very first interaction because
    // the stored timestamp predates that interaction being recorded.
    document.addEventListener("visibilitychange", recordActivity);

    const checkIdle = () => {
      const user = useAuthStore.getState().user;
      if (!user) return;
      const idleMs = Date.now() - getLastActivity();
      if (idleMs < INACTIVITY_MS) return;
      getFirebaseAuth()
        ?.signOut()
        .finally(() => {
          window.location.href = "/login?reason=session_expired";
        });
    };
    const intervalId = window.setInterval(checkIdle, CHECK_INTERVAL_MS);
    // Also right away on mount — covers the tab having been closed (or
    // the laptop asleep) for well over 24h and just reopened; without
    // this, that case would otherwise wait a full minute for the first
    // interval tick before signing out.
    checkIdle();

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, recordActivity));
      document.removeEventListener("visibilitychange", recordActivity);
      window.clearInterval(intervalId);
    };
  }, []);

  return null;
}
