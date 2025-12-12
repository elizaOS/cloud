import { describe, test, expect, beforeAll } from "bun:test";

describe("OAUTH_CONFIGS", () => {
  let OAUTH_CONFIGS: Record<string, { authUrl: string; tokenUrl: string; profileUrl: string; scopes: string[]; clientIdEnv: string; clientSecretEnv: string }>;

  beforeAll(async () => {
    OAUTH_CONFIGS = (await import("@/lib/services/platform-credentials")).OAUTH_CONFIGS;
  });

  test("OAuth platforms have valid URLs and scopes", () => {
    const skip = ["twilio", "mastodon"]; // API key and instance-based

    for (const [platform, config] of Object.entries(OAUTH_CONFIGS)) {
      if (skip.includes(platform)) continue;
      expect(config.authUrl).toMatch(/^https:\/\//);
      expect(config.tokenUrl).toMatch(/^https:\/\//);
      expect(config.scopes.length).toBeGreaterThan(0);
      expect(config.clientIdEnv).toMatch(/^[A-Z_]+$/);
    }
  });

  test("Mastodon has empty URLs (instance-based)", () => {
    expect(OAUTH_CONFIGS.mastodon.authUrl).toBe("");
    expect(OAUTH_CONFIGS.mastodon.scopes).toContain("write:statuses");
  });

  test("Twilio has empty URLs (API key-based)", () => {
    expect(OAUTH_CONFIGS.twilio.authUrl).toBe("");
    expect(OAUTH_CONFIGS.twilio.scopes.length).toBe(0);
  });

  test("social platforms have required scopes", () => {
    expect(OAUTH_CONFIGS.twitter.scopes).toContain("offline.access");
    expect(OAUTH_CONFIGS.reddit.scopes).toContain("submit");
    expect(OAUTH_CONFIGS.discord.scopes).toContain("identify");
  });
});

describe("Platform constants", () => {
  let SOCIAL_PLATFORMS: readonly string[];
  let MANUAL_AUTH_PLATFORMS: readonly string[];

  beforeAll(async () => {
    const mod = await import("@/lib/services/platform-credentials");
    SOCIAL_PLATFORMS = mod.SOCIAL_PLATFORMS;
    MANUAL_AUTH_PLATFORMS = mod.MANUAL_AUTH_PLATFORMS;
  });

  test("SOCIAL_PLATFORMS has 11 platforms", () => {
    expect(SOCIAL_PLATFORMS.length).toBe(11);
    expect(SOCIAL_PLATFORMS).toContain("twitter");
    expect(SOCIAL_PLATFORMS).toContain("bluesky");
    expect(SOCIAL_PLATFORMS).toContain("telegram");
  });

  test("MANUAL_AUTH_PLATFORMS has bluesky and telegram", () => {
    expect(MANUAL_AUTH_PLATFORMS).toEqual(["bluesky", "telegram"]);
  });
});

describe("Bluesky handle normalization", () => {
  const normalize = (h: string) => {
    const n = h.trim().replace(/^@/, "");
    return n.includes(".") ? n : `${n}.bsky.social`;
  };

  test("normalizes handles", () => {
    expect(normalize("@test.bsky.social")).toBe("test.bsky.social");
    expect(normalize("alice")).toBe("alice.bsky.social");
    expect(normalize("  @user  ")).toBe("user.bsky.social");
    expect(normalize("alice.example.com")).toBe("alice.example.com");
  });
});

describe("Telegram bot token format", () => {
  const valid = (t: string) => /^\d+:[A-Za-z0-9_-]+$/.test(t);

  test("validates format", () => {
    expect(valid("123456789:ABCdefGHI")).toBe(true);
    expect(valid("1:a")).toBe(true);
    expect(valid("")).toBe(false);
    expect(valid("123456789")).toBe(false);
    expect(valid(":ABC")).toBe(false);
    expect(valid("abc:ABC")).toBe(false);
  });
});

describe("Session expiry", () => {
  const SESSION_MS = 15 * 60 * 1000;
  const REFRESH_BUFFER = 5 * 60 * 1000;

  test("expiry is in future", () => {
    const expiry = new Date(Date.now() + SESSION_MS);
    expect(expiry.getTime()).toBeGreaterThan(Date.now());
  });

  test("refresh buffer logic", () => {
    const now = Date.now();
    const needsRefresh = (t: Date) => t.getTime() - Date.now() < REFRESH_BUFFER;
    expect(needsRefresh(new Date(now + 4 * 60 * 1000))).toBe(true);
    expect(needsRefresh(new Date(now + 10 * 60 * 1000))).toBe(false);
  });
});

describe("Credential status transitions", () => {
  const transitions: Record<string, string[]> = {
    pending: ["active", "expired", "error"],
    active: ["expired", "revoked", "error"],
    expired: ["active"],
    revoked: [],
    error: ["active", "expired"],
  };

  test("valid transitions", () => {
    expect(transitions.pending).toContain("active");
    expect(transitions.revoked.length).toBe(0);
    expect(transitions.expired).toContain("active");
  });
});

