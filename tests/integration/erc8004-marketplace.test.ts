/**
 * ERC-8004 Marketplace Integration Tests
 */

import { describe, test, expect } from "bun:test";
import {
  parseAgentId,
  isValidAgentId,
  agent0ToDiscoveredService,
  type DiscoveredService,
} from "@/lib/types/erc8004";
import { CHAIN_IDS } from "@/lib/config/erc8004";

describe("parseAgentId", () => {
  test("parses valid agentId", () => {
    expect(parseAgentId("8453:123")).toEqual({ chainId: 8453, tokenId: 123 });
    expect(parseAgentId("1:0")).toEqual({ chainId: 1, tokenId: 0 });
    expect(parseAgentId("31337:999999")).toEqual({
      chainId: 31337,
      tokenId: 999999,
    });
  });

  test("rejects invalid formats", () => {
    expect(parseAgentId("")).toBeNull();
    expect(parseAgentId("invalid")).toBeNull();
    expect(parseAgentId("8453")).toBeNull();
    expect(parseAgentId(":123")).toBeNull();
    expect(parseAgentId("abc:123")).toBeNull();
    expect(parseAgentId("8453:abc")).toBeNull();
    expect(parseAgentId("-1:123")).toBeNull();
  });
});

describe("isValidAgentId", () => {
  test("validates correctly", () => {
    expect(isValidAgentId("8453:123")).toBe(true);
    expect(isValidAgentId("invalid")).toBe(false);
  });
});

describe("agent0ToDiscoveredService", () => {
  const baseAgent = {
    agentId: "8453:42",
    name: "Test Agent",
    description: "A test agent",
    active: true,
    x402Support: false,
  };

  test("converts agent with both endpoints", () => {
    const agent = {
      ...baseAgent,
      a2aEndpoint: "https://x.com/a2a",
      mcpEndpoint: "https://x.com/mcp",
    };
    const result = agent0ToDiscoveredService(agent, "base", 8453);

    expect(result.type).toBe("agent");
    expect(result.source).toBe("erc8004");
    expect(result.tokenId).toBe(42);
  });

  test("detects MCP-only service", () => {
    const agent = { ...baseAgent, mcpEndpoint: "https://x.com/mcp" };
    expect(agent0ToDiscoveredService(agent, "base", 8453).type).toBe("mcp");
  });

  test("detects A2A-only service", () => {
    const agent = { ...baseAgent, a2aEndpoint: "https://x.com/a2a" };
    expect(agent0ToDiscoveredService(agent, "base", 8453).type).toBe("a2a");
  });

  test("handles x402 pricing", () => {
    const agent = { ...baseAgent, x402Support: true };
    const result = agent0ToDiscoveredService(agent, "base", 8453);
    expect(result.pricing?.type).toBe("x402");
  });

  test("handles credits pricing", () => {
    const agent = {
      ...baseAgent,
      metadata: { pricingType: "credits" as const, creditsPerRequest: 10 },
    };
    const result = agent0ToDiscoveredService(agent, "base", 8453);
    expect(result.pricing?.type).toBe("credits");
    expect(result.pricing?.amount).toBe(10);
  });

  test("handles invalid agentId", () => {
    const agent = { ...baseAgent, agentId: "invalid" };
    const result = agent0ToDiscoveredService(agent, "base", 8453);
    expect(result.tokenId).toBeUndefined();
  });
});

describe("CHAIN_IDS", () => {
  test("match expected values", () => {
    expect(CHAIN_IDS.anvil).toBe(31337);
    expect(CHAIN_IDS["base-sepolia"]).toBe(84532);
    expect(CHAIN_IDS.base).toBe(8453);
  });
});

describe("deduplication logic", () => {
  test("prefers local over ERC-8004", () => {
    const local: DiscoveredService = {
      id: "local-1",
      name: "Agent",
      description: "",
      type: "agent",
      source: "local",
      tags: [],
      active: true,
      x402Support: false,
    };
    const external: DiscoveredService = {
      id: "8453:1",
      name: "Agent",
      description: "",
      type: "agent",
      source: "erc8004",
      tags: [],
      active: true,
      x402Support: false,
    };

    const seen = new Map<string, DiscoveredService>();
    for (const s of [external, local].filter((s) => s.source === "local")) {
      seen.set(`${s.name.toLowerCase()}:${s.type}`, s);
    }
    for (const s of [external, local].filter((s) => s.source === "erc8004")) {
      const key = `${s.name.toLowerCase()}:${s.type}`;
      if (!seen.has(key)) seen.set(key, s);
    }

    expect(Array.from(seen.values())).toHaveLength(1);
    expect(Array.from(seen.values())[0].source).toBe("local");
  });
});

describe("URL validation", () => {
  const BLOCKED = [
    /^https?:\/\/localhost/i,
    /^https?:\/\/127\./,
    /^https?:\/\/192\.168\./,
    /^file:/i,
  ];
  const isBlocked = (url: string) => BLOCKED.some((p) => p.test(url));

  test("blocks internal URLs", () => {
    expect(isBlocked("http://localhost:3000")).toBe(true);
    expect(isBlocked("http://127.0.0.1")).toBe(true);
    expect(isBlocked("http://192.168.1.1")).toBe(true);
    expect(isBlocked("file:///etc/passwd")).toBe(true);
  });

  test("allows external URLs", () => {
    expect(isBlocked("https://api.example.com")).toBe(false);
  });
});
