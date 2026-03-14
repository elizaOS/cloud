/**
 * Unit tests for service JWT verification.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as jose from "jose";
import { isServiceJwtEnabled, verifyServiceJwt } from "@/lib/auth/service-jwt";

mock.module("@/lib/utils/logger", () => ({
  logger: {
    debug: mock(),
    info: mock(),
    warn: mock(),
    error: mock(),
  },
}));

const TEST_SECRET = "test-jwt-secret-for-waifu-core-bridge";

describe("Service JWT Auth", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved.MILADY_SERVICE_JWT_SECRET = process.env.MILADY_SERVICE_JWT_SECRET;
    process.env.MILADY_SERVICE_JWT_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    process.env.MILADY_SERVICE_JWT_SECRET = saved.MILADY_SERVICE_JWT_SECRET;
  });

  async function signToken(
    payload: Record<string, unknown>,
    secret = TEST_SECRET,
  ): Promise<string> {
    const key = new TextEncoder().encode(secret);
    return new jose.SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);
  }

  describe("isServiceJwtEnabled", () => {
    test("returns true when secret is set", () => {
      expect(isServiceJwtEnabled()).toBe(true);
    });

    test("returns false when secret is not set", () => {
      delete process.env.MILADY_SERVICE_JWT_SECRET;
      expect(isServiceJwtEnabled()).toBe(false);
    });
  });

  describe("verifyServiceJwt", () => {
    test("returns null for null header", async () => {
      expect(await verifyServiceJwt(null)).toBeNull();
    });

    test("returns null for empty header", async () => {
      expect(await verifyServiceJwt("")).toBeNull();
    });

    test("returns null when secret is not configured", async () => {
      delete process.env.MILADY_SERVICE_JWT_SECRET;
      const token = await signToken({ userId: "waifu:0xabc" });
      expect(await verifyServiceJwt(`Bearer ${token}`)).toBeNull();
    });

    test("returns null for invalid token", async () => {
      expect(await verifyServiceJwt("Bearer invalid.token.here")).toBeNull();
    });

    test("returns null for token with wrong secret", async () => {
      const token = await signToken({ userId: "waifu:0xabc" }, "wrong-secret");
      expect(await verifyServiceJwt(`Bearer ${token}`)).toBeNull();
    });

    test("re-reads the secret when the env value changes in-process", async () => {
      const firstToken = await signToken({ userId: "waifu:first" }, TEST_SECRET);
      expect(await verifyServiceJwt(`Bearer ${firstToken}`)).toEqual({
        userId: "waifu:first",
        email: undefined,
        tier: undefined,
      });

      process.env.MILADY_SERVICE_JWT_SECRET = "rotated-secret";
      const secondToken = await signToken({ userId: "waifu:second" }, "rotated-secret");

      expect(await verifyServiceJwt(`Bearer ${secondToken}`)).toEqual({
        userId: "waifu:second",
        email: undefined,
        tier: undefined,
      });
      expect(await verifyServiceJwt(`Bearer ${firstToken}`)).toBeNull();
    });

    test("returns null when userId claim is missing", async () => {
      const token = await signToken({ email: "test@example.com" });
      expect(await verifyServiceJwt(`Bearer ${token}`)).toBeNull();
    });

    test("returns payload for valid token with Bearer prefix", async () => {
      const token = await signToken({
        userId: "waifu:0xabc123",
        email: "test@waifu.fun",
        tier: "premium",
      });

      const result = await verifyServiceJwt(`Bearer ${token}`);
      expect(result).not.toBeNull();
      expect(result!.userId).toBe("waifu:0xabc123");
      expect(result!.email).toBe("test@waifu.fun");
      expect(result!.tier).toBe("premium");
    });

    test("returns payload for valid token without Bearer prefix", async () => {
      const token = await signToken({ userId: "waifu:0xdef456" });
      const result = await verifyServiceJwt(token);
      expect(result).not.toBeNull();
      expect(result!.userId).toBe("waifu:0xdef456");
    });

    test("email and tier are optional", async () => {
      const token = await signToken({ userId: "waifu:0x123" });
      const result = await verifyServiceJwt(`Bearer ${token}`);
      expect(result).not.toBeNull();
      expect(result!.userId).toBe("waifu:0x123");
      expect(result!.email).toBeUndefined();
      expect(result!.tier).toBeUndefined();
    });
  });
});
