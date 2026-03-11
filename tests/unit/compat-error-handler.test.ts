/**
 * Tests for handleCompatError — standardized compat route error handling.
 *
 * Verifies:
 * - ApiError subclasses (AuthenticationError, ForbiddenError) map to correct status
 * - ServiceKeyAuthError → 401
 * - Heuristic string matching for generic Errors
 * - 500-level errors do NOT leak raw internal messages
 * - Non-Error throws get generic 500
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

// Mock logger before importing error-handler
mock.module("@/lib/utils/logger", () => ({
  logger: {
    info: mock(),
    warn: mock(),
    error: mock(),
    debug: mock(),
  },
}));

import { handleCompatError } from "@/app/api/compat/_lib/error-handler";
import { AuthenticationError, ForbiddenError } from "@/lib/api/errors";
import { ServiceKeyAuthError } from "@/lib/auth/service-key";

describe("handleCompatError", () => {
  // --- Typed API errors ---

  test("AuthenticationError → 401 with original message", async () => {
    const err = new AuthenticationError("Token expired");
    const res = handleCompatError(err);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: "Token expired" });
  });

  test("ForbiddenError → 403 with original message", async () => {
    const err = new ForbiddenError("Access denied to resource");
    const res = handleCompatError(err);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: "Access denied to resource" });
  });

  // --- Service key auth ---

  test("ServiceKeyAuthError → 401", async () => {
    const err = new ServiceKeyAuthError("Invalid or missing service key");
    const res = handleCompatError(err);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: "Invalid or missing service key" });
  });

  // --- Heuristic string matching ---

  test("Error with 'Unauthorized' → 401", async () => {
    const res = handleCompatError(new Error("Unauthorized: bad token"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized: bad token");
  });

  test("Error with 'Invalid' → 401", async () => {
    const res = handleCompatError(new Error("Invalid API key"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid API key");
  });

  test("Error with 'Forbidden' → 403", async () => {
    const res = handleCompatError(new Error("Forbidden: org mismatch"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden: org mismatch");
  });

  test("Error with 'requires' → 403", async () => {
    const res = handleCompatError(new Error("This action requires admin"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("This action requires admin");
  });

  // --- 500-level: no internal message leakage ---

  test("generic Error → 500 with generic message (no leak)", async () => {
    const err = new Error(
      "WAIFU_SERVICE_ORG_ID and WAIFU_SERVICE_USER_ID must be set when WAIFU_SERVICE_KEY is configured",
    );
    const res = handleCompatError(err);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: "Internal server error" });
    // The raw config error message must NOT appear in the response
    expect(body.error).not.toContain("WAIFU_SERVICE");
  });

  test("DB connection error → 500 with generic message", async () => {
    const res = handleCompatError(new Error("connection refused to postgres://secret:pass@db:5432"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
    expect(body.error).not.toContain("postgres");
  });

  // --- Non-Error throws ---

  test("non-Error throw → 500 generic", async () => {
    const res = handleCompatError("something broke");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: "Internal server error" });
  });

  test("null throw → 500 generic", async () => {
    const res = handleCompatError(null);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: "Internal server error" });
  });
});
