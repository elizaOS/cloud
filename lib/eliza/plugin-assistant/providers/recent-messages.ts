import type { IAgentRuntime, Memory, Provider, State } from "@elizaos/core";

/**
 * RECENT_MESSAGES Provider
 *
 * Retrieves and formats recent conversation messages for context.
 * This provider is CRITICAL for conversation continuity - without it,
 * the agent treats every message as a new conversation.
 */
export const recentMessagesProvider: Provider = {
  name: "recentMessages", // Changed from RECENT_MESSAGES to match template variable
  description: "Recent conversation history",

  get: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    runtime.logger?.info(
      "[RECENT_MESSAGES Provider] ✅ Provider called! Loading conversation history...",
    );

    try {
      runtime.logger?.debug(
        "[RECENT_MESSAGES Provider] Fetching memories for room:",
        message.roomId,
      );

      // Retrieve recent messages from the database
      const recentMessages = await runtime.getMemories({
        tableName: "messages",
        roomId: message.roomId,
        count: 20, // Get last 20 messages for context
        unique: false,
      });

      runtime.logger?.info(
        `[RECENT_MESSAGES Provider] Retrieved ${recentMessages?.length || 0} messages from database`,
      );

      if (!recentMessages || recentMessages.length === 0) {
        runtime.logger?.warn(
          "[RECENT_MESSAGES Provider] No previous messages found",
        );
        const emptyText = "No previous messages in this conversation.";
        return {
          values: { recentMessages: emptyText },
          data: { messages: [] },
          text: emptyText,
        };
      }

      // Sort by creation time (oldest first for chronological order)
      const sortedMessages = [...recentMessages].sort(
        (a, b) => (a.createdAt || 0) - (b.createdAt || 0),
      );

      // Format messages for the prompt
      const formattedMessages = sortedMessages
        .map((mem) => {
          const isAgent = mem.entityId === runtime.agentId;
          const sender = isAgent
            ? runtime.character?.name || "Assistant"
            : "User";

          // Extract text content
          let text = "";
          if (typeof mem.content === "string") {
            text = mem.content;
          } else if (mem.content && typeof mem.content === "object") {
            text =
              ((mem.content as Record<string, unknown>).text as string) || "";
          }

          // Skip empty messages or system messages
          if (!text || text.trim() === "") {
            return null;
          }

          // Format timestamp
          const timestamp = mem.createdAt
            ? new Date(mem.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "";

          return `[${timestamp}] ${sender}: ${text}`;
        })
        .filter(Boolean) // Remove null entries
        .join("\n");

      if (!formattedMessages) {
        runtime.logger?.warn(
          "[RECENT_MESSAGES Provider] No formatted messages after processing",
        );
        const emptyText = "No previous messages in this conversation.";
        return {
          values: { recentMessages: emptyText },
          data: { messages: [] },
          text: emptyText,
        };
      }

      const result = `Previous conversation:\n${formattedMessages}\n`;
      runtime.logger?.info(
        `[RECENT_MESSAGES Provider] Returning ${sortedMessages.length} formatted messages`,
      );
      runtime.logger?.debug(
        "[RECENT_MESSAGES Provider] Preview:",
        result.substring(0, 200) + "...",
      );

      return {
        values: { recentMessages: result },
        data: {
          messages: sortedMessages,
          count: sortedMessages.length,
        },
        text: result,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      runtime.logger?.error(
        "[RECENT_MESSAGES Provider] Failed to retrieve recent messages:",
        errMsg,
      );
      const errorText = "Error loading conversation history.";
      return {
        values: { recentMessages: errorText },
        data: { error: errMsg },
        text: errorText,
      };
    }
  },
};
