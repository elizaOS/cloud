import { v4 as uuidv4 } from "uuid";
import { agentRuntime } from "@/lib/eliza/agent-runtime";
import { memoryCache, type RoomContext, type SearchResult } from "@/lib/cache/memory-cache";
import { CacheKeys, CacheTTL } from "@/lib/cache/keys";
import { logger } from "@/lib/utils/logger";
import { streamText } from "ai";
import { gateway } from "@ai-sdk/gateway";
import type { Memory, UUID } from "@elizaos/core";
import { createHash } from "crypto";
import { conversationsService } from "@/lib/services/conversations";
import type { ConversationMessage } from "@/db/repositories";

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

      // Ensure the room exists in the database
      const roomId = input.roomId as UUID;
      const adapter = runtime.adapter as unknown as {
        getRoomsByIds: (roomIds: UUID[]) => Promise<unknown[]>;
        createRooms: (rooms: { id: UUID }[]) => Promise<UUID[]>;
        ensureEntityExists: (entity: {
          id: UUID;
          agentId: UUID;
          names?: string[];
        }) => Promise<boolean>;
        addParticipant: (entityId: UUID, roomId: UUID) => Promise<boolean>;
      };

      const existingRooms = await adapter.getRoomsByIds([roomId]);
      if (!existingRooms || existingRooms.length === 0) {
        await adapter.createRooms([{ id: roomId }]);
        logger.debug(`[Memory Service] Created room: ${roomId}`);
      }

      // Ensure the entity (user) exists in the database
      const entityId = input.entityId as UUID;
      await adapter.ensureEntityExists({
        id: entityId,
        agentId: runtime.agentId,
        names: [entityId], // Use ID as name if we don't have a proper name
      });
      logger.debug(`[Memory Service] Ensured entity exists: ${entityId}`);

      // Ensure the entity is a participant in the room
      await adapter.addParticipant(entityId, roomId);
      logger.debug(
        `[Memory Service] Ensured participant in room: ${entityId} -> ${roomId}`,
      );

      const memory: Memory = {
        id: uuidv4() as UUID,
        roomId: roomId,
        entityId: entityId,
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
        try {
          logger.debug(
            `[Memory Service] Attempting to create memory in PostgreSQL:`,
            {
              memoryId: memory.id,
              roomId: memory.roomId,
              entityId: memory.entityId,
              agentId: memory.agentId,
              contentLength: JSON.stringify(memory.content).length,
            },
          );
          await runtime.adapter.createMemory(memory, "memories", true);
          logger.info(
            `[Memory Service] Saved memory to PostgreSQL: ${memory.id}`,
          );
        } catch (dbError) {
          logger.error(
            `[Memory Service] PostgreSQL insert failed with full error:`,
            {
              error: dbError instanceof Error ? dbError.message : String(dbError),
              errorName: dbError instanceof Error ? dbError.name : "Unknown",
              errorStack: dbError instanceof Error ? dbError.stack : undefined,
              errorCause:
                dbError instanceof Error
                  ? JSON.stringify(dbError.cause)
                  : undefined,
              memory: {
                id: memory.id,
                roomId: memory.roomId,
                entityId: memory.entityId,
                agentId: memory.agentId,
              },
            },
          );
          throw dbError;
        }
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
      logger.error("[Memory Service] Failed to save memory:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        cause: error instanceof Error ? error.cause : undefined,
        input: {
          organizationId: input.organizationId,
          roomId: input.roomId,
          entityId: input.entityId,
          persistent: input.persistent,
        },
      });
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

  async optimizeContextWindow(
    roomId: string,
    organizationId: string,
    maxTokens: number,
    query?: string,
    preserveRecent: number = 5,
  ): Promise<{
    messages: Memory[];
    totalTokens: number;
    messageCount: number;
    relevanceScores: Array<{ messageId: string; score: number }>;
  }> {
    try {
      const context = await this.getRoomContext(roomId, organizationId, 100);

      const recentMessages = context.messages.slice(0, preserveRecent);
      const olderMessages = context.messages.slice(preserveRecent);

      let selectedMessages = [...recentMessages];
      let currentTokens = await this.estimateTokenCount(recentMessages);

      const relevanceScores: Array<{ messageId: string; score: number }> = [];

      if (query) {
        for (const msg of olderMessages) {
          const msgText = msg.content.text || "";
          const score = this.calculateRelevanceScore(msgText, query);
          relevanceScores.push({
            messageId: msg.id?.toString() || "",
            score,
          });
        }

        relevanceScores.sort((a, b) => b.score - a.score);

        for (const scoreItem of relevanceScores) {
          const msg = olderMessages.find(
            (m) => m.id?.toString() === scoreItem.messageId,
          );
          if (msg) {
            const msgTokens = await this.estimateTokenCount([msg]);
            if (currentTokens + msgTokens <= maxTokens) {
              selectedMessages.push(msg);
              currentTokens += msgTokens;
            } else {
              break;
            }
          }
        }
      } else {
        for (const msg of olderMessages) {
          const msgTokens = await this.estimateTokenCount([msg]);
          if (currentTokens + msgTokens <= maxTokens) {
            selectedMessages.push(msg);
            currentTokens += msgTokens;
          } else {
            break;
          }
        }
      }

      logger.info(
        `[Memory Service] Optimized context: ${selectedMessages.length}/${context.messages.length} messages, ${currentTokens}/${maxTokens} tokens`,
      );

      return {
        messages: selectedMessages,
        totalTokens: currentTokens,
        messageCount: selectedMessages.length,
        relevanceScores,
      };
    } catch (error) {
      logger.error(
        "[Memory Service] Failed to optimize context window:",
        error,
      );
      throw error;
    }
  }

  async exportConversation(
    conversationId: string,
    organizationId: string,
    format: "json" | "markdown" | "txt",
    includeMemories: boolean = false,
  ): Promise<{
    content: string;
    size: number;
    format: string;
  }> {
    try {
      const conversation = await conversationsService.getWithMessages(
        conversationId,
      );

      if (!conversation) {
        throw new Error("Conversation not found");
      }

      let content = "";

      switch (format) {
        case "json":
          content = JSON.stringify(
            {
              id: conversation.id,
              title: conversation.title,
              model: conversation.model,
              createdAt: conversation.created_at,
              messages: conversation.messages.map((m: ConversationMessage) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                tokens: m.tokens,
                cost: m.cost,
                createdAt: m.created_at,
              })),
              metadata: {
                messageCount: conversation.message_count,
                totalCost: conversation.total_cost,
              },
            },
            null,
            2,
          );
          break;

        case "markdown":
          content = `# ${conversation.title}\n\n`;
          content += `**Model**: ${conversation.model}\n`;
          content += `**Created**: ${conversation.created_at}\n`;
          content += `**Messages**: ${conversation.message_count}\n\n`;
          content += `---\n\n`;

          for (const msg of conversation.messages) {
            content += `## ${msg.role}\n\n`;
            content += `${msg.content}\n\n`;
            content += `_Tokens: ${msg.tokens || 0} | Cost: ${msg.cost || 0} credits_\n\n`;
            content += `---\n\n`;
          }
          break;

        case "txt":
          content = `Conversation: ${conversation.title}\n`;
          content += `Model: ${conversation.model}\n`;
          content += `Created: ${conversation.created_at}\n`;
          content += `\n${"=".repeat(80)}\n\n`;

          for (const msg of conversation.messages) {
            content += `[${msg.role.toUpperCase()}]\n`;
            content += `${msg.content}\n`;
            content += `\n${"-".repeat(80)}\n\n`;
          }
          break;
      }

      logger.info(
        `[Memory Service] Exported conversation ${conversationId} as ${format}`,
      );

      return {
        content,
        size: content.length,
        format,
      };
    } catch (error) {
      logger.error("[Memory Service] Failed to export conversation:", error);
      throw error;
    }
  }

  async cloneConversation(
    conversationId: string,
    organizationId: string,
    userId: string,
    options: {
      newTitle?: string;
      preserveMessages?: boolean;
      preserveMemories?: boolean;
      newModel?: string;
    },
  ): Promise<{
    conversationId: string;
    clonedMessageCount: number;
  }> {
    try {
      const sourceConversation = await conversationsService.getWithMessages(
        conversationId,
      );

      if (!sourceConversation) {
        throw new Error("Source conversation not found");
      }

      const newConversation = await conversationsService.create({
        organization_id: organizationId,
        user_id: userId,
        title: options.newTitle || `${sourceConversation.title} (Copy)`,
        model: options.newModel || sourceConversation.model,
        settings: sourceConversation.settings,
      });

      let clonedMessageCount = 0;

      if (options.preserveMessages && sourceConversation.messages.length > 0) {
        for (const msg of sourceConversation.messages) {
          await conversationsService.addMessage(
            newConversation.id,
            msg.role,
            msg.content,
            msg.sequence_number,
            {
              tokens: msg.tokens,
              cost: msg.cost,
            },
          );
          clonedMessageCount++;
        }
      }

      logger.info(
        `[Memory Service] Cloned conversation ${conversationId} to ${newConversation.id} with ${clonedMessageCount} messages`,
      );

      return {
        conversationId: newConversation.id,
        clonedMessageCount,
      };
    } catch (error) {
      logger.error("[Memory Service] Failed to clone conversation:", error);
      throw error;
    }
  }

  async analyzeMemoryPatterns(
    organizationId: string,
    analysisType: "topics" | "sentiment" | "entities" | "timeline",
    timeRange?: { from: Date; to: Date },
  ): Promise<{
    analysisType: string;
    insights: string[];
    data: Record<string, unknown>;
    chartData?: Array<{ label: string; value: number }>;
  }> {
    try {
      const memories = await this.retrieveMemories({
        organizationId,
        limit: 100,
      });

      const memoriesText = memories
        .map((m) => m.memory.content.text || "")
        .join("\n");

      let insights: string[] = [];
      let data: Record<string, unknown> = {};
      let chartData: Array<{ label: string; value: number }> = [];

      switch (analysisType) {
        case "topics":
          const topics = this.extractTopics(memoriesText);
          insights = [
            `Identified ${topics.length} key topics from ${memories.length} memories`,
            `Most frequent: ${topics.slice(0, 3).join(", ")}`,
          ];
          data = { topics };
          chartData = topics.map((topic, idx) => ({
            label: topic,
            value: topics.length - idx,
          }));
          break;

        case "timeline":
          const timelineData = memories.map((m) => ({
            date: new Date(m.memory.createdAt || Date.now()),
            type: m.memory.content.type || "unknown",
          }));

          const groupedByDay = new Map<string, number>();
          for (const item of timelineData) {
            const day = item.date.toISOString().split("T")[0];
            groupedByDay.set(day, (groupedByDay.get(day) || 0) + 1);
          }

          chartData = Array.from(groupedByDay.entries()).map(
            ([label, value]) => ({ label, value }),
          );

          insights = [
            `Analyzed ${memories.length} memories over ${groupedByDay.size} days`,
            `Peak activity: ${Math.max(...Array.from(groupedByDay.values()))} memories in a single day`,
          ];
          data = { timelineData: Object.fromEntries(groupedByDay) };
          break;

        case "entities":
          const words = memoriesText
            .toLowerCase()
            .split(/\W+/)
            .filter((w) => w.length > 3);
          const wordCounts = new Map<string, number>();
          for (const word of words) {
            wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
          }

          const topEntities = Array.from(wordCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

          chartData = topEntities.map(([label, value]) => ({ label, value }));
          insights = [
            `Extracted ${topEntities.length} key entities`,
            `Total unique words: ${wordCounts.size}`,
          ];
          data = { entities: Object.fromEntries(topEntities) };
          break;

        case "sentiment":
          const positiveWords = ["good", "great", "excellent", "happy", "love"];
          const negativeWords = ["bad", "terrible", "hate", "sad", "poor"];

          let positiveCount = 0;
          let negativeCount = 0;

          const lowerText = memoriesText.toLowerCase();
          for (const word of positiveWords) {
            positiveCount += (lowerText.match(new RegExp(word, "g")) || [])
              .length;
          }
          for (const word of negativeWords) {
            negativeCount += (lowerText.match(new RegExp(word, "g")) || [])
              .length;
          }

          const neutralCount = memories.length - positiveCount - negativeCount;

          chartData = [
            { label: "Positive", value: positiveCount },
            { label: "Neutral", value: neutralCount },
            { label: "Negative", value: negativeCount },
          ];

          insights = [
            `Sentiment distribution: ${positiveCount} positive, ${neutralCount} neutral, ${negativeCount} negative`,
            positiveCount > negativeCount
              ? "Overall positive sentiment detected"
              : "Overall negative sentiment detected",
          ];
          data = { positive: positiveCount, neutral: neutralCount, negative: negativeCount };
          break;
      }

      logger.info(
        `[Memory Service] Analyzed ${memories.length} memories for ${analysisType}`,
      );

      return {
        analysisType,
        insights,
        data,
        chartData,
      };
    } catch (error) {
      logger.error("[Memory Service] Failed to analyze memory patterns:", error);
      throw error;
    }
  }

  private calculateRelevanceScore(text: string, query: string): number {
    const textLower = text.toLowerCase();
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);

    let score = 0;
    for (const word of queryWords) {
      if (textLower.includes(word)) {
        score += 1;
      }
    }

    if (textLower.includes(queryLower)) {
      score += 5;
    }

    return score;
  }
}

export const memoryService = new MemoryService();
