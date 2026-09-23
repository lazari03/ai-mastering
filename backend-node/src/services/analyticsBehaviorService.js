import analyticsDb from "../config/analyticsDb.js";

// ---------------------------------------------------------------------
// Behaviour insights — what visitors actually do, where they stop, and
// what to fix next. Built only from first-party sessions/events (no
// third-party data, no geography), for the admin "Behavior" page.
//
// One pass over the range: sessions + every non-heartbeat event, grouped
// by session in memory. Heartbeats are excluded in SQL — they're most of
// the table and carry nothing but active time, which the session row
// already sums.
// ---------------------------------------------------------------------

const MIN_SESSIONS_FOR_INSIGHTS = 30;
const ENGAGED_ACTIVE_MS = 10_000;

const TOOL_LABELS = {
  chord_detector: "Chord Detector",
  song_key_finder: "Song Key Finder",
  bpm_finder: "BPM Finder",
  chord_progression_finder: "Chord Progression Finder",
  lufs_meter: "LUFS Meter",
};

const sessionsStmt = analyticsDb.prepare(
  "SELECT session_id, visitor_id, uid, started_at, landing_page, device_category, is_new_visitor, page_view_count, active_ms, has_uploaded, has_mastered, has_viewed_pricing, has_started_checkout, has_paid FROM analytics_sessions WHERE started_at >= ? AND started_at < ?"
);
const eventsStmt = analyticsDb.prepare(
  "SELECT session_id, uid, name, ts, path, props_json, source FROM analytics_events WHERE name != 'heartbeat' AND ts >= ? AND ts < ? ORDER BY ts"
);

function rate(n, d) {
  return d ? Math.round((n / d) * 1000) / 10 : 0;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function cleanPath(path) {
  if (typeof path !== "string" || !path) return "/";
  return path.split("?")[0].split("#")[0] || "/";
}

function parseProps(json) {
  try {
    return json ? JSON.parse(json) : {};
  } catch {
    return {};
  }
}

// A step that's "reached" only if every earlier step was reached too, so
// the drop between two steps is a real drop, not two unrelated counts.
function nestedJourney(sessions, steps) {
  let remaining = sessions;
  let previous = null;
  return steps.map((step) => {
    remaining = remaining.filter(step.test);
    const count = remaining.length;
    const row = {
      key: step.key,
      label: step.label,
      count,
      pctOfStart: rate(count, sessions.length),
      dropFromPrevious: previous == null ? 0 : Math.round((previous - count) * 10) / 10,
      dropPct: previous ? rate(previous - count, previous) : 0,
    };
    previous = count;
    return row;
  });
}

export async function getBehavior({ from, to }) {
  const range = [from.toISOString(), to.toISOString()];
  const sessionRows = sessionsStmt.all(...range);
  const eventRows = eventsStmt.all(...range);

  // ---- group events by session; collect server-side facts by uid ------
  const bySession = new Map();
  const payerUids = new Set();
  const signupUids = new Set();
  let masterAttempts = 0;
  let masterFailures = 0;
  const failureReasons = new Map();
  let uploadFailures = 0;
  let analysisFailures = 0;

  for (const row of eventRows) {
    const evt = { name: row.name, ts: row.ts, path: row.path, props: parseProps(row.props_json), source: row.source, uid: row.uid };
    if (row.source === "backend") {
      if (row.name === "payment_succeeded" && row.uid) payerUids.add(row.uid);
      if (row.name === "sign_up" && row.uid) signupUids.add(row.uid);
      if (row.name === "master_started") masterAttempts++;
      if (row.name === "master_failed") {
        masterFailures++;
        const reason = evt.props.reason || "unknown";
        failureReasons.set(reason, (failureReasons.get(reason) || 0) + 1);
      }
      if (row.name === "analysis_failed") analysisFailures++;
    } else if (row.name === "audio_upload_failed") {
      uploadFailures++;
    }
    if (!row.session_id) continue;
    if (!bySession.has(row.session_id)) bySession.set(row.session_id, []);
    bySession.get(row.session_id).push(evt);
  }

  // ---- per-session behaviour flags ------------------------------------
  const sessions = sessionRows.map((s) => {
    const events = bySession.get(s.session_id) || [];
    const names = new Set(events.map((e) => e.name));
    const realMaster = events.some((e) => e.name === "master_completed" && e.props.preview !== true && e.props.preview !== "true");
    const pages = events.filter((e) => e.name === "page_view").map((e) => cleanPath(e.path));
    const actions = events.filter((e) => e.name !== "page_view");
    const firstMaster = events.find((e) => e.name === "master_completed" && e.props.preview !== true && e.props.preview !== "true");
    const toolsOpened = new Set(events.filter((e) => e.name === "free_tool_opened").map((e) => e.props.source_tool).filter(Boolean));
    const toolsCompleted = new Set(events.filter((e) => e.name === "free_tool_analysis_completed").map((e) => e.props.source_tool).filter(Boolean));
    const pageViews = Math.max(s.page_view_count || 0, pages.length);
    return {
      id: s.session_id,
      uid: s.uid,
      device: s.device_category || "unknown",
      isNew: Boolean(s.is_new_visitor),
      landing: cleanPath(s.landing_page),
      pages,
      pageViews,
      activeMs: s.active_ms || 0,
      startedAt: s.started_at,
      engaged: pageViews >= 2 || (s.active_ms || 0) >= ENGAGED_ACTIVE_MS || actions.some((e) => e.name !== "free_tool_opened"),
      tried: names.has("audio_upload_started") || names.has("free_tool_analysis_completed") || names.has("master_started") || Boolean(s.has_uploaded),
      mastered: Boolean(s.has_mastered) || realMaster,
      downloaded: names.has("download_completed"),
      pricing: Boolean(s.has_viewed_pricing) || names.has("pricing_view") || names.has("pricing_viewed"),
      checkout: Boolean(s.has_started_checkout) || names.has("checkout_started") || names.has("begin_checkout"),
      paid: Boolean(s.has_paid) || (s.uid ? payerUids.has(s.uid) : false),
      signedUp: s.uid ? signupUids.has(s.uid) : false,
      toolsOpened,
      toolsCompleted,
      secondsToFirstMaster: firstMaster ? Math.max(0, (new Date(firstMaster.ts) - new Date(s.started_at)) / 1000) : null,
    };
  });

  const total = sessions.length;
  const visitors = new Set(sessionRows.map((s) => s.uid || s.visitor_id)).size;

  // ---- journeys --------------------------------------------------------
  const productJourney = nestedJourney(sessions, [
    { key: "visited", label: "Visited", test: () => true },
    { key: "engaged", label: "Interacted (2+ pages, 10s+ active, or an action)", test: (s) => s.engaged },
    { key: "tried", label: "Tried a tool or uploaded audio", test: (s) => s.tried },
    { key: "mastered", label: "Completed a master", test: (s) => s.mastered },
    { key: "downloaded", label: "Downloaded the master", test: (s) => s.downloaded },
  ]);
  const purchaseJourney = nestedJourney(sessions, [
    { key: "pricing", label: "Viewed pricing", test: (s) => s.pricing },
    { key: "checkout", label: "Started checkout", test: (s) => s.checkout },
    { key: "paid", label: "Paid", test: (s) => s.paid },
  ]);

  // ---- engagement ------------------------------------------------------
  const bounced = sessions.filter((s) => !s.engaged);
  const activeSeconds = sessions.map((s) => s.activeMs / 1000);
  const buckets = [
    ["Under 10s", (v) => v < 10],
    ["10–60s", (v) => v >= 10 && v < 60],
    ["1–3 min", (v) => v >= 60 && v < 180],
    ["3–10 min", (v) => v >= 180 && v < 600],
    ["10 min+", (v) => v >= 600],
  ].map(([label, test]) => ({ label, count: activeSeconds.filter(test).length }));

  // ---- entry pages -----------------------------------------------------
  const entryMap = new Map();
  for (const s of sessions) {
    if (!entryMap.has(s.landing)) entryMap.set(s.landing, []);
    entryMap.get(s.landing).push(s);
  }
  const entryPages = [...entryMap.entries()]
    .map(([page, list]) => ({
      page,
      sessions: list.length,
      bounceRate: rate(list.filter((s) => !s.engaged).length, list.length),
      triedRate: rate(list.filter((s) => s.tried).length, list.length),
      masterRate: rate(list.filter((s) => s.mastered).length, list.length),
      signupRate: rate(list.filter((s) => s.signedUp).length, list.length),
    }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 12);

  // ---- where they go next ---------------------------------------------
  const transitions = new Map();
  let exitedAfterLanding = 0;
  for (const s of sessions) {
    const first = s.pages[0] || s.landing;
    const second = s.pages.find((p) => p !== first);
    if (!second) {
      exitedAfterLanding++;
      continue;
    }
    const key = `${first} → ${second}`;
    transitions.set(key, { from: first, to: second, count: (transitions.get(key)?.count || 0) + 1 });
  }
  const nextSteps = [...transitions.values()].sort((a, b) => b.count - a.count).slice(0, 10);

  // ---- free tools ------------------------------------------------------
  const toolStats = new Map();
  for (const s of sessions) {
    for (const tool of s.toolsOpened) {
      if (!toolStats.has(tool)) toolStats.set(tool, { opened: 0, completed: 0, mastered: 0 });
      const t = toolStats.get(tool);
      t.opened++;
      if (s.toolsCompleted.has(tool)) t.completed++;
      if (s.mastered) t.mastered++;
    }
  }
  const tools = [...toolStats.entries()]
    .map(([tool, t]) => ({
      tool,
      label: TOOL_LABELS[tool] || tool,
      opened: t.opened,
      completed: t.completed,
      completionRate: rate(t.completed, t.opened),
      thenMasteredRate: rate(t.mastered, t.opened),
    }))
    .sort((a, b) => b.opened - a.opened);

  // ---- devices and new vs returning -----------------------------------
  const segment = (list, keyFn, labelFn = (k) => k) => {
    const map = new Map();
    for (const s of list) {
      const k = keyFn(s);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(s);
    }
    return [...map.entries()]
      .map(([k, l]) => ({
        key: k,
        label: labelFn(k),
        sessions: l.length,
        share: rate(l.length, total),
        engagedRate: rate(l.filter((s) => s.engaged).length, l.length),
        triedRate: rate(l.filter((s) => s.tried).length, l.length),
        masterRate: rate(l.filter((s) => s.mastered).length, l.length),
        paidRate: rate(l.filter((s) => s.paid).length, l.length),
      }))
      .sort((a, b) => b.sessions - a.sessions);
  };
  const devices = segment(sessions, (s) => s.device);
  const visitorTypes = segment(sessions, (s) => (s.isNew ? "new" : "returning"), (k) => (k === "new" ? "New visitors" : "Returning visitors"));

  // ---- reliability and speed ------------------------------------------
  const failures = {
    masterAttempts,
    masterFailures,
    masterFailureRate: rate(masterFailures, masterAttempts),
    reasons: [...failureReasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    uploadFailures,
    analysisFailures,
  };
  const ttfm = sessions.map((s) => s.secondsToFirstMaster).filter((v) => v != null);
  const timeToFirstMaster = { medianSeconds: ttfm.length ? Math.round(median(ttfm)) : null, sessions: ttfm.length };

  const result = {
    range: { from, to },
    sample: { sessions: total, visitors, enough: total >= MIN_SESSIONS_FOR_INSIGHTS, minSessions: MIN_SESSIONS_FOR_INSIGHTS },
    productJourney,
    purchaseJourney,
    engagement: {
      bounceRate: rate(bounced.length, total),
      medianActiveSeconds: Math.round(median(activeSeconds) || 0),
      avgPagesPerSession: total ? Math.round((sessions.reduce((sum, s) => sum + s.pageViews, 0) / total) * 10) / 10 : 0,
      exitedAfterLandingRate: rate(exitedAfterLanding, total),
      buckets,
    },
    entryPages,
    nextSteps,
    tools,
    toolToMaster: {
      sessionsWithToolResult: sessions.filter((x) => x.toolsCompleted.size > 0).length,
      thenMastered: sessions.filter((x) => x.toolsCompleted.size > 0 && x.mastered).length,
    },
    devices,
    visitorTypes,
    failures,
    timeToFirstMaster,
  };
  result.insights = buildInsights(result);
  return result;
}

// ---------------------------------------------------------------------
// Rule-based "what to fix next". Each rule needs a minimum sample before
// it fires, so a handful of sessions can't produce confident advice.
// Ordered by severity, then by how many sessions the problem touches.
// ---------------------------------------------------------------------
const STEP_ADVICE = {
  engaged: {
    title: "Most visitors leave without doing anything",
    action:
      "Make the first screen of your top entry pages do something immediately: the tool or an audio before/after above the fold, one clear action, faster load on mobile.",
  },
  tried: {
    title: "Visitors look around but don't try the product",
    action:
      "Lower the cost of the first try: a built-in demo track ('try it with our sample'), a visible 'no signup needed' promise, and the upload box in the first viewport.",
  },
  mastered: {
    title: "People start but don't finish a master",
    action:
      "Check the failure reasons below first. Then shorten the path from upload to result: fewer choices before the first render, visible progress, and a free preview before any gate.",
  },
  downloaded: {
    title: "Masters are completed but not downloaded",
    action:
      "The result isn't convincing enough or the download is hard to find. Lead with the level-matched before/after comparison and make Download the primary button on the result.",
  },
};

function buildInsights(r) {
  const out = [];
  if (!r.sample.enough) {
    out.push({
      severity: "info",
      title: `Not enough data yet (${r.sample.sessions} sessions)`,
      detail: `Insights appear once this range has at least ${r.sample.minSessions} sessions. Widen the date range or come back after more traffic.`,
      action: "Drive a first batch of traffic (share a free tool in a producer community) so the numbers become meaningful.",
    });
    return out;
  }

  // Biggest drop in the product journey.
  const drops = r.productJourney.slice(1).map((step, i) => ({ step, prev: r.productJourney[i] })).filter(({ prev }) => prev.count >= 10);
  const worst = drops.sort((a, b) => b.step.dropPct - a.step.dropPct)[0];
  if (worst && worst.step.dropPct >= 40 && STEP_ADVICE[worst.step.key]) {
    const advice = STEP_ADVICE[worst.step.key];
    out.push({
      severity: worst.step.dropPct >= 70 ? "high" : "medium",
      title: advice.title,
      detail: `${worst.step.dropPct}% of sessions that reached "${worst.prev.label}" never reached "${worst.step.label}" (${worst.prev.count} → ${worst.step.count}). This is the biggest drop in the journey.`,
      action: advice.action,
      weight: worst.prev.count,
    });
  }

  // Entry pages that lose most visitors.
  for (const p of r.entryPages.filter((e) => e.sessions >= 15 && e.bounceRate >= 70).slice(0, 2)) {
    out.push({
      severity: "medium",
      title: `${p.page} loses ${p.bounceRate}% of visitors on arrival`,
      detail: `${p.sessions} sessions started here; only ${p.triedRate}% tried a tool.`,
      action: "Check that the page answers the search intent in the first screen and that the tool loads fast on mobile. Compare its first screen with your best-converting entry page.",
      weight: p.sessions,
    });
  }

  // Mobile vs desktop gap.
  const mobile = r.devices.find((d) => d.key === "mobile");
  const desktop = r.devices.find((d) => d.key === "desktop");
  if (mobile && desktop && mobile.sessions >= 15 && desktop.sessions >= 15 && desktop.triedRate > 0 && mobile.triedRate < desktop.triedRate * 0.5) {
    out.push({
      severity: "high",
      title: "Mobile visitors rarely try the product",
      detail: `${mobile.triedRate}% of mobile sessions try a tool vs ${desktop.triedRate}% on desktop, and mobile is ${mobile.share}% of traffic.`,
      action:
        "Test the upload flow on a real phone: the file picker (Files/Voice Memos), large WAV uploads on cellular, and the wait screen. Consider a 'send to desktop' link or a 30-second preview for mobile.",
      weight: mobile.sessions,
    });
  }

  // Reliability.
  if (r.failures.masterAttempts >= 10 && r.failures.masterFailureRate >= 5) {
    const top = r.failures.reasons[0];
    out.push({
      severity: "high",
      title: `${r.failures.masterFailureRate}% of masters fail`,
      detail: `${r.failures.masterFailures} of ${r.failures.masterAttempts} renders failed${top ? `; most common reason: ${top.reason} (${top.count})` : ""}.`,
      action: "Fix the top failure reason before any marketing work — every failed master is a visitor who was ready to convert.",
      weight: r.failures.masterAttempts,
    });
  }

  // Free tools that don't deliver a result.
  for (const t of r.tools.filter((x) => x.opened >= 20 && x.completionRate < 25).slice(0, 2)) {
    out.push({
      severity: "medium",
      title: `${t.label}: few visitors get a result`,
      detail: `Opened in ${t.opened} sessions, completed in ${t.completed} (${t.completionRate}%).`,
      action: "Most visitors land without a file ready. Offer a sample file, accept drag-and-drop of any format, and show the example result right next to the upload.",
      weight: t.opened,
    });
  }

  // Free tools that don't lead to mastering.
  const { sessionsWithToolResult: toolTotal, thenMastered } = r.toolToMaster;
  if (toolTotal >= 20) {
    if (rate(thenMastered, toolTotal) < 5) {
      out.push({
        severity: "medium",
        title: "Free tools bring traffic but not masters",
        detail: `${toolTotal} sessions got a free-tool result; ${thenMastered} of them (${rate(thenMastered, toolTotal)}%) went on to master a track.`,
        action: "Add a contextual next step on the tool result ('Your track is at −8 LUFS — hear it mastered for streaming') that carries the same file into mastering.",
        weight: toolTotal,
      });
    }
  }

  // Purchase journey.
  const [pricing, checkout, paid] = r.purchaseJourney;
  if (pricing.count >= 15 && rate(checkout.count, pricing.count) < 10) {
    out.push({
      severity: "medium",
      title: "Pricing is viewed but checkout rarely starts",
      detail: `${pricing.count} sessions viewed pricing; ${checkout.count} started checkout (${rate(checkout.count, pricing.count)}%).`,
      action: "Show what the free tier already did for them next to the plans, make the cheapest step obvious (single master / Indie), and state cancellation terms plainly.",
      weight: pricing.count,
    });
  }
  if (checkout.count >= 5 && rate(paid.count, checkout.count) < 50) {
    out.push({
      severity: "high",
      title: "Checkouts are abandoned",
      detail: `${checkout.count} checkouts started, ${paid.count} paid (${rate(paid.count, checkout.count)}%).`,
      action: "Walk through checkout yourself on mobile, check currency and VAT display and payment methods, and add an abandoned-checkout email.",
      weight: checkout.count,
    });
  }

  // Retention.
  const returning = r.visitorTypes.find((v) => v.key === "returning");
  if (r.sample.sessions >= 50 && (!returning || returning.share < 15)) {
    out.push({
      severity: "info",
      title: "Few visitors come back",
      detail: `Returning visitors are ${returning ? returning.share : 0}% of sessions.`,
      action: "Give people a reason to return: email the master link and the report, a 'master your next track' reminder, and the newsletter offer after a successful master.",
      weight: r.sample.sessions,
    });
  }

  // Speed to value.
  if (r.timeToFirstMaster.sessions >= 10 && r.timeToFirstMaster.medianSeconds > 300) {
    out.push({
      severity: "medium",
      title: "It takes too long to reach the first master",
      detail: `Median ${Math.round(r.timeToFirstMaster.medianSeconds / 60)} min from arrival to first completed master.`,
      action: "Remove steps before the first render (defaults instead of choices) and render a short preview first while the full master processes.",
      weight: r.timeToFirstMaster.sessions,
    });
  }

  if (out.length === 0) {
    out.push({
      severity: "info",
      title: "No major leak detected in this range",
      detail: "No step of the journey loses an unusual share of visitors.",
      action: "Grow top-of-funnel traffic: the tools and guides with the best tried-rate are the ones to promote.",
    });
  }

  const order = { high: 0, medium: 1, info: 2 };
  return out
    .sort((a, b) => order[a.severity] - order[b.severity] || (b.weight || 0) - (a.weight || 0))
    .slice(0, 6)
    .map(({ weight, ...rest }) => rest);
}
