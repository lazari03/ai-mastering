"use client";

import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

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

let _app = null;
let _auth = null;
let _googleProvider = null;

export function getFirebaseAuth() {
  if (!isBrowser()) return null;
  if (!_app) {
    _app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  }
  if (!_auth) {
    _auth = getAuth(_app);
  }
  return _auth;
}

export function getGoogleProvider() {
  if (!isBrowser()) return null;
  if (!_googleProvider) {
    _googleProvider = new GoogleAuthProvider();
  }
  return _googleProvider;
}
