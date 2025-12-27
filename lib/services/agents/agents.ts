import { agentsRepository, type AgentInfo } from "@/db/repositories/agents";
import { participantsRepository, memoriesRepository } from "@/db/repositories";
import { charactersService } from "@/lib/services/characters/characters";
import { logger } from "@/lib/utils/logger";
import { agentRuntime } from "@/lib/eliza/agent-runtime";
import {
  agentStateCache,
  type RoomContext,
} from "@/lib/cache/agent-state-cache";
import { cache as cacheClient } from "@/lib/cache/client";
import { distributedLocks } from "@/lib/cache/distributed-locks";
import { agentEventEmitter } from "@/lib/events/agent-events";
import { roomsService } from "./rooms";

const agentInfoCacheKey = (agentId: string) => `agent:info:${agentId}`;

export type { AgentInfo };

/**
 * Input for sending a message to an agent.
 */
export interface SendMessageInput {
  roomId: string;
  entityId: string;
  message: string;
  organizationId: string;
  streaming?: boolean;
  attachments?: Attachment[];
}

/**
 * Message attachment structure.
 */
export interface Attachment {
  id?: string;
  type: "image" | "file";
  url: string;
  filename?: string;
  mimeType?: string;
  title?: string;
  source?: string;
  description?: string;
  text?: string;
}

/**
 * Response from an agent.
 */
export interface AgentResponse {
  messageId: string;
  content: string;
  roomId: string;
  timestamp: Date;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    model: string;
  };
  streaming?: {
    sseUrl: string;
  };
}

class AgentsService {
  async getById(agentId: string): Promise<AgentInfo | null> {
    const cacheKey = agentInfoCacheKey(agentId);

    const cached = await cacheClient.get<AgentInfo>(cacheKey);
    if (cached) return cached;

    const agent = await agentsRepository.findById(agentId);

    if (agent) {
      await cacheClient.set(cacheKey, agent, 300);
    }

    return agent;
  }

  async invalidateCache(agentId: string): Promise<void> {
    await cacheClient.del(agentInfoCacheKey(agentId));
  }

  async getByIds(agentIds: string[]): Promise<AgentInfo[]> {
    if (agentIds.length === 0) return [];
    return await agentsRepository.findByIds(agentIds);
  }

  async exists(agentId: string): Promise<boolean> {
    return await agentsRepository.exists(agentId);
  }

  async ensureDefaultAgentExists(): Promise<void> {
    const DEFAULT_AGENT_ID = "b850bc30-45f8-0041-a00a-83df46d8555d";

    const exists = await agentsRepository.exists(DEFAULT_AGENT_ID);
    if (exists) {
      logger.debug(`[Agents Service] Default Eliza agent already exists`);
      return;
    }

    const defaultAgent = await import("@/lib/eliza/agent");
    const character = defaultAgent.default.character;

    const avatarUrl = character.settings?.avatarUrl as string | undefined;
    const created = await agentsRepository.create({
      id: DEFAULT_AGENT_ID as `${string}-${string}-${string}-${string}-${string}`,
      name: character.name,
      bio: character.bio,
      system: character.system,
      settings: avatarUrl ? { avatarUrl } : {},
      enabled: true,
    });

    if (created) {
      logger.info(
        `[Agents Service] Created default Eliza agent ${DEFAULT_AGENT_ID}`,
      );
    } else {
      logger.debug(
        `[Agents Service] Default Eliza agent already exists (race condition)`,
      );
    }
  }

  async ensureAgentExists(characterId: string): Promise<string> {
    const exists = await agentsRepository.exists(characterId);
    if (exists) {
      logger.debug(`[Agents Service] Agent ${characterId} already exists`);
      return characterId;
    }

    const character = await charactersService.getById(characterId);
    if (!character) throw new Error(`Character ${characterId} not found`);

    const characterData = character.character_data as
      | Record<string, unknown>
      | undefined;

    const created = await agentsRepository.create({
      id: characterId as `${string}-${string}-${string}-${string}-${string}`,
      name: character.name,
      bio: characterData?.bio as string | string[] | undefined,
      settings: {
        ...(character.avatar_url ? { avatarUrl: character.avatar_url } : {}),
        ...(characterData?.settings as Record<string, unknown> | undefined),
      },
      enabled: true,
    });

    if (!created) {
      logger.debug(
        `[Agents Service] Agent ${characterId} already exists (race condition)`,
      );
    } else {
      logger.info(
        `[Agents Service] Created agent ${characterId} from character ${character.name}`,
      );
    }

    return characterId;
  }

  async getDisplayInfo(
    agentId: string,
  ): Promise<{ id: string; name: string; avatarUrl?: string } | null> {
    return await agentsRepository.getDisplayInfo(agentId);
  }

  async getName(agentId: string): Promise<string | null> {
    const agent = await this.getById(agentId);
    return agent?.name || null;
  }

  async getAvatarUrl(agentId: string): Promise<string | undefined> {
    return await agentsRepository.getAvatarUrl(agentId);
  }

  async getOrCreateRoom(entityId: string, agentId: string): Promise<string> {
    const existingRoomIds =
      await participantsRepository.findRoomsByEntityId(entityId);

    if (existingRoomIds && existingRoomIds.length > 0) {
      logger.debug(
        `[Agents Service] Found existing room ${existingRoomIds[0]} for entity ${entityId}`,
      );
      return existingRoomIds[0];
    }

    const room = await roomsService.createRoom({
      agentId,
      entityId,
      source: "chat",
      type: "DM",
      name: "New Chat",
    });

    logger.info(
      `[Agents Service] Created new room ${room.id} for entity ${entityId}`,
    );
    return room.id;
  }

  async sendMessage(input: SendMessageInput): Promise<AgentResponse> {
    const { roomId, message, streaming, attachments } = input;

    const lock = await distributedLocks.acquireRoomLockWithRetry(
      roomId,
      60000,
      {
        maxRetries: 10,
        initialDelayMs: 100,
        maxDelayMs: 2000,
      },
    );

    if (!lock) {
      throw new Error(
        "Room is currently processing another message. Maximum wait time exceeded.",
      );
    }

    try {
      const runtime = await agentRuntime.getRuntime();

      await agentEventEmitter.emitResponseStarted(roomId, runtime.agentId);

      const { message: agentMessage, usage: messageUsage } =
        await agentRuntime.handleMessage(roomId, {
          text: message,
          attachments:
            attachments?.map((a, i) => ({
              id: a.id || `attachment-${i}`,
              url: a.url,
              title: a.filename || a.title || "",
              source: a.source || "upload",
              description: a.description || "",
              text: a.text || "",
            })) || [],
        });

      await agentEventEmitter.emitResponseComplete(
        roomId,
        agentMessage,
        messageUsage || {
          inputTokens: Math.ceil(message.length / 4),
          outputTokens: Math.ceil(
            ((agentMessage.content.text as string) || "").length / 4,
          ),
          model: "eliza-agent",
        },
      );

      await agentStateCache.invalidateRoomContext(roomId);

      return {
        messageId: agentMessage.id!,
        content: agentMessage.content.text as string,
        roomId,
        timestamp: new Date(agentMessage.createdAt || Date.now()),
        usage: {
          inputTokens: Math.ceil(message.length / 4),
          outputTokens: Math.ceil(
            ((agentMessage.content.text as string) || "").length / 4,
          ),
          model: "eliza-agent",
        },
        ...(streaming && {
          streaming: {
            sseUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/mcp/stream?eventType=agent&resourceId=${roomId}`,
          },
        }),
      };
    } finally {
      await lock.release();
    }
  }

  async getRoomContext(roomId: string): Promise<RoomContext> {
    const cached = await agentStateCache.getRoomContext(roomId);
    if (cached) {
      logger.debug(`[Agents Service] Cache hit for room ${roomId}`);
      return cached;
    }

    logger.debug(
      `[Agents Service] Cache miss for room ${roomId}, fetching from DB`,
    );

    const messages = await memoriesRepository.findMessages(roomId, {
      limit: 20,
    });
    const participantIds =
      await participantsRepository.getEntityIdsByRoomId(roomId);

    const context: RoomContext = {
      roomId,
      messages,
      participants: participantIds,
      metadata: {},
      lastActivity: new Date(),
    };

    await agentStateCache.setRoomContext(roomId, context);
    return context;
  }
}

export const agentsService = new AgentsService();
