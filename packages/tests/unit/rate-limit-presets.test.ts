import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { RateLimitPresets } from "@/lib/middleware/rate-limit";

/**
 * Guardrail for the embeddings rate-limit parity fix: embeddings must stay
 * at RELAXED (200/min) so RAG flows (N embeddings → 1 completion) aren't
 * bottlenecked below /v1/chat/completions.
 */

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

describe("Embeddings rate-limit parity", () => {
  test("STANDARD preset is 60 req/min", () => {
    expect(RateLimitPresets.STANDARD.windowMs).toBe(60_000);
    expect(RateLimitPresets.STANDARD.maxRequests).toBe(60);
  });

  test("RELAXED preset is 200 req/min", () => {
    expect(RateLimitPresets.RELAXED.windowMs).toBe(60_000);
    expect(RateLimitPresets.RELAXED.maxRequests).toBe(200);
  });

  test("embeddings route is wired to RELAXED", () => {
    const source = readFileSync(
      join(REPO_ROOT, "app/api/v1/embeddings/route.ts"),
      "utf8",
    );
    expect(source).toContain(
      "withRateLimit(handlePOST, RateLimitPresets.RELAXED)",
    );
    expect(source).not.toMatch(
      /withRateLimit\(handlePOST,\s*RateLimitPresets\.STANDARD\)/,
    );
  });
});
