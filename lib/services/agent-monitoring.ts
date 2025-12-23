import { dbRead } from "@/db/client";
import { containers } from "@/db/schemas/containers";
import { usageRecords } from "@/db/schemas/usage-records";
import { userCharacters } from "@/db/schemas/user-characters";
import {
  agentEventsRepository,
  type AgentEvent,
  type AgentEventType,
  type AgentLogLevel,
} from "@/db/repositories/agent-events";
import { containersService } from "./containers";
import { charactersService } from "./characters";
import { elizaRoomCharactersRepository } from "@/db/repositories/eliza-room-characters";
import { eq, desc, and, gte, sql, or } from "drizzle-orm";
import { logger } from "@/lib/utils/logger";

export type AgentStatus =
  | "running"
  | "deployed"
  | "idle"
  | "stopped"
  | "error"
  | "pending";

export interface AgentLogEntry {
  id: string;
  timestamp: string;
  type: AgentLogLevel;
  message: string;
  metadata?: Record<string, unknown>;
  source: "platform" | "container" | "inference";
}

export interface AgentStatusResponse {
  agentId: string;
  name: string;
  status: AgentStatus;
  lastMessageAt: string | null;
  lastActiveAt: string | null;
  lastError: {
    message: string;
    timestamp: string;
  } | null;
  deployment: {
    containerId: string | null;
    url: string | null;
    deployedAt: string | null;
    health: "healthy" | "unhealthy" | "unknown";
  };
  stats: {
    totalInferences: number;
    totalMessages: number;
    uptime: number;
  };
}

export interface AgentEventResponse {
  id: string;
  type: AgentEventType;
  timestamp: string;
  message: string;
  metadata?: Record<string, unknown>;
  durationMs?: number;
}

class AgentMonitoringService {
  async getAgentLogs(
    agentId: string,
    organizationId: string,
    options?: {
      limit?: number;
      since?: Date;
      level?: AgentLogLevel;
    },
  ): Promise<AgentLogEntry[]> {
    const limit = options?.limit || 50;
    const since = options?.since;

    const character = await charactersService.getById(agentId);
    if (!character || character.organization_id !== organizationId) {
      throw new Error("Agent not found");
    }

    const [platformEvents, inferenceRecords] = await Promise.all([
      agentEventsRepository.listByAgent(agentId, {
        levels: options?.level ? [options.level] : undefined,
        since,
        limit,
      }),
      this.getInferenceLogs(agentId, organizationId, { limit, since }),
    ]);

    const logs: AgentLogEntry[] = [];

    for (const event of platformEvents) {
      logs.push({
        id: event.id,
        timestamp: event.created_at.toISOString(),
        type: event.level,
        message: event.message,
        metadata: event.metadata as Record<string, unknown>,
        source: "platform",
      });
    }

    for (const record of inferenceRecords) {
      const level: AgentLogLevel = record.is_successful ? "info" : "error";
      if (options?.level && level !== options.level) continue;

      logs.push({
        id: record.id,
        timestamp: record.created_at.toISOString(),
        type: level,
        message: record.is_successful
          ? `Inference completed: ${record.model || "unknown model"}`
          : `Inference failed: ${record.error_message || "Unknown error"}`,
        metadata: {
          model: record.model,
          provider: record.provider,
          inputTokens: record.input_tokens,
          outputTokens: record.output_tokens,
          durationMs: record.duration_ms,
          ...(record.metadata as Record<string, unknown>),
        },
        source: "inference",
      });
    }

    logs.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return logs.slice(0, limit);
  }

  async getAgentStatus(
    agentId: string,
    organizationId: string,
  ): Promise<AgentStatusResponse> {
    const character = await charactersService.getById(agentId);
    if (!character || character.organization_id !== organizationId) {
      throw new Error("Agent not found");
    }

    const [container, latestError, roomCount, inferenceStats, lastInference] =
      await Promise.all([
        containersService.getByCharacterId(agentId),
        agentEventsRepository.getLatestError(agentId),
        elizaRoomCharactersRepository.countByCharacterId(agentId),
        this.getInferenceStats(agentId, organizationId),
        this.getLastInference(agentId, organizationId),
      ]);

    let status: AgentStatus = "idle";
    let health: "healthy" | "unhealthy" | "unknown" = "unknown";

    if (container) {
      switch (container.status) {
        case "running":
          status = "running";
          health = "healthy";
          break;
        case "pending":
        case "building":
        case "deploying":
          status = "pending";
          break;
        case "failed":
          status = "error";
          health = "unhealthy";
          break;
        case "stopped":
        case "deleted":
        case "deleting":
          status = "stopped";
          break;
        default:
          status = "idle";
      }
    } else if (roomCount > 0 || inferenceStats.total > 0) {
      status = "deployed";
    }

    const lastMessageAt = lastInference?.created_at || null;
    const lastActiveAt =
      container?.last_health_check ||
      container?.last_deployed_at ||
      lastInference?.created_at ||
      null;

    let uptime = 0;
    if (container?.last_deployed_at && status === "running") {
      uptime = Date.now() - new Date(container.last_deployed_at).getTime();
    }

    return {
      agentId,
      name: character.name,
      status,
      lastMessageAt: lastMessageAt?.toISOString() || null,
      lastActiveAt: lastActiveAt?.toISOString() || null,
      lastError: latestError
        ? {
            message: latestError.message,
            timestamp: latestError.created_at.toISOString(),
          }
        : container?.error_message
          ? {
              message: container.error_message,
              timestamp: container.updated_at.toISOString(),
            }
          : null,
      deployment: {
        containerId: container?.id || null,
        url: container?.load_balancer_url || null,
        deployedAt: container?.last_deployed_at?.toISOString() || null,
        health,
      },
      stats: {
        totalInferences: inferenceStats.total,
        totalMessages: roomCount,
        uptime,
      },
    };
  }

  async getAgentEvents(
    agentId: string,
    organizationId: string,
    options?: {
      limit?: number;
      since?: Date;
      types?: AgentEventType[];
    },
  ): Promise<AgentEventResponse[]> {
    const limit = options?.limit || 50;
    const since = options?.since;

    const character = await charactersService.getById(agentId);
    if (!character || character.organization_id !== organizationId) {
      throw new Error("Agent not found");
    }

    const [platformEvents, inferenceEvents, deployEvents] = await Promise.all([
      agentEventsRepository.listByAgent(agentId, {
        eventTypes: options?.types,
        since,
        limit,
      }),
      this.getInferenceEvents(agentId, organizationId, { limit, since }),
      this.getDeployEvents(agentId, organizationId, { since }),
    ]);

    const events: AgentEventResponse[] = [];

    for (const event of platformEvents) {
      events.push({
        id: event.id,
        type: event.event_type,
        timestamp: event.created_at.toISOString(),
        message: event.message,
        metadata: event.metadata as Record<string, unknown>,
        durationMs: event.duration_ms ? parseInt(event.duration_ms) : undefined,
      });
    }

    for (const record of inferenceEvents) {
      const eventType: AgentEventType = record.is_successful
        ? "inference_completed"
        : "inference_failed";

      if (options?.types && !options.types.includes(eventType)) continue;

      events.push({
        id: `inference-${record.id}`,
        type: eventType,
        timestamp: record.created_at.toISOString(),
        message: record.is_successful
          ? `Inference completed using ${record.model || "unknown"}`
          : `Inference failed: ${record.error_message || "Unknown error"}`,
        metadata: {
          model: record.model,
          provider: record.provider,
          tokens: record.input_tokens + record.output_tokens,
        },
        durationMs: record.duration_ms || undefined,
      });
    }

    for (const deploy of deployEvents) {
      let eventType: AgentEventType;
      let message: string;

      switch (deploy.status) {
        case "running":
          eventType = "deploy_completed";
          message = "Deployment completed successfully";
          break;
        case "failed":
          eventType = "deploy_failed";
          message = deploy.error_message || "Deployment failed";
          break;
        case "building":
        case "deploying":
        case "pending":
          eventType = "deploy_started";
          message = `Deployment ${deploy.status}`;
          break;
        case "stopped":
          eventType = "container_stopped";
          message = "Container stopped";
          break;
        default:
          continue;
      }

      if (options?.types && !options.types.includes(eventType)) continue;

      events.push({
        id: `deploy-${deploy.id}-${deploy.status}`,
        type: eventType,
        timestamp: deploy.updated_at.toISOString(),
        message,
        metadata: {
          containerId: deploy.id,
          containerName: deploy.name,
          url: deploy.load_balancer_url,
        },
      });
    }

    events.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return events.slice(0, limit);
  }

  async recordEvent(
    agentId: string,
    organizationId: string,
    event: {
      type: AgentEventType;
      level?: AgentLogLevel;
      message: string;
      metadata?: Record<string, unknown>;
      durationMs?: number;
      containerId?: string;
    },
  ): Promise<AgentEvent> {
    return await agentEventsRepository.create({
      agent_id: agentId,
      organization_id: organizationId,
      event_type: event.type,
      level: event.level || "info",
      message: event.message,
      metadata: event.metadata || {},
      duration_ms: event.durationMs?.toString(),
      container_id: event.containerId,
    });
  }

  private async getInferenceLogs(
    agentId: string,
    organizationId: string,
    options: { limit: number; since?: Date },
  ) {
    const conditions = [
      eq(usageRecords.organization_id, organizationId),
      or(
        sql`${usageRecords.metadata}->>'agentId' = ${agentId}`,
        sql`${usageRecords.metadata}->>'characterId' = ${agentId}`,
      ),
    ];

    if (options.since) {
      conditions.push(gte(usageRecords.created_at, options.since));
    }

    return await dbRead
      .select()
      .from(usageRecords)
      .where(and(...conditions))
      .orderBy(desc(usageRecords.created_at))
      .limit(options.limit);
  }

  private async getInferenceStats(agentId: string, organizationId: string) {
    const [result] = await dbRead
      .select({
        total: sql<number>`count(*)::int`,
        successful: sql<number>`count(*) filter (where ${usageRecords.is_successful} = true)::int`,
      })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.organization_id, organizationId),
          or(
            sql`${usageRecords.metadata}->>'agentId' = ${agentId}`,
            sql`${usageRecords.metadata}->>'characterId' = ${agentId}`,
          ),
        ),
      );

    return {
      total: result?.total || 0,
      successful: result?.successful || 0,
    };
  }

  private async getLastInference(agentId: string, organizationId: string) {
    const [result] = await dbRead
      .select()
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.organization_id, organizationId),
          or(
            sql`${usageRecords.metadata}->>'agentId' = ${agentId}`,
            sql`${usageRecords.metadata}->>'characterId' = ${agentId}`,
          ),
        ),
      )
      .orderBy(desc(usageRecords.created_at))
      .limit(1);

    return result;
  }

  private async getInferenceEvents(
    agentId: string,
    organizationId: string,
    options: { limit: number; since?: Date },
  ) {
    const conditions = [
      eq(usageRecords.organization_id, organizationId),
      or(
        sql`${usageRecords.metadata}->>'agentId' = ${agentId}`,
        sql`${usageRecords.metadata}->>'characterId' = ${agentId}`,
      ),
    ];

    if (options.since) {
      conditions.push(gte(usageRecords.created_at, options.since));
    }

    return await dbRead
      .select()
      .from(usageRecords)
      .where(and(...conditions))
      .orderBy(desc(usageRecords.created_at))
      .limit(options.limit);
  }

  private async getDeployEvents(
    agentId: string,
    organizationId: string,
    options: { since?: Date },
  ) {
    const conditions = [
      eq(containers.organization_id, organizationId),
      eq(containers.character_id, agentId),
    ];

    if (options.since) {
      conditions.push(gte(containers.updated_at, options.since));
    }

    return await dbRead
      .select()
      .from(containers)
      .where(and(...conditions))
      .orderBy(desc(containers.updated_at))
      .limit(10);
  }
}

export const agentMonitoringService = new AgentMonitoringService();
