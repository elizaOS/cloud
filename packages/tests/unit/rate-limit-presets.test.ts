import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { RateLimitPresets } from "@/lib/middleware/rate-limit";

/**
 * Guardrail tests for rate-limit presets and their per-endpoint assignment.
 *
 * These presets are security-critical thresholds. Accidental regressions
 * (e.g. dropping embeddings back to STANDARD) create artificial bottlenecks
 * for RAG flows where N embeddings feed 1 completion, so we pin the
 * production values and the embeddings route assignment here.
 *
 * Note: at runtime under NODE_ENV=test the presets expand to dev values
 * (10_000 req/window). We therefore read the source file directly to assert
 * the *production* numeric values, and assert runtime only at the shape
 * level.
 */

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const RATE_LIMIT_SOURCE = readFileSync(
  join(REPO_ROOT, "packages/lib/middleware/rate-limit.ts"),
  "utf8",
);

function extractProdMaxRequests(presetName: string): number {
  // Matches e.g. `STANDARD: { windowMs: 60000, maxRequests: isDevelopment ? 10000 : 60, ... }`
  const re = new RegExp(
    `${presetName}:\\s*\\{[^}]*maxRequests:\\s*isDevelopment\\s*\\?\\s*\\d+\\s*:\\s*(\\d+)`,
    "s",
  );
  const match = RATE_LIMIT_SOURCE.match(re);
  if (!match)
    throw new Error(`Could not find production maxRequests for ${presetName}`);
  return Number.parseInt(match[1]!, 10);
}

describe("RateLimitPresets (production values)", () => {
  test("STANDARD is 60 req/min in production", () => {
    expect(extractProdMaxRequests("STANDARD")).toBe(60);
  });

  test("RELAXED is 200 req/min in production", () => {
    expect(extractProdMaxRequests("RELAXED")).toBe(200);
  });

  test("RELAXED is strictly higher than STANDARD in production", () => {
    expect(extractProdMaxRequests("RELAXED")).toBeGreaterThan(
      extractProdMaxRequests("STANDARD"),
    );
  });

  test("runtime export exposes the expected presets", () => {
    expect(RateLimitPresets.STANDARD.windowMs).toBe(60_000);
    expect(RateLimitPresets.RELAXED.windowMs).toBe(60_000);
    expect(typeof RateLimitPresets.STANDARD.maxRequests).toBe("number");
    expect(typeof RateLimitPresets.RELAXED.maxRequests).toBe("number");
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
