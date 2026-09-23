"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";

import { useAuthStore } from "@/store/authStore";
import { scorePassword } from "@/lib/passwordStrength";
import { Spinner } from "@/components/ui/Spinner";
import { useLanguage } from "@/lib/i18n";
import InlineAlert from "@/components/ui/InlineAlert";

const fieldStyle = "field";

/**
 * The login/signup gate shown over an already-computed chord result for
 * an anonymous visitor — see PublicChordDetector.jsx for the full flow.
 * Two explicit tabs, not one ambiguous button, because email/password
 * genuinely needs to know upfront which Firebase call to make (link vs
 * plain sign-in); "Continue with Google" works identically either way
 * (claimWithGoogle tries to link, transparently falls back to signing
 * into an existing account if that Google account already has one).
 */
export default function ChordAuthGate({ onDone, eyebrowKey = "chordGate.eyebrow", titleKey = "chordGate.title", bodyKey = "chordGate.body" }) {
  const { t } = useLanguage();
  const { busy, error, signIn, claimWithEmail, claimWithGoogle, clearError } = useAuthStore();
  const [mode, setMode] = useState("signup"); // "signup" | "signin"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const isSignup = mode === "signup";
  const passwordStrength = scorePassword(password);

  // signIn/signInWithGoogle (the "returning user" path — unmodified,
  // shared with /login) don't return a success flag, only set error
  // state; claimWithEmail/claimWithGoogle do return one, but checking the
  // store's error afterward uniformly, instead of trusting each method's
  // return value differently, is what actually catches every failure
  // case correctly (a silently-undefined return must never be read as
  // "succeeded").
  const submit = async (event) => {
    event.preventDefault();
    if (isSignup) await claimWithEmail(email, password, {}, termsAccepted);
    else await signIn(email, password);
    if (!useAuthStore.getState().error) onDone?.();
  };

  const google = async () => {
    if (isSignup) await claimWithGoogle(termsAccepted);
    else await useAuthStore.getState().signInWithGoogle(termsAccepted);
    if (!useAuthStore.getState().error) onDone?.();
  };

  const googleDisabled = busy || (isSignup && !termsAccepted);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-text-primary/40 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chord-gate-title"
    >
      <div className="w-full max-w-[400px] rounded-[28px] border border-black/[0.07] bg-bg p-6 shadow-[var(--shadow-ambient-lifted)] sm:p-7">
        <p className="eyebrow m-0">{t(eyebrowKey)}</p>
        <h2 id="chord-gate-title" className="mt-3 font-[var(--font-title)] text-2xl font-semibold tracking-[-0.02em] text-text-primary">{t(titleKey)}</h2>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">{t(bodyKey)}</p>

        <div className="mt-5 flex gap-1 rounded-full border border-border-subtle bg-black/[0.03] p-1" role="tablist">
          <button
            type="button"
            onClick={() => {
              clearError();
              setMode("signup");
            }}
            className={`flex-1 rounded-full py-2 text-[12px] font-semibold transition ${
              isSignup ? "bg-text-primary text-bg" : "text-text-secondary"
            }`}
          >
            {t("chordGate.newHere")}
          </button>
          <button
            type="button"
            onClick={() => {
              clearError();
              setMode("signin");
            }}
            className={`flex-1 rounded-full py-2 text-[12px] font-semibold transition ${
              !isSignup ? "bg-text-primary text-bg" : "text-text-secondary"
            }`}
          >
            {t("chordGate.returning")}
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-text-secondary">{t("login.email")}</span>
            <input
              type="email"
              required
              placeholder="you@studio.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldStyle}
              autoComplete="email"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-text-secondary">{t("login.password")}</span>
            <input
              type="password"
              required
              minLength={6}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldStyle}
              autoComplete={isSignup ? "new-password" : "current-password"}
            />
            {isSignup && password ? (
              <div className="mt-2">
                <div className="flex h-1 w-full overflow-hidden rounded-full bg-black/[0.08]">
                  <div
                    className="h-full rounded-full transition-all duration-200"
                    style={{ width: `${passwordStrength.percent}%`, background: passwordStrength.color }}
                  />
                </div>
              </div>
            ) : null}
          </label>

          {isSignup ? (
            <label className="flex items-start gap-2.5 text-xs leading-relaxed text-text-secondary">
              <input
                type="checkbox"
                required
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span>
                {t("login.termsPrefix")}{" "}
                <Link href="/terms" target="_blank" className="text-link">
                  {t("login.termsLink")}
                </Link>{" "}
                {t("login.termsAnd")}{" "}
                <Link href="/privacy" target="_blank" className="text-link">
                  {t("login.privacyLink")}
                </Link>
              </span>
            </label>
          ) : null}

          {error ? <InlineAlert size="sm" className="m-0">{error}</InlineAlert> : null}

          <button
            type="submit"
            disabled={busy || (isSignup && !termsAccepted)}
            className="btn-primary w-full"
          >
            {busy ? (
              <>
                <Spinner size={13} /> {t("login.working")}
              </>
            ) : isSignup ? (
              t("login.submitSignup")
            ) : (
              t("login.submitSignin")
            )}
          </button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-text-secondary">
          <div className="h-px flex-1 bg-border-subtle" />
          {t("login.or")}
          <div className="h-px flex-1 bg-border-subtle" />
        </div>

        <button
          type="button"
          onClick={google}
          disabled={googleDisabled}
          className="btn-secondary w-full"
        >
          {t("login.google")}
        </button>
      </div>
    </motion.div>
  );
}
