"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { getAdminUsers } from "@/network/http/client";
import AdminTable from "@/components/admin/AdminTable";
import { LoadingBlock } from "@/components/ui/Spinner";

const COLUMNS = [
  {
    key: "email",
    label: "Email",
    render: (r) => (
      <Link href={`/admin/users/${r.uid}`} className="text-brass hover:text-ember">
        {r.email || "(no email)"}
      </Link>
    ),
  },
  { key: "name", label: "Name", render: (r) => [r.firstName, r.lastName].filter(Boolean).join(" ") || "—" },
  { key: "plan", label: "Plan", align: "right", render: (r) => r.plan },
  { key: "disabled", label: "Status", align: "right", render: (r) => (r.disabled ? "Disabled" : "Active") },
  { key: "createdAt", label: "Joined", align: "right", render: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—") },
  { key: "lastSignInTime", label: "Last Sign-in", align: "right", render: (r) => (r.lastSignInTime ? new Date(r.lastSignInTime).toLocaleDateString() : "—") },
];

// Debounce delay for the search box — avoids firing a listUsers()
// full-scan (see adminUsersService.js's search path) on every keystroke.
const SEARCH_DEBOUNCE_MS = 400;

export default function AdminUsersPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState(null);
  const [nextPageToken, setNextPageToken] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    setUsers(null);
    setError("");
    getAdminUsers("/list", { search: search || null })
      .then((res) => {
        if (cancelled) return;
        setUsers(res.users);
        setNextPageToken(res.nextPageToken);
      })
      .catch((err) => !cancelled && setError(err?.message || "Failed to load users."));
    return () => {
      cancelled = true;
    };
  }, [search]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await getAdminUsers("/list", { pageToken: nextPageToken });
      setUsers((prev) => [...(prev || []), ...res.users]);
      setNextPageToken(res.nextPageToken);
    } catch (err) {
      setError(err?.message || "Failed to load more users.");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-lg font-bold text-white">Users</h1>
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by email…"
          className="w-56 rounded-full border border-white/15 bg-black/20 px-3.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-brass/50"
        />
      </div>
      <p className="m-0 text-xs text-zinc-500">Pulled directly from Firebase Authentication, merged with each account&apos;s profile and plan.</p>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!users && !error ? <LoadingBlock /> : null}
      {users ? (
        <>
          <AdminTable columns={COLUMNS} rows={users.map((u) => ({ ...u, id: u.uid }))} emptyLabel="No users found." />
          {nextPageToken ? (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="rounded-full border border-white/15 bg-black/20 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-200 hover:border-white/30 disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
