import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { RateLimitPresets } from "@/lib/middleware/rate-limit";

/**
 * Guardrail tests for rate-limit presets and their per-endpoint assignment.
 *
 * These presets are security-critical thresholds. Accidental regressions
 * (e.g. dropping embeddings back to STANDARD) create artificial bottlenecks
 * for RAG flows where N embeddings feed 1 completion, so we pin both the
 * runtime values and the embeddings route assignment here.
 */

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

describe("RateLimitPresets", () => {
  test("STANDARD is 60 req/min", () => {
    expect(RateLimitPresets.STANDARD.windowMs).toBe(60_000);
    expect(RateLimitPresets.STANDARD.maxRequests).toBe(60);
  });

  test("RELAXED is 200 req/min", () => {
    expect(RateLimitPresets.RELAXED.windowMs).toBe(60_000);
    expect(RateLimitPresets.RELAXED.maxRequests).toBe(200);
  });

  test("RELAXED is strictly higher than STANDARD", () => {
    expect(RateLimitPresets.RELAXED.maxRequests).toBeGreaterThan(
      RateLimitPresets.STANDARD.maxRequests,
    );
  });

  test("presets are frozen to prevent accidental mutation", () => {
    expect(Object.isFrozen(RateLimitPresets)).toBe(true);
    expect(Object.isFrozen(RateLimitPresets.STANDARD)).toBe(true);
    expect(Object.isFrozen(RateLimitPresets.RELAXED)).toBe(true);
  });
});

describe("Per-endpoint rate limit assignment", () => {
  function readRouteSource(relativePath: string): string {
    return readFileSync(join(REPO_ROOT, relativePath), "utf8");
  }

  test("embeddings route uses RELAXED (parity with chat completions)", () => {
    const source = readRouteSource("app/api/v1/embeddings/route.ts");
    expect(source).toContain(
      "withRateLimit(handlePOST, RateLimitPresets.RELAXED)",
    );
    // Explicit guard against silent regression back to STANDARD.
    expect(source).not.toMatch(
      /withRateLimit\(handlePOST,\s*RateLimitPresets\.STANDARD\)/,
    );
  });

  test("chat completions route uses RELAXED", () => {
    const source = readRouteSource("app/api/v1/chat/completions/route.ts");
    expect(source).toContain("RateLimitPresets.RELAXED");
  });

  test("responses route uses RELAXED", () => {
    const source = readRouteSource("app/api/v1/responses/route.ts");
    expect(source).toContain("RateLimitPresets.RELAXED");
  });
});
