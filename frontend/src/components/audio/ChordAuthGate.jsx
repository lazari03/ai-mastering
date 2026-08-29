"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";

import { useAuthStore } from "@/store/authStore";
import { scorePassword } from "@/lib/passwordStrength";
import { Spinner } from "@/components/ui/Spinner";
import { useLanguage } from "@/lib/i18n";

const fieldStyle =
  "w-full box-border rounded-xl border border-white/15 bg-black/20 px-3.5 py-3 text-sm text-white outline-none focus:border-brass/60";

/**
 * The login/signup gate shown over an already-computed chord result for
 * an anonymous visitor — see PublicChordDetector.jsx for the full flow.
 * Two explicit tabs, not one ambiguous button, because email/password
 * genuinely needs to know upfront which Firebase call to make (link vs
 * plain sign-in); "Continue with Google" works identically either way
 * (claimWithGoogle tries to link, transparently falls back to signing
 * into an existing account if that Google account already has one).
 */
export default function ChordAuthGate({ onDone }) {
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-[380px] rounded-2xl border border-brass/25 bg-[#0f1113] p-6">
        <p className="m-0 text-[11px] uppercase tracking-[0.18em] text-brass">{t("chordGate.eyebrow")}</p>
        <h2 className="mt-2 font-[var(--font-title)] text-xl text-white">{t("chordGate.title")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">{t("chordGate.body")}</p>

        <div className="mt-4 flex gap-1 rounded-full border border-white/10 bg-black/20 p-1">
          <button
            type="button"
            onClick={() => {
              clearError();
              setMode("signup");
            }}
            className={`flex-1 rounded-full py-2 text-xs font-bold uppercase tracking-[0.1em] transition ${
              isSignup ? "bg-brass/20 text-brass" : "text-zinc-400"
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
            className={`flex-1 rounded-full py-2 text-xs font-bold uppercase tracking-[0.1em] transition ${
              !isSignup ? "bg-brass/20 text-brass" : "text-zinc-400"
            }`}
          >
            {t("chordGate.returning")}
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
          <label className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-[0.1em] text-zinc-300">{t("login.email")}</span>
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
            <span className="mb-1.5 block text-xs uppercase tracking-[0.1em] text-zinc-300">{t("login.password")}</span>
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
                <div className="flex h-1 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full transition-all duration-200"
                    style={{ width: `${passwordStrength.percent}%`, background: passwordStrength.color }}
                  />
                </div>
              </div>
            ) : null}
          </label>

          {isSignup ? (
            <label className="flex items-start gap-2.5 text-xs leading-relaxed text-zinc-300">
              <input
                type="checkbox"
                required
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span>
                {t("login.termsPrefix")}{" "}
                <Link href="/terms" target="_blank" className="text-brass hover:text-ember">
                  {t("login.termsLink")}
                </Link>{" "}
                {t("login.termsAnd")}{" "}
                <Link href="/privacy" target="_blank" className="text-brass hover:text-ember">
                  {t("login.privacyLink")}
                </Link>
              </span>
            </label>
          ) : null}

          {error ? <p className="m-0 text-sm text-red-300">{error}</p> : null}

          <button
            type="submit"
            disabled={busy || (isSignup && !termsAccepted)}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-brass/50 bg-brass/[0.18] px-4 py-3 text-[13px] font-bold uppercase tracking-[0.14em] text-brass transition hover:bg-brass/25 disabled:opacity-50"
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

        <div className="my-4 flex items-center gap-3 text-xs text-zinc-500">
          <div className="h-px flex-1 bg-white/10" />
          {t("login.or")}
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <button
          type="button"
          onClick={google}
          disabled={googleDisabled}
          className="w-full rounded-full border border-white/15 bg-black/20 px-4 py-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-zinc-100 transition hover:border-white/30 disabled:opacity-50"
        >
          {t("login.google")}
        </button>
      </div>
    </motion.div>
  );
}
