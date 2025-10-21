import { v4 as uuidv4 } from "uuid";
import { agentRuntime } from "@/lib/eliza/agent-runtime";
import { memoryCache, type RoomContext, type SearchResult } from "@/lib/cache/memory-cache";
import { CacheKeys, CacheTTL } from "@/lib/cache/keys";
import { logger } from "@/lib/utils/logger";
import { streamText } from "ai";
import { gateway } from "@ai-sdk/gateway";
import type { Memory, UUID } from "@elizaos/core";
import { createHash } from "crypto";

export interface SaveMemoryInput {
  organizationId: string;
  roomId: string;
  entityId: string;
  content: string;
  type: "fact" | "preference" | "context" | "document";
  tags?: string[];
  metadata?: Record<string, unknown>;
  ttl?: number;
  persistent?: boolean;
}

export interface SaveMemoryResult {
  memoryId: string;
  storage: "redis" | "postgres" | "both";
  expiresAt?: Date;
}

export interface RetrieveMemoriesInput {
  organizationId: string;
  roomId?: string;
  query?: string;
  type?: string[];
  tags?: string[];
  limit?: number;
  includeArchived?: boolean;
  sortBy?: "relevance" | "recent" | "importance";
}

export interface DeleteMemoryInput {
  organizationId: string;
  memoryId?: string;
  olderThan?: number;
  type?: string[];
  tags?: string[];
}

export interface DeleteMemoryResult {
  deletedCount: number;
  storageFreed: number;
}

export interface SummarizeConversationInput {
  roomId: string;
  organizationId: string;
  lastN?: number;
  style?: "brief" | "detailed" | "bullet-points";
  includeMetadata?: boolean;
}

export interface SummarizeConversationResult {
  summary: string;
  tokenCount: number;
  keyTopics: string[];
  participants: string[];
}

export class MemoryService {
  async saveMemory(input: SaveMemoryInput): Promise<SaveMemoryResult> {
    try {
      const runtime = await agentRuntime.getRuntime();

      const memory: Memory = {
        id: uuidv4() as UUID,
        roomId: input.roomId as UUID,
        entityId: input.entityId as UUID,
        agentId: runtime.agentId,
        createdAt: Date.now(),
        content: {
          text: input.content,
          type: input.type,
          tags: input.tags,
          ...input.metadata,
        },
      };

      const persistent = input.persistent !== false;

      if (persistent) {
        await runtime.adapter.createMemory(memory, "memories", true);
        logger.info(
          `[Memory Service] Saved memory to PostgreSQL: ${memory.id}`,
        );
      }

      const ttl = input.ttl || CacheTTL.memory.item;
      const memoryId = memory.id!;
      const cacheKey = CacheKeys.memory.item(input.organizationId, memoryId);
      await memoryCache.cacheMemory(cacheKey, memory, ttl);

      await memoryCache.invalidateRoom(input.roomId);

      return {
        memoryId: memoryId,
        storage: persistent ? "both" : "redis",
        expiresAt: input.ttl ? new Date(Date.now() + ttl * 1000) : undefined,
      };
    } catch (error) {
      logger.error("[Memory Service] Failed to save memory:", error);
      throw error;
    }
  }

  async retrieveMemories(
    input: RetrieveMemoriesInput,
  ): Promise<SearchResult[]> {
    try {
      const runtime = await agentRuntime.getRuntime();

      if (input.query) {
        const queryHash = this.hashQuery(input.query, input);
        const cached = await memoryCache.getSearchResults(queryHash);
        if (cached) {
          logger.debug(
            `[Memory Service] Cache HIT for search query: ${input.query.substring(0, 50)}`,
          );
          return cached;
        }
      }

      let memories: Memory[] = [];

      if (input.query) {
        const embedding = new Array(1536).fill(0);
        memories = await runtime.adapter.searchMemories({
          embedding,
          tableName: "memories",
          count: input.limit || 10,
          roomId: input.roomId ? (input.roomId as UUID) : undefined,
          match_threshold: 0.7,
        });
      } else {
        memories = await runtime.adapter.getMemories({
          tableName: "memories",
          roomId: input.roomId ? (input.roomId as UUID) : undefined,
          count: input.limit || 10,
          unique: true,
        });
      }

      const results: SearchResult[] = memories.map((memory) => ({
        memory,
        score: 1.0,
        context: [],
      }));

      if (input.query) {
        const queryHash = this.hashQuery(input.query, input);
        await memoryCache.cacheSearchResults(
          queryHash,
          results,
          CacheTTL.memory.search,
        );
      }

      logger.info(
        `[Memory Service] Retrieved ${results.length} memories for query`,
      );
      return results;
    } catch (error) {
      logger.error("[Memory Service] Failed to retrieve memories:", error);
      throw error;
    }
  }

  async deleteMemory(input: DeleteMemoryInput): Promise<DeleteMemoryResult> {
    try {
      const runtime = await agentRuntime.getRuntime();
      let deletedCount = 0;

      if (input.memoryId) {
        await runtime.adapter.deleteMemory(input.memoryId as UUID);
        await memoryCache.invalidateMemory(input.memoryId);
        deletedCount = 1;
      }

      logger.info(
        `[Memory Service] Deleted ${deletedCount} memories for org ${input.organizationId}`,
      );

      return {
        deletedCount,
        storageFreed: deletedCount * 1024,
      };
    } catch (error) {
      logger.error("[Memory Service] Failed to delete memory:", error);
      throw error;
    }
  }

  async getRoomContext(
    roomId: string,
    organizationId: string,
    depth: number = 20,
    includeMemories: boolean = false,
  ): Promise<RoomContext> {
    try {
      const cached = await memoryCache.getRoomContext(roomId);
      if (cached && cached.depth >= depth) {
        logger.debug(`[Memory Service] Cache HIT for room context: ${roomId}`);
        return cached;
      }

      const runtime = await agentRuntime.getRuntime();

      const memories = await runtime.adapter.getMemoriesByRoomIds({
        tableName: "messages",
        roomIds: [roomId as UUID],
        limit: depth,
      });

      const participants = await runtime.adapter.getParticipantsForRoom(
        roomId as UUID,
      );

      const rooms = await runtime.adapter.getRoomsByIds([roomId as UUID]);
      const room = rooms && rooms.length > 0 ? rooms[0] : null;

      const context: RoomContext = {
        roomId,
        messages: memories,
        participants,
        metadata: room?.metadata || {},
        depth,
        timestamp: new Date(),
      };

      await memoryCache.cacheRoomContext(
        roomId,
        context,
        CacheTTL.memory.roomContext,
      );

      logger.info(
        `[Memory Service] Retrieved room context: ${roomId} (${memories.length} messages)`,
      );
      return context;
    } catch (error) {
      logger.error("[Memory Service] Failed to get room context:", error);
      throw error;
    }
  }

  async summarizeConversation(
    input: SummarizeConversationInput,
  ): Promise<SummarizeConversationResult> {
    try {
      const cacheKey = `${input.roomId}:${input.lastN}:${input.style}`;
      const cached = await memoryCache.getMemory(
        CacheKeys.memory.conversationSummary(
          input.organizationId,
          cacheKey,
        ),
      );
      if (cached) {
        logger.debug(
          `[Memory Service] Cache HIT for conversation summary: ${input.roomId}`,
        );
        return cached.content as unknown as SummarizeConversationResult;
      }

      const context = await this.getRoomContext(
        input.roomId,
        input.organizationId,
        input.lastN || 50,
      );

      const summaryPrompt = this.buildSummaryPrompt(
        context,
        input.style || "brief",
      );

      const result = await streamText({
        model: gateway.languageModel("gpt-4o-mini"),
        prompt: summaryPrompt,
      });

      let fullText = "";
      for await (const delta of result.textStream) {
        fullText += delta;
      }

      const usage = await result.usage;

      const summary: SummarizeConversationResult = {
        summary: fullText,
        tokenCount: usage?.totalTokens || 0,
        keyTopics: this.extractTopics(fullText),
        participants: context.participants.map((p) => p.toString()),
      };

      const summaryMemory: Memory = {
        id: uuidv4() as UUID,
        roomId: input.roomId as UUID,
        entityId: context.participants[0] || ("system" as UUID),
        agentId: (await agentRuntime.getRuntime()).agentId,
        createdAt: Date.now(),
        content: summary as unknown as Record<string, unknown>,
      };

      await memoryCache.cacheMemory(
        CacheKeys.memory.conversationSummary(input.organizationId, cacheKey),
        summaryMemory,
        CacheTTL.memory.conversationSummary,
      );

      logger.info(
        `[Memory Service] Generated conversation summary: ${input.roomId} (${usage?.totalTokens} tokens)`,
      );
      return summary;
    } catch (error) {
      logger.error("[Memory Service] Failed to summarize conversation:", error);
      throw error;
    }
  }

  private hashQuery(
    query: string,
    filters: Partial<RetrieveMemoriesInput>,
  ): string {
    const hash = createHash("md5")
      .update(JSON.stringify({ query, filters }))
      .digest("hex");
    return hash.substring(0, 16);
  }

  private buildSummaryPrompt(context: RoomContext, style: string): string {
    const messages = context.messages
      .slice(0, 50)
      .map((m) => `${m.entityId}: ${m.content.text}`)
      .join("\n");

    const styleInstructions = {
      brief: "Provide a concise 2-3 sentence summary.",
      detailed:
        "Provide a comprehensive summary with key points and discussion flow.",
      "bullet-points":
        "Provide a bulleted list of the main topics discussed.",
    };

    return `Summarize the following conversation in ${style} style. ${styleInstructions[style as keyof typeof styleInstructions] || styleInstructions.brief}

Conversation:
${messages}

Summary:`;
  }

  private extractTopics(text: string): string[] {
    const words = text
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 4);
    const wordCounts = new Map<string, number>();

    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }

    return Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map((e) => e[0]);
  }

  async estimateTokenCount(messages: Memory[]): Promise<number> {
    const totalText = messages
      .map((m) => m.content.text || "")
      .join(" ");
    return Math.ceil(totalText.length / 4);
  }
}

export const memoryService = new MemoryService();
