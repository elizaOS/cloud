/**
 * Milady Sandbox Service — orchestrates cloud agent lifecycle:
 * Neon DB provisioning, sandbox creation (via pluggable provider), bridge proxy, backups, heartbeat.
 */

import { logger } from "@/lib/utils/logger";
import { getNeonClient } from "./neon-client";
import {
  miladySandboxesRepository,
  type MiladySandbox, type MiladySandboxBackup,
  type MiladyBackupSnapshotType,
} from "@/db/repositories/milady-sandboxes";
import type { MiladyBackupStateData } from "@/db/schemas/milady-sandboxes";
import { createSandboxProvider, type SandboxProvider } from "./sandbox-provider";
import type { DockerSandboxMetadata } from "./docker-sandbox-provider";

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
  private provider: SandboxProvider;

  constructor(provider?: SandboxProvider) {
    this.provider = provider ?? createSandboxProvider();
  }

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
    if (rec.sandbox_id && rec.status === "running") {
      await this.provider.stop(rec.sandbox_id).catch((e) => {
        logger.warn("[milady-sandbox] Stop failed during delete", { error: e instanceof Error ? e.message : String(e) });
      });
    }
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

    // 2. Sandbox (via provider)
    let handle;
    try {
      handle = await this.provider.create({
        agentId: rec.id,
        agentName: rec.agent_name ?? "CloudAgent",
        environmentVars: {
          ...((rec.environment_vars as Record<string, string>) ?? {}),
          DATABASE_URL: dbUri,
        },
        snapshotId: rec.snapshot_id ?? undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.markError(rec, `Sandbox creation failed: ${msg}`);
      return { success: false, sandboxRecord: await miladySandboxesRepository.findById(rec.id), error: msg };
    }

    // 3. Health check (via provider)
    if (!(await this.provider.checkHealth(handle.healthUrl))) {
      await this.markError(rec, "Sandbox health check timed out");
      return { success: false, sandboxRecord: await miladySandboxesRepository.findById(rec.id), error: "Health check timed out" };
    }

    // 4. Restore from backup
    const backup = await miladySandboxesRepository.getLatestBackup(rec.id);
    if (backup) await this.pushState(handle.bridgeUrl, backup.state_data as MiladyBackupStateData);

    // 5. Mark running + persist provider-specific metadata
    const updateData: Parameters<typeof miladySandboxesRepository.update>[1] = {
      status: "running",
      sandbox_id: handle.sandboxId,
      bridge_url: handle.bridgeUrl,
      health_url: handle.healthUrl,
      last_heartbeat_at: new Date(),
      error_message: null,
    };

    // For docker provider, persist docker-specific fields from typed metadata
    if (handle.metadata && "nodeId" in handle.metadata) {
      const dockerMeta = handle.metadata as unknown as DockerSandboxMetadata;
      if (dockerMeta.nodeId) updateData.node_id = dockerMeta.nodeId;
      if (dockerMeta.containerName) updateData.container_name = dockerMeta.containerName;
      if (dockerMeta.bridgePort) updateData.bridge_port = dockerMeta.bridgePort;
      if (dockerMeta.webUiPort) updateData.web_ui_port = dockerMeta.webUiPort;
      if (dockerMeta.headscaleIp) updateData.headscale_ip = dockerMeta.headscaleIp;
      if (dockerMeta.dockerImage) updateData.docker_image = dockerMeta.dockerImage;
    }

    const updated = await miladySandboxesRepository.update(rec.id, updateData);

    logger.info("[milady-sandbox] Provisioned", { agentId: rec.id, sandboxId: handle.sandboxId, provider: handle.metadata ? "docker" : "vercel" });
    return { success: true, sandboxRecord: updated!, bridgeUrl: handle.bridgeUrl, healthUrl: handle.healthUrl };
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
    if (rec.sandbox_id) {
      await this.provider.stop(rec.sandbox_id).catch((e) => {
        logger.warn("[milady-sandbox] Stop failed during shutdown", { error: e instanceof Error ? e.message : String(e) });
      });
    }
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
