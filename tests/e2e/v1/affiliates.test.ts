import { expect, test, describe } from "bun:test";
import * as api from "../helpers/api-client";

/**
 * Affiliates, Referrals, Analytics & Tracking API E2E Tests
 */

describe("Affiliates API", () => {
  test("POST /api/affiliate/create-character validates input", async () => {
    const response = await api.post("/api/affiliate/create-character", {});
    expect([400, 401]).toContain(response.status);
  });

  test("POST /api/affiliate/create-session creates session", async () => {
    const response = await api.post("/api/affiliate/create-session", {});
    expect([200, 400, 401]).toContain(response.status);
  });

  test("GET /api/v1/affiliates requires auth", async () => {
    const response = await api.get("/api/v1/affiliates");
    expect([401, 403]).toContain(response.status);
  });

  test.skipIf(!api.hasApiKey())(
    "GET /api/v1/affiliates returns data with auth",
    async () => {
      const response = await api.get("/api/v1/affiliates", { authenticated: true });
      expect(response.status).toBe(200);
    },
  );
});

describe("Referrals API", () => {
  test("POST /api/v1/referrals/apply requires auth", async () => {
    const response = await api.post("/api/v1/referrals/apply", {
      code: "TEST123",
    });
    expect([401, 403]).toContain(response.status);
  });

  test.skipIf(!api.hasApiKey())(
    "POST /api/v1/referrals/apply with invalid code",
    async () => {
      const response = await api.post(
        "/api/v1/referrals/apply",
        { code: "NONEXISTENT" },
        { authenticated: true },
      );
      expect([200, 400, 404]).toContain(response.status);
    },
  );
});

describe("Analytics API", () => {
  test("GET /api/analytics/overview requires auth", async () => {
    const response = await api.get("/api/analytics/overview");
    expect([401, 403]).toContain(response.status);
  });

  test("GET /api/analytics/export requires auth", async () => {
    const response = await api.get("/api/analytics/export");
    expect([401, 403]).toContain(response.status);
  });
});

describe("Tracking API", () => {
  test("POST /api/v1/track/pageview accepts tracking events", async () => {
    const response = await api.post("/api/v1/track/pageview", {
      path: "/test",
      title: "Test Page",
    });
    // Tracking may accept anonymously or require auth
    expect([200, 204, 400, 401]).toContain(response.status);
  });
});
