import { expect, test, describe } from "bun:test";
import * as api from "../helpers/api-client";

/**
 * User API E2E Tests
 */

describe("User API", () => {
  test("GET /api/v1/user requires authentication", async () => {
    const response = await api.get("/api/v1/user");
    expect([401, 403]).toContain(response.status);
  });

  test.skipIf(!api.hasApiKey())(
    "GET /api/v1/user returns user data with API key",
    async () => {
      const response = await api.get("/api/v1/user", { authenticated: true });
      expect(response.status).toBe(200);

      const body = await response.json() as any;
      expect(body.user || body.id).toBeTruthy();
    },
  );

  test("PATCH /api/v1/user requires authentication", async () => {
    const response = await api.patch("/api/v1/user", { name: "test" });
    expect([401, 403]).toContain(response.status);
  });
});
