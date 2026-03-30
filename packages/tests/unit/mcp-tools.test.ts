/**
 * MCP Tools Registration Tests
 * Verifies all tools register without import/config errors
 */

import { afterAll, describe, expect, mock, test } from "bun:test";

mock.module("isomorphic-dompurify", () => ({
  default: {
    sanitize: (value: string) => value,
  },
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

  afterAll(() => {
    mock.restore();
  });
});
