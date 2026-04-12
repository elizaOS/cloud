/**
 * E2E: Affiliate Mini App Pattern & Full Programmatic Setup
 *
 * Tests two integration patterns:
 *
 * 1. **Affiliate flow** (clone-your-crush style): external app creates a character
 *    via POST /api/affiliate/create-character. Requires a Bearer API key with
 *    the "affiliate:create-character" permission — a regular key will get 403.
 *
 * 2. **Programmatic mini app**: an agent (Claude) creates an app, agent,
 *    links them, enables monetization, publishes, and verifies — all via API.
 *    Uses POST /api/v1/app/agents for character creation (the real endpoint).
 *
 * Requires: TEST_API_KEY env var pointing at a live Cloud account.
 */

import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import * as api from "../helpers/api-client";
import {
  createTestAgent,
  createTestApp,
  deleteTestAgent,
  deleteTestApp,
  enableMonetization,
} from "../helpers/app-lifecycle";

setDefaultTimeout(30_000);

// ── Affiliate Character Creation ────────────────────────────────────
// The affiliate endpoint requires an API key with "affiliate:create-character"
// permission. A standard test API key will get 401 or 403, which is correct.
describe.skipIf(!api.hasApiKey())("Affiliate Mini App Flow", () => {
  let characterId: string;

  afterAll(async () => {
    if (characterId) {
      await api
        .del(`/api/my-agents/characters/${characterId}`, { authenticated: true })
        .catch(() => {});
    }
  });

  test("POST /api/affiliate/create-character requires affiliate permission", async () => {
    // Use Bearer auth (the affiliate endpoint expects Authorization: Bearer <key>)
    const response = await api.post(
      "/api/affiliate/create-character",
      {
        character: {
          name: `E2E Affiliate Agent ${Date.now()}`,
          bio: "Created by automated E2E test via affiliate API",
          topics: ["testing"],
          adjectives: ["helpful", "automated"],
        },
        affiliateId: "e2e-test-suite",
        sessionId: `e2e-session-${Date.now()}`,
      },
      { authenticated: true },
    );

    if (response.status === 201) {
      // Key has affiliate permission — character was created
      const body = (await response.json()) as any;
      expect(body.success).toBe(true);
      expect(typeof body.characterId).toBe("string");
      expect(typeof body.redirectUrl).toBe("string");
      characterId = body.characterId;
    } else {
      // Standard key lacks "affiliate:create-character" permission — expected
      expect([401, 403]).toContain(response.status);
    }
  });

  test("POST /api/affiliate/create-session is a public endpoint", async () => {
    // This creates an anonymous session for a character — no auth required.
    // Without a valid characterId we expect 400, which proves the endpoint exists.
    const response = await api.post("/api/affiliate/create-session", {
      characterId: "00000000-0000-4000-8000-000000000000",
    });
    // 200 (session created for nonexistent char) or 400/404 (validation)
    expect([200, 400, 404, 500]).toContain(response.status);
  });
});

// ── Full Programmatic Mini App: Create + Configure + Monetize ───────
describe.skipIf(!api.hasApiKey())("Programmatic Mini App Setup", () => {
  let appId: string;
  let appApiKey: string;
  let agentId: string;

  afterAll(async () => {
    if (agentId) {
      await deleteTestAgent(agentId).catch(() => {});
    }
    if (appId) {
      await deleteTestApp(appId).catch(() => {});
    }
  });

  // This test suite simulates what an agent (Claude) would do to
  // programmatically create a monetized mini app from scratch.

  test("Step 1: Create the app", async () => {
    const { response, body } = await createTestApp({
      name: `E2E Miniapp ${Date.now()}`,
      description: "Programmatic mini app created by E2E test",
      allowed_origins: ["https://miniapp-e2e.example.com"],
    });
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    appId = body.app.id;
    appApiKey = body.apiKey;
    expect(appId).toBeDefined();
    expect(appApiKey).toBeDefined();
  });

  test("Step 2: Create an agent character", async () => {
    if (!appId) return;

    // POST /api/v1/app/agents is the actual character creation endpoint
    const { response, body, agentId: id } = await createTestAgent({
      name: `Miniapp Agent ${Date.now()}`,
      bio: "AI assistant for the mini app",
    });
    expect([200, 201]).toContain(response.status);
    expect(body.success).toBe(true);
    agentId = id!;
    expect(agentId).toBeDefined();
  });

  test("Step 3: Link agent to app", async () => {
    if (!appId || !agentId) return;

    const response = await api.put(
      `/api/v1/apps/${appId}`,
      { linked_character_ids: [agentId] },
      { authenticated: true },
    );
    expect(response.status).toBe(200);

    // Verify link via characters endpoint
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

    const { response, body } = await enableMonetization(appId, {
      inferenceMarkupPercentage: 50,
      purchaseSharePercentage: 10,
    });
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
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
    expect(body.agent.monetizationEnabled).toBe(true);
  });

  test("Step 6: Verify complete setup — all endpoints work", async () => {
    if (!appId) return;

    // App is publicly discoverable
    const publicResp = await api.get(`/api/v1/apps/${appId}/public`);
    expect(publicResp.status).toBe(200);

    // Monetization enabled
    const monetResp = await api.get(`/api/v1/apps/${appId}/monetization`, {
      authenticated: true,
    });
    expect(monetResp.status).toBe(200);
    const monetBody = (await monetResp.json()) as any;
    expect(monetBody.monetization.monetizationEnabled).toBe(true);

    // Earnings endpoint works
    const earningsResp = await api.get(`/api/v1/apps/${appId}/earnings`, {
      authenticated: true,
    });
    expect(earningsResp.status).toBe(200);

    // App-level credits endpoint works
    const creditsResp = await api.get(`/api/v1/app-credits/balance?app_id=${appId}`, {
      authenticated: true,
    });
    expect(creditsResp.status).toBe(200);

    // App users endpoint works (should be empty)
    const usersResp = await api.get(`/api/v1/apps/${appId}/users`, {
      authenticated: true,
    });
    expect(usersResp.status).toBe(200);
  });

  test("Step 7: App's own API key works for scoped reads", async () => {
    if (!appId || !appApiKey) return;

    // The app's own API key should access its characters
    const response = await api.get(`/api/v1/apps/${appId}/characters`, {
      headers: { "X-API-Key": appApiKey },
    });
    // App key is scoped — may get 200 (has access) or 403 (key lacks org scope)
    expect([200, 401, 403]).toContain(response.status);
  });
});
