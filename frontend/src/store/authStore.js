import { create } from "zustand";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";

import { getFirebaseAuth, getGoogleProvider } from "@/lib/firebase";

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
    const auth = getFirebaseAuth();
    if (!auth) {
      // Not in a browser (shouldn't happen — init() is only ever called
      // from AuthInit's useEffect, which only runs client-side — but fail
      // safe rather than crash if that ever changes).
      set({ loading: false });
      return () => {};
    }
    return onAuthStateChanged(auth, (user) => {
      set({ user, loading: false });
    });
  },

  clearError() {
    set({ error: "" });
  },

  async signUp(email, password) {
    set({ busy: true, error: "" });
    try {
      await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
      set({ busy: false });
    } catch (error) {
      set({ busy: false, error: readableAuthError(error) });
    }
  },

  async signIn(email, password) {
    set({ busy: true, error: "" });
    try {
      await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
      set({ busy: false });
    } catch (error) {
      set({ busy: false, error: readableAuthError(error) });
    }
  },

  async signInWithGoogle() {
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
