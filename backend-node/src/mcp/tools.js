import crypto from "node:crypto";
import path from "node:path";

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { CATEGORIES, DELIVERY_KEYS, FLAVOURS_BY_CATEGORY, GENRES, STYLES, TAGS } from "../config/constants.js";
import { MCP_SCOPES, SUPPORTED_UPLOAD_EXTS } from "./config.js";
import { ToolError } from "./toolError.js";

// The five MCP tools. A fresh McpServer is built per HTTP request
// (stateless Streamable HTTP), so nothing about one user's call can leak
// into another's: the only identity a handler ever sees is the uid from the
// verified OAuth access token (extra.authInfo), and every lookup below is
// scoped to it.

const PLAN_NAMES = { free: "Free", indie: "Indie", studio: "Studio", pro: "All-Access" };
const UPLOAD_ID = z.string().regex(/^[a-f0-9]{32}$/, "upload_id is the 32-character id returned by create_upload");
const JOB_ID = z.string().regex(/^[a-f0-9]{32}$/, "job_id is the 32-character id returned by start_mastering");

const ErrorShape = z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).passthrough();

function iso(ms) {
  return ms ? new Date(ms).toISOString() : null;
}

function securityMeta(scope, invoking, invoked) {
  return {
    securitySchemes: [{ type: "oauth2", scopes: [scope] }],
    "openai/toolInvocation/invoking": invoking,
    "openai/toolInvocation/invoked": invoked,
  };
}

function ok(structuredContent, text) {
  return { structuredContent, content: [{ type: "text", text: text ? `${text}\n\n${JSON.stringify(structuredContent)}` : JSON.stringify(structuredContent) }] };
}

function toolFailure(error, config, requiredScope) {
  const e =
    error instanceof ToolError
      ? error
      : new ToolError("internal_error", "Something went wrong on our side. Please try again.", { retryable: true });
  const body = { error: { code: e.code, message: e.message, retryable: e.retryable, ...(e.details || {}) } };
  const result = { isError: true, structuredContent: body, content: [{ type: "text", text: `${e.code}: ${e.message}` }] };
  if (e.code === "insufficient_scope") {
    // OpenAI's linking hint: lets ChatGPT re-run OAuth for the missing scope.
    result._meta = {
      "mcp/www_authenticate": [
        `Bearer resource_metadata="${config.publicOrigin}/.well-known/oauth-protected-resource/mcp", error="insufficient_scope", scope="${requiredScope}", error_description="Reconnect Auralith Forge to allow this action."`,
      ],
    };
  }
  return result;
}

function jobView(job) {
  const status = job.status;
  const view = {
    job_id: job.job_id,
    status,
    upload_id: job.upload_id,
    created_at: iso(job.created_at),
    started_at: iso(job.started_at),
    finished_at: iso(job.finished_at),
    error: status === "failed" ? { code: job.error_code || "render_failed", message: job.error_message || "Mastering failed.", retryable: Boolean(job.retryable) } : null,
  };
  if (status === "queued" || status === "processing") {
    view.poll_after_seconds = 15;
    view.next_step = "Mastering is running (usually 1–5 minutes). Call get_job_status again in about 15 seconds; do not start the job again.";
  } else if (status === "completed") {
    view.next_step = "Call get_master_result to get the measurements and the WAV download link.";
  } else {
    view.next_step = job.retryable ? "This failure is temporary. You have not been charged; start_mastering can be called again." : "Explain the error to the user. You have not been charged for a failed master.";
  }
  return view;
}

export function buildMcpServer({ auth, deps }) {
  const { config, store, limiter, jobRunner, signedUrls, readUserData, planFromUserData, subscriptionStatusFromUserData, entitlementsFromUserData, getMixPresetByName, jobsService, now = () => Date.now() } = deps;
  const uid = auth.extra.uid;

  const server = new McpServer(
    { name: "auralith-forge", title: "Auralith Forge", version: "1.0.0" },
    {
      instructions:
        "Auralith Forge masters music tracks with its own adaptive mastering engine, using the signed-in user's Auralith Forge plan and quota. " +
        "Workflow: get_account (plan, remaining masters, valid options) → create_upload (gives the user a link to upload their audio file) → after the user says the upload is done, start_mastering → poll get_job_status every ~15 s until completed → get_master_result for loudness/true-peak measurements and a temporary WAV download link. " +
        "Never invent upload ids or job ids; never call start_mastering twice for the same request (it is idempotent, but each new request may use a master from the user's quota).",
    },
  );

  // Wraps every handler: scope check, per-user budget, error mapping.
  function tool(name, { scope, budget, ...spec }, handler) {
    server.registerTool(name, spec, async (args) => {
      try {
        if (!auth.scopes.includes(scope)) {
          throw new ToolError("insufficient_scope", `This connection is not allowed to ${scope === MCP_SCOPES.write ? "upload or master tracks" : "read your account"}. Reconnect Auralith Forge and approve access.`);
        }
        if (budget && !limiter.hit(`${budget}:${uid}`, config.rateLimits[budget])) {
          throw new ToolError("rate_limited", "Too many requests in a short time. Wait a few minutes and try again.", { retryable: true });
        }
        return await handler(args ?? {});
      } catch (error) {
        if (!(error instanceof ToolError)) console.error(`MCP tool ${name} failed:`, error);
        return toolFailure(error, config, scope);
      }
    });
  }

  // ---- get_account ------------------------------------------------------
  tool(
    "get_account",
    {
      scope: MCP_SCOPES.read,
      title: "Get Auralith Forge account",
      description:
        "Returns the connected Auralith Forge account: plan, subscription status, how many masters remain (and whether they reset monthly), purchased single-master credits, whether the Professional engine is available, upload limits, and the exact genre/style/tag/delivery/category options start_mastering accepts. Call this first, and before starting a master if quota is uncertain.",
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({
        account: z.object({ email: z.string().nullable(), plan: z.string(), plan_name: z.string() }),
        subscription: z.object({ active: z.boolean(), status: z.string().nullable(), current_period_end: z.string().nullable() }),
        masters: z.object({ used: z.number(), remaining: z.number(), limit: z.number(), resets_monthly: z.boolean(), extra_credits: z.number(), can_master_now: z.boolean() }),
        professional_tier_available: z.boolean(),
        active_jobs: z.number(),
        limits: z.object({ max_upload_mb: z.number(), max_duration_minutes: z.number(), supported_formats: z.array(z.string()), output_format: z.string() }),
        options: z.object({
          genres: z.array(z.string()),
          styles: z.array(z.string()),
          tags: z.array(z.string()),
          delivery_targets: z.array(z.string()),
          tiers: z.array(z.string()),
          categories: z.record(z.array(z.string())),
        }),
        manage_billing_url: z.string(),
      }),
      annotations: { title: "Get account", readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
      _meta: securityMeta(MCP_SCOPES.read, "Checking your Auralith account…", "Checked your account"),
    },
    async () => {
      let data;
      try {
        data = await readUserData(uid);
      } catch {
        throw new ToolError("billing_unavailable", "Couldn't load your plan right now. Try again in a minute.", { retryable: true });
      }
      const plan = planFromUserData(data);
      const sub = subscriptionStatusFromUserData(data);
      const ent = entitlementsFromUserData(data, plan);
      const out = {
        account: { email: auth.extra.email || null, plan, plan_name: PLAN_NAMES[plan] || plan },
        subscription: { active: Boolean(sub.active), status: sub.status || null, current_period_end: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd?.toDate ? sub.currentPeriodEnd.toDate() : sub.currentPeriodEnd).toISOString() : null },
        masters: {
          used: ent.masterQuota.used,
          remaining: ent.masterQuota.remaining,
          limit: ent.masterQuota.limit,
          resets_monthly: ent.masterQuota.resets,
          extra_credits: ent.extraCredits,
          can_master_now: ent.masterQuota.remaining > 0 || ent.extraCredits > 0,
        },
        professional_tier_available: plan === "studio" || plan === "pro",
        active_jobs: store.countActiveJobs(uid),
        limits: { max_upload_mb: config.maxUploadMb, max_duration_minutes: config.maxDurationMinutes, supported_formats: SUPPORTED_UPLOAD_EXTS.map((e) => e.slice(1)), output_format: "wav" },
        options: {
          genres: GENRES,
          styles: STYLES,
          tags: TAGS,
          delivery_targets: DELIVERY_KEYS,
          tiers: plan === "studio" || plan === "pro" ? ["standard", "professional"] : ["standard"],
          categories: FLAVOURS_BY_CATEGORY,
        },
        manage_billing_url: `${config.publicOrigin}/app`,
      };
      const quotaText = out.masters.can_master_now
        ? `${out.masters.remaining} of ${out.masters.limit} masters left${out.masters.resets_monthly ? " this month" : " (one-time free trial)"}${out.masters.extra_credits ? `, plus ${out.masters.extra_credits} single-master credit(s)` : ""}.`
        : "No masters left on this plan right now.";
      return ok(out, `Plan: ${out.account.plan_name}. ${quotaText}`);
    },
  );

  // ---- create_upload ----------------------------------------------------
  tool(
    "create_upload",
    {
      scope: MCP_SCOPES.write,
      budget: "uploads",
      title: "Create an upload link",
      description:
        "Creates a temporary, single-use upload link for one audio file (WAV, AIFF, FLAC, MP3, AAC/M4A, OGG, WMA or WebM; size and duration limits from get_account). Show upload_url to the user as a clickable link and ask them to upload their track there, then wait until they confirm it is done before calling start_mastering with the returned upload_id. Does not use any quota.",
      inputSchema: z
        .object({
          filename: z.string().min(1).max(200).optional().describe("The track's file name if the user mentioned it (used only as a label, e.g. 'my-song.wav')."),
        })
        .strict(),
      outputSchema: z.object({
        upload_id: z.string(),
        upload_url: z.string(),
        put_url: z.string(),
        expires_at: z.string(),
        max_upload_mb: z.number(),
        max_duration_minutes: z.number(),
        accepted_formats: z.array(z.string()),
        next_step: z.string(),
      }),
      annotations: { title: "Create upload link", readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false },
      _meta: securityMeta(MCP_SCOPES.write, "Creating an upload link…", "Upload link ready"),
    },
    async ({ filename }) => {
      if (filename) {
        const ext = path.extname(filename).toLowerCase();
        if (ext && !SUPPORTED_UPLOAD_EXTS.includes(ext)) {
          throw new ToolError("invalid_input", `Unsupported file type "${ext}". Supported: ${SUPPORTED_UPLOAD_EXTS.join(", ")}.`);
        }
      }
      if (store.countOpenUploads(uid) >= config.maxPendingUploadsPerUser) {
        throw new ToolError("too_many_pending_uploads", "You have too many unused upload links. Use one of them, or wait about an hour for them to expire.", { retryable: true });
      }
      const uploadId = crypto.randomBytes(16).toString("hex");
      const t = now();
      const urlExpires = t + config.uploadUrlTtlS * 1000;
      store.insertUpload({
        upload_id: uploadId,
        uid,
        filename: filename ? path.basename(filename) : "track",
        ext: filename ? path.extname(filename).toLowerCase() : "",
        declared_bytes: null,
        created_at: t,
        url_expires_at: urlExpires,
        expires_at: urlExpires + config.uploadRetentionS * 1000,
      });
      const token = signedUrls.mintUpload(uploadId, urlExpires);
      const pathPart = `/mcp/upload/${uploadId}?token=${encodeURIComponent(token)}`;
      const out = {
        upload_id: uploadId,
        upload_url: `${config.publicOrigin}${pathPart}`,
        put_url: `${config.publicOrigin}${pathPart}&name=${encodeURIComponent(filename ? path.basename(filename) : "track.wav")}`,
        expires_at: iso(urlExpires),
        max_upload_mb: config.maxUploadMb,
        max_duration_minutes: config.maxDurationMinutes,
        accepted_formats: SUPPORTED_UPLOAD_EXTS.map((e) => e.slice(1)),
        next_step: "Give the user upload_url and ask them to upload the track there and tell you when it's done. Then call start_mastering with this upload_id.",
      };
      return ok(out, `Upload link (valid until ${out.expires_at}): ${out.upload_url}`);
    },
  );

  // ---- start_mastering --------------------------------------------------
  tool(
    "start_mastering",
    {
      scope: MCP_SCOPES.write,
      budget: "masters",
      title: "Start mastering",
      description:
        "Starts mastering an uploaded track with Auralith Forge's existing engine and presets, asynchronously. Returns a job_id immediately; then poll get_job_status. Uses one master from the user's plan quota (or a purchased single-master credit) — failed masters are refunded automatically. Idempotent: repeating the same call (same upload_id and settings, or the same idempotency_key) returns the existing job instead of mastering and charging again. Only call after the user confirmed the upload finished. genre is required unless mix_preset is given; use only values listed by get_account.",
      inputSchema: z
        .object({
          upload_id: UPLOAD_ID,
          genre: z.enum(GENRES).optional().describe("Musical genre; sets the loudness/tonal target."),
          style: z.enum(STYLES).default("modern").describe("Mastering style."),
          tags: z.array(z.enum(TAGS)).max(TAGS.length).default([]).describe("Optional tonal goals, e.g. warmer, louder, better_vocals."),
          tier: z.enum(["standard", "professional"]).default("standard").describe("'professional' needs the Studio or All-Access plan."),
          delivery: z.enum(DELIVERY_KEYS).default("auto").describe("Loudness target: auto (genre best practice), streaming (-14 LUFS), apple (-16 LUFS) or loud."),
          category: z.enum(CATEGORIES).optional().describe("Optional musical objective (clean, modern, dynamic, punch, club, warm, bright, vocal_focus, bass_control)."),
          flavour: z.string().max(40).optional().describe("Optional flavour of the category (see get_account options.categories)."),
          mix_preset: z.string().min(1).max(100).optional().describe("Optional name of an existing Auralith preset (built-in or the user's own saved preset)."),
          idempotency_key: z
            .string()
            .regex(/^[A-Za-z0-9_.:-]{8,128}$/)
            .optional()
            .describe("Optional client key; retries with the same key never create a second job."),
        })
        .strict(),
      outputSchema: z.object({
        job_id: z.string(),
        status: z.enum(["queued", "processing", "completed", "failed"]),
        deduplicated: z.boolean(),
        upload_id: z.string(),
        poll_after_seconds: z.number(),
        next_step: z.string(),
      }),
      annotations: { title: "Start mastering", readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
      _meta: securityMeta(MCP_SCOPES.write, "Starting your master…", "Mastering started"),
    },
    async (input) => {
      const upload = store.getUploadForUser(input.upload_id, uid);
      if (!upload) throw new ToolError("upload_not_found", "No upload with that id exists for this account. Create a new upload with create_upload.");
      if (upload.status === "pending" || upload.status === "receiving") {
        const why = upload.reject_message ? ` The last attempt was rejected: ${upload.reject_message}` : "";
        throw new ToolError("upload_not_ready", `The file hasn't been uploaded yet.${why} Ask the user to finish uploading at the link, then try again.`, { retryable: true });
      }
      if (upload.status === "rejected") throw new ToolError("upload_rejected", upload.reject_message || "The uploaded file was rejected. Create a new upload.");
      if (upload.status !== "uploaded" || upload.expires_at < now()) {
        throw new ToolError("upload_expired", "That upload has expired. Create a new upload with create_upload.");
      }

      if (!input.genre && !input.mix_preset) throw new ToolError("invalid_input", "genre is required unless mix_preset is given.");
      if (input.flavour) {
        if (!input.category) throw new ToolError("invalid_input", "flavour requires a category.");
        const valid = FLAVOURS_BY_CATEGORY[input.category] || [];
        if (!valid.includes(input.flavour)) throw new ToolError("invalid_input", `Invalid flavour '${input.flavour}' for category '${input.category}'. Options: ${valid.join(", ")}.`);
      }
      if (input.mix_preset) {
        const preset = await getMixPresetByName(input.mix_preset, uid).catch(() => null);
        if (!preset) throw new ToolError("invalid_input", `Unknown preset '${input.mix_preset}'.`);
      }

      const settings = {
        genre: input.genre || null,
        style: input.style,
        tags: [...new Set(input.tags)].sort(),
        tier: input.tier,
        delivery: input.delivery,
        category: input.category || null,
        flavour: input.flavour || null,
        mix_preset: input.mix_preset || null,
      };
      const idempotencyKey = input.idempotency_key ? `client:${input.idempotency_key}` : `auto:${crypto.createHash("sha256").update(JSON.stringify({ upload: upload.upload_id, ...settings })).digest("hex")}`;
      const jobId = crypto.randomUUID().replace(/-/g, "");
      const { job, deduplicated } = await jobRunner.submit({ uid, upload, settings, idempotencyKey, jobId });
      const view = jobView(job);
      const out = {
        job_id: job.job_id,
        status: job.status,
        deduplicated,
        upload_id: job.upload_id,
        poll_after_seconds: 15,
        next_step: deduplicated ? `This exact request was already submitted (job ${job.job_id}, ${job.status}); nothing new was started or charged. ${view.next_step}` : view.next_step,
      };
      return ok(out, deduplicated ? `Already submitted: job ${job.job_id} is ${job.status}.` : `Mastering started: job ${job.job_id}.`);
    },
  );

  // ---- get_job_status ---------------------------------------------------
  tool(
    "get_job_status",
    {
      scope: MCP_SCOPES.read,
      title: "Get mastering job status",
      description: "Returns the status of a mastering job started with start_mastering: queued, processing, completed or failed (with a stable error code and whether retrying makes sense). Poll about every 15 seconds while queued or processing.",
      inputSchema: z.object({ job_id: JOB_ID }).strict(),
      outputSchema: z.object({
        job_id: z.string(),
        status: z.enum(["queued", "processing", "completed", "failed"]),
        upload_id: z.string(),
        created_at: z.string().nullable(),
        started_at: z.string().nullable(),
        finished_at: z.string().nullable(),
        error: ErrorShape.nullable(),
        poll_after_seconds: z.number().optional(),
        next_step: z.string(),
      }),
      annotations: { title: "Get job status", readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
      _meta: securityMeta(MCP_SCOPES.read, "Checking the master…", "Checked the master"),
    },
    async ({ job_id: jobId }) => {
      const job = store.getJobForUser(jobId, uid);
      if (!job) throw new ToolError("job_not_found", "No mastering job with that id exists for this account.");
      const view = jobView(job);
      return ok(view, `Job ${job.job_id}: ${job.status}${view.error ? ` (${view.error.code})` : ""}.`);
    },
  );

  // ---- get_master_result ------------------------------------------------
  const MetricSet = z.object({
    integrated_lufs: z.number().nullable(),
    true_peak_dbtp: z.number().nullable(),
    loudness_range_lu: z.number().nullable(),
    crest_factor_db: z.number().nullable(),
    plr_db: z.number().nullable(),
    stereo_width: z.number().nullable(),
    stereo_correlation: z.number().nullable(),
  });
  tool(
    "get_master_result",
    {
      scope: MCP_SCOPES.read,
      title: "Get mastered result",
      description:
        "For a completed mastering job, returns the final measurements Auralith produced (integrated loudness in LUFS, true peak in dBTP, before/after loudness range, crest factor, PLR, stereo width/correlation, quality-control result and warnings) and a temporary download link for the mastered WAV. The link expires (see download.expires_at); call this tool again for a fresh link. Masters are kept for 48 hours.",
      inputSchema: z.object({ job_id: JOB_ID }).strict(),
      outputSchema: z.object({
        job_id: z.string(),
        status: z.literal("completed"),
        download: z.object({ url: z.string(), filename: z.string(), format: z.string(), expires_at: z.string(), file_available_until: z.string() }),
        measurements: z.object({
          integrated_lufs: z.number().nullable(),
          true_peak_dbtp: z.number().nullable(),
          before: MetricSet,
          after: MetricSet,
          target: z.object({ integrated_lufs: z.number().nullable(), true_peak_ceiling_dbtp: z.number().nullable(), genre: z.string().nullable(), style: z.string().nullable(), delivery: z.string().nullable() }),
          quality_control: z.object({ passed: z.boolean().nullable(), fail_count: z.number().nullable(), warn_count: z.number().nullable(), issues: z.array(z.string()) }),
          delivery_check: z.object({ passed: z.boolean().nullable(), format: z.string(), clipped_samples: z.number().nullable(), sample_peak_dbfs: z.number().nullable() }),
          improved: z.boolean().nullable(),
          verdict_reasons: z.array(z.string()),
          warnings: z.array(z.string()),
        }),
      }),
      annotations: { title: "Get master result", readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
      _meta: securityMeta(MCP_SCOPES.read, "Fetching your master…", "Master ready"),
    },
    async ({ job_id: jobId }) => {
      const job = store.getJobForUser(jobId, uid);
      if (!job) throw new ToolError("job_not_found", "No mastering job with that id exists for this account.");
      if (job.status === "failed") {
        throw new ToolError("job_failed", job.error_message || "This master failed. You have not been charged.", { retryable: Boolean(job.retryable), details: { job_status: "failed", failure_code: job.error_code || "render_failed" } });
      }
      if (job.status !== "completed") {
        throw new ToolError("job_not_complete", `This master is still ${job.status}. Call get_job_status again in about 15 seconds.`, { retryable: true, details: { job_status: job.status } });
      }
      const record = await jobsService.getJob(uid, jobId).catch(() => null);
      const fileExpires = record?.expires_at ? Date.parse(record.expires_at) : NaN;
      if (!record || !Number.isFinite(fileExpires) || fileExpires <= now()) {
        throw new ToolError("result_expired", "This master has expired (files are kept for 48 hours). Master the track again to get a new file.");
      }
      const summary = JSON.parse(job.result || "{}");
      const format = summary.output_format === "mp3" ? "mp3" : "wav";
      const linkExpires = Math.min(now() + config.downloadUrlTtlS * 1000, fileExpires);
      const token = signedUrls.mintDownload(uid, jobId, linkExpires);
      const base = path.basename(String(job.original_filename || "track"), path.extname(String(job.original_filename || ""))).replace(/[^A-Za-z0-9 ._-]+/g, "").trim().slice(0, 80) || "track";
      const { output_format: _fmt, ...measurements } = summary;
      const out = {
        job_id: jobId,
        status: "completed",
        download: {
          url: `${config.publicOrigin}/mcp/download/${jobId}?token=${encodeURIComponent(token)}`,
          filename: `${base} (Auralith master).${format}`,
          format,
          expires_at: iso(linkExpires),
          file_available_until: iso(fileExpires),
        },
        measurements,
      };
      const lufs = measurements.integrated_lufs != null ? `${measurements.integrated_lufs} LUFS integrated` : "loudness n/a";
      const tp = measurements.true_peak_dbtp != null ? `${measurements.true_peak_dbtp} dBTP true peak` : "true peak n/a";
      return ok(out, `Master ready: ${lufs}, ${tp}. Download (expires ${out.download.expires_at}): ${out.download.url}`);
    },
  );

  return server;
}
