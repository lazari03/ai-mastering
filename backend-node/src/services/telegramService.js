import { settings } from "../config/settings.js";
import { getFirestore } from "../config/firebase.js";
// Aliased — this file already has its own resolveRange(argRaw) for the
// older /stats command's simpler today/7d/30d shape; this is analyticsQueryService.js's
// version (accepts the full admin-dashboard preset set, used by /funnel below).
import {
  resolveRange as resolveAnalyticsRange,
  getOverview,
  getAcquisition,
  getPages,
  getSeoOverview,
  getSales,
  getErrors,
  getRetention,
} from "./analyticsQueryService.js";

const API_BASE = "https://api.telegram.org";

function configured() {
  return Boolean(settings.telegramBotToken && settings.telegramChatId);
}

async function callTelegram(method, body) {
  const res = await fetch(`${API_BASE}/bot${settings.telegramBotToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.ok === false) {
    throw new Error(`Telegram ${method} failed: ${data?.description || res.status}`);
  }
  return data?.result;
}

// Deliberately plain text, no parse_mode — an email address or file name
// containing "_" or "*" (both common, both Markdown formatting characters)
// would otherwise make Telegram reject the send with a "can't parse
// entities" error, silently losing the notification. Not worth the
// formatting for what's a short admin alert anyway.
export async function sendMessage(text) {
  if (!configured()) return;
  try {
    await callTelegram("sendMessage", { chat_id: settings.telegramChatId, text });
  } catch (error) {
    // A notification must never be able to break the request path that
    // triggered it (signup, webhook processing) — same contract as
    // lib/analytics.js's trackEvent() on the frontend.
    console.error("Telegram sendMessage failed (non-fatal):", error.message);
  }
}

export async function notifyNewRegistration({ uid, email }) {
  await sendMessage(`New signup\n${email || "(no email on file)"}\nuid: ${uid}`);
}

export async function notifyPurchase({ kind, product, email, amountCents, currency }) {
  const price = typeof amountCents === "number" ? ` — ${(amountCents / 100).toFixed(2)} ${currency || ""}`.trim() : "";
  const who = email ? `\n${email}` : "";
  await sendMessage(`${kind}: ${product}${price}${who}`);
}

// A failed/revoked subscription renewal is the mirror image of a purchase
// (real revenue at risk, or already lost) — previously the only trace of
// this was an analytics event nobody actively watches; this actually
// reaches the founder the moment it happens, the same way a new sale does.
export async function notifyPaymentFailure({ kind, product, email }) {
  const who = email ? `\n${email}` : "";
  await sendMessage(`${kind}: ${product}${who}`);
}

// ---------------------------------------------------------------------
// On-demand stats commands — /stats, /help. Long-polls getUpdates rather
// than registering a webhook: this is a single admin talking to their
// own bot, so there's no reason to expose a new public HTTP endpoint
// (and verify Telegram's request signature) just to receive commands
// nobody but one person will ever send.
//
// Traffic/pageview numbers used to live here too (via GA4's Data API),
// but Google Analytics has been removed from this app entirely. /funnel
// below now covers that gap instead — it reads the first-party analytics
// pipeline directly (analyticsQueryService.js's getOverview, the same
// function the admin dashboard's Overview page calls), not a third-party
// API. Plausible (if configured, see components/Analytics.jsx) is a
// separate, purely traffic-level tool this bot doesn't query.
// ---------------------------------------------------------------------

// One command per admin dashboard tab (/admin/analytics/*) — same
// analyticsQueryService.js functions, same numbers, so this bot never
// shows fewer stats than opening the dashboard on a laptop would.
const HELP_TEXT = [
  "Auralith Forge bot",
  "",
  "/stats [today|7d|30d] - signups and purchases (default 7d)",
  "/funnel [today|yesterday|7d|30d|90d] - visitors, uploads, masters, checkout, revenue (default 7d)",
  "/acquisition [preset] - visitors/masters/revenue by source",
  "/pages [preset] - views/active time/conversion per page",
  "/seo [preset] - organic-only overview + top landing pages (default 30d)",
  "/sales [preset] - revenue, subscriptions, checkout, failure reasons",
  "/errors [preset] - upload/mastering/checkout failures",
  "/retention [preset] - unique vs returning visitors (default 30d)",
  "/help - this message",
].join("\n");

const RANGES = {
  today: { label: "today", cutoff: () => new Date(new Date().setHours(0, 0, 0, 0)) },
  "7d": { label: "last 7 days", cutoff: () => new Date(Date.now() - 7 * 86400000) },
  "30d": { label: "last 30 days", cutoff: () => new Date(Date.now() - 30 * 86400000) },
};

function resolveRange(argRaw) {
  return RANGES[(argRaw || "").toLowerCase()] || RANGES["7d"];
}

async function countUsersSince(cutoff) {
  // Aggregate count query — reads a number back from Firestore, not every
  // matching document, so this stays cheap regardless of how many users
  // sign up over the app's lifetime (see profileService.js for where
  // createdAt is set — only at signup, never touched again).
  const snap = await getFirestore().collection("users").where("createdAt", ">=", cutoff).count().get();
  return snap.data().count;
}

// purchaseEvents is a small, append-only log written by polarService.js
// alongside every notifyPurchase() call — kept separate from
// processedPolarOrders (the idempotency guard for credit-granting) so this
// query never has to reason about which collection is safe to read for
// reporting vs. safe to read for business logic. Fetches the actual docs
// (not an aggregate) because the revenue total needs to be split by
// currency, which a single aggregate query can't do — fine at this app's
// purchase volume.
async function purchaseStatsSince(cutoff) {
  const snap = await getFirestore().collection("purchaseEvents").where("at", ">=", cutoff).get();
  let count = 0;
  const revenueByCurrency = {};
  snap.forEach((doc) => {
    const data = doc.data();
    count += 1;
    if (typeof data.amountCents === "number" && data.currency) {
      revenueByCurrency[data.currency] = (revenueByCurrency[data.currency] || 0) + data.amountCents;
    }
  });
  return { count, revenueByCurrency };
}

function formatRevenue(revenueByCurrency) {
  const parts = Object.entries(revenueByCurrency).map(([currency, cents]) => `${(cents / 100).toFixed(2)} ${currency}`);
  return parts.length ? parts.join(", ") : "0";
}

async function handleStats(argRaw) {
  const range = resolveRange(argRaw);
  const cutoff = range.cutoff();

  const [signups, purchases] = await Promise.all([
    countUsersSince(cutoff).catch((error) => {
      console.error("Signup count query failed:", error);
      return null;
    }),
    purchaseStatsSince(cutoff).catch((error) => {
      console.error("Purchase stats query failed:", error);
      return null;
    }),
  ]);

  const lines = [`Summary - ${range.label}`, ""];
  lines.push(signups != null ? `Signups: ${signups}` : "Signups: (error, see server logs)");
  lines.push(
    purchases != null
      ? `Purchases: ${purchases.count} (${formatRevenue(purchases.revenueByCurrency)})`
      : "Purchases: (error, see server logs)"
  );
  return lines.join("\n");
}

const FUNNEL_PRESETS = new Set(["today", "yesterday", "7d", "30d", "90d"]);

// Same data the admin dashboard's Overview page shows (getOverview in
// analyticsQueryService.js) — this bot is a second surface onto the exact
// same first-party analytics, not a separate stats system to keep in sync.
function fmtDelta({ value, deltaPct }, suffix = "") {
  const num = typeof value === "number" ? Math.round(value * 100) / 100 : value;
  if (deltaPct == null) return `${num}${suffix}`;
  const arrow = deltaPct > 0 ? "↑" : deltaPct < 0 ? "↓" : "→";
  return `${num}${suffix} (${arrow}${Math.abs(deltaPct)}%)`;
}

async function handleFunnel(argRaw) {
  const preset = FUNNEL_PRESETS.has((argRaw || "").toLowerCase()) ? argRaw.toLowerCase() : "7d";
  let overview;
  try {
    overview = await getOverview(resolveAnalyticsRange({ preset }));
  } catch (error) {
    console.error("Telegram /funnel query failed:", error);
    return "Couldn't load funnel data — see server logs.";
  }

  return [
    `Funnel - ${preset}`,
    "",
    `Visitors: ${fmtDelta(overview.visitors)}`,
    `New visitors: ${fmtDelta(overview.newVisitors)}`,
    `Signups: ${fmtDelta(overview.signups)}`,
    `Uploads: ${fmtDelta(overview.uploads)}`,
    `Masters: ${fmtDelta(overview.masters)}`,
    `Pricing views: ${fmtDelta(overview.pricingViews)}`,
    `Checkout starts: ${fmtDelta(overview.checkoutStarts)}`,
    `New customers: ${fmtDelta(overview.newCustomers)}`,
    `Revenue: ${fmtDelta(overview.revenue, " EUR")}`,
    "",
    `MRR: ${Math.round(overview.mrr)} EUR`,
    `Active subscribers: ${overview.activeSubscribers}`,
    `Cancellations: ${overview.cancellations}`,
    "",
    `Visitor -> Upload: ${overview.conversion.visitorToUpload}%`,
    `Visitor -> Master: ${overview.conversion.visitorToMaster}%`,
    `Visitor -> Paid: ${fmtDelta(overview.conversion.visitorToPaid, "%")}`,
    `Checkout -> Paid: ${overview.conversion.checkoutToPaid}%`,
  ].join("\n");
}

function normalizePreset(argRaw, fallback = "7d") {
  return FUNNEL_PRESETS.has((argRaw || "").toLowerCase()) ? argRaw.toLowerCase() : fallback;
}

// The rest of these mirror the admin dashboard's other tabs 1:1 (same
// analyticsQueryService.js functions, same numbers) — this bot is meant
// to be a full second surface onto that dashboard, not just an Overview
// summary, so checking Auralith from Telegram never means fewer numbers
// than opening /admin/analytics on a laptop.

async function handleAcquisition(argRaw) {
  const preset = normalizePreset(argRaw);
  let rows;
  try {
    rows = await getAcquisition(resolveAnalyticsRange({ preset }));
  } catch (error) {
    console.error("Telegram /acquisition query failed:", error);
    return "Couldn't load acquisition data — see server logs.";
  }
  if (!rows.length) return `Acquisition - ${preset}\n\nNo sessions in this period.`;
  const lines = [`Acquisition - ${preset}`, ""];
  for (const r of rows.slice(0, 8)) {
    lines.push(`${r.source}: ${r.visitors} visitors, ${r.masters} masters, ${r.customers} paid (${r.conversion}%), €${r.revenue.toFixed(2)}`);
  }
  return lines.join("\n");
}

async function handlePages(argRaw) {
  const preset = normalizePreset(argRaw);
  let rows;
  try {
    rows = await getPages(resolveAnalyticsRange({ preset }));
  } catch (error) {
    console.error("Telegram /pages query failed:", error);
    return "Couldn't load pages data — see server logs.";
  }
  if (!rows.length) return `Pages - ${preset}\n\nNo page views in this period.`;
  const lines = [`Pages - ${preset}`, ""];
  for (const r of rows.slice(0, 8)) {
    lines.push(`${r.path}: ${r.views} views, ${r.uniqueVisitors} visitors, ${r.avgActiveSeconds}s active, ${r.paid} paid (${r.conversion}%)`);
  }
  return lines.join("\n");
}

async function handleSeo(argRaw) {
  const preset = normalizePreset(argRaw, "30d");
  let data;
  try {
    data = await getSeoOverview(resolveAnalyticsRange({ preset }));
  } catch (error) {
    console.error("Telegram /seo query failed:", error);
    return "Couldn't load SEO data — see server logs.";
  }
  const lines = [
    `SEO (organic) - ${preset}`,
    "",
    `Organic visitors: ${data.organicVisitors}`,
    `Organic new visitors: ${data.organicNewVisitors}`,
    `Organic masters: ${data.organicMasters}`,
    `Organic customers: ${data.organicCustomers}`,
    `Organic revenue: €${data.organicRevenue.toFixed(2)}`,
    `Visitor -> Paid: ${data.organicVisitorToPaid}%`,
  ];
  if (data.pages.length) {
    lines.push("", "Top organic landing pages:");
    for (const r of data.pages.slice(0, 5)) {
      lines.push(`${r.path}: ${r.visitors} visitors, ${r.paid} paid, €${r.revenue.toFixed(2)}`);
    }
  }
  return lines.join("\n");
}

async function handleSales(argRaw) {
  const preset = normalizePreset(argRaw);
  let data;
  try {
    data = await getSales(resolveAnalyticsRange({ preset }));
  } catch (error) {
    console.error("Telegram /sales query failed:", error);
    return "Couldn't load sales data — see server logs.";
  }
  const lines = [
    `Sales - ${preset}`,
    "",
    `Revenue: €${data.revenue.toFixed(2)}`,
    `New customers: ${data.newCustomers}`,
    `Subscriptions created: ${data.subscriptionsCreated}`,
    `Renewals: ${data.renewals}`,
    `Cancellations: ${data.cancellations}`,
    `Refunds: ${data.refunds}`,
    "",
    `Checkout started: ${data.checkout.started}`,
    `Checkout succeeded: ${data.checkout.succeeded}`,
    `Checkout failed: ${data.checkout.failed}`,
    `Checkout abandoned: ${data.checkout.abandoned}`,
  ];
  if (data.failureReasons.length) {
    lines.push("", "Checkout failure reasons:");
    for (const r of data.failureReasons.slice(0, 6)) lines.push(`${r.reason}: ${r.count}`);
  }
  return lines.join("\n");
}

async function handleErrors(argRaw) {
  const preset = normalizePreset(argRaw);
  let rows;
  try {
    rows = await getErrors(resolveAnalyticsRange({ preset }));
  } catch (error) {
    console.error("Telegram /errors query failed:", error);
    return "Couldn't load errors data — see server logs.";
  }
  if (!rows.length) return `Errors - ${preset}\n\nNo funnel-affecting failures in this period.`;
  const lines = [`Errors - ${preset}`, ""];
  for (const r of rows.slice(0, 8)) {
    const trend = r.previousCount ? ` (was ${r.previousCount})` : "";
    lines.push(`${r.event} / ${r.reason}: ${r.count}${trend}, ${r.affectedSessions} sessions`);
  }
  return lines.join("\n");
}

async function handleRetention(argRaw) {
  const preset = normalizePreset(argRaw, "30d");
  let data;
  try {
    data = await getRetention(resolveAnalyticsRange({ preset }));
  } catch (error) {
    console.error("Telegram /retention query failed:", error);
    return "Couldn't load retention data — see server logs.";
  }
  return [
    `Retention - ${preset}`,
    "",
    `Unique visitors: ${data.uniqueVisitors}`,
    `Returning visitors: ${data.returningVisitors}`,
    `Returning %: ${data.returningPct}%`,
  ].join("\n");
}

async function handleMessage(msg) {
  // Only the configured admin chat is ever answered — a Telegram bot is
  // discoverable by anyone who finds its @username, so without this an
  // unrelated stranger who messages it could pull real revenue/traffic
  // numbers. Silent, not an error reply: nothing here should confirm to a
  // stranger that this bot does anything at all.
  if (String(msg.chat?.id) !== String(settings.telegramChatId)) return;

  const text = (msg.text || "").trim();
  if (!text.startsWith("/")) return;

  const [rawCommand, ...args] = text.split(/\s+/);
  const command = rawCommand.replace(/@\w+$/, "").toLowerCase(); // strip "@botname" suffix Telegram appends in group chats

  let reply;
  if (command === "/start" || command === "/help") {
    reply = HELP_TEXT;
  } else if (command === "/stats") {
    reply = await handleStats(args[0]);
  } else if (command === "/funnel") {
    reply = await handleFunnel(args[0]);
  } else if (command === "/acquisition") {
    reply = await handleAcquisition(args[0]);
  } else if (command === "/pages") {
    reply = await handlePages(args[0]);
  } else if (command === "/seo") {
    reply = await handleSeo(args[0]);
  } else if (command === "/sales") {
    reply = await handleSales(args[0]);
  } else if (command === "/errors") {
    reply = await handleErrors(args[0]);
  } else if (command === "/retention") {
    reply = await handleRetention(args[0]);
  } else {
    reply = `Unknown command.\n\n${HELP_TEXT}`;
  }

  await sendMessage(reply);
}

let polling = false;
let pollOffset = 0;

async function pollLoop() {
  while (polling) {
    let updates = [];
    try {
      // timeout:25 makes this call itself a long-poll (Telegram holds the
      // request open until an update arrives or the timeout elapses), so
      // the while loop doesn't need its own sleep on the happy path.
      updates = (await callTelegram("getUpdates", { offset: pollOffset, timeout: 25, allowed_updates: ["message"] })) || [];
    } catch (error) {
      console.error("Telegram getUpdates failed, retrying in 5s:", error.message);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }
    for (const update of updates) {
      pollOffset = update.update_id + 1;
      if (update.message) {
        try {
          await handleMessage(update.message);
        } catch (error) {
          console.error("Telegram command handling failed:", error);
        }
      }
    }
  }
}

// Registers the native "/" menu button Telegram shows next to the message
// box — without this, the commands above all work fine, they just aren't
// discoverable unless you already know to type them. One-time call, not
// per-message; Telegram remembers this until it's set again.
async function registerCommandMenu() {
  try {
    await callTelegram("setMyCommands", {
      commands: [
        { command: "stats", description: "Signups and purchases" },
        { command: "funnel", description: "Visitors, uploads, masters, revenue" },
        { command: "acquisition", description: "Visitors/revenue by source" },
        { command: "pages", description: "Views/active time per page" },
        { command: "seo", description: "Organic visitors, masters, revenue" },
        { command: "sales", description: "Revenue, subscriptions, checkout" },
        { command: "errors", description: "Upload/mastering/checkout failures" },
        { command: "retention", description: "Unique vs returning visitors" },
        { command: "help", description: "List commands" },
      ],
    });
  } catch (error) {
    console.error("Telegram setMyCommands failed (non-fatal):", error.message);
  }
}

export function startBot() {
  if (!configured()) {
    console.log("Telegram bot: TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID unset - notifications and commands disabled.");
    return;
  }
  if (polling) return;
  polling = true;
  registerCommandMenu();
  console.log("Telegram bot: listening for admin commands.");
  pollLoop();
}

