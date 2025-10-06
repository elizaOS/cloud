import {
  type IAgentRuntime,
  type Memory,
  type Provider,
} from "@elizaos/core";

export const recentMessagesProvider: Provider = {
  name: "RECENT_MESSAGES",
  description: "Provides recent conversation history for context",

  async get(runtime: IAgentRuntime, message: Memory) {
    const roomId = message.roomId;

    // Fetch recent messages from the room
    const memories = await runtime.getMemories({
      tableName: "messages",
      roomId: roomId,
      count: 20, // Get more context than the manual approach
      unique: false,
    });

    // Sort by timestamp
    const ordered = memories.sort((a, b) => {
      const ta = (a as { createdAt?: number }).createdAt ?? 0;
      const tb = (b as { createdAt?: number }).createdAt ?? 0;
      return ta - tb;
    });

    // Format messages for context
    const formattedMessages = ordered
      .map((m) => {
        const isAgent = m.entityId === runtime.agentId;
        const text =
          typeof m.content === "string"
            ? m.content
            : (m.content as { text?: string } | undefined)?.text || "";

        const role = isAgent ? "{{agentName}}" : "User";
        return `${role}: ${text}`;
      })
      .join("\n");

    const text = `# Recent Conversation History\n\n${formattedMessages}`;

    return {
      data: { recentMessages: ordered },
      values: { recentMessages: formattedMessages },
      text,
    };
  },
};

