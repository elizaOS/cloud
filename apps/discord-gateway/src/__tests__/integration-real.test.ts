import { describe, expect, it, beforeAll, afterAll } from "bun:test";

/**
 * Real Integration Tests
 *
 * These tests run against real Discord API when credentials are available.
 * Set DISCORD_TEST_TOKEN and DISCORD_TEST_CHANNEL_ID to enable.
 *
 * Skip in CI unless explicitly enabled with ENABLE_DISCORD_INTEGRATION=true
 */

const DISCORD_TEST_TOKEN = process.env.DISCORD_TEST_TOKEN;
const DISCORD_TEST_CHANNEL_ID = process.env.DISCORD_TEST_CHANNEL_ID;
const ENABLE_INTEGRATION = process.env.ENABLE_DISCORD_INTEGRATION === "true";

const DISCORD_API_BASE = "https://discord.com/api/v10";

const shouldRun =
  ENABLE_INTEGRATION && DISCORD_TEST_TOKEN && DISCORD_TEST_CHANNEL_ID;

describe.skipIf(!shouldRun)("Real Discord API Integration", () => {
  describe("Bot Authentication", () => {
    it("should validate bot token with Discord API", async () => {
      const response = await fetch(`${DISCORD_API_BASE}/users/@me`, {
        headers: {
          Authorization: `Bot ${DISCORD_TEST_TOKEN}`,
        },
      });

      expect(response.ok).toBe(true);

      const user = await response.json();
      expect(user.id).toBeDefined();
      expect(user.username).toBeDefined();
      expect(user.bot).toBe(true);
    });

    it("should reject invalid token", async () => {
      const response = await fetch(`${DISCORD_API_BASE}/users/@me`, {
        headers: {
          Authorization: "Bot invalid-token-12345",
        },
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });
  });

  describe("Channel Access", () => {
    it("should fetch channel information", async () => {
      const response = await fetch(
        `${DISCORD_API_BASE}/channels/${DISCORD_TEST_CHANNEL_ID}`,
        {
          headers: {
            Authorization: `Bot ${DISCORD_TEST_TOKEN}`,
          },
        },
      );

      expect(response.ok).toBe(true);

      const channel = await response.json();
      expect(channel.id).toBe(DISCORD_TEST_CHANNEL_ID);
    });

    it("should handle non-existent channel", async () => {
      const response = await fetch(
        `${DISCORD_API_BASE}/channels/000000000000000000`,
        {
          headers: {
            Authorization: `Bot ${DISCORD_TEST_TOKEN}`,
          },
        },
      );

      expect(response.ok).toBe(false);
      expect([403, 404]).toContain(response.status);
    });
  });

  describe("Message Sending", () => {
    it("should send a message to channel", async () => {
      const testContent = `Integration test message - ${Date.now()}`;

      const response = await fetch(
        `${DISCORD_API_BASE}/channels/${DISCORD_TEST_CHANNEL_ID}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bot ${DISCORD_TEST_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content: testContent }),
        },
      );

      expect(response.ok).toBe(true);

      const message = await response.json();
      expect(message.id).toBeDefined();
      expect(message.content).toBe(testContent);

      // Clean up test message
      await fetch(
        `${DISCORD_API_BASE}/channels/${DISCORD_TEST_CHANNEL_ID}/messages/${message.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bot ${DISCORD_TEST_TOKEN}`,
          },
        },
      );
    });

    it("should send message with embed", async () => {
      const response = await fetch(
        `${DISCORD_API_BASE}/channels/${DISCORD_TEST_CHANNEL_ID}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bot ${DISCORD_TEST_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            embeds: [
              {
                title: "Integration Test Embed",
                description: `Test at ${new Date().toISOString()}`,
                color: 0x00ff00,
              },
            ],
          }),
        },
      );

      expect(response.ok).toBe(true);

      const message = await response.json();
      expect(message.embeds).toHaveLength(1);
      expect(message.embeds[0].title).toBe("Integration Test Embed");

      // Clean up
      await fetch(
        `${DISCORD_API_BASE}/channels/${DISCORD_TEST_CHANNEL_ID}/messages/${message.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bot ${DISCORD_TEST_TOKEN}`,
          },
        },
      );
    });

    it("should reject message over 2000 characters", async () => {
      const longContent = "a".repeat(2001);

      const response = await fetch(
        `${DISCORD_API_BASE}/channels/${DISCORD_TEST_CHANNEL_ID}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bot ${DISCORD_TEST_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content: longContent }),
        },
      );

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });
  });

  describe("Rate Limiting", () => {
    it("should receive rate limit headers", async () => {
      const response = await fetch(`${DISCORD_API_BASE}/users/@me`, {
        headers: {
          Authorization: `Bot ${DISCORD_TEST_TOKEN}`,
        },
      });

      expect(response.ok).toBe(true);

      // Discord returns rate limit headers
      const remaining = response.headers.get("x-ratelimit-remaining");
      const limit = response.headers.get("x-ratelimit-limit");

      // These may or may not be present depending on the endpoint
      if (remaining !== null) {
        expect(parseInt(remaining, 10)).toBeGreaterThanOrEqual(0);
      }
    });
  });
});

describe("Integration Test Configuration", () => {
  it("should report integration test status", () => {
    const status = {
      enabled: ENABLE_INTEGRATION,
      hasToken: !!DISCORD_TEST_TOKEN,
      hasChannel: !!DISCORD_TEST_CHANNEL_ID,
      willRun: shouldRun,
    };

    console.log(
      "Integration test configuration:",
      JSON.stringify(status, null, 2),
    );

    // This test always passes - it's for logging purposes
    expect(true).toBe(true);
  });

  it("should have clear instructions for enabling", () => {
    if (!shouldRun) {
      console.log(`
To enable real Discord integration tests:

1. Create a test Discord bot at https://discord.com/developers/applications
2. Get the bot token
3. Add bot to a test server with a test channel
4. Run tests with:

   ENABLE_DISCORD_INTEGRATION=true \\
   DISCORD_TEST_TOKEN=your-bot-token \\
   DISCORD_TEST_CHANNEL_ID=your-channel-id \\
   bun test integration-real
`);
    }

    expect(true).toBe(true);
  });
});
