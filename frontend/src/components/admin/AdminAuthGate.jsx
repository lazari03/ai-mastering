"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuthStore } from "@/store/authStore";
import { getAdminAnalytics } from "@/network/http/client";
import { LoadingBlock } from "@/components/ui/Spinner";

// The ONE frontend gate for the whole /admin/analytics surface — and it is
// explicitly NOT the security boundary (spec section 15/35). It exists
// purely for UX (bounce a signed-out visitor to /login, show a clear
// "not authorized" state instead of a blank/broken dashboard). The real
// boundary is server-side: every /analytics/admin/* API call below is
// independently re-checked by requireAdmin.js on the backend, so even if
// this component were bypassed entirely, no data would come back.
export default function AdminAuthGate({ children }) {
  const router = useRouter();
  const { user, loading } = useAuthStore();
  const [status, setStatus] = useState("checking"); // checking | authorized | forbidden | error

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login?redirect=/admin/analytics");
      return;
    }
    let cancelled = false;
    getAdminAnalytics("/me")
      .then(() => {
        if (!cancelled) setStatus("authorized");
      })
      .catch((err) => {
        if (cancelled) return;
        // requireAdmin.js returns 403 only when this uid's own role really
        // isn't "admin" — that's the one case that's actually "forbidden."
        // Anything else (a transient 401 from Firebase Auth's own API
        // quota, a 500, a network blip) is not evidence of that, and
        // telling a real admin "this account doesn't have access" over a
        // retryable error is worse than just saying the check failed.
        setStatus(err?.status === 403 ? "forbidden" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [loading, user, router]);

  if (loading || status === "checking") {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <LoadingBlock />
      </main>
    );
  }

  if (status === "forbidden") {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-lg font-semibold text-white">Not authorized</p>
        <p className="max-w-sm text-sm text-zinc-400">This account doesn&apos;t have access to the analytics dashboard.</p>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-lg font-semibold text-white">Couldn&apos;t verify access</p>
        <p className="max-w-sm text-sm text-zinc-400">
          The access check failed — this isn&apos;t the same as being denied access. It may be a temporary issue.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-300 hover:border-white/30"
        >
          Retry
        </button>
      </main>
    );
  }

  return children;
}
