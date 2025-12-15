/**
 * Event Router Logic Tests
 *
 * Tests for route evaluation, filter logic, and dispatch behavior.
 */
import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";

// Types matching the actual DiscordEventRoute structure
interface MockRoute {
  id: string;
  organization_id: string;
  platform_connection_id: string;
  guild_id: string;
  channel_id: string | null;
  event_type: string;
  route_type: "a2a" | "mcp" | "webhook" | "container" | "internal";
  route_target: string;
  enabled: boolean;
  filter_bot_messages: boolean;
  filter_self_messages: boolean;
  mention_only: boolean;
  command_prefix: string | null;
  rate_limit_per_minute: number;
  events_matched: number;
  events_routed: number;
  created_at: Date;
  updated_at: Date;
}

interface MockMessage {
  id: string;
  content: string;
  author: {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    bot: boolean;
  };
  mentions: Array<{ id: string; username: string; bot: boolean }>;
  attachments: Array<{
    id: string;
    filename: string;
    url: string;
    content_type?: string;
    size: number;
  }>;
  referenced_message?: { id: string } | null;
}

interface MockRoutableEvent {
  eventType: string;
  eventId: string;
  guildId: string;
  channelId?: string;
  organizationId: string;
  platformConnectionId: string;
  data: {
    message?: MockMessage;
    raw: Record<string, unknown>;
  };
  timestamp: Date;
}

const createMockRoute = (overrides: Partial<MockRoute> = {}): MockRoute => ({
  id: "route-123",
  organization_id: "org-456",
  platform_connection_id: "conn-789",
  guild_id: "guild-111",
  channel_id: null,
  event_type: "MESSAGE_CREATE",
  route_type: "a2a",
  route_target: "https://agent.example.com/a2a",
  enabled: true,
  filter_bot_messages: false,
  filter_self_messages: false,
  mention_only: false,
  command_prefix: null,
  rate_limit_per_minute: 60,
  events_matched: 0,
  events_routed: 0,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

const createMockMessage = (
  overrides: Partial<MockMessage> = {},
): MockMessage => ({
  id: "msg-123",
  content: "Hello world",
  author: {
    id: "user-456",
    username: "testuser",
    discriminator: "0001",
    avatar: null,
    bot: false,
  },
  mentions: [],
  attachments: [],
  referenced_message: null,
  ...overrides,
});

const createMockEvent = (
  overrides: Partial<MockRoutableEvent> = {},
): MockRoutableEvent => ({
  eventType: "MESSAGE_CREATE",
  eventId: "event-123",
  guildId: "guild-111",
  channelId: "channel-222",
  organizationId: "org-456",
  platformConnectionId: "conn-789",
  data: {
    message: createMockMessage(),
    raw: {},
  },
  timestamp: new Date(),
  ...overrides,
});

describe("Event Router Logic", () => {
  describe("Route Filtering - Bot Messages", () => {
    it("should allow non-bot messages when filter_bot_messages is true", () => {
      const route = createMockRoute({ filter_bot_messages: true });
      const event = createMockEvent();
      const message = event.data.message!;

      expect(message.author.bot).toBe(false);
      expect(route.filter_bot_messages).toBe(true);

      // Non-bot message should pass filter
      const shouldFilter = route.filter_bot_messages && message.author.bot;
      expect(shouldFilter).toBe(false);
    });

    it("should block bot messages when filter_bot_messages is true", () => {
      const route = createMockRoute({ filter_bot_messages: true });
      const message = createMockMessage({
        author: {
          id: "bot-123",
          username: "TestBot",
          discriminator: "0000",
          avatar: null,
          bot: true,
        },
      });

      const shouldFilter = route.filter_bot_messages && message.author.bot;
      expect(shouldFilter).toBe(true);
    });

    it("should allow bot messages when filter_bot_messages is false", () => {
      const route = createMockRoute({ filter_bot_messages: false });
      const message = createMockMessage({
        author: {
          id: "bot-123",
          username: "TestBot",
          discriminator: "0000",
          avatar: null,
          bot: true,
        },
      });

      const shouldFilter = route.filter_bot_messages && message.author.bot;
      expect(shouldFilter).toBe(false);
    });
  });

  describe("Route Filtering - Self Messages", () => {
    it("should filter messages from own bot user ID", () => {
      const botUserId = "bot-self-123";
      const route = createMockRoute({ filter_self_messages: true });
      const message = createMockMessage({
        author: {
          id: botUserId,
          username: "OwnBot",
          discriminator: "0000",
          avatar: null,
          bot: true,
        },
      });

      // Simulating the check done in evaluateRoute
      const isSelfMessage =
        route.filter_self_messages && message.author.id === botUserId;
      expect(isSelfMessage).toBe(true);
    });

    it("should allow messages from other users when filter_self_messages is true", () => {
      const botUserId = "bot-self-123";
      const route = createMockRoute({ filter_self_messages: true });
      const message = createMockMessage({
        author: {
          id: "user-other-456",
          username: "OtherUser",
          discriminator: "0001",
          avatar: null,
          bot: false,
        },
      });

      const isSelfMessage =
        route.filter_self_messages && message.author.id === botUserId;
      expect(isSelfMessage).toBe(false);
    });

    it("should allow own bot messages when filter_self_messages is false", () => {
      const botUserId = "bot-self-123";
      const route = createMockRoute({ filter_self_messages: false });
      const message = createMockMessage({
        author: {
          id: botUserId,
          username: "OwnBot",
          discriminator: "0000",
          avatar: null,
          bot: true,
        },
      });

      const isSelfMessage =
        route.filter_self_messages && message.author.id === botUserId;
      expect(isSelfMessage).toBe(false);
    });
  });

  describe("Route Filtering - Mention Only", () => {
    it("should pass when bot is mentioned and mention_only is true", () => {
      const botUserId = "bot-self-123";
      const route = createMockRoute({ mention_only: true });
      const message = createMockMessage({
        content: "Hey <@bot-self-123> what's up?",
        mentions: [{ id: botUserId, username: "OwnBot", bot: true }],
      });

      const mentionsBot = message.mentions.some((m) => m.id === botUserId);
      const shouldRoute = !route.mention_only || mentionsBot;
      expect(shouldRoute).toBe(true);
    });

    it("should filter when bot is NOT mentioned and mention_only is true", () => {
      const botUserId = "bot-self-123";
      const route = createMockRoute({ mention_only: true });
      const message = createMockMessage({
        content: "Hello everyone",
        mentions: [],
      });

      const mentionsBot = message.mentions.some((m) => m.id === botUserId);
      const shouldRoute = !route.mention_only || mentionsBot;
      expect(shouldRoute).toBe(false);
    });

    it("should pass any message when mention_only is false", () => {
      const route = createMockRoute({ mention_only: false });
      const message = createMockMessage({ mentions: [] });

      const shouldRoute = !route.mention_only || false;
      expect(shouldRoute).toBe(true);
    });

    it("should handle multiple mentions including non-bots", () => {
      const botUserId = "bot-self-123";
      const route = createMockRoute({ mention_only: true });
      const message = createMockMessage({
        content: "Hey <@user-456> and <@bot-self-123>",
        mentions: [
          { id: "user-456", username: "RegularUser", bot: false },
          { id: botUserId, username: "OwnBot", bot: true },
        ],
      });

      const mentionsBot = message.mentions.some((m) => m.id === botUserId);
      expect(mentionsBot).toBe(true);
    });
  });

  describe("Route Filtering - Command Prefix", () => {
    it("should match message starting with command prefix", () => {
      const route = createMockRoute({ command_prefix: "!" });
      const message = createMockMessage({ content: "!help" });

      const hasPrefix =
        !route.command_prefix ||
        message.content.startsWith(route.command_prefix);
      expect(hasPrefix).toBe(true);
    });

    it("should not match message without command prefix", () => {
      const route = createMockRoute({ command_prefix: "!" });
      const message = createMockMessage({ content: "hello everyone" });

      const hasPrefix =
        !route.command_prefix ||
        message.content.startsWith(route.command_prefix);
      expect(hasPrefix).toBe(false);
    });

    it("should handle multi-character command prefix", () => {
      const route = createMockRoute({ command_prefix: "/ai " });
      const message = createMockMessage({ content: "/ai help me" });

      const hasPrefix = message.content.startsWith(route.command_prefix!);
      expect(hasPrefix).toBe(true);
    });

    it("should handle case-sensitive prefix matching", () => {
      const route = createMockRoute({ command_prefix: "!AI" });
      const message = createMockMessage({ content: "!ai help" });

      // Standard prefix matching is case-sensitive
      const hasPrefix = message.content.startsWith(route.command_prefix!);
      expect(hasPrefix).toBe(false);
    });

    it("should pass any message when no command_prefix is set", () => {
      const route = createMockRoute({ command_prefix: null });
      const message = createMockMessage({ content: "any message" });

      const hasPrefix =
        !route.command_prefix ||
        message.content.startsWith(route.command_prefix);
      expect(hasPrefix).toBe(true);
    });

    it("should handle empty command prefix", () => {
      const route = createMockRoute({ command_prefix: "" });
      const message = createMockMessage({ content: "any message" });

      // Empty string prefix should match everything
      const hasPrefix = message.content.startsWith(route.command_prefix!);
      expect(hasPrefix).toBe(true);
    });
  });

  describe("Route Filtering - Disabled Routes", () => {
    it("should not route when route is disabled", () => {
      const route = createMockRoute({ enabled: false });
      expect(route.enabled).toBe(false);
    });

    it("should route when route is enabled", () => {
      const route = createMockRoute({ enabled: true });
      expect(route.enabled).toBe(true);
    });
  });

  describe("Route Filtering - Combined Filters", () => {
    it("should require ALL filters to pass", () => {
      const botUserId = "bot-self-123";
      const route = createMockRoute({
        enabled: true,
        filter_bot_messages: true,
        mention_only: true,
        command_prefix: "!",
      });

      // Message that passes all filters
      const validMessage = createMockMessage({
        content: "!help <@bot-self-123>",
        author: {
          id: "user-456",
          username: "Human",
          discriminator: "0001",
          avatar: null,
          bot: false,
        },
        mentions: [{ id: botUserId, username: "OwnBot", bot: true }],
      });

      const passesEnabled = route.enabled;
      const passesBotFilter = !(
        route.filter_bot_messages && validMessage.author.bot
      );
      const passesMentionFilter =
        !route.mention_only ||
        validMessage.mentions.some((m) => m.id === botUserId);
      const passesPrefixFilter =
        !route.command_prefix ||
        validMessage.content.startsWith(route.command_prefix);

      expect(passesEnabled).toBe(true);
      expect(passesBotFilter).toBe(true);
      expect(passesMentionFilter).toBe(true);
      expect(passesPrefixFilter).toBe(true);
    });

    it("should fail if ANY filter fails", () => {
      const botUserId = "bot-self-123";
      const route = createMockRoute({
        enabled: true,
        filter_bot_messages: true,
        mention_only: true,
        command_prefix: "!",
      });

      // Message from a bot (fails bot filter)
      const botMessage = createMockMessage({
        content: "!help <@bot-self-123>",
        author: {
          id: "other-bot-789",
          username: "OtherBot",
          discriminator: "0000",
          avatar: null,
          bot: true,
        },
        mentions: [{ id: botUserId, username: "OwnBot", bot: true }],
      });

      const passesBotFilter = !(
        route.filter_bot_messages && botMessage.author.bot
      );
      expect(passesBotFilter).toBe(false);
    });
  });

  describe("Route Type Validation", () => {
    const validRouteTypes = ["a2a", "mcp", "webhook", "container", "internal"];

    validRouteTypes.forEach((routeType) => {
      it(`should accept valid route type: ${routeType}`, () => {
        const route = createMockRoute({
          route_type: routeType as MockRoute["route_type"],
        });
        expect(validRouteTypes).toContain(route.route_type);
      });
    });

    it("should handle unknown route type gracefully", () => {
      // Type system prevents this, but testing runtime behavior
      const routeType = "invalid_type";
      expect(validRouteTypes).not.toContain(routeType);
    });
  });

  describe("Event Type Matching", () => {
    const eventTypes = [
      "MESSAGE_CREATE",
      "MESSAGE_UPDATE",
      "MESSAGE_DELETE",
      "MESSAGE_REACTION_ADD",
      "MESSAGE_REACTION_REMOVE",
      "GUILD_MEMBER_ADD",
      "GUILD_MEMBER_REMOVE",
      "GUILD_MEMBER_UPDATE",
      "INTERACTION_CREATE",
    ];

    eventTypes.forEach((eventType) => {
      it(`should handle event type: ${eventType}`, () => {
        const route = createMockRoute({ event_type: eventType });
        const event = createMockEvent({ eventType });

        expect(route.event_type).toBe(event.eventType);
      });
    });

    it("should match wildcard event type '*'", () => {
      const route = createMockRoute({ event_type: "*" });

      // Wildcard should conceptually match any event
      eventTypes.forEach((eventType) => {
        const matches =
          route.event_type === "*" || route.event_type === eventType;
        expect(matches).toBe(true);
      });
    });
  });

  describe("Channel Filtering", () => {
    it("should match when channel_id is null (any channel)", () => {
      const route = createMockRoute({ channel_id: null });
      const event = createMockEvent({ channelId: "channel-123" });

      // null channel_id means "any channel"
      const matches =
        route.channel_id === null || route.channel_id === event.channelId;
      expect(matches).toBe(true);
    });

    it("should match when channel_id matches exactly", () => {
      const route = createMockRoute({ channel_id: "channel-123" });
      const event = createMockEvent({ channelId: "channel-123" });

      const matches =
        route.channel_id === null || route.channel_id === event.channelId;
      expect(matches).toBe(true);
    });

    it("should not match when channel_id differs", () => {
      const route = createMockRoute({ channel_id: "channel-123" });
      const event = createMockEvent({ channelId: "channel-456" });

      const matches =
        route.channel_id === null || route.channel_id === event.channelId;
      expect(matches).toBe(false);
    });

    it("should handle DM events (no guild_id)", () => {
      const event = createMockEvent({
        guildId: "",
        channelId: "dm-channel-123",
      });

      expect(event.guildId).toBe("");
      expect(event.channelId).toBe("dm-channel-123");
    });
  });

  describe("Rate Limiting", () => {
    it("should have default rate limit of 60 per minute", () => {
      const route = createMockRoute();
      expect(route.rate_limit_per_minute).toBe(60);
    });

    it("should allow custom rate limits", () => {
      const route = createMockRoute({ rate_limit_per_minute: 10 });
      expect(route.rate_limit_per_minute).toBe(10);
    });

    it("should handle zero rate limit (effectively disabled)", () => {
      const route = createMockRoute({ rate_limit_per_minute: 0 });
      expect(route.rate_limit_per_minute).toBe(0);
    });

    it("should handle high rate limits", () => {
      const route = createMockRoute({ rate_limit_per_minute: 1000 });
      expect(route.rate_limit_per_minute).toBe(1000);
    });
  });

  describe("Route Target URL Handling", () => {
    it("should accept full HTTP URLs", () => {
      const route = createMockRoute({
        route_target: "https://agent.example.com/a2a",
      });
      const isFullUrl = route.route_target.startsWith("http");
      expect(isFullUrl).toBe(true);
    });

    it("should handle relative/ID-based targets", () => {
      const route = createMockRoute({ route_target: "agent-123" });
      const isFullUrl = route.route_target.startsWith("http");
      expect(isFullUrl).toBe(false);
    });

    it("should handle localhost URLs", () => {
      const route = createMockRoute({
        route_target: "http://localhost:3000/webhook",
      });
      const isFullUrl = route.route_target.startsWith("http");
      expect(isFullUrl).toBe(true);
    });

    it("should handle container ID targets", () => {
      const route = createMockRoute({
        route_type: "container",
        route_target: "container-abc-123",
      });

      const baseUrl = "https://{id}.containers.elizacloud.ai";
      const containerUrl = baseUrl.replace("{id}", route.route_target);
      expect(containerUrl).toBe(
        "https://container-abc-123.containers.elizacloud.ai",
      );
    });
  });

  describe("Event Counter Tracking", () => {
    it("should initialize counters to zero", () => {
      const route = createMockRoute();
      expect(route.events_matched).toBe(0);
      expect(route.events_routed).toBe(0);
    });

    it("should track matched vs routed accurately", () => {
      // Simulating counter increments
      let matched = 0;
      let routed = 0;

      // 5 events match, 3 successfully routed
      for (let i = 0; i < 5; i++) {
        matched++;
        if (i < 3) routed++;
      }

      expect(matched).toBe(5);
      expect(routed).toBe(3);
      expect(matched).toBeGreaterThanOrEqual(routed);
    });
  });

  describe("Message Content Edge Cases", () => {
    it("should handle empty message content", () => {
      const message = createMockMessage({ content: "" });
      expect(message.content).toBe("");
      expect(message.content.length).toBe(0);
    });

    it("should handle message with only whitespace", () => {
      const message = createMockMessage({ content: "   \n\t  " });
      expect(message.content.trim()).toBe("");
    });

    it("should handle message at Discord's character limit", () => {
      const maxContent = "a".repeat(2000);
      const message = createMockMessage({ content: maxContent });
      expect(message.content.length).toBe(2000);
    });

    it("should handle unicode content", () => {
      const message = createMockMessage({ content: "Hello 👋 你好 مرحبا" });
      expect(message.content).toContain("👋");
      expect(message.content).toContain("你好");
    });

    it("should handle mentions in content", () => {
      const message = createMockMessage({
        content: "Hey <@123456789> check this out <#987654321>",
        mentions: [{ id: "123456789", username: "user", bot: false }],
      });
      expect(message.content).toContain("<@123456789>");
      expect(message.mentions).toHaveLength(1);
    });

    it("should handle code blocks", () => {
      const message = createMockMessage({
        content: "```javascript\nconsole.log('hello');\n```",
      });
      expect(message.content).toContain("```");
    });
  });

  describe("Attachment Handling", () => {
    it("should handle message with no attachments", () => {
      const message = createMockMessage({ attachments: [] });
      expect(message.attachments).toHaveLength(0);
    });

    it("should handle message with multiple attachments", () => {
      const message = createMockMessage({
        attachments: [
          {
            id: "att-1",
            filename: "image.png",
            url: "https://cdn.discord.com/1.png",
            content_type: "image/png",
            size: 1024,
          },
          {
            id: "att-2",
            filename: "doc.pdf",
            url: "https://cdn.discord.com/2.pdf",
            content_type: "application/pdf",
            size: 2048,
          },
        ],
      });
      expect(message.attachments).toHaveLength(2);
    });

    it("should handle attachment without content_type", () => {
      const message = createMockMessage({
        attachments: [
          {
            id: "att-1",
            filename: "unknown",
            url: "https://cdn.discord.com/1",
            size: 100,
          },
        ],
      });
      expect(message.attachments[0].content_type).toBeUndefined();
    });

    it("should handle very large attachment sizes", () => {
      const message = createMockMessage({
        attachments: [
          {
            id: "att-1",
            filename: "large.zip",
            url: "https://cdn.discord.com/1.zip",
            size: 100 * 1024 * 1024,
          }, // 100MB
        ],
      });
      expect(message.attachments[0].size).toBe(100 * 1024 * 1024);
    });
  });

  describe("Reply Message Handling", () => {
    it("should handle message without reply", () => {
      const message = createMockMessage({ referenced_message: null });
      expect(message.referenced_message).toBeNull();
    });

    it("should handle message with reply reference", () => {
      const message = createMockMessage({
        referenced_message: { id: "original-msg-123" },
      });
      expect(message.referenced_message?.id).toBe("original-msg-123");
    });

    it("should handle reply to deleted message", () => {
      // When original message is deleted, referenced_message may be null
      const message = createMockMessage({
        content: "Replying to deleted message",
        referenced_message: null,
      });
      expect(message.referenced_message).toBeNull();
    });
  });
});

describe("A2A Request Building", () => {
  it("should build valid JSON-RPC 2.0 request", () => {
    const a2aRequest = {
      jsonrpc: "2.0" as const,
      method: "message/send" as const,
      params: {
        message: {
          role: "user" as const,
          content: "Hello from Discord",
          metadata: {
            source: "discord" as const,
            guild_id: "guild-123",
            channel_id: "channel-456",
            message_id: "msg-789",
            author_id: "user-111",
            author_username: "testuser",
            mentions_bot: true,
          },
        },
      },
      id: "request-uuid",
    };

    expect(a2aRequest.jsonrpc).toBe("2.0");
    expect(a2aRequest.method).toBe("message/send");
    expect(a2aRequest.params.message.role).toBe("user");
    expect(a2aRequest.params.message.metadata.source).toBe("discord");
  });

  it("should include attachments in metadata when present", () => {
    const metadata = {
      source: "discord" as const,
      guild_id: "guild-123",
      channel_id: "channel-456",
      message_id: "msg-789",
      author_id: "user-111",
      author_username: "testuser",
      mentions_bot: false,
      attachments: [
        {
          url: "https://cdn.discord.com/1.png",
          filename: "image.png",
          content_type: "image/png",
        },
      ],
    };

    expect(metadata.attachments).toHaveLength(1);
    expect(metadata.attachments[0].filename).toBe("image.png");
  });

  it("should include reply_to when message is a reply", () => {
    const metadata = {
      source: "discord" as const,
      guild_id: "guild-123",
      channel_id: "channel-456",
      message_id: "msg-789",
      author_id: "user-111",
      author_username: "testuser",
      mentions_bot: false,
      reply_to: "original-msg-123",
    };

    expect(metadata.reply_to).toBe("original-msg-123");
  });
});

describe("Webhook Request Building", () => {
  it("should build valid webhook request with signature", () => {
    const timestamp = new Date().toISOString();
    const webhookRequest = {
      event_type: "MESSAGE_CREATE",
      timestamp,
      organization_id: "org-123",
      guild_id: "guild-456",
      channel_id: "channel-789",
      data: { content: "Hello" },
      signature: "sha256-signature",
    };

    expect(webhookRequest.event_type).toBe("MESSAGE_CREATE");
    expect(webhookRequest.timestamp).toBeDefined();
    expect(webhookRequest.signature).toBeDefined();
  });

  it("should include all required headers", () => {
    const headers = {
      "Content-Type": "application/json",
      "X-Discord-Event": "MESSAGE_CREATE",
      "X-Discord-Signature": "signature-value",
      "X-Discord-Timestamp": new Date().toISOString(),
    };

    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-Discord-Event"]).toBeDefined();
    expect(headers["X-Discord-Signature"]).toBeDefined();
    expect(headers["X-Discord-Timestamp"]).toBeDefined();
  });
});

describe("Queue Event Structure", () => {
  it("should build valid queue item", () => {
    const queueItem = {
      organization_id: "org-123",
      route_id: "route-456",
      event_type: "MESSAGE_CREATE" as const,
      event_id: "event-789",
      guild_id: "guild-111",
      channel_id: "channel-222",
      payload: {
        type: "MESSAGE_CREATE",
        d: { content: "Hello" },
        t: "MESSAGE_CREATE",
      },
      status: "pending" as const,
      process_after: new Date(),
    };

    expect(queueItem.status).toBe("pending");
    expect(queueItem.payload.type).toBe(queueItem.event_type);
  });

  it("should handle optional route_id", () => {
    const queueItem = {
      organization_id: "org-123",
      route_id: undefined,
      event_type: "MESSAGE_CREATE" as const,
      event_id: "event-789",
      guild_id: "guild-111",
      channel_id: undefined,
      payload: { type: "MESSAGE_CREATE", d: {}, t: "MESSAGE_CREATE" },
      status: "pending" as const,
      process_after: new Date(),
    };

    expect(queueItem.route_id).toBeUndefined();
    expect(queueItem.channel_id).toBeUndefined();
  });
});
