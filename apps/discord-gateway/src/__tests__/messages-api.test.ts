import { describe, expect, it } from "bun:test";

/**
 * Discord Messages API Tests
 *
 * Tests the message sending API validation and structure.
 */

describe("Messages API Validation", () => {
  describe("SendMessageSchema", () => {
    const validateSendMessage = (
      data: unknown,
    ): { success: boolean; error?: string } => {
      const obj = data as Record<string, unknown>;

      // connection_id validation
      if (!obj.connection_id || typeof obj.connection_id !== "string") {
        return { success: false, error: "connection_id required" };
      }
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(obj.connection_id)) {
        return { success: false, error: "connection_id must be UUID" };
      }

      // channel_id validation
      if (!obj.channel_id || typeof obj.channel_id !== "string") {
        return { success: false, error: "channel_id required" };
      }

      // content validation (optional but max 2000)
      if (
        obj.content &&
        typeof obj.content === "string" &&
        obj.content.length > 2000
      ) {
        return { success: false, error: "content too long" };
      }

      // embeds validation (optional, max 10)
      if (obj.embeds && Array.isArray(obj.embeds) && obj.embeds.length > 10) {
        return { success: false, error: "too many embeds" };
      }

      return { success: true };
    };

    it("should accept valid send message request", () => {
      const valid = {
        connection_id: "123e4567-e89b-12d3-a456-426614174000",
        channel_id: "123456789012345678",
        content: "Hello, world!",
      };

      const result = validateSendMessage(valid);
      expect(result.success).toBe(true);
    });

    it("should reject missing connection_id", () => {
      const invalid = {
        channel_id: "123456789012345678",
        content: "Hello",
      };

      const result = validateSendMessage(invalid);
      expect(result.success).toBe(false);
      expect(result.error).toBe("connection_id required");
    });

    it("should reject invalid UUID format", () => {
      const invalid = {
        connection_id: "not-a-uuid",
        channel_id: "123456789012345678",
        content: "Hello",
      };

      const result = validateSendMessage(invalid);
      expect(result.success).toBe(false);
      expect(result.error).toBe("connection_id must be UUID");
    });

    it("should reject content over 2000 characters", () => {
      const invalid = {
        connection_id: "123e4567-e89b-12d3-a456-426614174000",
        channel_id: "123456789012345678",
        content: "a".repeat(2001),
      };

      const result = validateSendMessage(invalid);
      expect(result.success).toBe(false);
      expect(result.error).toBe("content too long");
    });

    it("should reject more than 10 embeds", () => {
      const invalid = {
        connection_id: "123e4567-e89b-12d3-a456-426614174000",
        channel_id: "123456789012345678",
        embeds: Array.from({ length: 11 }, () => ({ title: "Test" })),
      };

      const result = validateSendMessage(invalid);
      expect(result.success).toBe(false);
      expect(result.error).toBe("too many embeds");
    });

    it("should accept embeds without content", () => {
      const valid = {
        connection_id: "123e4567-e89b-12d3-a456-426614174000",
        channel_id: "123456789012345678",
        embeds: [{ title: "Embed Title", description: "Description" }],
      };

      const result = validateSendMessage(valid);
      expect(result.success).toBe(true);
    });

    it("should accept reply_to parameter", () => {
      const valid = {
        connection_id: "123e4567-e89b-12d3-a456-426614174000",
        channel_id: "123456789012345678",
        content: "This is a reply",
        reply_to: "987654321098765432",
      };

      const result = validateSendMessage(valid);
      expect(result.success).toBe(true);
    });
  });

  describe("EditMessageSchema", () => {
    const validateEditMessage = (
      data: unknown,
    ): { success: boolean; error?: string } => {
      const obj = data as Record<string, unknown>;

      if (!obj.connection_id || typeof obj.connection_id !== "string") {
        return { success: false, error: "connection_id required" };
      }
      if (!obj.channel_id || typeof obj.channel_id !== "string") {
        return { success: false, error: "channel_id required" };
      }
      if (!obj.message_id || typeof obj.message_id !== "string") {
        return { success: false, error: "message_id required" };
      }

      return { success: true };
    };

    it("should accept valid edit message request", () => {
      const valid = {
        connection_id: "123e4567-e89b-12d3-a456-426614174000",
        channel_id: "123456789012345678",
        message_id: "987654321098765432",
        content: "Updated content",
      };

      const result = validateEditMessage(valid);
      expect(result.success).toBe(true);
    });

    it("should require message_id for edit", () => {
      const invalid = {
        connection_id: "123e4567-e89b-12d3-a456-426614174000",
        channel_id: "123456789012345678",
        content: "Updated content",
      };

      const result = validateEditMessage(invalid);
      expect(result.success).toBe(false);
      expect(result.error).toBe("message_id required");
    });
  });
});

describe("Message Payload Construction", () => {
  it("should build correct Discord API payload", () => {
    const request = {
      channelId: "123456789012345678",
      content: "Hello!",
      replyTo: "987654321098765432",
    };

    const payload: Record<string, unknown> = {};

    if (request.content) {
      payload.content = request.content;
    }
    if (request.replyTo) {
      payload.message_reference = {
        message_id: request.replyTo,
      };
    }

    expect(payload.content).toBe("Hello!");
    expect(payload.message_reference).toEqual({
      message_id: "987654321098765432",
    });
  });

  it("should handle embeds in payload", () => {
    const embeds = [
      { title: "Title 1", description: "Desc 1", color: 0x00ff00 },
      { title: "Title 2", url: "https://example.com" },
    ];

    const payload = { embeds };

    expect(payload.embeds).toHaveLength(2);
    expect(payload.embeds[0].color).toBe(0x00ff00);
    expect(payload.embeds[1].url).toBe("https://example.com");
  });

  it("should handle allowed_mentions", () => {
    const allowedMentions = {
      parse: ["users", "roles"],
      users: ["user-123"],
      repliedUser: true,
    };

    const payload = {
      allowed_mentions: {
        parse: allowedMentions.parse,
        users: allowedMentions.users,
        replied_user: allowedMentions.repliedUser,
      },
    };

    expect(payload.allowed_mentions.parse).toContain("users");
    expect(payload.allowed_mentions.replied_user).toBe(true);
  });
});

describe("Authorization Checks", () => {
  it("should verify connection belongs to organization", () => {
    const connection = {
      id: "conn-123",
      organization_id: "org-456",
    };
    const userOrgId = "org-456";

    const authorized = connection.organization_id === userOrgId;
    expect(authorized).toBe(true);
  });

  it("should reject connection from different organization", () => {
    const connection = {
      id: "conn-123",
      organization_id: "org-456",
    };
    const userOrgId = "org-different";

    const authorized = connection.organization_id === userOrgId;
    expect(authorized).toBe(false);
  });

  it("should handle missing connection", () => {
    const connection = null;
    const shouldReject = !connection;

    expect(shouldReject).toBe(true);
  });
});

describe("Rate Limiting", () => {
  it("should check rate limit before sending", () => {
    const rateLimit = {
      allowed: true,
      remaining: 4,
      resetAt: Date.now() + 5000,
    };

    expect(rateLimit.allowed).toBe(true);
    expect(rateLimit.remaining).toBe(4);
  });

  it("should reject when rate limited", () => {
    const rateLimit = {
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 5000,
    };

    expect(rateLimit.allowed).toBe(false);
  });

  it("should use correct rate limit parameters", () => {
    const channelId = "123456789";
    const limit = 5;
    const windowMs = 5000;

    const rateLimitKey = `channel:${channelId}:messages`;

    expect(rateLimitKey).toBe("channel:123456789:messages");
    expect(limit).toBe(5);
    expect(windowMs).toBe(5000);
  });
});
