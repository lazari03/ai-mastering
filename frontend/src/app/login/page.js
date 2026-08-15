"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuthStore } from "@/store/authStore";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, busy, error, signIn, signUp, signInWithGoogle, clearError } = useAuthStore();

  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!loading && user) {
      router.replace("/app");
    }
  }, [loading, user, router]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (mode === "signup") {
      await signUp(email, password);
    } else {
      await signIn(email, password);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="glass-panel reveal w-full max-w-md rounded-3xl border border-white/10 p-6 sm:p-8">
        <p className="text-xs uppercase tracking-[0.22em] text-brass">Auralith Forge</p>
        <h1 className="mt-2 font-[var(--font-title)] text-2xl">{mode === "signup" ? "Create an account" : "Sign in"}</h1>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block space-y-2">
            <span className="text-xs uppercase tracking-[0.14em] text-zinc-300">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-black/20 p-3 text-sm"
              autoComplete="email"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs uppercase tracking-[0.14em] text-zinc-300">Password</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-black/20 p-3 text-sm"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </label>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full border border-brass/50 bg-brass/20 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-brass transition hover:bg-brass/30 disabled:opacity-50"
          >
            {busy ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-zinc-500">
          <div className="h-px flex-1 bg-white/10" />
          or
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={busy}
          className="w-full rounded-full border border-white/15 bg-black/20 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-100 transition hover:border-white/30 disabled:opacity-50"
        >
          Continue with Google
        </button>

        <button
          type="button"
          onClick={() => {
            clearError();
            setMode(mode === "signup" ? "signin" : "signup");
          }}
          className="mt-6 w-full text-center text-xs text-zinc-400 hover:text-zinc-200"
        >
          {mode === "signup" ? "Already have an account? Sign in" : "No account yet? Create one"}
        </button>
      </div>
    </main>
  );
}
