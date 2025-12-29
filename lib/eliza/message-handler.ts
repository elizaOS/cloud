/**
 * Message Handler - Processes messages through ElizaOS runtime.
 */

import { v4 as uuidv4 } from "uuid";
import {
  AgentRuntime,
  ChannelType,
  EventType,
  Memory,
  MemoryType,
  stringToUuid,
  elizaLogger,
  createUniqueUuid,
  type UUID,
  type Content,
  type Media,
  type World,
} from "@elizaos/core";
import { connectionCache } from "@/lib/cache/connection-cache";
import type { UserContext } from "./user-context";
import { anonymousSessionsService } from "@/lib/services/anonymous-sessions";
import { discordService } from "@/lib/services/discord";
import { roomsRepository } from "@/db/repositories";
import { charactersService } from "@/lib/services/characters";
import type { AgentModeConfig } from "./agent-mode-types";
import { DEFAULT_AGENT_MODE } from "./agent-mode-types";
import type { DialogueMetadata } from "@/lib/types/message-content";

export interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface MessageResult {
  message: Memory;
  usage?: UsageInfo;
}

export type StreamChunkCallback = (
  chunk: string,
  messageId?: UUID,
) => Promise<void>;

export type ReasoningChunkCallback = (
  chunk: string,
  phase: "planning" | "actions" | "response",
  messageId?: UUID,
) => Promise<void>;

export interface MessageOptions {
  roomId: string;
  text: string;
  attachments?: Media[];
  characterId?: string;
  model?: string;
  agentModeConfig?: AgentModeConfig;
  onStreamChunk?: StreamChunkCallback;
  onReasoningChunk?: ReasoningChunkCallback;
}

export class MessageHandler {
  constructor(
    private runtime: AgentRuntime,
    private userContext: UserContext,
  ) {}

  async process(options: MessageOptions): Promise<MessageResult> {
    const {
      roomId,
      text,
      attachments,
      agentModeConfig,
      onStreamChunk,
      onReasoningChunk,
    } = options;
    const entityId = this.userContext.userId;
    const modeConfig = agentModeConfig || DEFAULT_AGENT_MODE;

    elizaLogger.info(
      `[MessageHandler] Processing: user=${this.userContext.userId}, room=${roomId}, mode=${modeConfig.mode}, streaming=${!!onStreamChunk}`,
    );

    await this.ensureConnectionForCloud(roomId, entityId);
    const userMessage = this.createMessage(roomId, entityId, {
      text,
      attachments,
    });

    let responseMemory: Memory | undefined;
    let usage: MessageResult["usage"];

    await this.runtime.emitEvent(EventType.MESSAGE_RECEIVED, {
      runtime: this.runtime,
      message: userMessage,
      agentModeConfig: modeConfig,
      onStreamChunk,
      onReasoningChunk,
      callback: async (content: Content) => {
        if (content.text) {
          responseMemory = {
            id: createUniqueUuid(
              this.runtime,
              (userMessage.id ?? uuidv4()) as UUID,
            ),
            entityId: this.runtime.agentId,
            agentId: this.runtime.agentId,
            roomId: roomId as UUID,
            createdAt: Date.now(),
            content: {
              ...content,
              source: content.source || "agent",
              inReplyTo: userMessage.id,
            },
            metadata: {
              type: MemoryType.MESSAGE,
              role: "agent",
              dialogueType: "message",
              visibility: "visible",
              agentMode: modeConfig.mode,
            } as DialogueMetadata,
          };
          await this.runtime.createMemory(responseMemory, "messages");
        }

        if ("usage" in content && content.usage) {
          usage = content.usage as UsageInfo;
        }
        return [];
      },
    });

    // Fallback if no response was generated
    if (!responseMemory) {
      responseMemory = {
        id: uuidv4() as UUID,
        roomId: roomId as UUID,
        entityId: this.runtime.agentId as UUID,
        agentId: this.runtime.agentId as UUID,
        createdAt: Date.now(),
        content: {
          text: "I'm sorry, I couldn't generate a response.",
          source: "agent",
        },
      };
    }

    if (this.userContext.isAnonymous && this.userContext.sessionToken) {
      await this.incrementAnonymousMessageCount();
    }

    const responseText =
      typeof responseMemory.content === "string"
        ? responseMemory.content
        : responseMemory.content?.text || "";
    this.sendToDiscordThread(
      roomId,
      text,
      responseText,
      options.characterId,
    ).catch((e) => {
      elizaLogger.debug(`[MessageHandler] Discord send failed: ${e}`);
    });

    return { message: responseMemory, usage };
  }

  private async ensureConnectionForCloud(
    roomId: string,
    entityId: string,
  ): Promise<void> {
    if (await connectionCache.isEstablished(roomId, entityId)) return;

    const entityUuid = stringToUuid(entityId) as UUID;
    const roomUuid = roomId as UUID;
    const worldId = stringToUuid("eliza-world") as UUID;
    const serverId = stringToUuid("eliza-server") as UUID;

    const displayName =
      this.userContext.name ||
      this.userContext.email ||
      this.userContext.userId ||
      "User";
    const names = [
      this.userContext.name,
      this.userContext.email,
      displayName,
    ].filter(Boolean) as string[];

    // Batch all independent operations together.
    // World/Agent entities have no deps. Room needs worldId/serverId (but we have them).
    // User entity has no deps on room. Participants depend on room/user existing.
    await Promise.all([
      this.ensureWorldExists(worldId, serverId),
      this.ensureAgentEntity(),
      this.ensureRoomExistsWithFields(roomUuid, worldId, serverId),
      this.ensureUserEntity(entityUuid, names, displayName),
    ]);

    // Participants depend on room and user existing
    await this.ensureParticipants(roomUuid, entityUuid);

    // Fire-and-forget cache update
    connectionCache.markEstablished(roomId, entityId).catch((e) => {
      elizaLogger.debug(`[MessageHandler] Cache mark failed: ${e}`);
    });
  }

  private async ensureWorldExists(
    worldId: UUID,
    serverId: UUID,
  ): Promise<void> {
    try {
      await this.runtime.ensureWorldExists({
        id: worldId,
        name: "ElizaCloud Web",
        agentId: this.runtime.agentId,
        serverId,
      } as World);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        !msg.toLowerCase().includes("duplicate") &&
        !msg.toLowerCase().includes("unique constraint")
      )
        throw e;
    }
  }

  private async ensureRoomExistsWithFields(
    roomId: UUID,
    worldId: UUID,
    serverId: UUID,
  ): Promise<void> {
    const existingRoom = await this.runtime.getRoom(roomId);

    if (existingRoom) {
      if (!existingRoom.worldId || !existingRoom.serverId) {
        // DO NOT UPDATE ROOM NAME. SHOULD BE DONE BY AGENT.
        await this.runtime.updateRoom({ ...existingRoom, worldId, serverId });
      }
    } else {
      // We set the name to "New Chat" to and leave that for the agent to update.
      await this.runtime.ensureRoomExists({
        id: roomId,
        name: "New Chat",
        type: ChannelType.DM,
        channelId: roomId,
        worldId,
        serverId,
        agentId: this.runtime.agentId,
        source: "web",
      });
    }
  }

  private async ensureAgentEntity(): Promise<void> {
    if (await this.runtime.getEntityById(this.runtime.agentId)) return;

    try {
      await this.runtime.createEntity({
        id: this.runtime.agentId,
        agentId: this.runtime.agentId,
        names: [this.runtime.character?.name || "Agent"],
        metadata: {
          name: this.runtime.character?.name || "Agent",
          type: "agent",
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        !msg.toLowerCase().includes("duplicate") &&
        !msg.toLowerCase().includes("unique constraint")
      )
        throw e;
    }
  }

  private async ensureUserEntity(
    entityUuid: UUID,
    names: string[],
    displayName: string,
  ): Promise<void> {
    const existingEntity = await this.runtime.getEntityById(entityUuid);
    const metadata = {
      web: {
        id: this.userContext.userId,
        name: this.userContext.name,
        userName: displayName,
        email: this.userContext.email,
        organizationId: this.userContext.organizationId,
      },
    };

    if (!existingEntity) {
      try {
        await this.runtime.createEntity({
          id: entityUuid,
          agentId: this.runtime.agentId,
          names,
          metadata,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (
          !msg.toLowerCase().includes("duplicate") &&
          !msg.toLowerCase().includes("unique constraint")
        ) {
          throw new Error(`Failed to create user entity: ${msg}`);
        }
      }
    } else {
      const mergedNames = [
        ...new Set([...(existingEntity.names || []), ...names]),
      ].filter(Boolean) as string[];
      const mergedMetadata = {
        ...existingEntity.metadata,
        web: {
          ...(existingEntity.metadata?.web as Record<string, unknown>),
          ...metadata.web,
        },
      };

      await this.runtime
        .updateEntity({
          id: entityUuid,
          agentId: this.runtime.agentId,
          names: mergedNames,
          metadata: mergedMetadata,
        })
        .catch((e) => {
          elizaLogger.debug(`[MessageHandler] Entity update failed: ${e}`);
        });
    }
  }

  private async ensureParticipants(
    roomId: UUID,
    entityUuid: UUID,
  ): Promise<void> {
    await Promise.all([
      this.runtime
        .ensureParticipantInRoom(this.runtime.agentId, roomId)
        .catch((e) => {
          elizaLogger.debug(`[MessageHandler] Agent participant failed: ${e}`);
        }),
      this.runtime.ensureParticipantInRoom(entityUuid, roomId).catch((e) => {
        elizaLogger.debug(`[MessageHandler] User participant failed: ${e}`);
      }),
    ]);
  }

  private createMessage(
    roomId: string,
    entityId: string,
    content: { text?: string; attachments?: Media[] },
  ): Memory {
    const entityUuid = stringToUuid(entityId) as UUID;
    return {
      id: uuidv4() as UUID,
      roomId: roomId as UUID,
      entityId: entityUuid,
      agentId: this.runtime.agentId as UUID,
      createdAt: Date.now(),
      content: {
        text: content.text || "",
        source: "user",
        ...(content.attachments?.length
          ? {
              attachments: content.attachments.filter(
                (att): att is Media =>
                  typeof att === "object" &&
                  att !== null &&
                  ("url" in att || "mimeType" in att || "data" in att),
              ),
            }
          : {}),
      },
      metadata: {
        type: MemoryType.MESSAGE,
        role: "user",
        dialogueType: "message",
        visibility: "visible",
      } as DialogueMetadata,
    };
  }

  private async incrementAnonymousMessageCount(): Promise<void> {
    if (!this.userContext.sessionToken) return;

    const session = await anonymousSessionsService.getByToken(
      this.userContext.sessionToken,
    );

    if (session) {
      await anonymousSessionsService.incrementMessageCount(session.id);
    }
  }

  private async sendToDiscordThread(
    roomId: string,
    userText: string,
    agentResponse: string,
    characterId?: string,
  ): Promise<void> {
    const room = await roomsRepository.findById(roomId);
    const roomMetadata = room?.metadata as
      | { discordThreadId?: string }
      | undefined;
    const threadId = roomMetadata?.discordThreadId;
    if (!threadId) return;

    let characterName = "Agent";
    if (characterId) {
      const character = await charactersService.getById(characterId);
      characterName = character?.name || "Agent";
    }

    await discordService.sendToThread(
      threadId,
      `**${this.userContext.name || this.userContext.email || this.userContext.entityId}:** ${userText}`,
    );
    await discordService.sendToThread(
      threadId,
      `**🤖 ${characterName}:** ${agentResponse}`,
    );
  }
}

export function createMessageHandler(
  runtime: AgentRuntime,
  userContext: UserContext,
): MessageHandler {
  return new MessageHandler(runtime, userContext);
}
