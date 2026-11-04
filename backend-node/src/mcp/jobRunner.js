import fs from "node:fs";

import { toClientError } from "../services/clientError.js";
import { decideMasterCharge } from "../services/masterEntitlement.js";
import { partsFor } from "../services/reservationLedger.js";
import { STEM_MONTHLY_LIMIT } from "../services/entitlementsService.js";
import { ToolError } from "./toolError.js";

// Asynchronous mastering for MCP. start_mastering never holds the MCP
// request open for a render: it validates, charges (reserves) and enqueues,
// then returns a job id at once. The render runs in this process exactly
// like POST /master runs it — same reservation ledger (charge before render,
// refund on any failure, reconciler as the crash backstop), same
// processMastering() call into the Python engine, same recordJob() so the
// master also appears in the user's "My Masters" on the website and the
// existing ownership checks cover its files. Nothing about the DSP changes.
//
// Concurrency: at most config.maxConcurrentJobs MCP renders run at once
// (the Python service's own admission control still applies on top), so a
// burst from ChatGPT can't crowd website users out of the render slots. A
// queued job waits at most config.queueMaxWaitMs, which keeps the whole
// lifetime inside the reservation lease (25 min): a job that can't start in
// time fails and is refunded instead of being reconciled under itself.

const STEM_APPLIED = "applied";

function createSemaphore(max) {
  let active = 0;
  const waiters = [];
  return {
    get active() {
      return active;
    },
    get waiting() {
      return waiters.length;
    },
    acquire(timeoutMs) {
      if (active < max) {
        active += 1;
        return Promise.resolve(true);
      }
      return new Promise((resolve) => {
        const waiter = { resolve, timer: null };
        waiter.timer = setTimeout(() => {
          const i = waiters.indexOf(waiter);
          if (i >= 0) waiters.splice(i, 1);
          resolve(false);
        }, timeoutMs);
        waiter.timer.unref?.();
        waiters.push(waiter);
      });
    },
    release() {
      const next = waiters.shift();
      if (next) {
        clearTimeout(next.timer);
        next.resolve(true); // slot handed over; `active` unchanged
      } else {
        active = Math.max(0, active - 1);
      }
    },
  };
}

function round(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(digits)) : null;
}

// The measurements Auralith already produces, reduced to what a ChatGPT
// answer needs. Delivered-file values (delivery_check) win over the
// engine's in-memory ones: they describe the WAV the user downloads.
export function summarizeResult(result) {
  const before = result?.analysis_before || {};
  const after = result?.analysis_after || {};
  const delivery = result?.processing_applied?.delivery_check || {};
  const target = result?.target_profile_used || {};
  const qc = result?.quality_control || {};
  const ab = result?.ab_analysis || {};
  const metrics = (a) => ({
    integrated_lufs: round(a.integrated_lufs),
    true_peak_dbtp: round(a.true_peak_db),
    loudness_range_lu: round(a.loudness_range_lu),
    crest_factor_db: round(a.crest_factor_db),
    plr_db: round(a.plr_db),
    stereo_width: round(a.stereo_width_estimate, 3),
    stereo_correlation: round(a.stereo_correlation, 3),
  });
  const format = /\.mp3$/i.test(String(result?.download_url || "")) || delivery.format === "mp3" ? "mp3" : "wav";
  return {
    output_format: format,
    integrated_lufs: round(delivery.integrated_lufs ?? result?.after_lufs ?? after.integrated_lufs),
    true_peak_dbtp: round(delivery.true_peak_dbtp ?? after.true_peak_db),
    before: metrics(before),
    after: { ...metrics(after), integrated_lufs: round(delivery.integrated_lufs ?? after.integrated_lufs), true_peak_dbtp: round(delivery.true_peak_dbtp ?? after.true_peak_db) },
    target: {
      integrated_lufs: round(target.target_lufs),
      true_peak_ceiling_dbtp: round(target.true_peak_ceiling_dbtp),
      genre: target.genre || null,
      style: target.style || null,
      delivery: target.delivery || null,
    },
    quality_control: {
      passed: typeof qc.passed === "boolean" ? qc.passed : null,
      fail_count: Number.isFinite(qc.fail_count) ? qc.fail_count : null,
      warn_count: Number.isFinite(qc.warn_count) ? qc.warn_count : null,
      issues: Array.isArray(qc.issues) ? qc.issues.slice(0, 8).map(String) : [],
    },
    delivery_check: {
      passed: typeof delivery.passed === "boolean" ? delivery.passed : null,
      format: delivery.format || format,
      clipped_samples: Number.isFinite(delivery.clipped_samples) ? delivery.clipped_samples : null,
      sample_peak_dbfs: round(delivery.sample_peak_dbfs),
    },
    improved: typeof ab.improved === "boolean" ? ab.improved : null,
    verdict_reasons: Array.isArray(ab.verdict_reasons) ? ab.verdict_reasons.slice(0, 6).map(String) : [],
    warnings: Array.isArray(result?.source_warnings) ? result.source_warnings.slice(0, 8).map(String) : [],
  };
}

// processMastering() wraps upstream messages as `Mastering failed: "<detail>"`.
function cleanMessage(message) {
  const m = /^Mastering failed: (.*)$/s.exec(String(message || ""));
  if (!m) return String(message || "");
  try {
    const parsed = JSON.parse(m[1]);
    return typeof parsed === "string" ? parsed : m[1];
  } catch {
    return m[1];
  }
}

// Stable failure codes for get_job_status / get_master_result.
export function mapRenderFailure(error) {
  const { status, body } = toClientError(error, { fallbackDetail: "Mastering failed on our side. You have not been charged — please try again." });
  let code = body.code;
  if (status === 503) code = "server_busy";
  else if (status === 504) code = "processing_timeout";
  else if (!code) code = status === 413 ? "too_long" : status === 415 ? "unsupported_format" : status >= 500 ? "render_failed" : "invalid_audio";
  const retryable = status >= 500;
  // 4xx details are written for users; 5xx are already generic.
  const message = status < 500 || status === 503 || status === 504 ? cleanMessage(body.detail) : body.detail;
  return { code, message, retryable };
}

export function createJobRunner(deps) {
  const {
    store,
    config,
    ledger,
    readUserData,
    planFromUserData,
    entitlementsFromUserData,
    processMastering,
    recordJob,
    deleteJob,
    deleteJobFiles,
    cancelPythonJob,
    ownsJob,
    recordServerEvent = () => {},
    upstreamTimeoutMs,
    log = console,
  } = deps;

  const semaphore = createSemaphore(config.maxConcurrentJobs);
  const running = new Map(); // jobId -> promise (this process)

  async function refundWithRetry(jobId, reason, attempts = 3) {
    for (let i = 0; i < attempts; i += 1) {
      try {
        return await ledger.refund(jobId, reason);
      } catch (error) {
        log.error?.(`MCP: refund of ${jobId} failed (attempt ${i + 1}/${attempts}):`, error.message);
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, 250 * 4 ** i));
      }
    }
    return null; // lease expiry → reconcileReservations() refunds it
  }

  function fail(jobId, uid, settings, startedAt, { code, message, retryable }) {
    store.markJobFailed(jobId, code, message, retryable);
    recordServerEvent("master_failed", {
      uid,
      props: { tier: settings.tier, mastering_mode: "standard", source: "chatgpt_mcp", processing_duration_ms: startedAt ? Date.now() - startedAt : 0, reason: code },
    });
  }

  async function execute(job) {
    const { job_id: jobId, uid } = job;
    const settings = JSON.parse(job.settings);
    const acquired = await semaphore.acquire(config.queueMaxWaitMs);
    if (!acquired) {
      await refundWithRetry(jobId, "mcp_queue_timeout");
      fail(jobId, uid, settings, null, { code: "server_busy", message: "Auralith Forge is busy right now, so this master didn't start. You have not been charged — try again in a few minutes.", retryable: true });
      return;
    }
    const startedAt = Date.now();
    try {
      const upload = store.getUploadForUser(job.upload_id, uid);
      if (!upload || upload.status !== "uploaded" || !upload.file_path || !fs.existsSync(upload.file_path)) {
        await refundWithRetry(jobId, "mcp_upload_missing");
        fail(jobId, uid, settings, startedAt, { code: "upload_expired", message: "The uploaded file is no longer available. Create a new upload and try again. You have not been charged.", retryable: false });
        return;
      }
      store.markJobProcessing(jobId);
      await ledger.markProcessing(jobId).catch((error) => log.error?.(`MCP markProcessing ${jobId} failed:`, error.message));
      recordServerEvent("master_started", { uid, props: { tier: settings.tier, mastering_mode: "standard", source: "chatgpt_mcp" } });

      let result;
      try {
        result = await processMastering({
          jobId,
          deadlineEpochMs: Date.now() + upstreamTimeoutMs,
          file: { path: upload.file_path, originalname: upload.filename },
          referenceFile: null,
          uid,
          fields: {
            genre: settings.genre || null,
            style: settings.style || "modern",
            tags: settings.tags || [],
            tweaks: {},
            use_stem_separation: false,
            output_format: "wav",
            mix_preset: settings.mix_preset || null,
            tier: settings.tier,
            processing: null,
            category: settings.category || null,
            flavour: settings.flavour || null,
            delivery: settings.delivery || "auto",
          },
        });
      } catch (error) {
        await refundWithRetry(jobId, `mcp: ${error?.code || error?.message || "render failed"}`);
        if (error?.code === "processing_timeout" || error?.name === "UpstreamTimeoutError") {
          await cancelPythonJob(jobId);
          await deleteJobFiles(jobId).catch(() => {});
        }
        if (!error?.status || error.status >= 500) log.error?.(`MCP master failed (job ${jobId}):`, error?.message || error);
        fail(jobId, uid, settings, startedAt, mapRenderFailure(error));
        return;
      }

      // Same record as POST /master: makes the job the user's (ownsJob),
      // lists it in "My Masters", and lets the reconciler see it delivered.
      try {
        await recordJob(uid, {
          job_id: result.job_id || jobId,
          genre: settings.genre || null,
          style: settings.style || "modern",
          tier: settings.tier,
          output_format: "wav",
          original_filename: upload.filename,
          before_lufs: result.before_lufs,
          after_lufs: result.after_lufs,
          preview: false,
          analysis_before: result.analysis_before,
          analysis_after: result.analysis_after,
          ab_gain_match: result.ab_gain_match,
          processing_applied: result.processing_applied,
          target_profile_used: result.target_profile_used,
          source_warnings: result.source_warnings || [],
          quality_control: result.quality_control,
        });
      } catch (error) {
        log.error?.(`MCP: failed to record job ${jobId}:`, error.message);
      }

      let settled = null;
      try {
        settled = await ledger.complete(jobId, { refundStem: result?.stem_separation?.status !== STEM_APPLIED });
      } catch (error) {
        log.error?.(`MCP: completing reservation ${jobId} failed (reconciler will settle it):`, error.message);
      }
      if (settled && !settled.ok && settled.state === "refunded") {
        // The reconciler already refunded this render: never deliver an unpaid master.
        await deleteJob(uid, jobId).catch(() => {});
        await deleteJobFiles(jobId).catch(() => {});
        fail(jobId, uid, settings, startedAt, { code: "reservation_expired", message: "This master took too long and was cancelled. You have not been charged — please try again.", retryable: true });
        return;
      }

      store.markJobCompleted(jobId, summarizeResult(result));
      recordServerEvent("master_completed", {
        uid,
        props: { tier: settings.tier, mastering_mode: "standard", source: "chatgpt_mcp", processing_duration_ms: Date.now() - startedAt },
      });
    } catch (error) {
      // Unexpected bug in this function: settle safely.
      log.error?.(`MCP job ${jobId} crashed:`, error);
      await refundWithRetry(jobId, "mcp_internal_error");
      fail(jobId, uid, settings, startedAt, { code: "internal_error", message: "Something went wrong on our side. You have not been charged — please try again.", retryable: true });
    } finally {
      semaphore.release();
    }
  }

  function launch(job) {
    const p = execute(job)
      .catch((error) => log.error?.(`MCP job ${job.job_id} runner error:`, error))
      .finally(() => running.delete(job.job_id));
    running.set(job.job_id, p);
    return p;
  }

  // Entry point for start_mastering. Returns { job, deduplicated }.
  // Throws ToolError for anything the caller should see as a tool error.
  async function submit({ uid, upload, settings, idempotencyKey, jobId }) {
    // A duplicate of an earlier, non-failed request is answered with that
    // job before anything else — even if the quota has since run out.
    const earlier = store.getJobByKey(uid, idempotencyKey);
    if (earlier && earlier.status !== "failed") return { job: earlier, deduplicated: true };

    if (store.countActiveJobs(uid) >= config.maxActiveJobsPerUser) {
      throw new ToolError("too_many_active_jobs", `You already have ${config.maxActiveJobsPerUser} masters in progress. Wait for one to finish, then try again.`, { retryable: true });
    }

    // Read-only entitlement decision first, so an obviously refused request
    // leaves no job row behind. Fails closed (null snapshot = nothing left).
    const userData = await readUserData(uid).catch((error) => {
      log.error?.("MCP readUserData failed, failing closed:", error.message);
      return null;
    });
    const plan = userData ? planFromUserData(userData) : "free";
    const snapshot = userData ? entitlementsFromUserData(userData, plan) : null;
    const decision = decideMasterCharge({ plan, snapshot, tier: settings.tier, useStemSeparation: false });
    if (!decision.ok) throw new ToolError(decision.code, decision.detail, { retryable: false, details: { plan } });

    // Atomic claim of the idempotency key (two identical concurrent calls:
    // exactly one creates the job, the other gets it back).
    const claim = store.claimJob({ jobId, uid, uploadId: upload.upload_id, idempotencyKey, settings, originalFilename: upload.filename, maxActive: config.maxActiveJobsPerUser });
    if (claim.tooMany) {
      throw new ToolError("too_many_active_jobs", `You already have ${config.maxActiveJobsPerUser} masters in progress. Wait for one to finish, then try again.`, { retryable: true });
    }
    if (!claim.created) return { job: claim.job, deduplicated: true };

    // The authoritative, transactional charge (renderReservations/{jobId}).
    const parts = partsFor({ plan, quotaLimit: decision.quotaLimit, stemLimit: STEM_MONTHLY_LIMIT, needs: decision.needs });
    let reservation;
    try {
      reservation = await ledger.reserve({ reservationId: jobId, uid, plan, jobId, parts });
    } catch (error) {
      log.error?.("MCP render reservation failed, refusing:", error.message);
      store.markJobFailed(jobId, "billing_unavailable", "Couldn't confirm your plan right now. Nothing was charged — try again in a minute.", true);
      throw new ToolError("billing_unavailable", "Couldn't confirm your plan right now. Nothing was charged — try again in a minute.", { retryable: true });
    }
    if (!reservation.ok) {
      const message = "Your last available master was just used by another render. Buy a single master or upgrade in Settings → Billing on auralithforge.app.";
      store.markJobFailed(jobId, "quota_exhausted", message, false);
      throw new ToolError("quota_exhausted", message, { retryable: false, details: { plan } });
    }

    const job = store.getJob(jobId);
    launch(job);
    return { job, deduplicated: false, plan, charged: decision.needs.master };
  }

  // After a restart nothing in this process is running. A job whose master
  // was in fact delivered (recordJob happened) is completed from the job
  // record; anything else is failed — its reservation is refunded by the
  // existing reservation reconciler once the lease expires.
  async function recover({ getJobRecord, only = null } = {}) {
    let recovered = 0;
    for (const job of store.activeJobs()) {
      if (running.has(job.job_id) || (only && !only.has(job.job_id))) continue;
      let delivered = false;
      try {
        delivered = await ownsJob(job.uid, job.job_id);
      } catch {
        delivered = false;
      }
      if (delivered && getJobRecord) {
        const record = await getJobRecord(job.uid, job.job_id).catch(() => null);
        store.markJobCompleted(job.job_id, summarizeResult({ ...record, download_url: `/download/${job.job_id}.${record?.output_format || "wav"}` }));
      } else {
        await cancelPythonJob(job.job_id).catch(() => null);
        store.markJobFailed(job.job_id, "interrupted", "The server restarted while this master was in progress. You have not been charged — please start it again.", true);
      }
      recovered += 1;
    }
    return recovered;
  }

  return {
    submit,
    recover,
    isRunning: (jobId) => running.has(jobId),
    stats: () => ({ active: semaphore.active, waiting: semaphore.waiting, tracked: running.size }),
    // Test seam: wait for every in-flight job of this process.
    drain: () => Promise.allSettled([...running.values()]),
  };
}
