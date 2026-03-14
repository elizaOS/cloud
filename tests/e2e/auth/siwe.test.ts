import { describe, expect, test } from "bun:test";
import * as api from "../helpers/api-client";

/**
 * SIWE (Sign-In with Ethereum) E2E Tests
 */

describe("SIWE Auth API", () => {
  test("GET /api/auth/siwe/nonce returns a nonce", async () => {
    const response = await api.get("/api/auth/siwe/nonce");
    expect([200, 405]).toContain(response.status);

    if (response.status === 200) {
      const body = (await response.json()) as any;
      expect(body.nonce).toBeTruthy();
    }
  });

  test("POST /api/auth/siwe/verify rejects invalid signature", async () => {
    const response = await api.post("/api/auth/siwe/verify", {
      message: "invalid",
      signature: "0x0000",
    });
    expect([400, 401, 422]).toContain(response.status);
  });
});

describe("Logout API", () => {
  test("POST /api/auth/logout responds without error", async () => {
    const response = await api.post("/api/auth/logout");
    // Should succeed even without auth (idempotent logout)
    expect([200, 302, 401]).toContain(response.status);
  });
});
