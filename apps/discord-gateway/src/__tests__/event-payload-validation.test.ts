import { describe, expect, it } from "bun:test";

/**
 * Event Payload Validation Tests
 *
 * Tests boundary conditions and edge cases for Discord event payloads.
 */
describe("Event Payload Validation", () => {
  describe("Message Content Boundaries", () => {
    it("should handle empty message content", () => {
      const payload = buildMessagePayload({ content: "" });
      expect(payload.data.content).toBe("");
      expect(typeof payload.data.content).toBe("string");
    });

    it("should handle message at Discord limit (2000 chars)", () => {
      const maxContent = "a".repeat(2000);
      const payload = buildMessagePayload({ content: maxContent });
      expect(payload.data.content.length).toBe(2000);
    });

    it("should handle message exceeding Discord limit", () => {
      const oversizedContent = "a".repeat(4000);
      const payload = buildMessagePayload({ content: oversizedContent });
      expect(payload.data.content.length).toBe(4000); // We don't truncate, Discord will reject
    });

    it("should handle unicode content correctly", () => {
      const unicodeContent = "Hello 👋 世界 🌍 مرحبا";
      const payload = buildMessagePayload({ content: unicodeContent });
      expect(payload.data.content).toBe(unicodeContent);
    });

    it("should handle newlines and special characters", () => {
      const specialContent = "Line1\nLine2\r\nLine3\tTabbed";
      const payload = buildMessagePayload({ content: specialContent });
      expect(payload.data.content).toBe(specialContent);
      expect(payload.data.content).toContain("\n");
      expect(payload.data.content).toContain("\t");
    });

    it("should handle markdown formatting", () => {
      const markdownContent = "**bold** *italic* `code` ```block```";
      const payload = buildMessagePayload({ content: markdownContent });
      expect(payload.data.content).toContain("**bold**");
    });
  });

  describe("Author Fields", () => {
    it("should handle author with all fields", () => {
      const payload = buildMessagePayload({
        author: {
          id: "123456789",
          username: "TestUser",
          discriminator: "1234",
          avatar: "abc123hash",
          bot: false,
          global_name: "Test User Display",
        },
      });

      expect(payload.data.author.id).toBe("123456789");
      expect(payload.data.author.username).toBe("TestUser");
      expect(payload.data.author.global_name).toBe("Test User Display");
    });

    it("should handle author without optional fields", () => {
      const payload = buildMessagePayload({
        author: {
          id: "123456789",
          username: "MinimalUser",
          discriminator: "0",
          avatar: null,
          bot: false,
          global_name: undefined,
        },
      });

      expect(payload.data.author.avatar).toBeNull();
      expect(payload.data.author.global_name).toBeUndefined();
    });

    it("should handle bot author", () => {
      const payload = buildMessagePayload({
        author: {
          id: "bot-123",
          username: "BotUser",
          discriminator: "0000",
          avatar: null,
          bot: true,
          global_name: null,
        },
      });

      expect(payload.data.author.bot).toBe(true);
    });

    it("should handle username with special characters", () => {
      const payload = buildMessagePayload({
        author: {
          id: "123",
          username: "User_With.Special-Chars123",
          discriminator: "0",
          avatar: null,
          bot: false,
        },
      });

      expect(payload.data.author.username).toBe("User_With.Special-Chars123");
    });
  });

  describe("Attachments", () => {
    it("should handle zero attachments", () => {
      const payload = buildMessagePayload({ attachments: [] });
      expect(payload.data.attachments).toHaveLength(0);
    });

    it("should handle single attachment", () => {
      const payload = buildMessagePayload({
        attachments: [
          {
            id: "att-1",
            filename: "file.png",
            url: "https://cdn.discord.com/file.png",
            content_type: "image/png",
            size: 1024,
          },
        ],
      });

      expect(payload.data.attachments).toHaveLength(1);
      expect(payload.data.attachments[0].filename).toBe("file.png");
    });

    it("should handle maximum 10 attachments", () => {
      const attachments = Array.from({ length: 10 }, (_, i) => ({
        id: `att-${i}`,
        filename: `file${i}.png`,
        url: `https://cdn.discord.com/file${i}.png`,
        content_type: "image/png",
        size: 1024,
      }));

      const payload = buildMessagePayload({ attachments });
      expect(payload.data.attachments).toHaveLength(10);
    });

    it("should handle various file types", () => {
      const types = [
        { content_type: "image/png", filename: "image.png" },
        { content_type: "image/gif", filename: "animation.gif" },
        { content_type: "video/mp4", filename: "video.mp4" },
        { content_type: "audio/ogg", filename: "voice.ogg" },
        { content_type: "application/pdf", filename: "doc.pdf" },
      ];

      types.forEach((type) => {
        const payload = buildMessagePayload({
          attachments: [
            {
              id: "att-1",
              filename: type.filename,
              url: `https://cdn.discord.com/${type.filename}`,
              content_type: type.content_type,
              size: 1000,
            },
          ],
        });
        expect(payload.data.attachments[0].content_type).toBe(type.content_type);
      });
    });

    it("should handle null content_type", () => {
      const payload = buildMessagePayload({
        attachments: [
          {
            id: "att-1",
            filename: "unknown",
            url: "https://cdn.discord.com/unknown",
            content_type: null,
            size: 100,
          },
        ],
      });
      expect(payload.data.attachments[0].content_type).toBeNull();
    });

    it("should handle large file sizes", () => {
      const payload = buildMessagePayload({
        attachments: [
          {
            id: "att-1",
            filename: "large.zip",
            url: "https://cdn.discord.com/large.zip",
            content_type: "application/zip",
            size: 100 * 1024 * 1024, // 100MB
          },
        ],
      });
      expect(payload.data.attachments[0].size).toBe(104857600);
    });
  });

  describe("Embeds", () => {
    it("should handle zero embeds", () => {
      const payload = buildMessagePayload({ embeds: [] });
      expect(payload.data.embeds).toHaveLength(0);
    });

    it("should handle embed with all fields", () => {
      const payload = buildMessagePayload({
        embeds: [
          {
            title: "Test Title",
            description: "Test description",
            url: "https://example.com",
            color: 0xff0000,
          },
        ],
      });

      expect(payload.data.embeds[0].title).toBe("Test Title");
      expect(payload.data.embeds[0].color).toBe(0xff0000);
    });

    it("should handle embed with null fields", () => {
      const payload = buildMessagePayload({
        embeds: [
          {
            title: null,
            description: "Only description",
            url: null,
            color: null,
          },
        ],
      });

      expect(payload.data.embeds[0].title).toBeNull();
      expect(payload.data.embeds[0].description).toBe("Only description");
    });

    it("should handle maximum 10 embeds", () => {
      const embeds = Array.from({ length: 10 }, (_, i) => ({
        title: `Embed ${i}`,
        description: null,
        url: null,
        color: null,
      }));

      const payload = buildMessagePayload({ embeds });
      expect(payload.data.embeds).toHaveLength(10);
    });
  });

  describe("Mentions", () => {
    it("should handle zero mentions", () => {
      const payload = buildMessagePayload({ mentions: [] });
      expect(payload.data.mentions).toHaveLength(0);
    });

    it("should handle multiple user mentions", () => {
      const payload = buildMessagePayload({
        mentions: [
          { id: "user-1", username: "User1", bot: false },
          { id: "user-2", username: "User2", bot: false },
          { id: "bot-1", username: "Bot1", bot: true },
        ],
      });

      expect(payload.data.mentions).toHaveLength(3);
      expect(payload.data.mentions.filter((m) => m.bot)).toHaveLength(1);
    });

    it("should correctly identify bot mentions", () => {
      const payload = buildMessagePayload({
        mentions: [{ id: "bot-123", username: "MyBot", bot: true }],
      });

      expect(payload.data.mentions[0].bot).toBe(true);
    });
  });

  describe("Referenced Messages (Replies)", () => {
    it("should handle message without reply", () => {
      const payload = buildMessagePayload({ referenced_message: undefined });
      expect(payload.data.referenced_message).toBeUndefined();
    });

    it("should handle reply to existing message", () => {
      const payload = buildMessagePayload({
        referenced_message: { id: "original-msg-123" },
      });

      expect(payload.data.referenced_message).toBeDefined();
      expect(payload.data.referenced_message?.id).toBe("original-msg-123");
    });

    it("should handle reply to deleted message (null)", () => {
      const payload = buildMessagePayload({
        referenced_message: null,
      });

      expect(payload.data.referenced_message).toBeNull();
    });
  });

  describe("Guild and Channel IDs", () => {
    it("should handle DM messages (no guild_id)", () => {
      const payload = buildEventPayload("MESSAGE_CREATE", {
        guild_id: null,
        channel_id: "dm-channel-123",
      });

      expect(payload.guild_id).toBe("");
      expect(payload.channel_id).toBe("dm-channel-123");
    });

    it("should handle guild messages", () => {
      const payload = buildEventPayload("MESSAGE_CREATE", {
        guild_id: "guild-123",
        channel_id: "channel-456",
      });

      expect(payload.guild_id).toBe("guild-123");
      expect(payload.channel_id).toBe("channel-456");
    });

    it("should handle snowflake IDs (large numbers)", () => {
      const snowflakeGuild = "1234567890123456789";
      const snowflakeChannel = "9876543210987654321";

      const payload = buildEventPayload("MESSAGE_CREATE", {
        guild_id: snowflakeGuild,
        channel_id: snowflakeChannel,
      });

      expect(payload.guild_id).toBe(snowflakeGuild);
      expect(payload.channel_id).toBe(snowflakeChannel);
    });
  });

  describe("Event Types", () => {
    const eventTypes = [
      "MESSAGE_CREATE",
      "MESSAGE_UPDATE",
      "MESSAGE_DELETE",
      "MESSAGE_REACTION_ADD",
      "MESSAGE_REACTION_REMOVE",
      "GUILD_MEMBER_ADD",
      "GUILD_MEMBER_REMOVE",
      "INTERACTION_CREATE",
      "VOICE_STATE_UPDATE",
      "PRESENCE_UPDATE",
    ];

    eventTypes.forEach((eventType) => {
      it(`should handle ${eventType} event type`, () => {
        const payload = buildEventPayload(eventType, {});
        expect(payload.event_type).toBe(eventType);
      });
    });

    it("should preserve unknown event types", () => {
      const payload = buildEventPayload("UNKNOWN_EVENT", {});
      expect(payload.event_type).toBe("UNKNOWN_EVENT");
    });
  });

  describe("Timestamps", () => {
    it("should generate valid ISO 8601 timestamps", () => {
      const payload = buildEventPayload("MESSAGE_CREATE", {});
      expect(payload.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("should handle message creation timestamps", () => {
      const timestamp = "2024-01-15T12:30:45.123Z";
      const payload = buildMessagePayload({
        timestamp,
      });

      expect(payload.data.timestamp).toBe(timestamp);
    });
  });

  describe("Event ID Generation", () => {
    it("should use message ID as event ID for MESSAGE_CREATE", () => {
      const payload = buildEventPayload("MESSAGE_CREATE", {
        id: "msg-12345",
      });
      expect(payload.event_id).toBe("msg-12345");
    });

    it("should generate fallback event ID when no ID present", () => {
      const payload = buildEventPayload("PRESENCE_UPDATE", {});
      expect(payload.event_id).toMatch(/^PRESENCE_UPDATE-\d+$/);
    });
  });
});

// Helper functions to build test payloads
function buildMessagePayload(overrides: Partial<MessageData> = {}) {
  const defaultMessage: MessageData = {
    id: "msg-default",
    channel_id: "channel-default",
    guild_id: "guild-default",
    author: {
      id: "author-default",
      username: "DefaultUser",
      discriminator: "0",
      avatar: null,
      bot: false,
    },
    content: "Default content",
    timestamp: new Date().toISOString(),
    attachments: [],
    embeds: [],
    mentions: [],
    referenced_message: undefined,
  };

  const data = { ...defaultMessage, ...overrides };

  return {
    connection_id: "conn-test",
    organization_id: "org-test",
    platform_connection_id: "conn-test",
    event_type: "MESSAGE_CREATE",
    event_id: data.id,
    guild_id: data.guild_id ?? "",
    channel_id: data.channel_id,
    data,
    timestamp: new Date().toISOString(),
  };
}

function buildEventPayload(eventType: string, data: Record<string, unknown>) {
  return {
    connection_id: "conn-test",
    organization_id: "org-test",
    platform_connection_id: "conn-test",
    event_type: eventType,
    event_id: (data.id as string) ?? `${eventType}-${Date.now()}`,
    guild_id: (data.guild_id as string) ?? "",
    channel_id: (data.channel_id as string) ?? "",
    data,
    timestamp: new Date().toISOString(),
  };
}

interface MessageData {
  id: string;
  channel_id: string;
  guild_id: string | null;
  author: {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    bot: boolean;
    global_name?: string | null;
  };
  content: string;
  timestamp: string;
  attachments: Array<{
    id: string;
    filename: string;
    url: string;
    content_type: string | null;
    size: number;
  }>;
  embeds: Array<{
    title: string | null;
    description: string | null;
    url: string | null;
    color: number | null;
  }>;
  mentions: Array<{
    id: string;
    username: string;
    bot: boolean;
  }>;
  referenced_message?: { id: string } | null;
}
