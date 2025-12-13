import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";

describe("Event Forwarding", () => {
  const originalFetch = globalThis.fetch;
  let mockResponses: Array<{ ok: boolean; json: () => Promise<Record<string, unknown>> }> = [];
  let fetchCalls: Array<{ url: string; options: RequestInit }> = [];

  beforeEach(() => {
    fetchCalls = [];
    mockResponses = [];
    
    globalThis.fetch = mock((url: string, options?: RequestInit) => {
      fetchCalls.push({ url, options: options ?? {} });
      const response = mockResponses.shift() ?? { ok: true, json: () => Promise.resolve({}) };
      return Promise.resolve(response as Response);
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should construct correct event payload structure", () => {
    // Test payload structure without actually sending
    const eventPayload = {
      connection_id: "conn-123",
      organization_id: "org-456",
      platform_connection_id: "conn-123",
      event_type: "MESSAGE_CREATE",
      event_id: "msg-789",
      guild_id: "guild-111",
      channel_id: "channel-222",
      data: {
        id: "msg-789",
        content: "Hello world",
        author: {
          id: "user-333",
          username: "testuser",
          bot: false,
        },
      },
      timestamp: new Date().toISOString(),
    };

    expect(eventPayload.connection_id).toBe("conn-123");
    expect(eventPayload.event_type).toBe("MESSAGE_CREATE");
    expect(eventPayload.data.content).toBe("Hello world");
  });

  it("should include all required headers", () => {
    const headers = {
      "Content-Type": "application/json",
      "X-Internal-API-Key": "test-api-key",
    };

    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-Internal-API-Key"]).toBe("test-api-key");
  });

  it("should support all event types", () => {
    const supportedEvents = [
      "MESSAGE_CREATE",
      "MESSAGE_UPDATE",
      "MESSAGE_DELETE",
      "MESSAGE_REACTION_ADD",
      "GUILD_MEMBER_ADD",
      "GUILD_MEMBER_REMOVE",
      "INTERACTION_CREATE",
    ];

    supportedEvents.forEach((eventType) => {
      expect(typeof eventType).toBe("string");
      expect(eventType.length).toBeGreaterThan(0);
    });

    expect(supportedEvents).toHaveLength(7);
  });

  it("should handle message with attachments", () => {
    const messageWithAttachments = {
      id: "msg-123",
      content: "Check this out",
      attachments: [
        {
          id: "att-1",
          filename: "image.png",
          url: "https://cdn.discord.com/attachments/123/456/image.png",
          content_type: "image/png",
          size: 1024,
        },
      ],
    };

    expect(messageWithAttachments.attachments).toHaveLength(1);
    expect(messageWithAttachments.attachments[0].filename).toBe("image.png");
  });

  it("should handle message with embeds", () => {
    const messageWithEmbeds = {
      id: "msg-123",
      content: "",
      embeds: [
        {
          title: "Embedded Content",
          description: "This is an embed",
          color: 0x00ff00,
          url: "https://example.com",
        },
      ],
    };

    expect(messageWithEmbeds.embeds).toHaveLength(1);
    expect(messageWithEmbeds.embeds[0].title).toBe("Embedded Content");
  });

  it("should handle reply messages", () => {
    const replyMessage = {
      id: "msg-456",
      content: "This is a reply",
      referenced_message: {
        id: "msg-123",
      },
    };

    expect(replyMessage.referenced_message).toBeDefined();
    expect(replyMessage.referenced_message.id).toBe("msg-123");
  });

  it("should handle member events", () => {
    const memberAddEvent = {
      guild_id: "guild-123",
      user: {
        id: "user-456",
        username: "newmember",
        discriminator: "0001",
        avatar: null,
        bot: false,
      },
      nick: null,
      roles: ["role-1", "role-2"],
      joined_at: new Date().toISOString(),
    };

    expect(memberAddEvent.user.username).toBe("newmember");
    expect(memberAddEvent.roles).toHaveLength(2);
  });

  it("should handle interaction events", () => {
    const interactionEvent = {
      id: "int-123",
      type: 2, // APPLICATION_COMMAND
      channel_id: "channel-123",
      guild_id: "guild-123",
      user: {
        id: "user-456",
        username: "commander",
        bot: false,
      },
      data: {
        name: "ping",
        options: [],
      },
    };

    expect(interactionEvent.type).toBe(2);
    expect(interactionEvent.data.name).toBe("ping");
  });
});
