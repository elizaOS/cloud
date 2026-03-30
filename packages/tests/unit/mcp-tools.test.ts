/**
 * MCP Tools Registration Tests
 * Verifies all tools register without import/config errors
 */

import { describe, expect, mock, test } from "bun:test";

mock.module("isomorphic-dompurify", () => ({
  default: {
    sanitize: (value: string) => value,
  },
}));

// Ensure InsufficientCreditsError is available in the credits mock.
// Bun's mock.module persists across test files in --max-concurrency=1 mode;
// a prior test may have mocked credits without this export.
class MockInsufficientCreditsError extends Error {
  constructor(message = "Insufficient credits") {
    super(message);
    this.name = "InsufficientCreditsError";
  }
}
mock.module("@/lib/services/credits", () => ({
  creditsService: {
    deductCredits: async () => ({ success: true }),
    reserve: async () => ({ success: true }),
    addCredits: async () => ({ success: true }),
  },
  InsufficientCreditsError: MockInsufficientCreditsError,
}));

describe("MCP Tools Registration", () => {
  test(
    "getMcpHandler initializes without errors",
    async () => {
      const { getMcpHandler } = await import("@/app/api/mcp/route");
      const handler = await getMcpHandler();
      expect(handler).toBeDefined();
      expect(typeof handler).toBe("function");
    },
    { timeout: 30000 },
  );
});
