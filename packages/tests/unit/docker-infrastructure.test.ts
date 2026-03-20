/**
 * Unit Tests — Docker Infrastructure Pure Functions
 *
 * Tests the utility functions extracted to docker-sandbox-utils.ts.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  allocatePort,
  getContainerName,
  getVolumePath,
  MAX_AGENT_ID_LENGTH,
  parseDockerNodes,
  shellQuote,
  validateAgentId,
  validateAgentName,
  validateContainerName,
  validateEnvKey,
  validateEnvValue,
  validateVolumePath,
} from "@/lib/services/docker-sandbox-utils";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const sandboxProviderModuleUrl = new URL("../../lib/services/sandbox-provider.ts", import.meta.url)
  .href;

function runSandboxProviderFactory(providerEnv?: string) {
  const env = { ...process.env };

  if (providerEnv === undefined) {
    delete env.MILADY_SANDBOX_PROVIDER;
    delete env.MILAIDY_SANDBOX_PROVIDER;
  } else {
    env.MILADY_SANDBOX_PROVIDER = providerEnv;
    delete env.MILAIDY_SANDBOX_PROVIDER;
  }

  const result = Bun.spawnSync({
    cmd: [
      "bun",
      "-e",
      `
        const mod = await import(${JSON.stringify(`${sandboxProviderModuleUrl}?test=${Date.now()}`)});
        const { createSandboxProvider } = mod;
        try {
          const provider = await createSandboxProvider();
          console.log(JSON.stringify({ ok: true, name: provider.constructor?.name ?? null }));
        } catch (error) {
          console.log(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : String(error) }));
        }
      `,
    ],
    cwd: process.cwd(),
    env,
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = new TextDecoder().decode(result.stdout).trim();
  const stderr = new TextDecoder().decode(result.stderr).trim();

  expect(result.exitCode).toBe(0);
  expect(stderr).toBe("");

  return JSON.parse(stdout) as { ok: true; name: string | null } | { ok: false; message: string };
}

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

    test("accepts exactly the Docker-safe maximum length", () => {
      const id = "a".repeat(MAX_AGENT_ID_LENGTH);
      expect(() => validateAgentId(id)).not.toThrow();
    });

    test("throws for empty string", () => {
      expect(() => validateAgentId("")).toThrow(/Invalid agent ID/);
    });

    test("throws when the agentId would exceed the Docker container name limit", () => {
      const id = "a".repeat(MAX_AGENT_ID_LENGTH + 1);
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
  describe("validateEnvKey", () => {
    test("accepts uppercase underscore keys", () => {
      expect(() => validateEnvKey("JWT_SECRET")).not.toThrow();
      expect(() => validateEnvKey("A1_B2")).not.toThrow();
    });

    test("rejects lowercase keys", () => {
      expect(() => validateEnvKey("jwt_secret")).toThrow(/Invalid environment variable key/);
    });

    test("rejects keys starting with a digit", () => {
      expect(() => validateEnvKey("1SECRET")).toThrow(/Invalid environment variable key/);
    });

    test("rejects punctuation", () => {
      expect(() => validateEnvKey("JWT-SECRET")).toThrow(/Invalid environment variable key/);
    });
  });

  // -------------------------------------------------------------------------
  describe("validateEnvValue", () => {
    test("accepts printable values", () => {
      expect(() => validateEnvValue("JWT_SECRET", "hello-world_123")).not.toThrow();
    });

    test("accepts UUIDs, URLs, and base64-like tokens", () => {
      expect(() =>
        validateEnvValue(
          "MIXED_VALUE",
          "550e8400-e29b-41d4-a716-446655440000 https://example.com/a?b=c token+/=",
        ),
      ).not.toThrow();
    });

    test("rejects null bytes and includes the key name", () => {
      expect(() => validateEnvValue("JWT_SECRET", "abc\x00def")).toThrow(
        /JWT_SECRET.*control characters/,
      );
    });

    test("rejects newlines and explains PEM-style values are unsupported", () => {
      expect(() => validateEnvValue("TLS_CERT", "abc\ndef")).toThrow(
        /TLS_CERT.*newlines and PEM-encoded values are not supported/,
      );
    });

    test("rejects tabs", () => {
      expect(() => validateEnvValue("JWT_SECRET", "abc\tdef")).toThrow(
        /control characters/,
      );
    });
  });

  // -------------------------------------------------------------------------
  describe("container name and volume path validation", () => {
    test("getContainerName returns a valid deterministic name", () => {
      expect(getContainerName("agent_1")).toBe("milady-agent_1");
    });

    test("validateContainerName accepts docker-safe names", () => {
      expect(() => validateContainerName("milady-agent_1.test-2")).not.toThrow();
    });

    test("validateContainerName accepts the 128-character boundary", () => {
      const containerName = `m${"a".repeat(127)}`;
      expect(containerName).toHaveLength(128);
      expect(() => validateContainerName(containerName)).not.toThrow();
    });

    test("validateContainerName rejects shell metacharacters", () => {
      expect(() => validateContainerName("bad;name")).toThrow(/Invalid container name/);
    });

    test("validateContainerName rejects names longer than 128 characters", () => {
      const containerName = `m${"a".repeat(128)}`;
      expect(containerName).toHaveLength(129);
      expect(() => validateContainerName(containerName)).toThrow(/Invalid container name/);
    });

    test("getVolumePath returns a normalized absolute path", () => {
      expect(getVolumePath("agent_1")).toBe("/data/agents/agent_1");
    });

    test("validateVolumePath rejects traversal", () => {
      expect(() => validateVolumePath("/data/agents/../escape")).toThrow(/Invalid volume path/);
    });

    test("validateVolumePath rejects trailing slashes", () => {
      expect(() => validateVolumePath("/data/agents/")).toThrow(/path must be normalized/);
    });

    test("validateVolumePath rejects non-absolute paths", () => {
      expect(() => validateVolumePath("data/agents/agent_1")).toThrow(/Invalid volume path/);
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
      expect(() => allocatePort(10, 13, excluded)).toThrow(/No available ports in range/);
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

    test("rejects an agentId that would exceed the Docker container name limit", () => {
      const longId = "a".repeat(MAX_AGENT_ID_LENGTH + 1);
      expect(() => getContainerName(longId)).toThrow(/Invalid agent ID/);
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
    });

    afterEach(() => {
      if (savedEnv === undefined) {
        delete process.env.MILADY_DOCKER_NODES;
      } else {
        process.env.MILADY_DOCKER_NODES = savedEnv;
      }
    });

    test("parses a single valid node", () => {
      process.env.MILADY_DOCKER_NODES = "node1:192.168.1.1:8";
      const nodes = parseDockerNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toEqual({
        nodeId: "node1",
        hostname: "192.168.1.1",
        capacity: 8,
      });
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
    test("defaults to VercelSandboxProvider when env var is unset", () => {
      const result = runSandboxProviderFactory();
      expect(result).toEqual({ ok: true, name: "VercelSandboxProvider" });
    });

    test("returns VercelSandboxProvider for MILADY_SANDBOX_PROVIDER=vercel", () => {
      const result = runSandboxProviderFactory("vercel");
      expect(result).toEqual({ ok: true, name: "VercelSandboxProvider" });
    });

    test("returns DockerSandboxProvider for MILADY_SANDBOX_PROVIDER=docker", () => {
      const result = runSandboxProviderFactory("docker");
      if (result.ok) {
        expect(result.name).toBe("DockerSandboxProvider");
      } else {
        expect(result.message).not.toContain("Unknown sandbox provider");
      }
    });

    test("throws for an unknown provider name", () => {
      const result = runSandboxProviderFactory("unknown");
      expect(result).toEqual({
        ok: false,
        message: 'Unknown sandbox provider: "unknown". Supported values: vercel, docker',
      });
    });

    test("is case-insensitive (Docker → docker)", () => {
      const result = runSandboxProviderFactory("Docker");
      if (result.ok) {
        expect(result.name).toBe("DockerSandboxProvider");
      } else {
        expect(result.message).not.toContain("Unknown sandbox provider");
      }
    });

    test("is case-insensitive (VERCEL → vercel)", () => {
      const result = runSandboxProviderFactory("VERCEL");
      expect(result).toEqual({ ok: true, name: "VercelSandboxProvider" });
    });
  });
});
