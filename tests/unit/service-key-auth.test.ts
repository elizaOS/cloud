/**
 * Unit Tests — Service Key Authentication
 *
 * Tests the X-Service-Key auth flow used for waifu.fun → eliza-cloud service calls.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { validateServiceKey, requireServiceKey, ServiceKeyAuthError } from "@/lib/auth/service-key";
import { NextRequest } from "next/server";

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://example.com/api/v1/agents", {
    method: "POST",
    headers,
  });
}

describe("Service Key Auth", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved.WAIFU_SERVICE_KEY = process.env.WAIFU_SERVICE_KEY;
    saved.WAIFU_SERVICE_ORG_ID = process.env.WAIFU_SERVICE_ORG_ID;
    saved.WAIFU_SERVICE_USER_ID = process.env.WAIFU_SERVICE_USER_ID;

    process.env.WAIFU_SERVICE_KEY = "test-secret-key-abc123";
    process.env.WAIFU_SERVICE_ORG_ID = "org-uuid-123";
    process.env.WAIFU_SERVICE_USER_ID = "user-uuid-456";
  });

  afterEach(() => {
    process.env.WAIFU_SERVICE_KEY = saved.WAIFU_SERVICE_KEY;
    process.env.WAIFU_SERVICE_ORG_ID = saved.WAIFU_SERVICE_ORG_ID;
    process.env.WAIFU_SERVICE_USER_ID = saved.WAIFU_SERVICE_USER_ID;
  });

  // --------------------------------------------------------------------------
  describe("validateServiceKey", () => {
    test("returns null when X-Service-Key header is missing", () => {
      expect(validateServiceKey(makeRequest())).toBeNull();
    });

    test("returns null when X-Service-Key header is empty", () => {
      expect(validateServiceKey(makeRequest({ "X-Service-Key": "" }))).toBeNull();
    });

    test("returns null when key does not match", () => {
      expect(validateServiceKey(makeRequest({ "X-Service-Key": "wrong-key" }))).toBeNull();
    });

    test("returns null when WAIFU_SERVICE_KEY env is not set", () => {
      delete process.env.WAIFU_SERVICE_KEY;
      expect(validateServiceKey(makeRequest({ "X-Service-Key": "test-secret-key-abc123" }))).toBeNull();
    });

    test("returns identity when key matches", () => {
      const result = validateServiceKey(makeRequest({ "X-Service-Key": "test-secret-key-abc123" }));
      expect(result).toEqual({
        organizationId: "org-uuid-123",
        userId: "user-uuid-456",
      });
    });

    test("throws when key matches but org/user env vars are missing", () => {
      delete process.env.WAIFU_SERVICE_ORG_ID;
      expect(() =>
        validateServiceKey(makeRequest({ "X-Service-Key": "test-secret-key-abc123" })),
      ).toThrow("WAIFU_SERVICE_ORG_ID and WAIFU_SERVICE_USER_ID must be set");
    });

    test("throws when key matches but user env var is missing", () => {
      delete process.env.WAIFU_SERVICE_USER_ID;
      expect(() =>
        validateServiceKey(makeRequest({ "X-Service-Key": "test-secret-key-abc123" })),
      ).toThrow("WAIFU_SERVICE_ORG_ID and WAIFU_SERVICE_USER_ID must be set");
    });
  });

  // --------------------------------------------------------------------------
  describe("requireServiceKey", () => {
    test("returns identity for valid key", () => {
      const result = requireServiceKey(makeRequest({ "X-Service-Key": "test-secret-key-abc123" }));
      expect(result).toEqual({
        organizationId: "org-uuid-123",
        userId: "user-uuid-456",
      });
    });

    test("throws ServiceKeyAuthError for invalid key", () => {
      expect(() =>
        requireServiceKey(makeRequest({ "X-Service-Key": "wrong" })),
      ).toThrow(ServiceKeyAuthError);
    });

    test("throws ServiceKeyAuthError for missing header", () => {
      expect(() => requireServiceKey(makeRequest())).toThrow(ServiceKeyAuthError);
    });
  });
});
