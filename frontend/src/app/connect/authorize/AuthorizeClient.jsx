"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { useAuthStore } from "@/store/authStore";
import { getOAuthConnectionRequest, postOAuthConnectionDecision } from "@/network/http/client";
import { Spinner } from "@/components/ui/Spinner";
import LogoMark from "@/components/brand/LogoMark";

// Consent step of the ChatGPT (MCP) OAuth flow. The API's /authorize
// endpoint validated the client, redirect URI and PKCE challenge and parked
// the request; this page signs the person in with their normal Auralith
// account (Firebase, same as everywhere else), shows who is asking for what,
// and sends their decision. The API returns the redirect back to ChatGPT —
// this page never builds that URL itself.

const SCOPE_TEXT = {
  "mastering:read": "See your plan, remaining masters, and the status and results of masters started from ChatGPT",
  "mastering:write": "Upload tracks you choose and master them using your plan's quota",
};

const REQUEST_ID_RE = /^[a-f0-9]{48}$/;

export default function AuthorizeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestId = searchParams.get("request") || "";
  const { user, loading } = useAuthStore();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const validId = REQUEST_ID_RE.test(requestId);
  const signedIn = Boolean(user && !user.isAnonymous);

  // Not signed in → the normal login page, then straight back here.
  useEffect(() => {
    if (!validId || loading || signedIn) return;
    router.replace(`/login?redirect=${encodeURIComponent(`/connect/authorize?request=${requestId}`)}`);
  }, [validId, loading, signedIn, requestId, router]);

  useEffect(() => {
    if (!validId || loading || !signedIn) return;
    let cancelled = false;
    getOAuthConnectionRequest(requestId)
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "This connection request couldn't be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [validId, loading, signedIn, requestId]);

  async function decide(approve) {
    setBusy(true);
    setError(null);
    try {
      const { redirect_url: redirectUrl } = await postOAuthConnectionDecision(requestId, approve);
      window.location.assign(redirectUrl);
    } catch (err) {
      setError(err?.message || "Something went wrong. Start connecting again from ChatGPT.");
      setBusy(false);
    }
  }

  let body;
  if (!validId) {
    body = <p className="mt-3 text-[14px] leading-[1.6] text-text-secondary">This link is incomplete. Start connecting Auralith Forge again from ChatGPT.</p>;
  } else if (error) {
    body = (
      <p role="alert" className="mt-4 rounded-xl border border-red-600/25 bg-red-600/[0.05] px-3.5 py-2.5 text-[13px] text-red-800">
        {error}
      </p>
    );
  } else if (!info) {
    body = (
      <div className="mt-6 flex items-center gap-3 text-[14px] text-text-secondary">
        <Spinner size={18} /> Loading…
      </div>
    );
  } else {
    body = (
      <>
        <p className="mt-3 text-[14px] leading-[1.6] text-text-secondary">
          <strong className="text-text-primary">{info.client_name}</strong> ({info.redirect_host}) wants to use your Auralith Forge account
          {info.account?.email ? (
            <>
              {" "}
              <strong className="text-text-primary">{info.account.email}</strong>
            </>
          ) : null}
          .
        </p>
        <p className="mb-2 mt-5 text-xs uppercase tracking-[0.12em] text-text-secondary">It will be able to</p>
        <ul className="m-0 flex list-disc flex-col gap-2 pl-5 text-[14px] leading-[1.55] text-text-primary">
          {(info.scopes || []).map((scope) => (
            <li key={scope}>{SCOPE_TEXT[scope] || scope}</li>
          ))}
        </ul>
        <p className="mt-4 rounded-xl border border-accent/25 bg-accent/[0.07] px-3.5 py-2.5 text-[13px] leading-[1.55] text-text-primary">
          Masters started from ChatGPT count toward your plan, exactly like masters made on this site. It can&apos;t change your plan, payment details or password. You can disconnect anytime with
          “Sign out of all devices” in Settings.
        </p>
        <p className="mt-3 text-[12px] leading-[1.55] text-text-secondary">Only continue if you started this from ChatGPT yourself.</p>
        <div className="mt-6 flex flex-col gap-3">
          <button type="button" disabled={busy} onClick={() => decide(true)} className="btn-primary w-full justify-center py-3.5 disabled:opacity-50">
            {busy ? <Spinner size={16} /> : null} Allow
          </button>
          <button type="button" disabled={busy} onClick={() => decide(false)} className="btn-secondary w-full justify-center py-3 disabled:opacity-50">
            Cancel
          </button>
        </div>
      </>
    );
  }

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
        </div>
        <div className="bezel">
          <div className="bezel-core p-6 sm:p-9">
            <h1 className="m-0 font-[var(--font-title)] text-[28px] font-semibold tracking-[-0.02em] text-text-primary">Connect to ChatGPT</h1>
            {body}
          </div>
        </div>
      </div>
    </main>
  );
}
