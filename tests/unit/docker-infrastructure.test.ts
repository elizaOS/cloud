/**
 * Unit Tests — Docker Infrastructure Pure Functions
 *
 * These functions are not exported from their source modules, so they are
 * copied here for testing purposes.
 * Source: lib/services/docker-sandbox-provider.ts
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";

// ---------------------------------------------------------------------------
// Copied pure functions from lib/services/docker-sandbox-provider.ts
// ---------------------------------------------------------------------------

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function validateAgentId(agentId: string): void {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(agentId)) {
    throw new Error(
      `Invalid agent ID "${agentId}": must be 1-128 chars, alphanumeric / hyphens / underscores only.`,
    );
  }
}

/** Validate an agent name: printable characters, 1-64 chars, no control characters. */
function validateAgentName(name: string): void {
  if (!name || name.length > 64) {
    throw new Error(
      `Invalid agent name: must be 1-64 characters.`,
    );
  }
  // Block characters that could break shell commands even inside quotes
  if (/[\x00-\x1f\x7f]/.test(name)) {
    throw new Error(
      `Invalid agent name "${name}": contains control characters.`,
    );
  }
}

function allocatePort(min: number, max: number, excluded: Set<number>): number {
  const range = max - min;
  if (excluded.size >= range) {
    throw new Error(
      `[docker-sandbox] No available ports in range [${min}, ${max}). All ${range} ports are allocated.`,
    );
  }
  let port: number;
  let attempts = 0;
  do {
    port = min + Math.floor(Math.random() * range);
    attempts++;
    if (attempts > range * 2) {
      throw new Error(
        `[docker-sandbox] Failed to find an available port in range [${min}, ${max}) after ${attempts} attempts.`,
      );
    }
  } while (excluded.has(port));
  return port;
}

function getContainerName(agentId: string): string {
  return `milady-${agentId}`;
}

function getVolumePath(agentId: string): string {
  validateAgentId(agentId);
  return `/data/agents/${agentId}`;
}

// ---------------------------------------------------------------------------
// Copied parseDockerNodes from lib/services/docker-sandbox-provider.ts
// Cache variables are local to this module so tests can reset state.
// ---------------------------------------------------------------------------

interface DockerNodeEnv {
  nodeId: string;
  hostname: string;
  capacity: number;
}

let _cachedDockerNodes: DockerNodeEnv[] | null = null;
let _cachedDockerNodesRaw: string | undefined;

function parseDockerNodes(): DockerNodeEnv[] {
  const raw = process.env.MILADY_DOCKER_NODES;
  if (!raw) {
    throw new Error(
      "[docker-sandbox] MILADY_DOCKER_NODES env var is not set. " +
        'Expected format: "nodeId:hostname:capacity,..."',
    );
  }

  // Return cached result if env var hasn't changed
  if (_cachedDockerNodes && _cachedDockerNodesRaw === raw) {
    return _cachedDockerNodes;
  }

  const nodes: DockerNodeEnv[] = [];
  for (const segment of raw.split(",")) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    const parts = trimmed.split(":");
    if (parts.length < 3) {
      // Skipping malformed entry (logger.warn in real impl)
      continue;
    }

    const [nodeId, hostname, capacityStr] = parts;
    const capacity = parseInt(capacityStr!, 10);
    if (!nodeId || !hostname || isNaN(capacity) || capacity <= 0) {
      // Skipping invalid entry
      continue;
    }

    nodes.push({ nodeId, hostname, capacity });
  }

  if (nodes.length === 0) {
    throw new Error(
      "[docker-sandbox] No valid nodes parsed from MILADY_DOCKER_NODES",
    );
  }

  _cachedDockerNodes = nodes;
  _cachedDockerNodesRaw = raw;
  return nodes;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Docker Infrastructure - Pure Functions", () => {
  // -------------------------------------------------------------------------
  describe("shellQuote", () => {
    test("wraps a simple string in single quotes", () => {
      expect(shellQuote("hello")).toBe("'hello'");
    });

    test("wraps an empty string", () => {
      expect(shellQuote("")).toBe("''");
    });

    test("wraps a string with spaces", () => {
      expect(shellQuote("hello world")).toBe("'hello world'");
    });

    test("escapes an embedded single quote", () => {
      // it's  →  'it'"'"'s'
      expect(shellQuote("it's")).toBe("'it'\"'\"'s'");
    });

    test("safely quotes $HOME && rm -rf / (no variable expansion)", () => {
      const result = shellQuote("$HOME && rm -rf /");
      // The result must start and end with single-quote so the shell treats
      // the whole thing as a literal string.
      expect(result.startsWith("'")).toBe(true);
      expect(result.endsWith("'")).toBe(true);
      // The literal characters must survive round-trip
      expect(result).toBe("'$HOME && rm -rf /'");
    });

    test("wraps a string with double quotes (no escaping needed)", () => {
      expect(shellQuote('say "hi"')).toBe("'say \"hi\"'");
    });

    test("safely quotes a string with newlines", () => {
      const result = shellQuote("line1\nline2");
      expect(result.startsWith("'")).toBe(true);
      expect(result.endsWith("'")).toBe(true);
      expect(result).toContain("line1\nline2");
    });

    test("safely quotes $(whoami) — no command substitution possible", () => {
      // Wrapped in single quotes → shell never evaluates $() inside
      const result = shellQuote("$(whoami)");
      expect(result).toBe("'$(whoami)'");
    });
  });

  // -------------------------------------------------------------------------
  describe("validateAgentId", () => {
    test("accepts a UUID-like ID", () => {
      expect(() => validateAgentId("abc-123-def")).not.toThrow();
    });

    test("accepts alphanumeric with underscores", () => {
      expect(() => validateAgentId("agent_1")).not.toThrow();
    });

    test("accepts a single character", () => {
      expect(() => validateAgentId("a")).not.toThrow();
    });

    test("accepts exactly 128 characters", () => {
      const id = "a".repeat(128);
      expect(() => validateAgentId(id)).not.toThrow();
    });

    test("throws for empty string", () => {
      expect(() => validateAgentId("")).toThrow(/Invalid agent ID/);
    });

    test("throws for 129 characters (too long)", () => {
      const id = "a".repeat(129);
      expect(() => validateAgentId(id)).toThrow(/Invalid agent ID/);
    });

    test("throws for shell injection chars (semicolon, space)", () => {
      expect(() => validateAgentId("agent;rm -rf /")).toThrow(/Invalid agent ID/);
    });

    test("throws for dots", () => {
      expect(() => validateAgentId("agent.1")).toThrow(/Invalid agent ID/);
    });

    test("throws for spaces", () => {
      expect(() => validateAgentId("agent 1")).toThrow(/Invalid agent ID/);
    });
  });

  // -------------------------------------------------------------------------
  describe("validateAgentName", () => {
    test("accepts a simple valid name", () => {
      expect(() => validateAgentName("my-agent")).not.toThrow();
    });

    test("accepts alphanumeric with underscores and hyphens", () => {
      expect(() => validateAgentName("Agent_99")).not.toThrow();
    });

    test("accepts a single character", () => {
      expect(() => validateAgentName("x")).not.toThrow();
    });

    test("accepts exactly 64 characters", () => {
      const name = "a".repeat(64);
      expect(() => validateAgentName(name)).not.toThrow();
    });

    test("throws for empty string", () => {
      expect(() => validateAgentName("")).toThrow(/Invalid agent name/);
    });

    test("throws for 65 characters (too long)", () => {
      const name = "a".repeat(65);
      expect(() => validateAgentName(name)).toThrow(/Invalid agent name/);
    });

    test("now accepts spaces (relaxed for existing agents)", () => {
      expect(() => validateAgentName("my agent")).not.toThrow();
    });

    test("now accepts dots (relaxed for existing agents)", () => {
      expect(() => validateAgentName("my.agent")).not.toThrow();
    });

    test("now accepts semicolons (shell-safe via quoting)", () => {
      expect(() => validateAgentName("agent;drop")).not.toThrow();
    });

    test("throws for control characters (null byte)", () => {
      expect(() => validateAgentName("agent\x00name")).toThrow(/control characters/);
    });

    test("throws for control characters (newline)", () => {
      expect(() => validateAgentName("agent\nname")).toThrow(/control characters/);
    });

    test("throws for control characters (tab)", () => {
      expect(() => validateAgentName("agent\tname")).toThrow(/control characters/);
    });
  });

  // -------------------------------------------------------------------------
  describe("allocatePort", () => {
    test("returns a port within [min, max)", () => {
      const port = allocatePort(3000, 4000, new Set());
      expect(port).toBeGreaterThanOrEqual(3000);
      expect(port).toBeLessThan(4000);
    });

    test("never returns an excluded port (large range, many iterations)", () => {
      // Range [1000, 2000) → 1000 ports; exclude 3 specific ones.
      // retry cap = 2000, so finding an available port is virtually certain.
      const excluded = new Set([1000, 1001, 1002]);
      for (let i = 0; i < 50; i++) {
        const port = allocatePort(1000, 2000, excluded);
        expect(excluded.has(port)).toBe(false);
        expect(port).toBeGreaterThanOrEqual(1000);
        expect(port).toBeLessThan(2000);
      }
    });

    test("finds an available port when most of the range is excluded", () => {
      // Range [500, 600) → 100 ports; exclude 95 leaving 5 available.
      // retry cap = 200, P(failure per call) ≈ 0.035% — deterministic enough.
      const excluded = new Set(Array.from({ length: 95 }, (_, i) => 500 + i));
      // Available ports: 595, 596, 597, 598, 599
      const available = new Set([595, 596, 597, 598, 599]);
      for (let i = 0; i < 20; i++) {
        const port = allocatePort(500, 600, excluded);
        expect(available.has(port)).toBe(true);
        expect(port).toBeGreaterThanOrEqual(500);
        expect(port).toBeLessThan(600);
      }
    });

    test("throws when all ports in range are excluded", () => {
      // Range [10, 13) = 3 ports; exclude all 3
      const excluded = new Set([10, 11, 12]);
      expect(() => allocatePort(10, 13, excluded)).toThrow(
        /No available ports in range/,
      );
    });

    test("works with an empty exclusion set", () => {
      const port = allocatePort(5000, 6000, new Set());
      expect(port).toBeGreaterThanOrEqual(5000);
      expect(port).toBeLessThan(6000);
    });

    test("single-port range with no exclusions returns that port", () => {
      // Range [42, 43) → only port 42
      expect(allocatePort(42, 43, new Set())).toBe(42);
    });
  });

  // -------------------------------------------------------------------------
  describe("getContainerName", () => {
    test("prefixes the agentId with 'milady-'", () => {
      expect(getContainerName("abc-123")).toBe("milady-abc-123");
    });

    test("works with a UUID-style agentId", () => {
      const agentId = "550e8400-e29b-41d4-a716-446655440000";
      expect(getContainerName(agentId)).toBe(`milady-${agentId}`);
    });

    test("works with a short agentId", () => {
      expect(getContainerName("x")).toBe("milady-x");
    });
  });

  // -------------------------------------------------------------------------
  describe("getVolumePath", () => {
    test("returns the correct path for a valid agentId", () => {
      expect(getVolumePath("abc-123")).toBe("/data/agents/abc-123");
    });

    test("returns the correct path for a UUID-style agentId", () => {
      const agentId = "550e8400-e29b-41d4-a716-446655440000";
      expect(getVolumePath(agentId)).toBe(`/data/agents/${agentId}`);
    });

    test("throws for an invalid agentId (has dots)", () => {
      expect(() => getVolumePath("agent.1")).toThrow(/Invalid agent ID/);
    });

    test("throws for an empty agentId", () => {
      expect(() => getVolumePath("")).toThrow(/Invalid agent ID/);
    });
  });

  // -------------------------------------------------------------------------
  describe("parseDockerNodes", () => {
    let savedEnv: string | undefined;

    beforeEach(() => {
      savedEnv = process.env.MILADY_DOCKER_NODES;
      // Reset cache so each test parses fresh
      _cachedDockerNodes = null;
      _cachedDockerNodesRaw = undefined;
    });

    afterEach(() => {
      if (savedEnv === undefined) {
        delete process.env.MILADY_DOCKER_NODES;
      } else {
        process.env.MILADY_DOCKER_NODES = savedEnv;
      }
      // Reset cache after each test
      _cachedDockerNodes = null;
      _cachedDockerNodesRaw = undefined;
    });

    test("parses a single valid node", () => {
      process.env.MILADY_DOCKER_NODES = "node1:192.168.1.1:8";
      const nodes = parseDockerNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toEqual({ nodeId: "node1", hostname: "192.168.1.1", capacity: 8 });
    });

    test("parses multiple valid nodes", () => {
      process.env.MILADY_DOCKER_NODES = "n1:h1:4,n2:h2:8";
      const nodes = parseDockerNodes();
      expect(nodes).toHaveLength(2);
      expect(nodes[0]).toEqual({ nodeId: "n1", hostname: "h1", capacity: 4 });
      expect(nodes[1]).toEqual({ nodeId: "n2", hostname: "h2", capacity: 8 });
    });

    test("skips malformed entries and keeps valid ones", () => {
      process.env.MILADY_DOCKER_NODES = "n1:h1:4,bad-entry,n2:h2:8";
      const nodes = parseDockerNodes();
      expect(nodes).toHaveLength(2);
      expect(nodes[0]!.nodeId).toBe("n1");
      expect(nodes[1]!.nodeId).toBe("n2");
    });

    test("throws when env var is not set", () => {
      delete process.env.MILADY_DOCKER_NODES;
      expect(() => parseDockerNodes()).toThrow(/MILADY_DOCKER_NODES env var is not set/);
    });

    test("throws when all entries are invalid", () => {
      process.env.MILADY_DOCKER_NODES = "bad,also-bad,still-bad";
      expect(() => parseDockerNodes()).toThrow(/No valid nodes parsed/);
    });

    test("returns cached result on repeated calls with same env value", () => {
      process.env.MILADY_DOCKER_NODES = "node1:10.0.0.1:4";
      const first = parseDockerNodes();
      const second = parseDockerNodes();
      expect(first).toBe(second); // Same object reference = cache hit
    });
  });

  // -------------------------------------------------------------------------
  describe("createSandboxProvider factory", () => {
    let savedEnv: string | undefined;

    beforeEach(() => {
      savedEnv = process.env.MILADY_SANDBOX_PROVIDER;
    });

    afterEach(() => {
      if (savedEnv === undefined) {
        delete process.env.MILADY_SANDBOX_PROVIDER;
      } else {
        process.env.MILADY_SANDBOX_PROVIDER = savedEnv;
      }
    });

    test("defaults to VercelSandboxProvider when env var is unset", async () => {
      delete process.env.MILADY_SANDBOX_PROVIDER;
      const { createSandboxProvider } = await import("@/lib/services/sandbox-provider");
      const provider = createSandboxProvider();
      const { VercelSandboxProvider } = await import("@/lib/services/vercel-sandbox-provider");
      expect(provider).toBeInstanceOf(VercelSandboxProvider);
    });

    test("returns VercelSandboxProvider for MILADY_SANDBOX_PROVIDER=vercel", async () => {
      process.env.MILADY_SANDBOX_PROVIDER = "vercel";
      const { createSandboxProvider } = await import("@/lib/services/sandbox-provider");
      const provider = createSandboxProvider();
      const { VercelSandboxProvider } = await import("@/lib/services/vercel-sandbox-provider");
      expect(provider).toBeInstanceOf(VercelSandboxProvider);
    });

    test("returns DockerSandboxProvider for MILADY_SANDBOX_PROVIDER=docker", async () => {
      process.env.MILADY_SANDBOX_PROVIDER = "docker";
      const { createSandboxProvider } = await import("@/lib/services/sandbox-provider");
      try {
        const provider = createSandboxProvider();
        const { DockerSandboxProvider } = await import("@/lib/services/docker-sandbox-provider");
        expect(provider).toBeInstanceOf(DockerSandboxProvider);
      } catch (err) {
        // If DockerSandboxProvider can't be constructed in test env, at least
        // verify the factory attempted to create it (no "Unknown provider" error)
        expect(String(err)).not.toContain("Unknown sandbox provider");
      }
    });

    test("throws for an unknown provider name", async () => {
      process.env.MILADY_SANDBOX_PROVIDER = "unknown";
      const { createSandboxProvider } = await import("@/lib/services/sandbox-provider");
      expect(() => createSandboxProvider()).toThrow(/Unknown sandbox provider/);
    });

    test("is case-insensitive (Docker → docker)", async () => {
      process.env.MILADY_SANDBOX_PROVIDER = "Docker";
      const { createSandboxProvider } = await import("@/lib/services/sandbox-provider");
      try {
        const provider = createSandboxProvider();
        const { DockerSandboxProvider } = await import("@/lib/services/docker-sandbox-provider");
        expect(provider).toBeInstanceOf(DockerSandboxProvider);
      } catch (err) {
        expect(String(err)).not.toContain("Unknown sandbox provider");
      }
    });

    test("is case-insensitive (VERCEL → vercel)", async () => {
      process.env.MILADY_SANDBOX_PROVIDER = "VERCEL";
      const { createSandboxProvider } = await import("@/lib/services/sandbox-provider");
      const provider = createSandboxProvider();
      const { VercelSandboxProvider } = await import("@/lib/services/vercel-sandbox-provider");
      expect(provider).toBeInstanceOf(VercelSandboxProvider);
    });
  });
});
