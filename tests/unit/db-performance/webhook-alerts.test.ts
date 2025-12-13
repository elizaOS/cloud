/**
 * Tests for webhook alert payloads.
 * 
 * Verifies Discord and Slack webhook payload formats by mocking fetch.
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import {
  sendSlowQueryAlert,
  resetAlertingState,
  checkAlertConfig,
} from "@/lib/db/query-alerting";

// Store original env and fetch
const originalEnv = { ...process.env };
let fetchSpy: ReturnType<typeof spyOn>;
let capturedRequests: Array<{ url: string; body: string }> = [];

describe("webhook alerts", () => {
  beforeEach(() => {
    capturedRequests = [];
    
    // Reset module state before each test
    resetAlertingState();
    
    // Mock fetch to capture requests
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        capturedRequests.push({ url, body: init?.body as string || "" });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
    );

    // Set webhook URLs
    process.env.DB_SLOW_QUERY_DISCORD_WEBHOOK = "https://discord.com/api/webhooks/test/token";
    process.env.DB_SLOW_QUERY_SLACK_WEBHOOK = "https://hooks.slack.com/services/T00/B00/XXX";
    
    // Initialize config with new env vars
    checkAlertConfig();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    // Restore env
    delete process.env.DB_SLOW_QUERY_DISCORD_WEBHOOK;
    delete process.env.DB_SLOW_QUERY_SLACK_WEBHOOK;
  });

  describe("discord payload format", () => {
    it("sends correct Discord embed structure", async () => {
      await sendSlowQueryAlert({
        query: "SELECT * FROM users WHERE id = 123",
        durationMs: 500,
        timestamp: new Date("2024-01-15T12:00:00Z"),
        severity: "warning",
      });

      const discordReq = capturedRequests.find((r) =>
        r.url.includes("discord.com")
      );

      expect(discordReq).toBeDefined();
      const body = JSON.parse(discordReq!.body);

      // Verify embed structure
      expect(body.embeds).toBeDefined();
      expect(body.embeds.length).toBe(1);

      const embed = body.embeds[0];
      expect(embed.title).toContain("Slow Database Query");
      expect(embed.color).toBe(0xffaa00); // Warning color (yellow)
      expect(embed.fields).toBeDefined();

      // Verify fields
      const durationField = embed.fields.find(
        (f: { name: string }) => f.name === "Duration"
      );
      expect(durationField.value).toBe("500ms");

      const severityField = embed.fields.find(
        (f: { name: string }) => f.name === "Severity"
      );
      expect(severityField.value).toBe("WARNING");

      const queryField = embed.fields.find(
        (f: { name: string }) => f.name === "Query"
      );
      expect(queryField.value).toContain("SELECT * FROM users");

      // Verify timestamp
      expect(embed.timestamp).toBe("2024-01-15T12:00:00.000Z");
    });

    it("uses red color for critical severity", async () => {
      await sendSlowQueryAlert({
        query: "SELECT 1",
        durationMs: 2000,
        timestamp: new Date(),
        severity: "critical",
      });

      const discordReq = capturedRequests.find((r) =>
        r.url.includes("discord.com")
      );

      expect(discordReq).toBeDefined();
      const body = JSON.parse(discordReq!.body);
      expect(body.embeds[0].color).toBe(0xff0000); // Critical color (red)
      expect(body.embeds[0].title).toContain("🔴");
    });

    it("uses yellow color and emoji for warning severity", async () => {
      await sendSlowQueryAlert({
        query: "SELECT 1",
        durationMs: 300,
        timestamp: new Date(),
        severity: "warning",
      });

      const discordReq = capturedRequests.find((r) =>
        r.url.includes("discord.com")
      );

      expect(discordReq).toBeDefined();
      const body = JSON.parse(discordReq!.body);
      expect(body.embeds[0].color).toBe(0xffaa00);
      expect(body.embeds[0].title).toContain("🟡");
    });

    it("truncates long queries to 500 chars", async () => {
      const longQuery = "SELECT " + "a".repeat(1000) + " FROM test";

      await sendSlowQueryAlert({
        query: longQuery,
        durationMs: 500,
        timestamp: new Date(),
        severity: "warning",
      });

      const discordReq = capturedRequests.find((r) =>
        r.url.includes("discord.com")
      );

      expect(discordReq).toBeDefined();
      const body = JSON.parse(discordReq!.body);
      const queryField = body.embeds[0].fields.find(
        (f: { name: string }) => f.name === "Query"
      );
      
      // Query should be truncated (500 chars + markdown formatting + ...)
      expect(queryField.value.length).toBeLessThan(600);
      expect(queryField.value).toContain("...");
    });
  });

  describe("slack payload format", () => {
    it("sends correct Slack block structure", async () => {
      await sendSlowQueryAlert({
        query: "SELECT * FROM orders",
        durationMs: 1500,
        timestamp: new Date(),
        severity: "critical",
      });

      const slackReq = capturedRequests.find((r) =>
        r.url.includes("slack.com")
      );

      expect(slackReq).toBeDefined();
      const body = JSON.parse(slackReq!.body);

      // Verify blocks structure
      expect(body.blocks).toBeDefined();
      expect(body.blocks.length).toBeGreaterThanOrEqual(2);

      // Header block
      const headerBlock = body.blocks.find(
        (b: { type: string }) => b.type === "header"
      );
      expect(headerBlock).toBeDefined();
      expect(headerBlock.text.text).toContain("Slow Database Query");

      // Section with fields
      const fieldsBlock = body.blocks.find(
        (b: { type: string; fields?: unknown[] }) =>
          b.type === "section" && b.fields
      );
      expect(fieldsBlock).toBeDefined();

      // Duration field
      const durationField = fieldsBlock.fields.find((f: { text: string }) =>
        f.text.includes("Duration")
      );
      expect(durationField.text).toContain("1500ms");

      // Severity field
      const severityField = fieldsBlock.fields.find((f: { text: string }) =>
        f.text.includes("Severity")
      );
      expect(severityField.text).toContain("CRITICAL");

      // Query section
      const queryBlock = body.blocks.find(
        (b: { type: string; text?: { text?: string } }) =>
          b.type === "section" && b.text?.text?.includes("Query")
      );
      expect(queryBlock).toBeDefined();
      expect(queryBlock.text.text).toContain("SELECT * FROM orders");
    });

    it("uses correct emoji for severity", async () => {
      await sendSlowQueryAlert({
        query: "SELECT 1",
        durationMs: 1500,
        timestamp: new Date(),
        severity: "critical",
      });

      const slackReq = capturedRequests.find((r) =>
        r.url.includes("slack.com")
      );

      expect(slackReq).toBeDefined();
      const body = JSON.parse(slackReq!.body);
      const headerBlock = body.blocks.find(
        (b: { type: string }) => b.type === "header"
      );
      expect(headerBlock.text.text).toContain(":red_circle:");
    });
  });

  describe("rate limiting", () => {
    it("prevents duplicate alerts for same query within cooldown", async () => {
      const alert = {
        query: "SELECT * FROM rate_limit_test",
        durationMs: 500,
        timestamp: new Date(),
        severity: "warning" as const,
      };

      // First call - should send
      await sendSlowQueryAlert(alert);
      const firstCount = capturedRequests.length;
      expect(firstCount).toBeGreaterThan(0);

      // Second call immediately - should be rate limited
      await sendSlowQueryAlert(alert);
      const secondCount = capturedRequests.length;

      expect(secondCount).toBe(firstCount); // No new requests
    });

    it("allows alerts for different queries", async () => {
      await sendSlowQueryAlert({
        query: "SELECT * FROM table_a",
        durationMs: 500,
        timestamp: new Date(),
        severity: "warning",
      });

      const firstCount = capturedRequests.length;

      await sendSlowQueryAlert({
        query: "SELECT * FROM table_b",
        durationMs: 500,
        timestamp: new Date(),
        severity: "warning",
      });

      const secondCount = capturedRequests.length;

      // Should have sent for both
      expect(secondCount).toBeGreaterThan(firstCount);
    });
  });

  describe("both webhooks", () => {
    it("sends to both Discord and Slack when configured", async () => {
      await sendSlowQueryAlert({
        query: "SELECT 1",
        durationMs: 500,
        timestamp: new Date(),
        severity: "warning",
      });

      const discordReq = capturedRequests.find((r) =>
        r.url.includes("discord.com")
      );
      const slackReq = capturedRequests.find((r) =>
        r.url.includes("slack.com")
      );

      expect(discordReq).toBeDefined();
      expect(slackReq).toBeDefined();
    });
  });
});

describe("webhook alerts without config", () => {
  beforeEach(() => {
    resetAlertingState();
    delete process.env.DB_SLOW_QUERY_DISCORD_WEBHOOK;
    delete process.env.DB_SLOW_QUERY_SLACK_WEBHOOK;
  });

  it("does not send when no webhooks configured", async () => {
    const fetchSpy = spyOn(globalThis, "fetch");

    await sendSlowQueryAlert({
      query: "SELECT 1",
      durationMs: 500,
      timestamp: new Date(),
      severity: "warning",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
