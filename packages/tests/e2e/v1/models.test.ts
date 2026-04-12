import { describe, expect, test } from "bun:test";
import * as api from "../helpers/api-client";

/**
 * Models API E2E Tests
 */

describe("Models API", () => {
  test("GET /api/v1/models returns model list", async () => {
    const response = await api.get("/api/v1/models");
    expect([200, 401]).toContain(response.status);

    if (response.status === 200) {
      const body = (await response.json()) as any;
      expect(body.data || body.models || Array.isArray(body)).toBeTruthy();
    }
  });

  test.skipIf(!api.hasApiKey())("GET /api/v1/models returns models with auth", async () => {
    const response = await api.get("/api/v1/models", {
      authenticated: true,
    });
    expect(response.status).toBe(200);

    const body = (await response.json()) as any;
    const models = body.data || body.models || body;
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
  });

  test("POST /api/v1/models/status returns status", async () => {
    const response = await api.post("/api/v1/models/status", {
      modelIds: ["google/gemini-2.5-flash"],
    });
    expect([200, 401]).toContain(response.status);

    if (response.status === 200) {
      const body = (await response.json()) as any;
      expect(Array.isArray(body.models)).toBe(true);
    }
  });
});

describe("Responses API", () => {
  test("POST /api/v1/responses supports auth or anonymous fallback", async () => {
    const response = await api.post("/api/v1/responses", {
      input: "Hello",
    });
    expect([200, 401, 402, 403]).toContain(response.status);
  });

  test.skipIf(!api.hasApiKey())("POST /api/v1/responses accepts valid input", async () => {
    const response = await api.post(
      "/api/v1/responses",
      { input: "Say hello" },
      { authenticated: true },
    );
    expect([200, 402]).toContain(response.status);
  });
});
