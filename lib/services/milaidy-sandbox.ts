/**
 * Milady Sandbox Service — orchestrates cloud agent lifecycle:
 * Neon DB provisioning, Vercel Sandbox creation, bridge proxy, backups, heartbeat.
 */

import { logger } from "@/lib/utils/logger";
import { getNeonClient } from "./neon-client";
import {
  miladySandboxesRepository,
  type MiladySandbox, type MiladySandboxBackup,
  type MiladyBackupSnapshotType,
} from "@/db/repositories/milady-sandboxes";
import type { MiladyBackupStateData } from "@/db/schemas/milady-sandboxes";

export interface CreateAgentParams {
  organizationId: string;
  userId: string;
  agentName: string;
  agentConfig?: Record<string, unknown>;
  environmentVars?: Record<string, string>;
}

export type ProvisionResult =
  | { success: true; sandboxRecord: MiladySandbox; bridgeUrl: string; healthUrl: string }
  | { success: false; sandboxRecord?: MiladySandbox; error: string };

export interface BridgeRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface BridgeResponse {
  jsonrpc: "2.0";
  id?: string | number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

export interface SnapshotResult {
  success: boolean;
  backup?: MiladySandboxBackup;
  error?: string;
}

// Set MILADY_AGENT_TEMPLATE_URL to override the default template repo.
// The template must contain package.json + entrypoint.ts (see milady/deploy/cloud-agent-template/).
const CLOUD_AGENT_TEMPLATE_URL = process.env.MILADY_AGENT_TEMPLATE_URL ?? "https://github.com/elizaos/milady-cloud-agent-template.git";
const SANDBOX_TIMEOUT_MS = 30 * 60 * 1000;
const SANDBOX_VCPUS = 4;
const SANDBOX_HEALTH_PORT = 2138;
const SANDBOX_BRIDGE_PORT = 18790;
const HEALTH_CHECK_TIMEOUT_MS = 60_000;
const HEALTH_CHECK_INTERVAL_MS = 2_000;
const MAX_BACKUPS = 10;

function sanitizeProjectNameSegment(value: string): string {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20);

  return sanitized || "agent";
}

export class MiladySandboxService {

  // Agent CRUD

  async createAgent(params: CreateAgentParams): Promise<MiladySandbox> {
    logger.info("[milady-sandbox] Creating agent", { orgId: params.organizationId, name: params.agentName });
    return miladySandboxesRepository.create({
      organization_id: params.organizationId,
      user_id: params.userId,
      agent_name: params.agentName,
      agent_config: params.agentConfig ?? {},
      environment_vars: params.environmentVars ?? {},
      status: "pending",
      database_status: "none",
    });
  }

  async getAgent(agentId: string, orgId: string) {
    return miladySandboxesRepository.findByIdAndOrg(agentId, orgId);
  }

  async listAgents(orgId: string) {
    return miladySandboxesRepository.listByOrganization(orgId);
  }

  async deleteAgent(agentId: string, orgId: string): Promise<boolean> {
    const rec = await miladySandboxesRepository.findByIdAndOrg(agentId, orgId);
    if (!rec) return false;
    logger.info("[milady-sandbox] Deleting agent", { agentId, neon: rec.neon_project_id, sandbox: rec.sandbox_id });
    if (rec.neon_project_id) await this.cleanupNeon(rec.neon_project_id);
    if (rec.sandbox_id && rec.status === "running") await this.stopSandbox(rec.sandbox_id);
    return miladySandboxesRepository.delete(agentId, orgId);
  }

  // Provision

  async provision(agentId: string, orgId: string): Promise<ProvisionResult> {
    const rec = await miladySandboxesRepository.findByIdAndOrg(agentId, orgId);
    if (!rec) return { success: false, error: "Agent not found" } as ProvisionResult;

    const lock = await miladySandboxesRepository.trySetProvisioning(rec.id);
    if (!lock) {
      if (rec.status === "running" && rec.bridge_url && rec.health_url)
        return { success: true, sandboxRecord: rec, bridgeUrl: rec.bridge_url, healthUrl: rec.health_url };
      return { success: false, sandboxRecord: rec, error: "Agent is already being provisioned" };
    }

    // 1. Database
    let dbUri = rec.database_uri;
    if (rec.database_status !== "ready" || !dbUri) {
      const db = await this.provisionNeon(rec);
      if (!db.success) {
        await this.markError(rec, `Database provisioning failed: ${db.error}`);
        return { success: false, sandboxRecord: await miladySandboxesRepository.findById(rec.id), error: db.error ?? "Unknown database error" };
      }
      dbUri = db.connectionUri!;
    }

    // 2. Sandbox
    const sb = await this.createSandbox(rec, dbUri);
    if (!sb.success) {
      await this.markError(rec, `Sandbox creation failed: ${sb.error}`);
      return { success: false, sandboxRecord: await miladySandboxesRepository.findById(rec.id), error: sb.error ?? "Unknown sandbox error" };
    }

    // 3. Health check
    if (!(await this.waitForHealth(sb.healthUrl!))) {
      await this.markError(rec, "Sandbox health check timed out");
      return { success: false, sandboxRecord: await miladySandboxesRepository.findById(rec.id), error: "Health check timed out" };
    }

    // 4. Restore from backup
    const backup = await miladySandboxesRepository.getLatestBackup(rec.id);
    if (backup) await this.pushState(sb.bridgeUrl!, backup.state_data as MiladyBackupStateData);

    // 5. Mark running
    const updated = await miladySandboxesRepository.update(rec.id, {
      status: "running", sandbox_id: sb.sandboxId, bridge_url: sb.bridgeUrl,
      health_url: sb.healthUrl, last_heartbeat_at: new Date(), error_message: null,
    });

    logger.info("[milady-sandbox] Provisioned", { agentId: rec.id, sandboxId: sb.sandboxId });
    return { success: true, sandboxRecord: updated!, bridgeUrl: sb.bridgeUrl!, healthUrl: sb.healthUrl! };
  }

  // Bridge

  async bridge(agentId: string, orgId: string, rpc: BridgeRequest): Promise<BridgeResponse> {
    const rec = await miladySandboxesRepository.findRunningSandbox(agentId, orgId);
    if (!rec?.bridge_url) {
      logger.warn("[milady-sandbox] Bridge call to non-running sandbox", { agentId, method: rpc.method });
      return { jsonrpc: "2.0", id: rpc.id, error: { code: -32000, message: "Sandbox is not running" } };
    }

    const res = await fetch(`${rec.bridge_url}/bridge`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rpc), signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return { jsonrpc: "2.0", id: rpc.id, error: { code: -32000, message: `Bridge returned HTTP ${res.status}` } };
    return (await res.json()) as BridgeResponse;
  }

  async bridgeStream(agentId: string, orgId: string, rpc: BridgeRequest): Promise<Response | null> {
    const rec = await miladySandboxesRepository.findRunningSandbox(agentId, orgId);
    if (!rec?.bridge_url) return null;
    const res = await fetch(`${rec.bridge_url}/bridge/stream`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rpc), signal: AbortSignal.timeout(120_000),
    });
    return res.ok ? res : null;
  }

  // Snapshots

  async snapshot(agentId: string, orgId: string, type: MiladyBackupSnapshotType = "manual"): Promise<SnapshotResult> {
    const rec = await miladySandboxesRepository.findRunningSandbox(agentId, orgId);
    if (!rec?.bridge_url) return { success: false, error: "Sandbox is not running" };

    const res = await fetch(`${rec.bridge_url}/api/snapshot`, { method: "POST", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { success: false, error: `Snapshot fetch failed: HTTP ${res.status}` };

    const stateData = (await res.json()) as MiladyBackupStateData;
    const serialized = JSON.stringify(stateData);

    const backup = await miladySandboxesRepository.createBackup({
      sandbox_record_id: rec.id, snapshot_type: type,
      state_data: stateData, size_bytes: Buffer.byteLength(serialized, "utf-8"),
    });

    await miladySandboxesRepository.update(rec.id, { last_backup_at: new Date() });
    await miladySandboxesRepository.pruneBackups(rec.id, MAX_BACKUPS);
    logger.info("[milady-sandbox] Backup created", { agentId, type, bytes: backup.size_bytes });
    return { success: true, backup };
  }

  async restore(agentId: string, orgId: string, backupId?: string): Promise<SnapshotResult> {
    const rec = await miladySandboxesRepository.findByIdAndOrg(agentId, orgId);
    if (!rec) return { success: false, error: "Agent not found" };

    const backup = backupId
      ? await miladySandboxesRepository.getBackupById(backupId)
      : await miladySandboxesRepository.getLatestBackup(rec.id);
    if (!backup) return { success: false, error: "No backup found" };

    if (rec.status === "running" && rec.bridge_url) {
      await this.pushState(rec.bridge_url, backup.state_data as MiladyBackupStateData);
      return { success: true, backup };
    }

    const prov = await this.provision(agentId, orgId);
    return prov.success ? { success: true, backup } : { success: false, error: prov.error };
  }

  async listBackups(agentId: string, orgId: string): Promise<MiladySandboxBackup[]> {
    const rec = await miladySandboxesRepository.findByIdAndOrg(agentId, orgId);
    return rec ? miladySandboxesRepository.listBackups(rec.id) : [];
  }

  // Heartbeat

  async heartbeat(agentId: string, orgId: string): Promise<boolean> {
    const rec = await miladySandboxesRepository.findRunningSandbox(agentId, orgId);
    if (!rec?.bridge_url) return false;

    const res = await fetch(`${rec.bridge_url}/bridge`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "heartbeat" } satisfies BridgeRequest),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);

    if (!res?.ok) {
      logger.warn("[milady-sandbox] Heartbeat failed, marking disconnected", { agentId });
      await miladySandboxesRepository.update(rec.id, { status: "disconnected" });
      return false;
    }
    await miladySandboxesRepository.update(rec.id, { last_heartbeat_at: new Date() });
    return true;
  }

  // Shutdown

  async shutdown(agentId: string, orgId: string): Promise<{ success: boolean; error?: string }> {
    const rec = await miladySandboxesRepository.findByIdAndOrg(agentId, orgId);
    if (!rec) return { success: false, error: "Agent not found" };

    if (rec.status === "running" && rec.bridge_url) {
      await this.snapshot(agentId, orgId, "pre-shutdown").catch((e) => {
        logger.warn("[milady-sandbox] Pre-shutdown backup failed", { error: e instanceof Error ? e.message : String(e) });
      });
    }
    if (rec.sandbox_id) await this.stopSandbox(rec.sandbox_id);
    await miladySandboxesRepository.update(rec.id, { status: "stopped", sandbox_id: null, bridge_url: null, health_url: null });
    logger.info("[milady-sandbox] Shutdown complete", { agentId });
    return { success: true };
  }

  // Private helpers

  private async markError(rec: MiladySandbox, msg: string) {
    await miladySandboxesRepository.update(rec.id, {
      status: "error", error_message: msg, error_count: (rec.error_count ?? 0) + 1,
    });
  }

  private async provisionNeon(rec: MiladySandbox): Promise<{ success: boolean; connectionUri?: string; error?: string }> {
    await miladySandboxesRepository.update(rec.id, { database_status: "provisioning" });
    const neon = getNeonClient();
    const name = `milady-${sanitizeProjectNameSegment(rec.agent_name ?? "agent")}-${rec.id.substring(0, 8)}`;
    const result = await neon.createProject({ name, region: "aws-us-east-1" });

    const updated = await miladySandboxesRepository.update(rec.id, {
      neon_project_id: result.projectId, neon_branch_id: result.branchId,
      database_uri: result.connectionUri, database_status: "ready", database_error: null,
    });

    if (!updated) {
      logger.error("[milady-sandbox] DB update failed after Neon creation, cleaning orphan", { projectId: result.projectId });
      await neon.deleteProject(result.projectId).catch((e) => {
        logger.error("[milady-sandbox] Orphan Neon project cleanup failed", { projectId: result.projectId, error: e instanceof Error ? e.message : String(e) });
      });
      return { success: false, error: "Failed to persist database credentials" };
    }

    return { success: true, connectionUri: result.connectionUri };
  }

  private async cleanupNeon(projectId: string) {
    await getNeonClient().deleteProject(projectId).catch((e) => {
      logger.warn("[milady-sandbox] Neon cleanup failed", { projectId, error: e instanceof Error ? e.message : String(e) });
    });
  }

  private async createSandbox(rec: MiladySandbox, dbUri: string): Promise<{
    success: boolean; sandboxId?: string; bridgeUrl?: string; healthUrl?: string; error?: string;
  }> {
    const { Sandbox } = await import("@vercel/sandbox");
    const creds = this.getSandboxCreds();
    if (!creds.hasOIDC && !creds.hasAccessToken) return { success: false, error: "Vercel Sandbox credentials not configured" };

    const env: Record<string, string> = {
      ...((rec.environment_vars as Record<string, string>) ?? {}),
      DATABASE_URL: dbUri, AGENT_NAME: rec.agent_name ?? "CloudAgent",
      PORT: String(SANDBOX_HEALTH_PORT), BRIDGE_PORT: String(SANDBOX_BRIDGE_PORT),
    };

    const opts: Record<string, unknown> = {
      source: rec.snapshot_id ? { type: "snapshot", snapshotId: rec.snapshot_id } : { url: CLOUD_AGENT_TEMPLATE_URL, type: "git" },
      resources: { vcpus: SANDBOX_VCPUS }, timeout: SANDBOX_TIMEOUT_MS,
      ports: [SANDBOX_HEALTH_PORT, SANDBOX_BRIDGE_PORT], runtime: "node24", env,
    };
    if (creds.hasAccessToken) { opts.teamId = creds.teamId; opts.projectId = creds.projectId; opts.token = creds.token; }

    type SB = { sandboxId?: string; domain: (port: number) => string };
    const sb = (await Sandbox.create(opts)) as SB;
    const id = sb.sandboxId ?? `sandbox-${crypto.randomUUID().slice(0, 8)}`;

    // Write .env.local as a fallback — some SDK versions ignore the env create option
    const envContent = Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n");
    const sbWithShell = sb as SB & { runCommand?: (opts: { cmd: string; args: string[]; env?: Record<string, string> }) => Promise<unknown> };
    if (typeof sbWithShell.runCommand === "function") {
      await sbWithShell.runCommand({ cmd: "sh", args: ["-c", `cat > /app/.env.local << 'ENVEOF'\n${envContent}\nENVEOF`] });
    }

    return { success: true, sandboxId: id, bridgeUrl: `https://${sb.domain(SANDBOX_BRIDGE_PORT)}`, healthUrl: `https://${sb.domain(SANDBOX_HEALTH_PORT)}` };
  }

  private async stopSandbox(sandboxId: string) {
    const { Sandbox } = await import("@vercel/sandbox");
    const creds = this.getSandboxCreds();
    const opts: Record<string, unknown> = {};
    if (creds.hasAccessToken) { opts.teamId = creds.teamId; opts.projectId = creds.projectId; opts.token = creds.token; }
    const sb = await Sandbox.get({ sandboxId, ...opts }) as { shutdown?: () => Promise<void>; close?: () => Promise<void> };
    if (typeof sb.shutdown === "function") await sb.shutdown();
    else if (typeof sb.close === "function") await sb.close();
  }

  private getSandboxCreds() {
    const hasOIDC = !!process.env.VERCEL_OIDC_TOKEN;
    const { VERCEL_TEAM_ID: teamId, VERCEL_PROJECT_ID: projectId, VERCEL_TOKEN: token } = process.env;
    return { hasOIDC, hasAccessToken: !!(teamId && projectId && token), teamId, projectId, token };
  }

  private async waitForHealth(url: string): Promise<boolean> {
    const deadline = Date.now() + HEALTH_CHECK_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (await fetch(`${url}/health`, { signal: AbortSignal.timeout(5_000) }).then((r) => r.ok).catch(() => false)) return true;
      await new Promise((r) => setTimeout(r, HEALTH_CHECK_INTERVAL_MS));
    }
    return false;
  }

  private async pushState(bridgeUrl: string, state: MiladyBackupStateData) {
    const res = await fetch(`${bridgeUrl}/api/restore`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state), signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`State restore failed: HTTP ${res.status} ${text.slice(0, 200)}`);
    }
  }
}

export const miladySandboxService = new MiladySandboxService();
