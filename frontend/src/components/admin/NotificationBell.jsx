"use client";

import { useEffect, useRef, useState } from "react";

import { getAdminNotifications, postMarkNotificationRead, postMarkAllNotificationsRead } from "@/network/http/client";

const POLL_MS = 25000; // same setInterval idiom the Live tab already uses — no websocket/SSE infra in this app

function formatWhen(iso) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState(null);
  const [error, setError] = useState("");
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      getAdminNotifications("/unread-count")
        .then((res) => !cancelled && setUnreadCount(res.count || 0))
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const loadPanel = () => {
    setError("");
    getAdminNotifications("/list", { limit: 20 })
      .then((res) => setNotifications(res.notifications))
      .catch((err) => setError(err?.message || "Failed to load notifications."));
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) loadPanel();
  };

  const markRead = async (id) => {
    setNotifications((prev) => (prev ? prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)) : prev));
    setUnreadCount((n) => Math.max(0, n - 1));
    postMarkNotificationRead(id).catch(() => {});
  };

  const markAll = async () => {
    setNotifications((prev) => (prev ? prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })) : prev));
    setUnreadCount(0);
    postMarkAllNotificationsRead().catch(() => {});
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={toggle}
        aria-label="Notifications"
        className="relative flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-zinc-400 transition hover:border-white/25 hover:text-zinc-200"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-ember px-1 text-[9px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-10 z-30 w-80 max-w-[90vw] rounded-xl border border-white/10 bg-[#14161a] shadow-xl">
          <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2.5">
            <p className="m-0 text-xs font-bold uppercase tracking-[0.08em] text-zinc-300">Notifications</p>
            <button type="button" onClick={markAll} className="text-[11px] text-brass hover:text-ember">
              Mark all read
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {error ? <p className="p-3.5 text-xs text-red-300">{error}</p> : null}
            {!notifications && !error ? <p className="p-3.5 text-xs text-zinc-500">Loading…</p> : null}
            {notifications?.length === 0 ? <p className="p-3.5 text-xs text-zinc-500">No notifications yet.</p> : null}
            {notifications?.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => !n.readAt && markRead(n.id)}
                className={`block w-full border-b border-white/5 px-3.5 py-2.5 text-left text-xs last:border-0 ${
                  n.readAt ? "text-zinc-500" : "bg-brass/[0.06] text-zinc-200"
                }`}
              >
                <p className="m-0">{n.message}</p>
                <p className="m-0 mt-0.5 text-[10px] text-zinc-500">{formatWhen(n.createdAt)}</p>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
