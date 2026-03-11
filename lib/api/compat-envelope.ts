/**
 * Compatibility Envelope — Canonical response shapes for thin-client consumption.
 *
 * Both waifu-core (MiladyClient) and milady-cloud (frontend) consume these
 * shapes. The field naming is a union of both conventions so each client
 * gets what it expects and ignores the rest.
 *
 * Every response is wrapped in: { success: boolean, data?: T, error?: string }
 *
 * Compat create + job polling is synthesized from the current sandbox row.
 * There is no separate compat job record, so `jobId` intentionally aliases
 * the sandbox/agent id in create results, op results, and GET /api/compat/jobs/:jobId.
 *
 * Status mapping:
 *   eliza-cloud "pending"       → thin-client "queued"
 *   eliza-cloud "provisioning"  → thin-client "provisioning"
 *   eliza-cloud "running"       → thin-client "running"
 *   eliza-cloud "stopped"       → thin-client "stopped"
 *   eliza-cloud "disconnected"  → thin-client "stopped"
 *   eliza-cloud "error"         → thin-client "failed"
 */

import type { MiladySandbox, MiladySandboxStatus } from "@/db/schemas/milady-sandboxes";

function getAgentWebUiUrl(sandbox: MiladySandbox): string | null {
  if (!sandbox.headscale_ip) {
    return null;
  }

  const configuredDomain =
    process.env.ELIZA_CLOUD_AGENT_BASE_DOMAIN ?? "agents.example.com";
  const normalizedDomain = configuredDomain
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.+$/, "");

  if (!normalizedDomain) {
    return null;
  }

  return `https://${sandbox.id}.${normalizedDomain}`;
}

// ---------------------------------------------------------------------------
// Agent shape (union of milady-cloud + waifu-core fields)
// ---------------------------------------------------------------------------

export interface CompatAgentShape {
  // milady-cloud fields (snake_case)
  agent_id: string;
  agent_name: string;
  node_id: string | null;
  container_id: string | null;
  headscale_ip: string | null;
  bridge_url: string | null;
  web_ui_url: string | null;
  status: string;
  agent_config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // waifu-core aliases (camelCase)
  containerUrl: string;
  webUiUrl: string | null;
  // extras both can use
  database_status: string;
  error_message: string | null;
  last_heartbeat_at: string | null;
}

/**
 * Translate a MiladySandbox row to the canonical Agent shape.
 */
export function toCompatAgent(sandbox: MiladySandbox): CompatAgentShape {
  const webUiUrl = getAgentWebUiUrl(sandbox);

  return {
    agent_id: sandbox.id,
    agent_name: sandbox.agent_name ?? "",
    node_id: sandbox.node_id ?? null,
    container_id: sandbox.container_name ?? sandbox.sandbox_id ?? null,
    headscale_ip: sandbox.headscale_ip ?? null,
    bridge_url: sandbox.bridge_url ?? null,
    web_ui_url: webUiUrl,
    status: mapStatus(sandbox.status),
    agent_config: (sandbox.agent_config as Record<string, unknown>) ?? {},
    created_at: toISO(sandbox.created_at),
    updated_at: toISO(sandbox.updated_at),
    containerUrl: sandbox.bridge_url ?? "",
    webUiUrl,
    database_status: sandbox.database_status,
    error_message: sandbox.error_message,
    last_heartbeat_at: sandbox.last_heartbeat_at ? toISO(sandbox.last_heartbeat_at) : null,
  };
}

// ---------------------------------------------------------------------------
// Create result shape
// ---------------------------------------------------------------------------

export interface CompatCreateResultShape {
  agentId: string;
  agentName: string;
  // Thin clients poll /api/compat/jobs/:jobId, but compat reuses the agent ID
  // because v2 does not persist a separate async job row for agent creation.
  jobId: string;
  status: string;
  nodeId: string | null;
  message: string;
}

/**
 * Translate a newly created sandbox to the CreateResult shape.
 * `jobId` intentionally equals `agentId` because compat job polling
 * synthesizes status from the same sandbox row.
 */
export function toCompatCreateResult(sandbox: MiladySandbox): CompatCreateResultShape {
  return {
    agentId: sandbox.id,
    agentName: sandbox.agent_name ?? "",
    jobId: sandbox.id,
    status: mapStatus(sandbox.status),
    nodeId: sandbox.node_id ?? null,
    message:
      sandbox.status === "running"
        ? "agent provisioned and running"
        : "agent creation queued, poll GET /api/compat/jobs/:jobId for status",
  };
}

// ---------------------------------------------------------------------------
// Operation result shape (restart, delete, suspend, resume)
// ---------------------------------------------------------------------------

export interface CompatOpResultShape {
  jobId: string;
  status: string;
  message: string;
}

/**
 * Synthesize a result for an operation (restart, delete, suspend, resume).
 * `jobId` intentionally aliases `agentId` for the same compat polling contract.
 */
export function toCompatOpResult(
  agentId: string,
  action: string,
  success: boolean,
): CompatOpResultShape {
  return {
    jobId: agentId,
    status: success ? "completed" : "failed",
    message: success
      ? `agent ${action} completed`
      : `agent ${action} failed`,
  };
}

// ---------------------------------------------------------------------------
// Job status shape — union of milady-cloud Job + waifu-core MiladyJob
// ---------------------------------------------------------------------------

export interface CompatJobShape {
  // milady-cloud Job fields
  // Compat job polling is synthesized from the agent record, so jobId/id alias
  // the agent ID instead of a standalone job-table primary key.
  jobId: string;
  type: string;
  status: "queued" | "processing" | "completed" | "failed" | "retrying";
  data: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  retryCount: number;
  // waifu-core MiladyJob aliases
  id: string;
  name: string;
  state: string;
  created_on: string;
  completed_on: string | null;
}

/**
 * Synthesize a Job record from a MiladySandbox's current state.
 */
export function toCompatJob(sandbox: MiladySandbox): CompatJobShape {
  const jobStatus = mapStatusToJobStatus(sandbox.status);
  const isTerminal = jobStatus === "completed" || jobStatus === "failed";
  const compatStatus = mapStatus(sandbox.status);

  const data = {
    agentId: sandbox.id,
    agentName: sandbox.agent_name,
    status: compatStatus,
    bridgeUrl: sandbox.bridge_url,
    errorMessage: sandbox.error_message,
  };

  // waifu-core treats a successfully provisioned agent as a completed create job,
  // even if the agent itself remains running afterward. This state machine is
  // distinct from the live agent status exposed via `data.status` / `result.status`.
  const waifuStateMap: Record<string, string> = {
    pending: "waiting",
    provisioning: "active",
    running: "completed",
    stopped: "completed",
    disconnected: "completed",
    error: "failed",
  };

  return {
    jobId: sandbox.id,
    type: "create-agent",
    status: jobStatus,
    data,
    result: isTerminal
        ? {
          agentId: sandbox.id,
          agentName: sandbox.agent_name,
          status: compatStatus,
          bridgeUrl: sandbox.bridge_url,
        }
      : null,
    error: sandbox.error_message ?? null,
    createdAt: toISO(sandbox.created_at),
    startedAt: sandbox.status !== "pending" ? toISO(sandbox.updated_at) : null,
    completedAt: isTerminal ? toISO(sandbox.updated_at) : null,
    retryCount: sandbox.error_count ?? 0,
    id: sandbox.id,
    name: "provision",
    state: waifuStateMap[sandbox.status] ?? "unknown",
    created_on: toISO(sandbox.created_at),
    completed_on: isTerminal ? toISO(sandbox.updated_at) : null,
  };
}

// ---------------------------------------------------------------------------
// Status shape — canonical status response
// ---------------------------------------------------------------------------

export interface CompatStatusShape {
  status: string;
  lastHeartbeat: string | null;
  bridgeUrl: string | null;
  webUiUrl: string | null;
  currentNode: string | null;
  suspendedReason: string | null;
  databaseStatus: string;
}

/**
 * Build canonical status payload from a sandbox record.
 */
export function toCompatStatus(sandbox: MiladySandbox): CompatStatusShape {
  const webUiUrl = getAgentWebUiUrl(sandbox);

  return {
    status: mapStatus(sandbox.status),
    lastHeartbeat: sandbox.last_heartbeat_at ? toISO(sandbox.last_heartbeat_at) : null,
    bridgeUrl: sandbox.bridge_url ?? null,
    webUiUrl,
    currentNode: sandbox.node_id ?? null,
    suspendedReason: sandbox.error_message ?? null,
    databaseStatus: sandbox.database_status,
  };
}

// ---------------------------------------------------------------------------
// Usage shape — canonical usage response
// ---------------------------------------------------------------------------

export interface CompatUsageShape {
  uptimeHours: number;
  estimatedDailyBurnUsd: number;
  currentPeriodCostUsd: number;
  fundingSource: string;
  status: string;
}

/**
 * Build canonical usage payload from a sandbox record.
 */
export function toCompatUsage(sandbox: MiladySandbox): CompatUsageShape {
  const createdAt = new Date(sandbox.created_at);
  const now = new Date();
  const uptimeMs = sandbox.status === "running" ? now.getTime() - createdAt.getTime() : 0;
  const uptimeHours = Math.round((uptimeMs / (1000 * 60 * 60)) * 100) / 100;

  const config = (sandbox.agent_config ?? {}) as Record<string, unknown>;
  const billing = config.billing as Record<string, unknown> | undefined;
  const fundingSource = (billing?.mode as string) ?? "unknown";

  return {
    uptimeHours,
    estimatedDailyBurnUsd: 0,
    currentPeriodCostUsd: 0,
    fundingSource,
    status: mapStatus(sandbox.status),
  };
}

// ---------------------------------------------------------------------------
// Status mapping helpers
// ---------------------------------------------------------------------------

/**
 * Map internal sandbox status to thin-client status.
 * milady-cloud frontend expects: queued | provisioning | running | stopped | failed
 */
export function mapStatus(status: MiladySandboxStatus): string {
  switch (status) {
    case "pending":
      return "queued";
    case "provisioning":
      return "provisioning";
    case "running":
      return "running";
    case "stopped":
      return "stopped";
    case "disconnected":
      return "stopped";
    case "error":
      return "failed";
    default:
      return status;
  }
}

/**
 * Map sandbox status to **job** status (not agent status).
 *
 * The "job" represents the provisioning task, not the live agent lifecycle.
 * A "stopped" or "disconnected" agent still had its provisioning complete
 * successfully, so the job status is "completed". The live agent status
 * is conveyed separately via `data.status` / `result.status` in the job
 * payload (see `toCompatJob`).
 */
function mapStatusToJobStatus(
  status: MiladySandboxStatus,
): CompatJobShape["status"] {
  switch (status) {
    case "pending":
      return "queued";
    case "provisioning":
      return "processing";
    case "running":
      return "completed";
    case "stopped":         // provisioning succeeded; agent later stopped
      return "completed";
    case "disconnected":    // provisioning succeeded; agent later disconnected
      return "completed";
    case "error":
      return "failed";
    default:
      return "queued";
  }
}

// ---------------------------------------------------------------------------
// Envelope helper
// ---------------------------------------------------------------------------

/**
 * Standard envelope wrapper. All compat routes return this shape.
 */
export function envelope<T>(data: T): { success: true; data: T } {
  return { success: true, data };
}

export function errorEnvelope(message: string): { success: false; error: string } {
  return { success: false, error: message };
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Convert a date-ish value to an ISO string for compat JSON responses.
 *
 * When the value is null/undefined we return the Unix epoch ("1970-01-01T…")
 * rather than the current time — this is intentional: compat clients interpret
 * a zero-epoch as "not set" and it avoids silently injecting now() which would
 * be misleading.  Callers that need nullable semantics should check before
 * calling (e.g. `value ? toISO(value) : null`).
 */
function toISO(value: Date | string | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
}
