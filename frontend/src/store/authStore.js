import { create } from "zustand";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";

import { getFirebaseAuth, getGoogleProvider, isFirebaseConfigured } from "@/lib/firebase";

const NOT_CONFIGURED_MESSAGE = "Sign-in isn't set up yet — see FIREBASE_SETUP.md.";

function readableAuthError(error) {
  // Firebase's own messages are technically accurate but not what a user
  // should read ("Firebase: Error (auth/wrong-password).") — map the ones
  // people actually hit to plain language, fall back to the raw message
  // for anything unmapped rather than hiding it.
  const map = {
    "auth/invalid-email": "That doesn't look like a valid email address.",
    "auth/user-not-found": "No account with that email — sign up instead?",
    "auth/wrong-password": "Wrong password.",
    "auth/invalid-credential": "Wrong email or password.",
    "auth/email-already-in-use": "An account with that email already exists — sign in instead?",
    "auth/weak-password": "Password needs to be at least 6 characters.",
    "auth/popup-closed-by-user": "Sign-in was cancelled.",
    "auth/network-request-failed": "Network error — check your connection and try again.",
  };
  return map[error?.code] || error?.message || "Something went wrong signing in.";
}

export const useAuthStore = create((set) => ({
  user: null,
  // True until the very first onAuthStateChanged callback fires — Firebase
  // checks a persisted session asynchronously on load, so without this the
  // UI would flash "logged out" for a moment even for an already-signed-in
  // user on every page load.
  loading: true,
  error: "",
  busy: false,

  init() {
    if (!isFirebaseConfigured()) {
      // No real project yet (see FIREBASE_SETUP.md) — stay logged-out
      // rather than touch any Firebase API. Calling getAuth() with a
      // placeholder/empty key kicks off async internal work (checking for
      // a pending redirect sign-in) that throws an unhandled promise
      // rejection no try/catch here can reach, which crashes the whole
      // app via Next's error boundary — including the public landing
      // page, which doesn't even use auth. Checking first avoids that
      // entirely instead of trying to catch every way it can fail.
      console.warn(NOT_CONFIGURED_MESSAGE);
      set({ loading: false });
      return () => {};
    }
    const auth = getFirebaseAuth();
    if (!auth) {
      // Not in a browser (shouldn't happen — init() is only ever called
      // from AuthInit's useEffect, which only runs client-side — but fail
      // safe rather than crash if that ever changes).
      set({ loading: false });
      return () => {};
    }
    try {
      // Second callback here is onAuthStateChanged's own error handler —
      // covers async failures during the subscription's lifetime. The
      // try/catch covers a synchronous throw from subscribing in the
      // first place, which is what an unset/invalid Firebase project
      // (no real credentials yet, or a bad API key) actually does. Either
      // way: never let an auth problem crash the whole app — the public
      // landing page doesn't even need auth to work, and gated pages
      // correctly redirect to /login with user staying null.
      return onAuthStateChanged(
        auth,
        (user) => set({ user, loading: false }),
        (error) => {
          console.error("Firebase auth state error:", error);
          set({ user: null, loading: false });
        }
      );
    } catch (error) {
      console.error("Firebase Auth failed to initialize — check NEXT_PUBLIC_FIREBASE_* env vars:", error);
      set({ user: null, loading: false });
      return () => {};
    }
  },

  clearError() {
    set({ error: "" });
  },

  async signUp(email, password) {
    if (!isFirebaseConfigured()) {
      set({ error: NOT_CONFIGURED_MESSAGE });
      return;
    }
    set({ busy: true, error: "" });
    try {
      await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
      set({ busy: false });
    } catch (error) {
      set({ busy: false, error: readableAuthError(error) });
    }
  },

  async signIn(email, password) {
    if (!isFirebaseConfigured()) {
      set({ error: NOT_CONFIGURED_MESSAGE });
      return;
    }
    set({ busy: true, error: "" });
    try {
      await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
      set({ busy: false });
    } catch (error) {
      set({ busy: false, error: readableAuthError(error) });
    }
  },

  async signInWithGoogle() {
    if (!isFirebaseConfigured()) {
      set({ error: NOT_CONFIGURED_MESSAGE });
      return;
    }
    set({ busy: true, error: "" });
    try {
      await signInWithPopup(getFirebaseAuth(), getGoogleProvider());
      set({ busy: false });
    } catch (error) {
      set({ busy: false, error: readableAuthError(error) });
    }
  },

  async signOut() {
    await firebaseSignOut(getFirebaseAuth());
  },
}));
