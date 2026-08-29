import { create } from "zustand";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInAnonymously,
  signInWithCredential,
  linkWithCredential,
  linkWithPopup,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  GoogleAuthProvider,
  getAdditionalUserInfo,
  deleteUser,
  signOut as firebaseSignOut,
} from "firebase/auth";

import { getFirebaseAuth, getGoogleProvider, isFirebaseConfigured } from "@/lib/firebase";
import { postProfile, deleteAccountData, postSignOutEverywhere, checkEmailDeliverable } from "@/network/http/client";
import { trackEvent } from "@/lib/analytics";

const NOT_CONFIGURED_MESSAGE = "Site is under maintenance";

// Bump when Terms/Privacy content materially changes — lets us tell, from
// stored data alone, which users accepted an older version.
export const TERMS_VERSION = "2026-08-16";

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

  async signUp(email, password, profile = {}) {
    if (!isFirebaseConfigured()) {
      set({ error: NOT_CONFIGURED_MESSAGE });
      return;
    }
    if (!profile.termsAccepted) {
      set({ error: "You need to accept the Terms & Conditions and Privacy Policy to create an account." });
      return;
    }
    set({ busy: true, error: "" });
    try {
      // Checked before the account is even created — catches an
      // undeliverable email (fake/typo'd domain) at signup instead of
      // only surfacing it later at Polar checkout. Best-effort: a lookup
      // failure (network hiccup hitting our own backend) shouldn't block
      // signup outright, so this only blocks on an explicit `false`, not
      // on the check itself failing to run.
      try {
        const { deliverable } = await checkEmailDeliverable(email);
        if (deliverable === false) {
          set({ busy: false, error: "That email address looks invalid or can't receive mail — double check it." });
          return;
        }
      } catch (checkError) {
        console.warn("Email deliverability check failed, allowing signup to proceed:", checkError);
      }

      const auth = getFirebaseAuth();
      const credential = await createUserWithEmailAndPassword(auth, email, password);

      const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
      if (displayName) {
        await updateProfile(credential.user, { displayName });
      }

      // Best-effort: the account already exists at this point regardless of
      // whether this succeeds, so a Firestore/network hiccup here shouldn't
      // block sign-up or surface as an auth error.
      try {
        await postProfile({
          firstName: profile.firstName || "",
          lastName: profile.lastName || "",
          phone: profile.phone || "",
          termsAcceptedAt: new Date().toISOString(),
          termsVersion: TERMS_VERSION,
        });
      } catch (profileError) {
        console.error("Failed to save profile details:", profileError);
      }

      trackEvent("sign_up", { method: "password" });
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
      trackEvent("login", { method: "password" });
      set({ busy: false });
    } catch (error) {
      set({ busy: false, error: readableAuthError(error) });
    }
  },

  async signInWithGoogle(termsAccepted) {
    if (!isFirebaseConfigured()) {
      set({ error: NOT_CONFIGURED_MESSAGE });
      return;
    }
    set({ busy: true, error: "" });
    try {
      const result = await signInWithPopup(getFirebaseAuth(), getGoogleProvider());

      // Google sign-in doubles as sign-up for a brand-new account — only
      // record terms acceptance (and only if it was actually given) the
      // first time this account is ever seen, not on every later sign-in.
      if (getAdditionalUserInfo(result)?.isNewUser) {
        if (!termsAccepted) {
          await firebaseSignOut(getFirebaseAuth());
          set({ busy: false, error: "You need to accept the Terms & Conditions and Privacy Policy to create an account." });
          return;
        }
        try {
          await postProfile({ termsAcceptedAt: new Date().toISOString(), termsVersion: TERMS_VERSION });
        } catch (profileError) {
          console.error("Failed to save profile details:", profileError);
        }
        trackEvent("sign_up", { method: "google" });
      } else {
        trackEvent("login", { method: "google" });
      }

      set({ busy: false });
    } catch (error) {
      set({ busy: false, error: readableAuthError(error) });
    }
  },

  // Silent, no busy/error state — this is meant to run in the background
  // the moment someone starts using a tool without being signed in (see
  // PublicChordDetector.jsx), not as a user-facing action. Anonymous
  // Firebase users are real, rate-limited, quota-tracked identities
  // server-side (requireAuth accepts them like any other token) — this is
  // what lets "try it before you sign up" reuse the exact same
  // entitlements/quota system as everything else, with zero backend
  // changes and zero abuse-surface beyond what already exists per-account.
  async ensureAnonymous() {
    if (!isFirebaseConfigured()) return;
    const auth = getFirebaseAuth();
    if (auth && !auth.currentUser) {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Anonymous sign-in failed:", error);
      }
    }
  },

  // Upgrades an anonymous session into a real account IN PLACE — same
  // uid, so whatever was done anonymously (a chord analysis result held
  // in React state, a spent free-trial quota slot) is simply already
  // "theirs" the moment this resolves, no data transfer needed. Falls
  // back to a plain sign-in if the email turns out to already belong to
  // a real account (auth/email-already-in-use) — someone who clicks
  // "Create account" but already has one gets logged into it instead of
  // a hard error, same forgiving behavior as claimWithGoogle below.
  async claimWithEmail(email, password, profile = {}, termsAccepted = false) {
    if (!isFirebaseConfigured()) {
      set({ error: NOT_CONFIGURED_MESSAGE });
      return false;
    }
    set({ busy: true, error: "" });
    const auth = getFirebaseAuth();
    const current = auth?.currentUser;
    try {
      if (current?.isAnonymous) {
        try {
          await linkWithCredential(current, EmailAuthProvider.credential(email, password));
        } catch (linkError) {
          if (linkError?.code === "auth/email-already-in-use" || linkError?.code === "auth/credential-already-in-use") {
            // Someone already owns this email — log into that account
            // instead of blocking on "sign up" specifically. Whatever was
            // done anonymously stays behind on the now-abandoned
            // anonymous uid (see the module doc comment on
            // PublicChordDetector.jsx for why that's an acceptable,
            // deliberate trade-off here).
            await signInWithEmailAndPassword(auth, email, password);
            set({ busy: false });
            trackEvent("login", { method: "password" });
            return true;
          }
          throw linkError;
        }
      } else {
        if (!termsAccepted) {
          set({ busy: false, error: "You need to accept the Terms & Conditions and Privacy Policy to create an account." });
          return false;
        }
        await createUserWithEmailAndPassword(auth, email, password);
      }

      const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
      try {
        await postProfile({
          firstName: profile.firstName || "",
          lastName: profile.lastName || "",
          termsAcceptedAt: new Date().toISOString(),
          termsVersion: TERMS_VERSION,
        });
        if (displayName) await updateProfile(auth.currentUser, { displayName });
      } catch (profileError) {
        console.error("Failed to save profile details:", profileError);
      }

      trackEvent("sign_up", { method: "password" });
      set({ busy: false });
      return true;
    } catch (error) {
      set({ busy: false, error: readableAuthError(error) });
      return false;
    }
  },

  // Same idea as claimWithEmail but for the Google button — tries to
  // link the anonymous session to whatever Google account the popup
  // returns; if that Google account already has a real Auralith account
  // (auth/credential-already-in-use), signs into that existing account
  // instead of erroring. One button correctly covers both "new Google
  // user" and "returning Google user" this way, unlike email/password
  // which needs the explicit Sign Up/Log In tab choice.
  async claimWithGoogle(termsAccepted = false) {
    if (!isFirebaseConfigured()) {
      set({ error: NOT_CONFIGURED_MESSAGE });
      return false;
    }
    set({ busy: true, error: "" });
    const auth = getFirebaseAuth();
    const current = auth?.currentUser;
    try {
      if (current?.isAnonymous) {
        try {
          const result = await linkWithPopup(current, getGoogleProvider());
          if (!termsAccepted) {
            // Can't undo the link, but can still refuse to treat this as
            // a completed signup without terms acceptance — same refusal
            // shape as the plain signInWithGoogle path below.
            set({ busy: false, error: "You need to accept the Terms & Conditions and Privacy Policy to create an account." });
            return false;
          }
          try {
            await postProfile({ termsAcceptedAt: new Date().toISOString(), termsVersion: TERMS_VERSION });
          } catch (profileError) {
            console.error("Failed to save profile details:", profileError);
          }
          trackEvent("sign_up", { method: "google" });
          void result;
        } catch (linkError) {
          const credential = GoogleAuthProvider.credentialFromError(linkError);
          if (credential && (linkError?.code === "auth/credential-already-in-use" || linkError?.code === "auth/email-already-in-use")) {
            await signInWithCredential(auth, credential);
            trackEvent("login", { method: "google" });
          } else {
            throw linkError;
          }
        }
      } else {
        const result = await signInWithPopup(auth, getGoogleProvider());
        trackEvent(getAdditionalUserInfo(result)?.isNewUser ? "sign_up" : "login", { method: "google" });
      }
      set({ busy: false });
      return true;
    } catch (error) {
      set({ busy: false, error: readableAuthError(error) });
      return false;
    }
  },

  async signOut() {
    await firebaseSignOut(getFirebaseAuth());
  },

  // Revokes every refresh token Firebase has issued for this account, then
  // signs this browser out too (revocation alone doesn't invalidate the
  // ID token this tab is already holding until it naturally expires or the
  // next request 401s — signing out here is immediate instead of waiting
  // on that). Every other signed-in device stops being accepted the next
  // time it makes a request (see requireAuth.js's checkRevoked).
  async signOutEverywhere() {
    set({ busy: true, error: "" });
    try {
      await postSignOutEverywhere();
      await firebaseSignOut(getFirebaseAuth());
      set({ busy: false });
      return true;
    } catch (error) {
      set({ busy: false, error: error?.message || "Failed to sign out of other devices." });
      return false;
    }
  },

  // Deletes every trace of the account: Firestore data first (profile,
  // Saved Artists, job history — while the ID token is still valid), then
  // the Firebase Auth account itself. Requires re-authentication like
  // changePassword — deleteUser() throws auth/requires-recent-login
  // otherwise, and this is far more destructive than a password change to
  // get wrong. currentPassword is only used for password-auth accounts;
  // Google-only accounts re-authenticate via a fresh popup instead.
  async deleteAccount(currentPassword) {
    const auth = getFirebaseAuth();
    const user = auth?.currentUser;
    if (!user) {
      set({ error: "You need to be signed in to delete your account." });
      return false;
    }
    set({ busy: true, error: "" });
    try {
      const isPasswordAccount = user.providerData.some((p) => p.providerId === "password");
      if (isPasswordAccount) {
        if (!currentPassword) {
          set({ busy: false, error: "Enter your current password to confirm account deletion." });
          return false;
        }
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);
      } else {
        const { reauthenticateWithPopup } = await import("firebase/auth");
        await reauthenticateWithPopup(user, getGoogleProvider());
      }

      await deleteAccountData();
      await deleteUser(user);

      set({ busy: false });
      return true;
    } catch (error) {
      set({ busy: false, error: readableAuthError(error) });
      return false;
    }
  },

  // Firebase requires a "recent" sign-in for sensitive operations like a
  // password change — re-authenticate with the current password first
  // rather than surfacing Firebase's opaque auth/requires-recent-login
  // error to the user.
  async changePassword(currentPassword, newPassword) {
    const auth = getFirebaseAuth();
    const user = auth?.currentUser;
    if (!user?.email) {
      set({ error: "You need to be signed in to change your password." });
      return false;
    }
    set({ busy: true, error: "" });
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);

      // A changed password is exactly the case "sign out of all devices"
      // exists for — someone else with the old password (or a stolen
      // session) should be kicked out now, not left signed in on this
      // token's remaining 1h lifetime. Reuses the same revokeRefreshTokens
      // backend call as the manual "Sign out of all devices" button
      // (masteringRoutes.js /account/sign-out-everywhere), then force-
      // refreshes this device's own token immediately after — it already
      // has the new password, so it shouldn't get logged out too.
      try {
        await postSignOutEverywhere();
        await user.getIdToken(true);
      } catch (revokeError) {
        // Non-fatal — the password itself did change successfully. Worst
        // case, other devices stay signed in a little longer than
        // intended; don't fail the whole operation over this.
        console.error("Failed to revoke other sessions after password change:", revokeError);
      }

      set({ busy: false });
      return true;
    } catch (error) {
      set({ busy: false, error: readableAuthError(error) });
      return false;
    }
  },
}));
