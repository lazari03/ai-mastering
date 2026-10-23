"use client";

import { initializeApp, getApps } from "firebase/app";
import { initializeAuth, getAuth, indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence, browserPopupRedirectResolver, GoogleAuthProvider } from "firebase/auth";

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
    // Browser-wide persistence: one sign-in covers every tab of this
    // browser and survives a reload or restart. It used to be
    // browserSessionPersistence (per TAB), which logged people out
    // whenever they opened the app in a new tab: a duplicated tab copies
    // sessionStorage, a fresh one does not, hence "sometimes".
    //
    // How long a session lasts is NOT decided here. It is enforced by
    // requireAuth.js (absolute sessionMaxAgeDays + sessionInactivityHours,
    // checked on every request) and AuthInit.jsx's client-side 24h idle
    // logout, which already shares its clock across tabs via localStorage.
    // Persistence only decides whether a still-valid session is visible
    // to the user's other tabs, and it should be.
    //
    // Firebase uses the first available entry (IndexedDB, else
    // localStorage) and MIGRATES a user found in a later one up to it, so
    // anyone signed in under the old per-tab persistence keeps their
    // session through this deploy instead of being logged out.
    // popupRedirectResolver must be passed explicitly with initializeAuth
    // (getAuth bundled it implicitly) or signInWithPopup — the Google
    // button — throws at call time.
    try {
      _auth = initializeAuth(_app, {
        persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
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
