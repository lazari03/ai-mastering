"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { useAuthStore } from "@/store/authStore";
import { useLanguage } from "@/lib/i18n";
import { scorePassword } from "@/lib/passwordStrength";
import { Spinner } from "@/components/ui/Spinner";
import LogoMark from "@/components/brand/LogoMark";
import TermsNotice from "@/components/auth/TermsNotice";

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const { user, loading, busy, error, signIn, signUp, signInWithGoogle, sendPasswordReset, clearError } = useAuthStore();
  // Set by client.js's SESSION_EXPIRED handling (absolute or inactivity
  // cap, see requireAuth.js) or by the client-side inactivity timer
  // (AuthInit.jsx) when it signs someone out proactively without waiting
  // for a request to 401 first — same query param, same message either way.
  const sessionExpired = searchParams.get("reason") === "session_expired";
  const passwordResetDone = searchParams.get("reason") === "password_reset";

  // Defaults to Sign In for a bare /login visit, but every "Master a Track
  // Free"/"Try it free"-style CTA site-wide links to /login?mode=signup
  // (see lib/internalLinks.js's CTA.signup) — those are all fresh-visitor
  // conversion moments, and landing them on Sign In first cost every one
  // an extra click to find the right tab.
  const [mode, setMode] = useState(() => {
    const m = searchParams.get("mode");
    return m === "signup" || m === "reset" ? m : "signin";
  }); // "signin" | "signup" | "reset"
  const [resetSent, setResetSent] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  // ?redirect=/admin/analytics (or any other in-app path) sends someone
  // back where they actually meant to go instead of always landing on
  // /app — used by the admin dashboard's own auth gate (AdminAuthGate.jsx)
  // when it bounces a signed-out visitor here. Only ever a same-origin,
  // in-app path (starts with "/"), never an external redirect target.
  const redirectTo = searchParams.get("redirect");
  useEffect(() => {
    // Real accounts only: the free tools sign visitors in anonymously, and
    // with browser-wide persistence that session outlives the tab. Bouncing
    // it to /app would hide the login form from someone who came here to
    // sign in. Signing up from here links the anonymous session instead
    // (authStore.claimWithEmail / claimWithGoogle).
    if (!loading && user && !user.isAnonymous) {
      router.replace(redirectTo && redirectTo.startsWith("/") ? redirectTo : "/app");
    }
  }, [loading, user, router, redirectTo]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (mode === "reset") {
      if (await sendPasswordReset(email)) setResetSent(true);
      return;
    }
    if (mode === "signup") {
      // Clickwrap: submitting under <TermsNotice> is the acceptance.
      await signUp(email, password, { firstName, lastName, phone, termsAccepted: true });
    } else {
      await signIn(email, password);
    }
  };

  const fieldStyle = "field";
  const isSignup = mode === "signup";
  const isReset = mode === "reset";
  const switchMode = (next) => {
    clearError();
    setResetSent(false);
    setMode(next);
  };
  // Never gated on a checkbox: Google is one tap for a new or returning user.
  const googleDisabled = busy;
  const passwordStrength = scorePassword(password);

  return (
    <main id="main" className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6">
      <div className="w-full max-w-[440px]">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 text-text-primary">
            <LogoMark size={20} />
            <span className="text-[12px] font-semibold uppercase tracking-[0.22em]">
              Auralith <span className="font-normal text-text-secondary">Forge</span>
            </span>
          </Link>
          <Link href="/" className="text-[13px] text-text-secondary transition hover:text-text-primary">
            ← {t("login.back")}
          </Link>
        </div>

        <div className="bezel">
        <div className="bezel-core p-6 sm:p-9">
          <h1 className="m-0 font-[var(--font-title)] text-[28px] font-semibold tracking-[-0.02em] text-text-primary">
            {isReset ? t("login.reset") : isSignup ? t("login.signup") : t("login.signin")}
          </h1>
          {isReset ? <p className="mt-2 text-[14px] leading-[1.6] text-text-secondary">{t("login.resetIntro")}</p> : null}

          {sessionExpired ? (
            <p className="mt-4 rounded-xl border border-accent/25 bg-accent/[0.07] px-3.5 py-2.5 text-[13px] text-text-primary">
              {t("login.sessionExpired")}
            </p>
          ) : null}
          {passwordResetDone && !isReset ? (
            <p role="status" className="mt-4 rounded-xl border border-emerald-600/25 bg-emerald-600/[0.06] px-3.5 py-2.5 text-[13px] text-emerald-900">
              {t("login.passwordResetDone")}
            </p>
          ) : null}

          {isReset && resetSent ? (
            <div role="status" className="mt-6 rounded-xl border border-emerald-600/25 bg-emerald-600/[0.06] p-4 text-[14px] leading-[1.6] text-emerald-900">
              {t("login.resetSent")}
            </div>
          ) : null}

          {isReset && resetSent ? null : (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            {isSignup ? (
              <div className="grid grid-cols-2 items-end gap-3">
                <label className="block">
                  <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-text-secondary">
                    {t("login.firstName")} <span className="normal-case tracking-normal opacity-70">({t("login.optional")})</span>
                  </span>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className={fieldStyle}
                    autoComplete="given-name"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-text-secondary">
                    {t("login.lastName")} <span className="normal-case tracking-normal opacity-70">({t("login.optional")})</span>
                  </span>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className={fieldStyle}
                    autoComplete="family-name"
                  />
                </label>
              </div>
            ) : null}

            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-text-secondary">{t("login.email")}</span>
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

            {isSignup ? (
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.12em] text-text-secondary">
                  {t("login.phone")} <span className="normal-case tracking-normal opacity-70">({t("login.optional")})</span>
                </span>
                <input
                  type="tel"
                  placeholder="+355 6X XXX XXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={fieldStyle}
                  autoComplete="tel"
                />
              </label>
            ) : null}

            {!isReset ? (
            <label className="block">
              <span className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.12em] text-text-secondary">
                {t("login.password")}
                {!isSignup ? (
                  <button type="button" onClick={() => switchMode("reset")} className="text-[12px] normal-case tracking-normal text-text-primary underline decoration-accent/50 underline-offset-2 hover:decoration-accent">
                    {t("login.forgot")}
                  </button>
                ) : null}
              </span>
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
                  <div className="flex h-1 w-full overflow-hidden rounded-full bg-black/[0.05]">
                    <div
                      className="h-full rounded-full transition-all duration-200"
                      style={{ width: `${passwordStrength.percent}%`, background: passwordStrength.color }}
                    />
                  </div>
                  <span className="mt-1 block text-[11px]" style={{ color: passwordStrength.color }}>
                    {passwordStrength.label}
                  </span>
                </div>
              ) : null}
            </label>
            ) : null}

            {isSignup ? <TermsNotice /> : null}

            {error ? (
              <p role="alert" className="m-0 rounded-xl border border-red-600/25 bg-red-600/[0.05] px-3.5 py-2.5 text-[13px] text-red-800">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="btn-primary w-full justify-center py-3.5 disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Spinner size={13} /> {t("login.working")}
                </>
              ) : isReset ? (
                t("login.submitReset")
              ) : isSignup ? (
                t("login.submitSignup")
              ) : (
                t("login.submitSignin")
              )}
            </button>
          </form>
          )}

          {isReset ? (
            <button type="button" onClick={() => switchMode("signin")} className="mt-5 block w-full bg-transparent text-center text-[13px] text-text-secondary hover:text-text-primary">
              ← {t("login.backToSignin")}
            </button>
          ) : (
          <>
          <div className="my-5 flex items-center gap-3 text-xs text-text-secondary">
            <div className="h-px flex-1 bg-border-subtle" />
            {t("login.or")}
            <div className="h-px flex-1 bg-border-subtle" />
          </div>

          <button
            type="button"
            onClick={() => signInWithGoogle(true)}
            disabled={googleDisabled}
            className="btn-secondary w-full justify-center py-3.5 disabled:opacity-50"
          >
            {t("login.google")}
          </button>
          {!isSignup ? <TermsNotice className="mt-3 text-center" /> : null}

          <button
            type="button"
            onClick={() => switchMode(isSignup ? "signin" : "signup")}
            className="mt-5 block w-full bg-transparent text-center text-[13px] text-text-secondary hover:text-text-primary"
          >
            {isSignup ? t("login.toSignin") : t("login.toSignup")}
          </button>
          </>
          )}
        </div>
        </div>
      </div>
    </main>
  );
}
