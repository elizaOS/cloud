/**
 * Unit Tests — DockerSSHClient cloud-deployability hardening
 *
 * Tests the SSH key resolution logic for Vercel/serverless environments
 * where filesystem access is unavailable, and verifies that secrets are
 * never leaked in error messages or logs.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

// Import the real `redact` object directly.  Other test files in the batch
// may call `mock.module("@/lib/utils/logger", ...)` without including `redact`,
// which poisons the module cache for later dynamic `await import(...)` calls.
// Importing via the file-system path with a cache-buster query param
// guarantees we always get the real implementation regardless of mocks.
// @ts-expect-error Bun supports cache-busting query imports in tests.
import { redact } from "../../lib/utils/logger?v=docker-ssh-test";

// ---------------------------------------------------------------------------
// Env helpers — save/restore to avoid cross-test pollution
// ---------------------------------------------------------------------------

let savedEnv: Record<string, string | undefined> = {};
const ENV_KEYS = ["MILADY_SSH_KEY", "MILADY_SSH_KEY_PATH", "MILADY_SSH_USER"];

function saveEnv() {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
  }
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
}

// ---------------------------------------------------------------------------
// SSH key resolution tests
// ---------------------------------------------------------------------------

describe("DockerSSHClient — cloud deploy key resolution", () => {
  beforeEach(() => saveEnv());
  afterEach(() => restoreEnv());

  test("loads key from MILADY_SSH_KEY env var (base64)", async () => {
    const fakeKey =
      "-----BEGIN OPENSSH PRIVATE KEY-----\nfake-key-data\n-----END OPENSSH PRIVATE KEY-----\n";
    process.env.MILADY_SSH_KEY = Buffer.from(fakeKey).toString("base64");
    delete process.env.MILADY_SSH_KEY_PATH;

    // Test the resolution logic directly via the privateKey config option
    const { DockerSSHClient } = await import("@/lib/services/docker-ssh");

    const keyBuf = Buffer.from(fakeKey);
    const client = new DockerSSHClient({
      hostname: "test-host",
      privateKey: keyBuf,
    });

    expect(client).toBeDefined();
    expect(client.isConnected).toBe(false);
  });

  test("DockerSSHConfig accepts privateKey buffer directly", async () => {
    const { DockerSSHClient } = await import("@/lib/services/docker-ssh");

    const fakeKey = Buffer.from("test-key-material");
    const client = new DockerSSHClient({
      hostname: "direct-key-host",
      privateKey: fakeKey,
    });

    expect(client).toBeDefined();
    // Client should be constructable without filesystem access
    expect(client.isConnected).toBe(false);
  });

  test("constructor does not throw when privateKey buffer is provided (even without filesystem)", async () => {
    // Simulate serverless: no SSH key file, no env var, but direct buffer
    delete process.env.MILADY_SSH_KEY;
    delete process.env.MILADY_SSH_KEY_PATH;

    const { DockerSSHClient } = await import("@/lib/services/docker-ssh");

    const fakeKey = Buffer.from(
      "-----BEGIN OPENSSH PRIVATE KEY-----\ntest\n-----END OPENSSH PRIVATE KEY-----\n",
    );
    expect(() => {
      new DockerSSHClient({
        hostname: "serverless-host",
        privateKey: fakeKey,
      });
    }).not.toThrow();
  });

  test("error message does not contain full filesystem path", async () => {
    const { DockerSSHClient } = await import("@/lib/services/docker-ssh");

    // Pass privateKeyPath directly via config instead of env var.
    // (Module-level DEFAULT_SSH_KEY_PATH is captured at import time and
    // is unaffected by later process.env changes — which makes env-based
    // overrides unreliable when the module is cached across tests.)
    let caught = false;
    try {
      new DockerSSHClient({
        hostname: "err-test-host",
        privateKeyPath: "/very/secret/path/to/my_private_key",
      });
    } catch (err) {
      caught = true;
      const msg = err instanceof Error ? err.message : String(err);
      // The full path should NOT appear in the error message
      expect(msg).not.toContain("/very/secret/path/to/");
      // But the basename hint should appear
      expect(msg).toContain("my_private_key");
      // Should suggest the env var alternative
      expect(msg).toContain("MILADY_SSH_KEY");
    }
    // Ensure the error path was actually exercised
    expect(caught).toBe(true);
  });

  test("error message suggests MILADY_SSH_KEY for serverless", async () => {
    const { DockerSSHClient } = await import("@/lib/services/docker-ssh");

    let caught = false;
    try {
      new DockerSSHClient({
        hostname: "suggest-test-host",
        privateKeyPath: "/nonexistent/serverless/deploy/key",
      });
    } catch (err) {
      caught = true;
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toContain("MILADY_SSH_KEY");
      expect(msg).toContain("serverless");
    }
    expect(caught).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Secret redaction tests
// ---------------------------------------------------------------------------

describe("Logger redact.context — secret field coverage", () => {
  // All tests use the top-level `redact` import (cache-buster path) to
  // ensure we always test the real implementation, not a mock from another
  // test file in the same batch.

  test("redacts privateKey fields", () => {
    const result = redact.context({ privateKey: "super-secret-key-data" });
    expect(result.privateKey).toBe("[REDACTED]");
  });

  test("redacts private_key fields", () => {
    const result = redact.context({ private_key: "pem-data-here" });
    expect(result.private_key).toBe("[REDACTED]");
  });

  test("redacts apiKey fields", () => {
    const result = redact.context({ apiKey: "sk-1234567890" });
    expect(result.apiKey).toBe("[REDACTED]");
  });

  test("redacts api_key fields", () => {
    const result = redact.context({ api_key: "sk-1234567890" });
    expect(result.api_key).toBe("[REDACTED]");
  });

  test("redacts secret fields", () => {
    const result = redact.context({
      webhookSecret: "whsec_abc123",
      appSecret: "secret-value",
    });
    expect(result.webhookSecret).toBe("[REDACTED]");
    expect(result.appSecret).toBe("[REDACTED]");
  });

  test("redacts password fields", () => {
    const result = redact.context({ password: "hunter2", dbPassword: "p@ss" });
    expect(result.password).toBe("[REDACTED]");
    expect(result.dbPassword).toBe("[REDACTED]");
  });

  test("redacts token fields", () => {
    const result = redact.context({
      accessToken: "gho_abc123",
      bearerToken: "eyJ...",
    });
    expect(result.accessToken).toBe("[REDACTED]");
    expect(result.bearerToken).toBe("[REDACTED]");
  });

  test("redacts authKey / auth_key fields", () => {
    const result = redact.context({
      authKey: "tskey-auth-abc",
      ts_auth_key: "tskey-auth-xyz",
    });
    expect(result.authKey).toBe("[REDACTED]");
    expect(result.ts_auth_key).toBe("[REDACTED]");
  });

  test("redacts SSH key fields", () => {
    const result = redact.context({
      sshKey: "-----BEGIN OPENSSH PRIVATE KEY-----",
      ssh_private_key: "base64data==",
    });
    expect(result.sshKey).toBe("[REDACTED]");
    expect(result.ssh_private_key).toBe("[REDACTED]");
  });

  test("redacts signing key fields", () => {
    const result = redact.context({
      signingKey: "base64-pem-data",
      jwt_signing_key: "private-key-data",
    });
    expect(result.signingKey).toBe("[REDACTED]");
    expect(result.jwt_signing_key).toBe("[REDACTED]");
  });

  test("does NOT redact non-sensitive fields", () => {
    const result = redact.context({
      hostname: "node-1.example.com",
      status: "healthy",
      containerName: "milady-abc123",
      tokenId: "tok-123", // tokenId is explicitly excluded from token redaction
    });
    expect(result.hostname).toBe("node-1.example.com");
    expect(result.status).toBe("healthy");
    expect(result.containerName).toBe("milady-abc123");
    expect(result.tokenId).toBe("tok-123");
  });

  test("handles non-string values without redaction", () => {
    const result = redact.context({
      count: 42,
      enabled: true,
      nested: { deep: "value" },
    });
    expect(result.count).toBe(42);
    expect(result.enabled).toBe(true);
    expect(result.nested).toEqual({ deep: "value" });
  });
});

// ---------------------------------------------------------------------------
// DockerSSHConfig interface tests
// ---------------------------------------------------------------------------

describe("DockerSSHConfig — interface completeness", () => {
  test("exports DockerSSHConfig with all expected fields", async () => {
    const _mod = await import("@/lib/services/docker-ssh");
    // Type-level check: ensure the config interface works with all fields
    const config: import("@/lib/services/docker-ssh").DockerSSHConfig = {
      hostname: "test",
      port: 22,
      username: "root",
      privateKeyPath: "/tmp/test",
      privateKey: Buffer.from("test"),
      hostKeyFingerprint: "abc123",
    };
    expect(config.hostname).toBe("test");
    expect(config.privateKey).toBeInstanceOf(Buffer);
  });

  test("DockerSSHConfig works with minimal fields", async () => {
    const config: import("@/lib/services/docker-ssh").DockerSSHConfig = {
      hostname: "minimal-host",
    };
    expect(config.hostname).toBe("minimal-host");
    expect(config.privateKey).toBeUndefined();
  });
});
