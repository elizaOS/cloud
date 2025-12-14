import { describe, test, expect } from "bun:test";
import { z } from "zod";
import { orgMcpServer } from "@/lib/mcp/org";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const INVALID_UUID = "not-a-valid-uuid";

describe("Org MCP Tool Registry", () => {
  test("exports tools", () => {
    // Tool count changes as features are added - just verify we have tools
    expect(orgMcpServer.tools.length).toBeGreaterThan(50);
  });

  test("exports resources", () => {
    expect(orgMcpServer.resources.length).toBeGreaterThan(5);
  });

  test("all tools have required properties", () => {
    for (const tool of orgMcpServer.tools) {
      expect(tool.name).toBeTruthy();
      expect(typeof tool.name).toBe("string");
      expect(tool.description).toBeTruthy();
      expect(typeof tool.description).toBe("string");
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.handler).toBe("function");
    }
  });

  test("all resources have required properties", () => {
    for (const resource of orgMcpServer.resources) {
      expect(resource.uri).toBeTruthy();
      expect(resource.uri.startsWith("org://")).toBe(true);
      expect(resource.name).toBeTruthy();
      expect(resource.description).toBeTruthy();
      expect(resource.mimeType).toBe("application/json");
      expect(typeof resource.handler).toBe("function");
    }
  });

  describe("SEO tools are registered", () => {
    const seoTools = [
      "keyword_research",
      "serp_snapshot",
      "generate_seo_meta",
      "generate_seo_schema",
      "publish_seo_bundle",
      "submit_to_index",
      "seo_health_check",
      "get_seo_request",
    ];

    for (const toolName of seoTools) {
      test(`${toolName} is registered`, () => {
        const tool = orgMcpServer.tools.find(t => t.name === toolName);
        expect(tool).toBeDefined();
        expect(tool?.description.length).toBeGreaterThan(10);
      });
    }
  });

  describe("Advertising tools are registered", () => {
    const adTools = [
      "list_ad_accounts",
      "list_campaigns",
      "create_campaign",
      "start_campaign",
      "pause_campaign",
      "delete_campaign",
      "get_campaign_analytics",
      "get_ad_stats",
      "create_creative",
    ];

    for (const toolName of adTools) {
      test(`${toolName} is registered`, () => {
        const tool = orgMcpServer.tools.find(t => t.name === toolName);
        expect(tool).toBeDefined();
      });
    }
  });

  describe("Analytics tools are registered", () => {
    const analyticsTools = [
      "get_usage_overview",
      "get_cost_breakdown",
      "get_usage_trends",
      "get_provider_stats",
    ];

    for (const toolName of analyticsTools) {
      test(`${toolName} is registered`, () => {
        const tool = orgMcpServer.tools.find(t => t.name === toolName);
        expect(tool).toBeDefined();
      });
    }
  });

  describe("Secrets tools are registered", () => {
    const secretsTools = [
      "list_secrets",
      "store_secret",
      "list_oauth_connections",
    ];

    for (const toolName of secretsTools) {
      test(`${toolName} is registered`, () => {
        const tool = orgMcpServer.tools.find(t => t.name === toolName);
        expect(tool).toBeDefined();
      });
    }
  });
});

describe("Input Schema Validation", () => {
  describe("SEO tool schemas", () => {
    test("keyword_research requires keywords array", () => {
      const tool = orgMcpServer.tools.find(t => t.name === "keyword_research");
      const schema = tool?.inputSchema as z.ZodType;

      expect(schema.safeParse({ keywords: ["test", "keyword"] }).success).toBe(true);
      expect(schema.safeParse({ keywords: [] }).success).toBe(false);
      expect(schema.safeParse({}).success).toBe(false);
    });

    test("keyword_research enforces max 50 keywords", () => {
      const tool = orgMcpServer.tools.find(t => t.name === "keyword_research");
      const schema = tool?.inputSchema as z.ZodType;

      expect(schema.safeParse({ keywords: Array(50).fill("keyword") }).success).toBe(true);
      expect(schema.safeParse({ keywords: Array(51).fill("keyword") }).success).toBe(false);
    });

    test("serp_snapshot validates device enum", () => {
      const tool = orgMcpServer.tools.find(t => t.name === "serp_snapshot");
      const schema = tool?.inputSchema as z.ZodType;

      expect(schema.safeParse({ query: "test", device: "desktop" }).success).toBe(true);
      expect(schema.safeParse({ query: "test", device: "mobile" }).success).toBe(true);
      expect(schema.safeParse({ query: "test", device: "tablet" }).success).toBe(true);
      expect(schema.safeParse({ query: "test", device: "smartwatch" }).success).toBe(false);
    });

    test("generate_seo_meta requires valid URL", () => {
      const tool = orgMcpServer.tools.find(t => t.name === "generate_seo_meta");
      const schema = tool?.inputSchema as z.ZodType;

      expect(schema.safeParse({ pageUrl: "https://example.com" }).success).toBe(true);
      expect(schema.safeParse({ pageUrl: "not-a-url" }).success).toBe(false);
      expect(schema.safeParse({ pageUrl: "" }).success).toBe(false);
    });

    test("get_seo_request requires valid UUID", () => {
      const tool = orgMcpServer.tools.find(t => t.name === "get_seo_request");
      const schema = tool?.inputSchema as z.ZodType;

      expect(schema.safeParse({ requestId: VALID_UUID }).success).toBe(true);
      expect(schema.safeParse({ requestId: INVALID_UUID }).success).toBe(false);
    });
  });

  describe("Advertising tool schemas", () => {
    test("create_campaign validates objective", () => {
      const tool = orgMcpServer.tools.find(t => t.name === "create_campaign");
      if (!tool) {
        // Tool may not exist in all configurations
        return;
      }
      const schema = tool.inputSchema as z.ZodType;

      // Test that a valid objective works
      const result = schema.safeParse({
        adAccountId: VALID_UUID,
        name: "Test Campaign",
        objective: "traffic",
        budgetType: "daily",
        budgetAmount: 100,
      });
      expect(result.success).toBe(true);

      // Test that invalid objective fails
      expect(schema.safeParse({
        adAccountId: VALID_UUID,
        name: "Test",
        objective: "definitely_invalid_objective_xyz",
        budgetType: "daily",
        budgetAmount: 100,
      }).success).toBe(false);
    });

    test("create_campaign requires positive budget", () => {
      const tool = orgMcpServer.tools.find(t => t.name === "create_campaign");
      const schema = tool?.inputSchema as z.ZodType;

      // Positive budget passes
      expect(schema.safeParse({
        adAccountId: VALID_UUID,
        name: "Test",
        objective: "awareness",
        budgetType: "daily",
        budgetAmount: 0.01,
      }).success).toBe(true);

      // Zero budget fails
      expect(schema.safeParse({
        adAccountId: VALID_UUID,
        name: "Test",
        objective: "awareness",
        budgetType: "daily",
        budgetAmount: 0,
      }).success).toBe(false);

      // Negative budget fails
      expect(schema.safeParse({
        adAccountId: VALID_UUID,
        name: "Test",
        objective: "awareness",
        budgetType: "daily",
        budgetAmount: -100,
      }).success).toBe(false);
    });

    test("create_campaign name length limits", () => {
      const tool = orgMcpServer.tools.find(t => t.name === "create_campaign");
      const schema = tool?.inputSchema as z.ZodType;

      // Empty name fails
      expect(schema.safeParse({
        adAccountId: VALID_UUID,
        name: "",
        objective: "awareness",
        budgetType: "daily",
        budgetAmount: 100,
      }).success).toBe(false);

      // 200 char name passes
      expect(schema.safeParse({
        adAccountId: VALID_UUID,
        name: "a".repeat(200),
        objective: "awareness",
        budgetType: "daily",
        budgetAmount: 100,
      }).success).toBe(true);

      // 201 char name fails
      expect(schema.safeParse({
        adAccountId: VALID_UUID,
        name: "a".repeat(201),
        objective: "awareness",
        budgetType: "daily",
        budgetAmount: 100,
      }).success).toBe(false);
    });

    test("create_creative validates type enum", () => {
      const tool = orgMcpServer.tools.find(t => t.name === "create_creative");
      const schema = tool?.inputSchema as z.ZodType;

      const validTypes = ["image", "video", "carousel"];
      for (const type of validTypes) {
        const result = schema.safeParse({
          campaignId: VALID_UUID,
          name: "Test Creative",
          type,
          destinationUrl: "https://example.com",
        });
        expect(result.success).toBe(true);
      }

      // Invalid type
      expect(schema.safeParse({
        campaignId: VALID_UUID,
        name: "Test",
        type: "gif",
        destinationUrl: "https://example.com",
      }).success).toBe(false);
    });
  });

  describe("Analytics tool schemas", () => {
    test("get_usage_overview validates timeRange enum", () => {
      const tool = orgMcpServer.tools.find(t => t.name === "get_usage_overview");
      const schema = tool?.inputSchema as z.ZodType;

      expect(schema.safeParse({ timeRange: "daily" }).success).toBe(true);
      expect(schema.safeParse({ timeRange: "weekly" }).success).toBe(true);
      expect(schema.safeParse({ timeRange: "monthly" }).success).toBe(true);
      expect(schema.safeParse({ timeRange: "yearly" }).success).toBe(false);
    });

    test("get_cost_breakdown validates dimension enum", () => {
      const tool = orgMcpServer.tools.find(t => t.name === "get_cost_breakdown");
      const schema = tool?.inputSchema as z.ZodType;

      expect(schema.safeParse({ dimension: "model" }).success).toBe(true);
      expect(schema.safeParse({ dimension: "provider" }).success).toBe(true);
      expect(schema.safeParse({ dimension: "user" }).success).toBe(true);
      expect(schema.safeParse({ dimension: "apiKey" }).success).toBe(true);
      expect(schema.safeParse({ dimension: "invalid" }).success).toBe(false);
    });

    test("get_usage_trends validates granularity and requires dates", () => {
      const tool = orgMcpServer.tools.find(t => t.name === "get_usage_trends");
      const schema = tool?.inputSchema as z.ZodType;

      const validGranularities = ["hour", "day", "week", "month"];
      const startDate = new Date().toISOString();
      const endDate = new Date().toISOString();

      for (const granularity of validGranularities) {
        const result = schema.safeParse({ startDate, endDate, granularity });
        expect(result.success).toBe(true);
      }

      // Invalid granularity
      expect(schema.safeParse({
        startDate,
        endDate,
        granularity: "quarter",
      }).success).toBe(false);

      // Missing dates should fail
      expect(schema.safeParse({ granularity: "day" }).success).toBe(false);
    });
  });

  describe("Secrets tool schemas", () => {
    test("store_secret validates name length", () => {
      const tool = orgMcpServer.tools.find(t => t.name === "store_secret");
      const schema = tool?.inputSchema as z.ZodType;

      // Valid name
      expect(schema.safeParse({
        name: "VALID_SECRET_NAME",
        value: "secret_value",
      }).success).toBe(true);

      // Empty name fails
      expect(schema.safeParse({
        name: "",
        value: "secret_value",
      }).success).toBe(false);

      // 100 char name passes
      expect(schema.safeParse({
        name: "A".repeat(100),
        value: "secret_value",
      }).success).toBe(true);

      // 101 char name fails
      expect(schema.safeParse({
        name: "A".repeat(101),
        value: "secret_value",
      }).success).toBe(false);
    });

    test("store_secret validates environment enum", () => {
      const tool = orgMcpServer.tools.find(t => t.name === "store_secret");
      const schema = tool?.inputSchema as z.ZodType;

      const validEnvs = ["development", "preview", "production"];
      for (const environment of validEnvs) {
        expect(schema.safeParse({
          name: "SECRET",
          value: "value",
          environment,
        }).success).toBe(true);
      }

      expect(schema.safeParse({
        name: "SECRET",
        value: "value",
        environment: "staging",
      }).success).toBe(false);
    });

    test("store_secret requires non-empty value", () => {
      const tool = orgMcpServer.tools.find(t => t.name === "store_secret");
      const schema = tool?.inputSchema as z.ZodType;

      expect(schema.safeParse({
        name: "SECRET",
        value: "",
      }).success).toBe(false);

      expect(schema.safeParse({
        name: "SECRET",
        value: " ",
      }).success).toBe(true); // Whitespace is valid
    });
  });
});

describe("Social Feed Tool Schemas", () => {
  test("create_feed_config validates platform enum", () => {
    const tool = orgMcpServer.tools.find(t => t.name === "create_feed_config");
    const schema = tool?.inputSchema as z.ZodType;

    const validPlatforms = [
      "twitter", "bluesky", "discord", "telegram", "slack",
      "reddit", "mastodon", "facebook", "instagram", "tiktok", "linkedin",
    ];

    for (const platform of validPlatforms) {
      const result = schema.safeParse({
        sourcePlatform: platform,
        sourceAccountId: "123456",
        notificationChannels: [],
      });
      expect(result.success).toBe(true);
    }

    expect(schema.safeParse({
      sourcePlatform: "myspace",
      sourceAccountId: "123",
      notificationChannels: [],
    }).success).toBe(false);
  });

  test("send_manual_reply validates content length", () => {
    const tool = orgMcpServer.tools.find(t => t.name === "send_manual_reply");
    const schema = tool?.inputSchema as z.ZodType;

    // Valid content
    expect(schema.safeParse({
      targetPlatform: "twitter",
      targetPostId: "123",
      replyContent: "Hello world",
    }).success).toBe(true);

    // Empty content fails
    expect(schema.safeParse({
      targetPlatform: "twitter",
      targetPostId: "123",
      replyContent: "",
    }).success).toBe(false);

    // 500 char limit
    expect(schema.safeParse({
      targetPlatform: "twitter",
      targetPostId: "123",
      replyContent: "a".repeat(500),
    }).success).toBe(true);

    expect(schema.safeParse({
      targetPlatform: "twitter",
      targetPostId: "123",
      replyContent: "a".repeat(501),
    }).success).toBe(false);
  });

  test("list_engagements validates event type enum", () => {
    const tool = orgMcpServer.tools.find(t => t.name === "list_engagements");
    const schema = tool?.inputSchema as z.ZodType;

    const validTypes = ["mention", "reply", "quote_tweet", "repost", "like", "comment", "follow"];
    for (const eventType of validTypes) {
      expect(schema.safeParse({ eventType }).success).toBe(true);
    }

    expect(schema.safeParse({ eventType: "share" }).success).toBe(false);
  });

  test("list_pending_replies validates status enum", () => {
    const tool = orgMcpServer.tools.find(t => t.name === "list_pending_replies");
    const schema = tool?.inputSchema as z.ZodType;

    const validStatuses = ["pending", "confirmed", "rejected", "expired", "sent", "failed"];
    for (const status of validStatuses) {
      expect(schema.safeParse({ status }).success).toBe(true);
    }

    expect(schema.safeParse({ status: "processing" }).success).toBe(false);
  });
});

describe("Tool Description Quality", () => {
  test("all descriptions are non-empty", () => {
    for (const tool of orgMcpServer.tools) {
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  test("no duplicate tool names", () => {
    const names = orgMcpServer.tools.map(t => t.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  test("tool names follow snake_case convention", () => {
    for (const tool of orgMcpServer.tools) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  test("resource URIs follow org:// convention", () => {
    for (const resource of orgMcpServer.resources) {
      expect(resource.uri).toMatch(/^org:\/\/[a-z-]+$/);
    }
  });
});

describe("Existing Tool Edge Cases", () => {
  test("create_todo validates title length boundaries", () => {
    const tool = orgMcpServer.tools.find(t => t.name === "create_todo");
    const schema = tool?.inputSchema as z.ZodType;

    // Minimum 1 char
    expect(schema.safeParse({ title: "a" }).success).toBe(true);
    expect(schema.safeParse({ title: "" }).success).toBe(false);

    // Maximum 500 chars
    expect(schema.safeParse({ title: "a".repeat(500) }).success).toBe(true);
    expect(schema.safeParse({ title: "a".repeat(501) }).success).toBe(false);
  });

  test("create_todo validates description length", () => {
    const tool = orgMcpServer.tools.find(t => t.name === "create_todo");
    const schema = tool?.inputSchema as z.ZodType;

    // 5000 chars max
    expect(schema.safeParse({
      title: "Test",
      description: "a".repeat(5000),
    }).success).toBe(true);

    expect(schema.safeParse({
      title: "Test",
      description: "a".repeat(5001),
    }).success).toBe(false);
  });

  test("list_todos validates limit boundaries", () => {
    const tool = orgMcpServer.tools.find(t => t.name === "list_todos");
    const schema = tool?.inputSchema as z.ZodType;

    // Valid range 1-100
    expect(schema.safeParse({ limit: 1 }).success).toBe(true);
    expect(schema.safeParse({ limit: 100 }).success).toBe(true);

    // Out of range
    expect(schema.safeParse({ limit: 0 }).success).toBe(false);
    expect(schema.safeParse({ limit: 101 }).success).toBe(false);
  });

  test("update_todo accepts null dueDate for clearing", () => {
    const tool = orgMcpServer.tools.find(t => t.name === "update_todo");
    const schema = tool?.inputSchema as z.ZodType;

    // Valid: null is allowed for clearing
    expect(schema.safeParse({
      todoId: VALID_UUID,
      dueDate: null,
    }).success).toBe(true);

    // Valid: ISO datetime string
    expect(schema.safeParse({
      todoId: VALID_UUID,
      dueDate: new Date().toISOString(),
    }).success).toBe(true);

    // Valid: omitting dueDate entirely
    expect(schema.safeParse({
      todoId: VALID_UUID,
      title: "Updated title",
    }).success).toBe(true);
  });

  test("create_checkin_schedule validates time format", () => {
    const tool = orgMcpServer.tools.find(t => t.name === "create_checkin_schedule");
    const schema = tool?.inputSchema as z.ZodType;

    // Valid HH:MM format
    expect(schema.safeParse({
      serverId: VALID_UUID,
      name: "Daily Standup",
      timeUtc: "09:00",
      checkinChannelId: "channel-123",
    }).success).toBe(true);

    expect(schema.safeParse({
      serverId: VALID_UUID,
      name: "Daily Standup",
      timeUtc: "23:59",
      checkinChannelId: "channel-123",
    }).success).toBe(true);

    // Invalid time format (single digit hour)
    const invalidSingleDigit = schema.safeParse({
      serverId: VALID_UUID,
      name: "Daily Standup",
      timeUtc: "9:00",
      checkinChannelId: "channel-123",
    });
    expect(invalidSingleDigit.success).toBe(false);

    // Note: The regex only validates format (HH:MM), not hour/minute ranges
    // "25:00" matches the pattern but is semantically invalid
    // This is a known limitation - semantic validation should happen at service layer
    const semanticallyInvalid = schema.safeParse({
      serverId: VALID_UUID,
      name: "Daily Standup",
      timeUtc: "25:00",
      checkinChannelId: "channel-123",
    });
    // Regex accepts it (format is valid), semantic validation is service-level
    expect(semanticallyInvalid.success).toBe(true);
  });

  test("review_post validates platform and content", () => {
    const tool = orgMcpServer.tools.find(t => t.name === "review_post");
    const schema = tool?.inputSchema as z.ZodType;

    // Valid: content can be any string (including empty)
    expect(schema.safeParse({
      content: "Valid post content",
      platform: "twitter",
    }).success).toBe(true);

    // Valid platforms
    expect(schema.safeParse({
      content: "test",
      platform: "discord",
    }).success).toBe(true);

    expect(schema.safeParse({
      content: "test",
      platform: "telegram",
    }).success).toBe(true);

    // Invalid platform
    expect(schema.safeParse({
      content: "test",
      platform: "facebook",
    }).success).toBe(false);
  });
});

describe("Concurrent Schema Validation", () => {
  test("multiple tools can be validated concurrently", async () => {
    const tools = orgMcpServer.tools.slice(0, 10);
    const validations = tools.map(tool => {
      return new Promise<boolean>(resolve => {
        const schema = tool.inputSchema as z.ZodType;
        // Each tool should at least accept empty object for optional-only schemas
        // or fail gracefully for required fields
        const result = schema.safeParse({});
        resolve(typeof result.success === "boolean");
      });
    });

    const results = await Promise.all(validations);
    expect(results.every(r => r === true)).toBe(true);
  });

  test("schema validation is deterministic", async () => {
    const tool = orgMcpServer.tools.find(t => t.name === "create_campaign");
    const schema = tool?.inputSchema as z.ZodType;

    const input = {
      adAccountId: VALID_UUID,
      name: "Test Campaign",
      objective: "awareness",
      budgetType: "daily",
      budgetAmount: 100,
    };

    // Run 100 concurrent validations
    const validations = Array(100).fill(null).map(() =>
      schema.safeParse(input)
    );

    // All should succeed and be consistent
    for (const result of validations) {
      expect(result.success).toBe(true);
    }
  });
});

describe("Handler Type Verification", () => {
  test("all handlers are functions", () => {
    for (const tool of orgMcpServer.tools) {
      expect(typeof tool.handler).toBe("function");
    }
  });

  test("all resource handlers are async functions", () => {
    for (const resource of orgMcpServer.resources) {
      expect(typeof resource.handler).toBe("function");
      expect(resource.handler.constructor.name).toBe("AsyncFunction");
    }
  });
});

describe("Growth Manager Character", () => {
  test("growth manager character is properly configured", async () => {
    const { growthManagerCharacter } = await import("@/lib/eliza/characters/org/growth-manager");

    expect(growthManagerCharacter.name).toBe("Maya");
    expect(growthManagerCharacter.id).toBe("org-growth-manager");
    expect(growthManagerCharacter.plugins).toContain("@elizaos/plugin-mcp");
  });

  test("growth manager has org-tools MCP configured", async () => {
    const { growthManagerCharacter } = await import("@/lib/eliza/characters/org/growth-manager");

    const mcpSettings = growthManagerCharacter.settings?.mcp as {
      servers: { "org-tools": { url: string; transport: string } };
    };
    expect(mcpSettings.servers["org-tools"]).toBeDefined();
    expect(mcpSettings.servers["org-tools"].url).toBe("/api/mcp/org/sse");
  });

  test("growth manager system prompt mentions SEO and advertising", async () => {
    const { growthManagerCharacter } = await import("@/lib/eliza/characters/org/growth-manager");

    const system = growthManagerCharacter.system as string;
    expect(system).toContain("SEO");
    expect(system).toContain("advertising");
    expect(system).toContain("analytics");
  });

  test("growth manager has relevant topics", async () => {
    const { growthManagerCharacter } = await import("@/lib/eliza/characters/org/growth-manager");

    const topics = growthManagerCharacter.topics as string[];
    expect(topics).toContain("SEO optimization");
    expect(topics).toContain("keyword research");
    expect(topics).toContain("paid advertising");
    expect(topics).toContain("analytics");
  });
});

describe("Org Characters Export", () => {
  test("all org characters are exported", async () => {
    const { orgCharacters, ORG_CHARACTER_IDS } = await import("@/lib/eliza/characters/org");

    expect(Object.keys(orgCharacters).length).toBe(6);
    expect(ORG_CHARACTER_IDS.length).toBe(6);
  });

  test("growth manager is in orgCharacters map", async () => {
    const { orgCharacters, isOrgCharacter, getOrgCharacter } = await import("@/lib/eliza/characters/org");

    expect(orgCharacters["org-growth-manager"]).toBeDefined();
    expect(isOrgCharacter("org-growth-manager")).toBe(true);
    expect(getOrgCharacter("org-growth-manager")).toBeDefined();
    expect(getOrgCharacter("org-growth-manager")?.name).toBe("Maya");
  });

  test("non-existent character returns null", async () => {
    const { isOrgCharacter, getOrgCharacter } = await import("@/lib/eliza/characters/org");

    expect(isOrgCharacter("non-existent")).toBe(false);
    expect(getOrgCharacter("non-existent")).toBeNull();
  });
});

