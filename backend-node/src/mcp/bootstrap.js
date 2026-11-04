// Production wiring for the MCP integration: real Firestore ledger, real
// Python engine, real job history. Imported dynamically by server.js only
// when MCP_ENABLED=true, so a disabled integration has no side effects at
// all (no SQLite file, no timers).
import { settings } from "../config/settings.js";
import { createLedger } from "../services/reservationLedger.js";
import { readUserData, entitlementsFromUserData } from "../services/entitlementsService.js";
import { planFromUserData, subscriptionStatusFromUserData } from "../services/polarService.js";
import { processMastering, deleteJobFiles, cancelPythonJob } from "../services/masteringService.js";
import { recordJob, deleteJob, ownsJob, getJob } from "../services/jobsService.js";
import { getMixPresetByName } from "../services/presetsService.js";
import { recordServerEvent } from "../services/analyticsService.js";
import { UPSTREAM_TIMEOUT_MS } from "../services/pythonUpstream.js";

import { loadMcpConfig, validateMcpConfig } from "./config.js";
import { createMcpStore } from "./store.js";
import { createMcpIntegration } from "./index.js";
import { checkFirebaseUser } from "./accountCheck.js";
import { registerMcpIntegration } from "./hooks.js";

export function bootstrapMcp() {
  const config = loadMcpConfig();
  const problems = validateMcpConfig(config, { nodeEnv: settings.nodeEnv });
  if (problems.length) {
    throw new Error(`MCP integration misconfigured:\n  - ${problems.join("\n  - ")}`);
  }
  if (settings.nodeEnv === "production" && !process.env.DOWNLOAD_TOKEN_SECRET) {
    throw new Error("MCP integration needs DOWNLOAD_TOKEN_SECRET set in production (it signs MCP upload/download links).");
  }
  const store = createMcpStore({ dbPath: config.dbPath });
  const integration = createMcpIntegration({
    config,
    store,
    deps: {
      secret: settings.downloadTokenSecret,
      uploadDir: settings.uploadDir,
      pythonApiBaseUrl: settings.pythonApiBaseUrl,
      upstreamTimeoutMs: UPSTREAM_TIMEOUT_MS,
      registerPerHour: Number(process.env.MCP_RATE_REGISTER_PER_HOUR || 200),
      ledger: createLedger(),
      readUserData,
      planFromUserData,
      subscriptionStatusFromUserData,
      entitlementsFromUserData,
      processMastering,
      recordJob,
      deleteJob,
      deleteJobFiles,
      cancelPythonJob,
      ownsJob,
      jobsService: { getJob },
      getMixPresetByName,
      recordServerEvent,
      checkUser: checkFirebaseUser,
    },
  });
  registerMcpIntegration(integration);
  return { config, integration };
}
