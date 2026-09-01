import { settings } from "../config/settings.js";
import { getFirestore } from "../config/firebase.js";
import { getTrafficSummary, getTopPages } from "./ga4Service.js";

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

// ---------------------------------------------------------------------
// On-demand stats commands — /pageviews, /stats, /help. Long-polls
// getUpdates rather than registering a webhook: this is a single admin
// talking to their own bot, so there's no reason to expose a new public
// HTTP endpoint (and verify Telegram's request signature) just to receive
// commands nobody but one person will ever send.
// ---------------------------------------------------------------------

const HELP_TEXT = [
  "Auralith Forge bot",
  "",
  "/pageviews [today|7d|30d] - GA4 traffic + top pages (default 7d)",
  "/stats [today|7d|30d] - signups, purchases, and traffic in one summary (default today)",
  "/help - this message",
].join("\n");

const RANGES = {
  today: { label: "today", ga4Start: "today", cutoff: () => new Date(new Date().setHours(0, 0, 0, 0)) },
  "7d": { label: "last 7 days", ga4Start: "7daysAgo", cutoff: () => new Date(Date.now() - 7 * 86400000) },
  "30d": { label: "last 30 days", ga4Start: "30daysAgo", cutoff: () => new Date(Date.now() - 30 * 86400000) },
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

async function handlePageviews(argRaw) {
  if (!settings.ga4PropertyId) {
    return "GA4 isn't configured (GA4_PROPERTY_ID unset) - no traffic data to show.";
  }
  const range = resolveRange(argRaw);
  try {
    const [summary, topPages] = await Promise.all([getTrafficSummary(range.ga4Start), getTopPages(range.ga4Start)]);
    const lines = [
      `Traffic - ${range.label}`,
      `${summary.pageViews} pageviews, ${summary.sessions} sessions, ${summary.activeUsers} users (${summary.newUsers} new)`,
      "",
      "Top pages:",
      ...(topPages.length ? topPages.map((p) => `${p.pageViews}  ${p.path}`) : ["(no data)"]),
    ];
    return lines.join("\n");
  } catch (error) {
    console.error("GA4 query failed:", error);
    return `Couldn't fetch GA4 data: ${error.message}`;
  }
}

async function handleStats(argRaw) {
  const range = resolveRange(argRaw);
  const cutoff = range.cutoff();

  const [signups, purchases, traffic] = await Promise.all([
    countUsersSince(cutoff).catch((error) => {
      console.error("Signup count query failed:", error);
      return null;
    }),
    purchaseStatsSince(cutoff).catch((error) => {
      console.error("Purchase stats query failed:", error);
      return null;
    }),
    settings.ga4PropertyId
      ? getTrafficSummary(range.ga4Start).catch((error) => {
          console.error("GA4 query failed:", error);
          return null;
        })
      : Promise.resolve(null),
  ]);

  const lines = [`Summary - ${range.label}`, ""];
  lines.push(signups != null ? `Signups: ${signups}` : "Signups: (error, see server logs)");
  lines.push(
    purchases != null
      ? `Purchases: ${purchases.count} (${formatRevenue(purchases.revenueByCurrency)})`
      : "Purchases: (error, see server logs)"
  );
  lines.push(
    traffic
      ? `Pageviews: ${traffic.pageViews}, sessions: ${traffic.sessions}, users: ${traffic.activeUsers}`
      : settings.ga4PropertyId
        ? "Pageviews: (error, see server logs)"
        : "Pageviews: GA4 not configured"
  );
  return lines.join("\n");
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
  } else if (command === "/pageviews") {
    reply = await handlePageviews(args[0]);
  } else if (command === "/stats") {
    reply = await handleStats(args[0]);
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
        { command: "stats", description: "Signups, purchases, and traffic in one summary" },
        { command: "pageviews", description: "Visitor traffic + top pages" },
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

