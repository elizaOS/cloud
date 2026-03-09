import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  spyOn,
  mock,
} from "bun:test";

// Mock fs.readFileSync to avoid reading real K8s service account files
mock.module("fs", () => ({
  readFileSync: (path: string) => {
    throw new Error(`ENOENT: ${path}`);
  },
}));

import {
  getProjectEnv,
  initProjectConfig,
  shutdownProjectConfig,
} from "../src/project-config";

describe("project-config", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore env vars
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    shutdownProjectConfig();
  });

  describe("getProjectEnv", () => {
    test("eliza-app project maps to ELIZA_APP_ prefix", () => {
      process.env.ELIZA_APP_TELEGRAM_BOT_TOKEN = "app-token";
      expect(getProjectEnv("eliza-app", "TELEGRAM_BOT_TOKEN")).toBe(
        "app-token",
      );
    });

    test("soulmates project maps to SOULMATES_ prefix", () => {
      process.env.SOULMATES_BLOOIO_API_KEY = "soul-key";
      expect(getProjectEnv("soulmates", "BLOOIO_API_KEY")).toBe("soul-key");
    });

    test("returns empty string for missing env var", () => {
      expect(getProjectEnv("nonexistent", "MISSING_KEY")).toBe("");
    });

    test("isolates projects from each other", () => {
      process.env.PROJ_A_TOKEN = "A";
      process.env.PROJ_B_TOKEN = "B";
      // proj-a → PROJ_A_, proj-b → PROJ_B_ (hyphens become underscores)
      expect(getProjectEnv("proj-a", "TOKEN")).toBe("A");
      expect(getProjectEnv("proj-b", "TOKEN")).toBe("B");
      // proj-a cannot see proj-b's token
      expect(getProjectEnv("proj-a", "TOKEN")).not.toBe("B");
    });
  });

  describe("initProjectConfig", () => {
    test("completes without error when not in K8s (no service account)", async () => {
      // readFileSync is mocked to throw, simulating non-K8s environment
      await initProjectConfig();
      // Should not throw — just skips K8s secret loading
    });
  });
});
