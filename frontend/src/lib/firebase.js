"use client";

import { initializeApp, getApps } from "firebase/app";
import { initializeAuth, getAuth, browserSessionPersistence, browserPopupRedirectResolver, GoogleAuthProvider } from "firebase/auth";
import { getRemoteConfig, fetchAndActivate, getValue } from "firebase/remote-config";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Firebase Auth is browser-only — it relies on window/localStorage for
// session persistence. Next.js still server-renders "use client" modules
// for the initial HTML/static generation pass, so calling initializeApp()/
// getAuth() eagerly at module-load time crashes the entire build the
// moment this file is imported anywhere, server-side, real credentials or
// not. Lazy-init behind a browser check instead — nothing in this module
// touches Firebase until something in an actual browser calls one of
// these functions.
function isBrowser() {
  return typeof window !== "undefined";
}

// A missing/placeholder API key isn't a "try and catch the failure" case —
// getAuth() kicks off async internal work (checking for a pending redirect
// sign-in, initializing its popup resolver) that rejects with an
// unhandled promise rejection when the key is bad, which no try/catch
// around the call site can catch, and which Next.js's error boundary
// treats as fatal — it took down the *public landing page* over this
// before this check existed. So: don't call any Firebase API at all until
// there's a real-looking key. isConfigured() is the thing to check before
// touching Firebase anywhere in this app.
export function isFirebaseConfigured() {
  return Boolean(firebaseConfig.apiKey);
}

let _app = null;
let _auth = null;
let _googleProvider = null;

export function getFirebaseAuth() {
  if (!isBrowser() || !isFirebaseConfigured()) return null;
  if (!_app) {
    _app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  }
  if (!_auth) {
    // Session persistence is a deliberate architecture choice, not the
    // SDK default. getAuth() defaults to browserLocalPersistence
    // (IndexedDB): a signed-in session survives browser restarts and
    // redeploys indefinitely, silently refreshing its token forever —
    // which made "click Log in" auto-enter the app with no credentials
    // even days later, undermining the session limits this app
    // deliberately enforces everywhere else (requireAuth.js's absolute
    // sessionMaxAgeDays + sessionInactivityHours caps, AuthInit.jsx's
    // client-side 24h idle logout). browserSessionPersistence scopes the
    // session to the current tab: close it and the sign-in is gone,
    // reopen the app and credentials are required again — consistent
    // with the strict-session posture the rest of the stack already has.
    //
    // initializeAuth (not getAuth + setPersistence) on purpose: it makes
    // this auth instance never even READ the old IndexedDB layer, so
    // sessions persisted under the previous default are simply not
    // resumed — the fix applies to existing browsers on their next
    // visit, not only to sign-ins that happen after it shipped.
    // popupRedirectResolver must be passed explicitly with initializeAuth
    // (getAuth bundled it implicitly) or signInWithPopup — the Google
    // button — throws at call time.
    try {
      _auth = initializeAuth(_app, {
        persistence: browserSessionPersistence,
        popupRedirectResolver: browserPopupRedirectResolver,
      });
    } catch {
      // initializeAuth throws if some other code path already created an
      // auth instance for this app (it's create-only) — fall back to
      // returning that instance rather than crashing sign-in outright.
      _auth = getAuth(_app);
    }
  }
  return _auth;
}

export function getGoogleProvider() {
  if (!isBrowser() || !isFirebaseConfigured()) return null;
  if (!_googleProvider) {
    _googleProvider = new GoogleAuthProvider();
  }
  return _googleProvider;
}

let _remoteConfig = null;

// Two Remote Config parameters back the top-of-app announcement banner
// (TopBanner.jsx) — siteConfig (Boolean, on/off) and appBanner (String,
// the message) — both edited straight in Firebase console → Remote
// Config, no redeploy needed. Fetched client-side (not through
// backend-node) since Remote Config is designed to be consumed by the
// client SDK directly, with its own built-in fetch caching —
// minimumFetchIntervalMillis below is that cache window, not a
// hand-rolled one.
export async function getAppBannerConfig() {
  const fallback = { enabled: false, message: "" };
  if (!isBrowser() || !isFirebaseConfigured()) return fallback;
  if (!_app) {
    _app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  }
  if (!_remoteConfig) {
    _remoteConfig = getRemoteConfig(_app);
    _remoteConfig.settings.minimumFetchIntervalMillis = 5 * 60 * 1000;
    _remoteConfig.defaultConfig = { siteConfig: false, appBanner: "" };
  }
  try {
    await fetchAndActivate(_remoteConfig);
  } catch {
    // Network hiccup, or the project has no Remote Config template
    // published yet — fall back to defaults rather than block the app
    // shell on this.
  }
  return {
    enabled: getValue(_remoteConfig, "siteConfig").asBoolean(),
    message: getValue(_remoteConfig, "appBanner").asString(),
  };
}
