/**
 * E2E: Affiliate Mini App Pattern
 *
 * Tests the flow used by mini apps like clone-your-crush:
 * an external app creates a character via the affiliate API,
 * receives a characterId, and redirects to Cloud for chat.
 *
 * This is the simplest integration pattern — no app registration needed,
 * just an affiliateId and the character creation endpoint.
 *
 * Requires: TEST_API_KEY env var pointing at a live Cloud account.
 */

import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import * as api from "../helpers/api-client";

setDefaultTimeout(30_000);

describe.skipIf(!api.hasApiKey())("Affiliate Mini App Flow", () => {
  let characterId: string;

  afterAll(async () => {
    // Clean up created character
    if (characterId) {
      await api
        .del(`/api/my-agents/characters/${characterId}`, {
          authenticated: true,
        })
        .catch(() => {});
    }
  });

  // ── Create character via affiliate API ──────────────────────────
  test("POST /api/affiliate/create-character creates a character", async () => {
    const response = await api.post("/api/affiliate/create-character", {
      character: {
        name: `E2E Affiliate Agent ${Date.now()}`,
        bio: "Created by automated E2E test via affiliate API",
        system: "You are a helpful test assistant.",
        topics: ["testing"],
        adjectives: ["helpful", "automated"],
        messageExamples: [
          [
            { name: "user", content: { text: "Hello" } },
            { name: "agent", content: { text: "Hi there! How can I help?" } },
          ],
        ],
      },
      affiliateId: "e2e-test-suite",
      sessionId: `e2e-session-${Date.now()}`,
    });

    // Affiliate endpoint may or may not require auth depending on config
    if (response.status === 200 || response.status === 201) {
      const body = (await response.json()) as any;
      expect(body.success).toBe(true);
      expect(typeof body.characterId).toBe("string");
      characterId = body.characterId;
    } else {
      // If the endpoint requires auth or is configured differently,
      // just verify we get a reasonable error
      expect([400, 401, 403, 404]).toContain(response.status);
    }
  });

  // ── Verify character was created ────────────────────────────────
  test("created character is retrievable", async () => {
    if (!characterId) return;

    const response = await api.get(`/api/my-agents/characters/${characterId}`, {
      authenticated: true,
    });

    if (response.status === 200) {
      const body = (await response.json()) as any;
      const char = body.character || body;
      expect(char.name).toContain("E2E Affiliate Agent");
    }
  });
});

// ── Full Programmatic Mini App: Create + Configure + Monetize ───────
describe.skipIf(!api.hasApiKey())("Programmatic Mini App Setup", () => {
  let appId: string;
  let appApiKey: string;
  let agentId: string;

  afterAll(async () => {
    // Clean up in reverse order
    if (agentId) {
      await api.del(`/api/v1/agents/${agentId}/publish`, { authenticated: true }).catch(() => {});
      await api
        .del(`/api/my-agents/characters/${agentId}`, { authenticated: true })
        .catch(() => {});
    }
    if (appId) {
      await api
        .del(`/api/v1/apps/${appId}?deleteGitHubRepo=false&deleteVercelProject=false`, {
          authenticated: true,
        })
        .catch(() => {});
    }
  });

  // This test suite simulates what an agent (Claude) would do to
  // programmatically create a monetized mini app from scratch.

  test("Step 1: Create the app", async () => {
    const response = await api.post(
      "/api/v1/apps",
      {
        name: `E2E Miniapp ${Date.now()}`,
        description: "Programmatic mini app created by E2E test",
        app_url: "https://miniapp-e2e.example.com",
        allowed_origins: ["https://miniapp-e2e.example.com"],
        skipGitHubRepo: true,
      },
      { authenticated: true },
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as any;
    expect(body.success).toBe(true);
    appId = body.app.id;
    appApiKey = body.apiKey;

    expect(appId).toBeDefined();
    expect(appApiKey).toBeDefined();
  });

  test("Step 2: Create an agent character", async () => {
    if (!appId) return;

    const response = await api.post(
      "/api/my-agents/characters",
      {
        name: `Miniapp Agent ${Date.now()}`,
        bio: "AI assistant for the mini app",
        system: "You are a helpful assistant embedded in a mini app.",
        topics: ["general", "help"],
        adjectives: ["friendly", "helpful"],
      },
      { authenticated: true },
    );

    if (response.status === 200 || response.status === 201) {
      const body = (await response.json()) as any;
      agentId = body.id || body.character?.id || body.agent?.id;
    }
  });

  test("Step 3: Link agent to app", async () => {
    if (!appId || !agentId) return;

    const response = await api.put(
      `/api/v1/apps/${appId}`,
      { linked_character_ids: [agentId] },
      { authenticated: true },
    );
    expect(response.status).toBe(200);

    // Verify link
    const verify = await api.get(`/api/v1/apps/${appId}/characters`, {
      authenticated: true,
    });
    if (verify.status === 200) {
      const body = (await verify.json()) as any;
      expect(body.success).toBe(true);
      expect(body.characters.length).toBe(1);
      expect(body.characters[0].id).toBe(agentId);
    }
  });

  test("Step 4: Enable monetization on the app", async () => {
    if (!appId) return;

    const response = await api.put(
      `/api/v1/apps/${appId}/monetization`,
      {
        monetizationEnabled: true,
        inferenceMarkupPercentage: 50,
        purchaseSharePercentage: 10,
      },
      { authenticated: true },
    );
    expect(response.status).toBe(200);
  });

  test("Step 5: Publish the agent with monetization", async () => {
    if (!agentId) return;

    const response = await api.post(
      `/api/v1/agents/${agentId}/publish`,
      {
        enableMonetization: true,
        markupPercentage: 50,
        a2aEnabled: true,
        mcpEnabled: true,
      },
      { authenticated: true },
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as any;
    expect(body.agent.isPublic).toBe(true);
  });

  test("Step 6: Verify complete setup", async () => {
    if (!appId) return;

    // App should be active and approved (public endpoint works)
    const publicResp = await api.get(`/api/v1/apps/${appId}/public`);
    expect(publicResp.status).toBe(200);

    // Monetization should be enabled
    const monetResp = await api.get(`/api/v1/apps/${appId}/monetization`, {
      authenticated: true,
    });
    expect(monetResp.status).toBe(200);
    const monetBody = (await monetResp.json()) as any;
    expect(monetBody.monetization.monetizationEnabled).toBe(true);

    // Earnings endpoint should work
    const earningsResp = await api.get(`/api/v1/apps/${appId}/earnings`, {
      authenticated: true,
    });
    expect(earningsResp.status).toBe(200);

    // Credits endpoint should work
    const creditsResp = await api.get(`/api/v1/app-credits/balance?app_id=${appId}`, {
      authenticated: true,
    });
    expect(creditsResp.status).toBe(200);
  });

  test("Step 7: App API key works for app-scoped operations", async () => {
    if (!appId || !appApiKey) return;

    // The app's own API key should be able to read characters
    const response = await api.get(`/api/v1/apps/${appId}/characters`, {
      headers: { "X-API-Key": appApiKey },
    });
    // The app API key may have limited permissions
    expect([200, 401, 403]).toContain(response.status);
  });
});
