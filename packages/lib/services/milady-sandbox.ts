/**
 * Milady Sandbox Service — orchestrates cloud agent lifecycle:
 * Neon DB provisioning, sandbox creation (via pluggable provider), bridge proxy, backups, heartbeat.
 */

import { isIP } from "node:net";
import { sql } from "drizzle-orm";
import { type Database, dbWrite } from "@/db/helpers";
import { dockerNodesRepository } from "@/db/repositories/docker-nodes";
import {
  type MiladyBackupSnapshotType,
  type MiladySandbox,
  type MiladySandboxBackup,
  miladySandboxesRepository,
} from "@/db/repositories/milady-sandboxes";
import { jobs } from "@/db/schemas/jobs";
import {
  type MiladyBackupStateData,
  miladySandboxBackups,
  miladySandboxes,
} from "@/db/schemas/milady-sandboxes";
import { assertSafeOutboundUrl } from "@/lib/security/outbound-url";
import {
  stripReservedMiladyConfigKeys,
  withReusedMiladyCharacterOwnership,
} from "@/lib/services/milady-agent-config";
import { logger } from "@/lib/utils/logger";
import type { DockerSandboxMetadata } from "./docker-sandbox-provider";
import { miladyProvisionAdvisoryLockSql } from "./milady-provision-lock";
import { getNeonClient, NeonClientError } from "./neon-client";
import { JOB_TYPES } from "./provisioning-jobs";
import { createSandboxProvider, type SandboxProvider } from "./sandbox-provider";

export interface CreateAgentParams {
  organizationId: string;
  userId: string;
  agentName: string;
  agentConfig?: Record<string, unknown>;
  environmentVars?: Record<string, string>;
  /** Link to a user_characters record (canonical character with token linkage). */
  characterId?: string;
}

export type ProvisionResult =
  | {
      success: true;
      sandboxRecord: MiladySandbox;
      bridgeUrl: string;
      healthUrl: string;
    }
  | { success: false; sandboxRecord?: MiladySandbox; error: string };

export type DeleteAgentResult =
  | { success: true; deletedSandbox: MiladySandbox }
  | { success: false; error: string };

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
type LifecycleTx = Parameters<Parameters<Database["transaction"]>[0]>[0];

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
    logger.info("[milady-sandbox] Creating agent", {
      orgId: params.organizationId,
      name: params.agentName,
    });

    const sanitizedConfig = stripReservedMiladyConfigKeys(params.agentConfig);
    const agentConfig = params.characterId
      ? withReusedMiladyCharacterOwnership(sanitizedConfig)
      : sanitizedConfig;

    return miladySandboxesRepository.create({
      organization_id: params.organizationId,
      user_id: params.userId,
      agent_name: params.agentName,
      agent_config: agentConfig,
      environment_vars: params.environmentVars ?? {},
      status: "pending",
      database_status: "none",
      ...(params.characterId && { character_id: params.characterId }),
    });
  }

  async getAgent(agentId: string, orgId: string) {
    return miladySandboxesRepository.findByIdAndOrg(agentId, orgId);
  }

  async getAgentForWrite(agentId: string, orgId: string) {
    return miladySandboxesRepository.findByIdAndOrgForWrite(agentId, orgId);
  }

  async listAgents(orgId: string) {
    return miladySandboxesRepository.listByOrganization(orgId);
  }

  async deleteAgent(agentId: string, orgId: string): Promise<DeleteAgentResult> {
    return dbWrite.transaction(async (tx) => {
      await this.lockLifecycle(tx, agentId, orgId);

      const rec = await this.getAgentForLifecycleMutation(tx, agentId, orgId);
      if (!rec) return { success: false, error: "Agent not found" } as const;

      const hasActiveProvisionJob = await this.hasActiveProvisionJobTx(tx, agentId, orgId);
      if (rec.status === "provisioning" || hasActiveProvisionJob) {
        return {
          success: false,
          error: "Agent provisioning is in progress",
        } as const;
      }

      logger.info("[milady-sandbox] Deleting agent", {
        agentId,
        neon: rec.neon_project_id,
        sandbox: rec.sandbox_id,
      });

      if (rec.sandbox_id) {
        try {
          await this.provider.stop(rec.sandbox_id);
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : String(e);
          if (!this.isIgnorableSandboxStopError(e)) {
            logger.warn("[milady-sandbox] Stop failed during delete", {
              sandboxId: rec.sandbox_id,
              status: rec.status,
              error: errorMessage,
            });
            return {
              success: false,
              error: "Failed to delete sandbox",
            } as const;
          }

          logger.info("[milady-sandbox] Sandbox already absent during delete cleanup", {
            sandboxId: rec.sandbox_id,
            status: rec.status,
            error: errorMessage,
          });
        }
      }
      if (rec.neon_project_id) {
        try {
          await this.cleanupNeon(rec.neon_project_id);
        } catch (e) {
          logger.warn("[milady-sandbox] Neon cleanup failed during delete", {
            projectId: rec.neon_project_id,
            error: e instanceof Error ? e.message : String(e),
          });
          return {
            success: false,
            error: "Failed to delete database project",
          } as const;
        }
      }

      const result = await tx.execute<MiladySandbox>(sql`
        DELETE FROM ${miladySandboxes}
        WHERE id = ${agentId}
          AND organization_id = ${orgId}
        RETURNING *
      `);
      const deletedSandbox = result.rows[0];

      return deletedSandbox
        ? ({ success: true, deletedSandbox } as const)
        : ({ success: false, error: "Agent not found" } as const);
    });
  }

  // Provision

  async provision(agentId: string, orgId: string): Promise<ProvisionResult> {
    const rec = await miladySandboxesRepository.findByIdAndOrg(agentId, orgId);
    if (!rec) return { success: false, error: "Agent not found" } as ProvisionResult;

    const lock = await miladySandboxesRepository.trySetProvisioning(rec.id);
    if (!lock) {
      if (rec.status === "running" && rec.bridge_url && rec.health_url)
        return {
          success: true,
          sandboxRecord: rec,
          bridgeUrl: rec.bridge_url,
          healthUrl: rec.health_url,
        };
      return {
        success: false,
        sandboxRecord: rec,
        error: "Agent is already being provisioned",
      };
    }

    // 1. Database
    let dbUri = rec.database_uri;
    if (rec.database_status !== "ready" || !dbUri) {
      const db = await this.provisionNeon(rec);
      if (!db.success) {
        await this.markError(rec, `Database provisioning failed: ${db.error}`);
        return {
          success: false,
          sandboxRecord: await miladySandboxesRepository.findById(rec.id),
          error: db.error ?? "Unknown database error",
        };
      }
      dbUri = db.connectionUri!;
    }

    // 2-5. Sandbox creation + DB persistence with retry for port collision
    // TOCTOU race: Port allocation happens in-memory (provider allocates next available port),
    // but persistence to DB (unique constraint on node_id + bridge_port) happens later.
    // If two concurrent provisions pick the same port, one will fail with PG 23505.
    // Solution: Retry loop catches unique constraint errors, cleans up ghost container, and retries.
    const MAX_PROVISION_ATTEMPTS = 3;
    let lastError: string = "Unknown error";

    for (let attempt = 1; attempt <= MAX_PROVISION_ATTEMPTS; attempt++) {
      let handle;

      try {
        // 2. Sandbox (via provider)
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
        return {
          success: false,
          sandboxRecord: await miladySandboxesRepository.findById(rec.id),
          error: msg,
        };
      }

      try {
        // 3. Health check (via provider)
        if (!(await this.provider.checkHealth(handle.healthUrl))) {
          throw new Error("Sandbox health check timed out");
        }

        // 4. Restore from backup
        const backup = await miladySandboxesRepository.getLatestBackup(rec.id);
        if (backup)
          await this.pushState(handle.bridgeUrl, backup.state_data as MiladyBackupStateData, {
            trusted: true,
          });

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
        if (handle.metadata?.provider === "docker") {
          const dockerMeta = handle.metadata as unknown as DockerSandboxMetadata;
          if (dockerMeta.nodeId) updateData.node_id = dockerMeta.nodeId;
          if (dockerMeta.containerName) updateData.container_name = dockerMeta.containerName;
          if (dockerMeta.bridgePort) updateData.bridge_port = dockerMeta.bridgePort;
          if (dockerMeta.webUiPort) updateData.web_ui_port = dockerMeta.webUiPort;
          if (dockerMeta.headscaleIp) updateData.headscale_ip = dockerMeta.headscaleIp;
          if (dockerMeta.dockerImage) updateData.docker_image = dockerMeta.dockerImage;
        }

        const updated = await miladySandboxesRepository.update(rec.id, updateData);

        logger.info("[milady-sandbox] Provisioned", {
          agentId: rec.id,
          sandboxId: handle.sandboxId,
          provider: handle.metadata ? "docker" : "vercel",
          attempt,
        });
        return {
          success: true,
          sandboxRecord: updated!,
          bridgeUrl: handle.bridgeUrl,
          healthUrl: handle.healthUrl,
        };
      } catch (err) {
        // Ghost container cleanup: provider.create() succeeded but DB update or health check failed
        const msg = err instanceof Error ? err.message : String(err);
        lastError = msg;

        logger.warn("[milady-sandbox] Post-create failure, cleaning up container", {
          agentId: rec.id,
          sandboxId: handle.sandboxId,
          attempt,
          error: msg,
        });

        await this.provider.stop(handle.sandboxId).catch((stopErr) => {
          logger.error("[milady-sandbox] Ghost container cleanup failed", {
            sandboxId: handle.sandboxId,
            error: stopErr instanceof Error ? stopErr.message : String(stopErr),
          });
        });

        // Check if it's a unique constraint error (port collision) -> retry
        const isUniqueConstraintError =
          msg.includes("23505") ||
          msg.toLowerCase().includes("unique") ||
          msg.toLowerCase().includes("duplicate");

        if (isUniqueConstraintError && attempt < MAX_PROVISION_ATTEMPTS) {
          logger.info("[milady-sandbox] Port collision detected, retrying", {
            attempt,
            nextAttempt: attempt + 1,
          });
          continue; // Retry
        }

        // Non-retryable error or max attempts reached -> fail
        break;
      }
    }

    // All attempts exhausted
    await this.markError(
      rec,
      `Provisioning failed after ${MAX_PROVISION_ATTEMPTS} attempts: ${lastError}`,
    );
    return {
      success: false,
      sandboxRecord: await miladySandboxesRepository.findById(rec.id),
      error: lastError,
    };
  }

  private async getSafeBridgeEndpoint(
    sandboxOrBridgeUrl:
      | Pick<
          MiladySandbox,
          "bridge_url" | "node_id" | "bridge_port" | "headscale_ip" | "sandbox_id"
        >
      | string,
    path: string,
    options?: { trusted?: boolean },
  ): Promise<string> {
    if (typeof sandboxOrBridgeUrl === "string") {
      if (options?.trusted) {
        return new URL(path, sandboxOrBridgeUrl).toString();
      }

      return (await assertSafeOutboundUrl(new URL(path, sandboxOrBridgeUrl).toString())).toString();
    }

    const dockerBridgeBaseUrl = await this.getTrustedDockerBridgeBaseUrl(sandboxOrBridgeUrl);
    if (
      dockerBridgeBaseUrl &&
      sandboxOrBridgeUrl.bridge_url &&
      this.matchesTrustedDockerBridge(sandboxOrBridgeUrl.bridge_url, dockerBridgeBaseUrl)
    ) {
      return new URL(path, dockerBridgeBaseUrl).toString();
    }

    if (!sandboxOrBridgeUrl.bridge_url) {
      throw new Error("Sandbox bridge is missing");
    }

    if (this.isTrustedLegacyPrivateBridgeUrl(sandboxOrBridgeUrl)) {
      return new URL(path, sandboxOrBridgeUrl.bridge_url).toString();
    }

    return (
      await assertSafeOutboundUrl(new URL(path, sandboxOrBridgeUrl.bridge_url).toString())
    ).toString();
  }

  private async getTrustedDockerBridgeBaseUrl(
    sandbox: Pick<MiladySandbox, "node_id" | "bridge_port" | "headscale_ip">,
  ): Promise<string | null> {
    if (!sandbox.node_id || !sandbox.bridge_port) {
      return null;
    }

    const host =
      sandbox.headscale_ip || (await dockerNodesRepository.findByNodeId(sandbox.node_id))?.hostname;
    if (!host) {
      return null;
    }

    return `http://${host}:${sandbox.bridge_port}`;
  }

  private isTrustedLegacyPrivateBridgeUrl(
    sandbox: Pick<
      MiladySandbox,
      "bridge_url" | "node_id" | "bridge_port" | "headscale_ip" | "sandbox_id"
    >,
  ): boolean {
    if (!sandbox.bridge_url) {
      return false;
    }

    let candidate: URL;
    try {
      candidate = new URL(sandbox.bridge_url);
    } catch {
      return false;
    }

    if (candidate.protocol !== "http:" || !this.isMiladyPrivateBridgeHost(candidate.hostname)) {
      return false;
    }

    const candidatePort = Number.parseInt(candidate.port, 10);
    const hasMatchingBridgePort =
      sandbox.bridge_port != null &&
      Number.isInteger(candidatePort) &&
      candidatePort === sandbox.bridge_port;
    const hasMatchingHeadscaleIp =
      !!sandbox.headscale_ip && candidate.hostname === sandbox.headscale_ip;
    const hasDockerNodeSignal = !!sandbox.node_id;
    // Older Docker-backed records may predate the node/headscale backfill but
    // still carry the provider-generated `sandbox_id`/container name.
    const hasLegacyDockerSandboxId = this.isLegacyDockerSandboxId(sandbox.sandbox_id);

    return (
      hasMatchingHeadscaleIp ||
      hasLegacyDockerSandboxId ||
      (hasDockerNodeSignal && hasMatchingBridgePort) ||
      (hasDockerNodeSignal && hasMatchingHeadscaleIp)
    );
  }

  private isLegacyDockerSandboxId(sandboxId: string | null | undefined): boolean {
    return typeof sandboxId === "string" && /^milady-[0-9a-f-]{36}$/i.test(sandboxId);
  }

  private isMiladyPrivateBridgeHost(hostname: string): boolean {
    if (isIP(hostname) !== 4) {
      return false;
    }

    const [first, second] = hostname.split(".").map((part) => Number.parseInt(part, 10));
    return first === 100 && second >= 64 && second <= 127;
  }

  private matchesTrustedDockerBridge(
    bridgeUrl: string,
    trustedDockerBridgeBaseUrl: string,
  ): boolean {
    try {
      const candidate = new URL(bridgeUrl);
      const trusted = new URL(trustedDockerBridgeBaseUrl);
      return candidate.host === trusted.host;
    } catch {
      return false;
    }
  }

  // Bridge

  async bridge(agentId: string, orgId: string, rpc: BridgeRequest): Promise<BridgeResponse> {
    const rec = await miladySandboxesRepository.findRunningSandbox(agentId, orgId);
    if (!rec?.bridge_url) {
      logger.warn("[milady-sandbox] Bridge call to non-running sandbox", {
        agentId,
        method: rpc.method,
      });
      return {
        jsonrpc: "2.0",
        id: rpc.id,
        error: { code: -32000, message: "Sandbox is not running" },
      };
    }

    try {
      const bridgeEndpoint = await this.getSafeBridgeEndpoint(rec, "/bridge");
      const res = await fetch(bridgeEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rpc),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok)
        return {
          jsonrpc: "2.0",
          id: rpc.id,
          error: {
            code: -32000,
            message: `Bridge returned HTTP ${res.status}`,
          },
        };
      return (await res.json()) as BridgeResponse;
    } catch (error) {
      logger.warn("[milady-sandbox] Bridge request failed", {
        agentId,
        method: rpc.method,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        jsonrpc: "2.0",
        id: rpc.id,
        error: { code: -32000, message: "Sandbox bridge is unreachable" },
      };
    }
  }

  async bridgeStream(agentId: string, orgId: string, rpc: BridgeRequest): Promise<Response | null> {
    const rec = await miladySandboxesRepository.findRunningSandbox(agentId, orgId);
    if (!rec?.bridge_url) return null;

    try {
      const bridgeEndpoint = await this.getSafeBridgeEndpoint(rec, "/bridge/stream");
      const res = await fetch(bridgeEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rpc),
        signal: AbortSignal.timeout(120_000),
      });
      return res.ok ? res : null;
    } catch (error) {
      logger.warn("[milady-sandbox] Bridge stream request failed", {
        agentId,
        method: rpc.method,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  // Snapshots

  async snapshot(
    agentId: string,
    orgId: string,
    type: MiladyBackupSnapshotType = "manual",
  ): Promise<SnapshotResult> {
    const rec = await miladySandboxesRepository.findRunningSandbox(agentId, orgId);
    if (!rec?.bridge_url) return { success: false, error: "Sandbox is not running" };

    const { stateData, sizeBytes } = await this.fetchSnapshotState(rec);

    const backup = await miladySandboxesRepository.createBackup({
      sandbox_record_id: rec.id,
      snapshot_type: type,
      state_data: stateData,
      size_bytes: sizeBytes,
    });

    await miladySandboxesRepository.update(rec.id, {
      last_backup_at: new Date(),
    });
    await miladySandboxesRepository.pruneBackups(rec.id, MAX_BACKUPS);
    logger.info("[milady-sandbox] Backup created", {
      agentId,
      type,
      bytes: backup.size_bytes,
    });
    return { success: true, backup };
  }

  async restore(agentId: string, orgId: string, backupId?: string): Promise<SnapshotResult> {
    const rec = await miladySandboxesRepository.findByIdAndOrg(agentId, orgId);
    if (!rec) return { success: false, error: "Agent not found" };

    const backup = backupId
      ? await miladySandboxesRepository.getBackupById(backupId)
      : await miladySandboxesRepository.getLatestBackup(rec.id);
    if (!backup) return { success: false, error: "No backup found" };

    if (rec.status !== "running" && backupId) {
      const latestBackup = await miladySandboxesRepository.getLatestBackup(rec.id);
      if (!latestBackup || backup.id !== latestBackup.id) {
        return {
          success: false,
          error: "Stopped agents can only restore the latest backup",
        };
      }
    }

    if (rec.status === "running" && rec.bridge_url) {
      await this.pushState(rec, backup.state_data as MiladyBackupStateData);
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

    const res = await (async () => {
      try {
        const heartbeatEndpoint = await this.getSafeBridgeEndpoint(rec, "/bridge");
        return await fetch(heartbeatEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "heartbeat",
          } satisfies BridgeRequest),
          signal: AbortSignal.timeout(10_000),
        });
      } catch (error) {
        logger.warn("[milady-sandbox] Heartbeat request failed", {
          agentId,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    })();

    if (!res?.ok) {
      logger.warn("[milady-sandbox] Heartbeat failed, marking disconnected", {
        agentId,
      });
      await miladySandboxesRepository.update(rec.id, {
        status: "disconnected",
      });
      return false;
    }
    await miladySandboxesRepository.update(rec.id, {
      last_heartbeat_at: new Date(),
    });
    return true;
  }

  // Shutdown

  async shutdown(agentId: string, orgId: string): Promise<{ success: boolean; error?: string }> {
    let snapshotAgentId: string | null = null;
    let preShutdownSnapshot: {
      stateData: MiladyBackupStateData;
      sizeBytes: number;
      bridgeUrl: string;
    } | null = null;

    const snapshotSource = await this.getAgentForWrite(agentId, orgId);
    if (snapshotSource?.status === "running" && snapshotSource.bridge_url) {
      preShutdownSnapshot = await this.fetchSnapshotState(snapshotSource).catch((error) => {
        logger.warn("[milady-sandbox] Pre-shutdown backup fetch failed", {
          agentId,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      });
    }

    const result = await dbWrite.transaction(async (tx) => {
      await this.lockLifecycle(tx, agentId, orgId);

      const rec = await this.getAgentForLifecycleMutation(tx, agentId, orgId);
      if (!rec) return { success: false, error: "Agent not found" } as const;

      const hasActiveProvisionJob = await this.hasActiveProvisionJobTx(tx, agentId, orgId);
      if (rec.status === "provisioning" || hasActiveProvisionJob) {
        return {
          success: false,
          error: "Agent provisioning is in progress",
        } as const;
      }

      if (
        preShutdownSnapshot &&
        rec.status === "running" &&
        rec.bridge_url === preShutdownSnapshot.bridgeUrl
      ) {
        await this.persistSnapshotWithinTransaction(
          tx,
          rec.id,
          "pre-shutdown",
          preShutdownSnapshot.stateData,
          preShutdownSnapshot.sizeBytes,
        );
      }

      if (rec.sandbox_id) {
        await this.provider.stop(rec.sandbox_id).catch((e) => {
          logger.warn("[milady-sandbox] Stop failed during shutdown", {
            sandboxId: rec.sandbox_id,
            status: rec.status,
            error: e instanceof Error ? e.message : String(e),
          });
        });
      }

      await tx.execute(sql`
        UPDATE ${miladySandboxes}
        SET
          status = 'stopped',
          sandbox_id = NULL,
          bridge_url = NULL,
          health_url = NULL,
          updated_at = NOW()
        WHERE id = ${rec.id}
      `);

      snapshotAgentId = rec.id;
      return { success: true } as const;
    });

    if (result.success && snapshotAgentId) {
      await miladySandboxesRepository.pruneBackups(snapshotAgentId, MAX_BACKUPS).catch((error) => {
        logger.warn("[milady-sandbox] Backup pruning failed after shutdown", {
          agentId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      logger.info("[milady-sandbox] Shutdown complete", { agentId });
    }

    return result;
  }

  // Private helpers

  private async lockLifecycle(tx: LifecycleTx, agentId: string, orgId: string): Promise<void> {
    await tx.execute(miladyProvisionAdvisoryLockSql(orgId, agentId));
  }

  private async getAgentForLifecycleMutation(
    tx: LifecycleTx,
    agentId: string,
    orgId: string,
  ): Promise<MiladySandbox | undefined> {
    const result = await tx.execute<MiladySandbox>(sql`
      SELECT *
      FROM ${miladySandboxes}
      WHERE id = ${agentId}
        AND organization_id = ${orgId}
      FOR UPDATE
    `);
    return result.rows[0];
  }

  private async hasActiveProvisionJobTx(
    tx: LifecycleTx,
    agentId: string,
    orgId: string,
  ): Promise<boolean> {
    const result = await tx.execute<{ id: string }>(sql`
      SELECT id
      FROM ${jobs}
      WHERE type = ${JOB_TYPES.MILADY_PROVISION}
        AND organization_id = ${orgId}
        AND ${jobs.data}->>'agentId' = ${agentId}
        AND status IN ('pending', 'in_progress')
      LIMIT 1
    `);
    return result.rows.length > 0;
  }

  private async fetchSnapshotState(
    rec: Pick<
      MiladySandbox,
      "bridge_url" | "node_id" | "bridge_port" | "headscale_ip" | "sandbox_id"
    >,
  ): Promise<{
    stateData: MiladyBackupStateData;
    sizeBytes: number;
    bridgeUrl: string;
  }> {
    if (!rec.bridge_url) {
      throw new Error("Sandbox is not running");
    }

    const snapshotEndpoint = await this.getSafeBridgeEndpoint(rec, "/api/snapshot");
    const res = await fetch(snapshotEndpoint, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`Snapshot fetch failed: HTTP ${res.status}`);
    }

    const stateData = (await res.json()) as MiladyBackupStateData;
    const sizeBytes = Buffer.byteLength(JSON.stringify(stateData), "utf-8");

    return {
      stateData,
      sizeBytes,
      bridgeUrl: rec.bridge_url,
    };
  }

  private async persistSnapshotWithinTransaction(
    tx: LifecycleTx,
    sandboxRecordId: string,
    type: MiladyBackupSnapshotType,
    stateData: MiladyBackupStateData,
    sizeBytes: number,
  ): Promise<void> {
    const backupResult = await tx.execute<MiladySandboxBackup>(sql`
      INSERT INTO ${miladySandboxBackups}
        (sandbox_record_id, snapshot_type, state_data, size_bytes)
      VALUES
        (${sandboxRecordId}, ${type}, ${stateData}, ${sizeBytes})
      RETURNING *
    `);
    const backup = backupResult.rows[0];

    await tx.execute(sql`
      UPDATE ${miladySandboxes}
      SET
        last_backup_at = NOW(),
        updated_at = NOW()
      WHERE id = ${sandboxRecordId}
    `);

    logger.info("[milady-sandbox] Backup created", {
      agentId: sandboxRecordId,
      type,
      bytes: backup?.size_bytes ?? sizeBytes,
    });
  }

  private async markError(rec: MiladySandbox, msg: string) {
    await miladySandboxesRepository.update(rec.id, {
      status: "error",
      error_message: msg,
      error_count: (rec.error_count ?? 0) + 1,
    });
  }

  private async provisionNeon(
    rec: MiladySandbox,
  ): Promise<{ success: boolean; connectionUri?: string; error?: string }> {
    await miladySandboxesRepository.update(rec.id, {
      database_status: "provisioning",
    });
    const neon = getNeonClient();
    const name = `milady-${sanitizeProjectNameSegment(rec.agent_name ?? "agent")}-${rec.id.substring(0, 8)}`;
    const result = await neon.createProject({ name, region: "aws-us-east-1" });

    const updated = await miladySandboxesRepository.update(rec.id, {
      neon_project_id: result.projectId,
      neon_branch_id: result.branchId,
      database_uri: result.connectionUri,
      database_status: "ready",
      database_error: null,
    });

    if (!updated) {
      logger.error("[milady-sandbox] DB update failed after Neon creation, cleaning orphan", {
        projectId: result.projectId,
      });
      await neon.deleteProject(result.projectId).catch((e) => {
        logger.error("[milady-sandbox] Orphan Neon project cleanup failed", {
          projectId: result.projectId,
          error: e instanceof Error ? e.message : String(e),
        });
      });
      return {
        success: false,
        error: "Failed to persist database credentials",
      };
    }

    return { success: true, connectionUri: result.connectionUri };
  }

  private async cleanupNeon(projectId: string) {
    try {
      await getNeonClient().deleteProject(projectId);
    } catch (error) {
      if (error instanceof NeonClientError && error.statusCode === 404) {
        logger.info("[milady-sandbox] Neon project already absent during cleanup", {
          projectId,
        });
        return;
      }
      throw error;
    }
  }

  private isIgnorableSandboxStopError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.toLowerCase();
    return (
      normalized.includes("not found") ||
      normalized.includes("already gone") ||
      normalized.includes("no longer exists") ||
      normalized.includes("404")
    );
  }

  private async pushState(
    sandboxOrBridgeUrl:
      | Pick<
          MiladySandbox,
          "bridge_url" | "node_id" | "bridge_port" | "headscale_ip" | "sandbox_id"
        >
      | string,
    state: MiladyBackupStateData,
    options?: { trusted?: boolean },
  ) {
    const restoreEndpoint = await this.getSafeBridgeEndpoint(
      sandboxOrBridgeUrl,
      "/api/restore",
      options,
    );
    const res = await fetch(restoreEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`State restore failed: HTTP ${res.status} ${text.slice(0, 200)}`);
    }
  }
}

export const miladySandboxService = new MiladySandboxService();
