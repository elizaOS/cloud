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

import { describe, expect, mock, test } from "bun:test";

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

  test("Error with 'Invalid API key' → 401", async () => {
    const res = handleCompatError(new Error("Invalid API key"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid API key");
  });

  test("Error with 'Invalid agent config' → 500 (not 401)", async () => {
    // Non-auth 'Invalid' errors should NOT become 401 (already narrowed in round-4)
    const res = handleCompatError(new Error("Invalid agent config: missing name"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
  });

  test("Error with 'Forbidden' → 403", async () => {
    const res = handleCompatError(new Error("Forbidden: org mismatch"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden: org mismatch");
  });

  test("Error with 'requires admin' → 403", async () => {
    const res = handleCompatError(new Error("This action requires admin"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("This action requires admin");
  });

  test("Error with 'requires authentication' → 403", async () => {
    const res = handleCompatError(new Error("Endpoint requires authentication"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Endpoint requires authentication");
  });

  test("Error with 'requires org membership' → 403", async () => {
    const res = handleCompatError(new Error("Access requires org membership"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Access requires org membership");
  });

  // Non-auth 'requires' should NOT become 403 — falls through to 500
  test("Error with non-auth 'requires' → 500 (not 403)", async () => {
    const res = handleCompatError(new Error("Table requires migration"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
  });

  test("Error with 'Field requires a value' → 500 (not 403)", async () => {
    const res = handleCompatError(new Error("Field requires a value"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
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
    const res = handleCompatError(
      new Error("connection refused to postgres://secret:pass@db:5432"),
    );
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
