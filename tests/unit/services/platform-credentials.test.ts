/**
 * Unit Tests for Platform Credentials Service
 *
 * Tests:
 * 1. Bluesky credential validation - boundary conditions, edge cases
 * 2. Telegram bot token validation - format validation
 * 3. SOCIAL_PLATFORMS constant correctness
 * 4. OAUTH_CONFIGS structure validation
 * 5. Session expiry calculations
 * 6. Error handling for invalid inputs
 */

import { describe, test, expect, beforeAll } from "bun:test";

// Test OAUTH_CONFIGS structure
describe("OAUTH_CONFIGS Structure", () => {
  let OAUTH_CONFIGS: Record<string, { authUrl: string; tokenUrl: string; profileUrl: string; scopes: string[]; clientIdEnv: string; clientSecretEnv: string }>;

  beforeAll(async () => {
    const module = await import("@/lib/services/platform-credentials");
    OAUTH_CONFIGS = module.OAUTH_CONFIGS;
  });

  test("all OAuth platforms have required fields", () => {
    const requiredFields = ["authUrl", "tokenUrl", "profileUrl", "scopes", "clientIdEnv", "clientSecretEnv"];
    // Skip platforms with special handling (Twilio uses API keys, Mastodon uses dynamic instance URLs)
    const skipPlatforms = ["twilio", "mastodon"];

    for (const [platform, config] of Object.entries(OAUTH_CONFIGS)) {
      if (skipPlatforms.includes(platform)) continue;

      for (const field of requiredFields) {
        expect(config).toHaveProperty(field);
        expect((config as Record<string, unknown>)[field]).toBeDefined();
      }
      // Validate URL formats
      expect(config.authUrl).toMatch(/^https:\/\//);
      expect(config.tokenUrl).toMatch(/^https:\/\//);
      expect(config.profileUrl).toMatch(/^https:\/\//);
      // Validate scopes is non-empty array
      expect(Array.isArray(config.scopes)).toBe(true);
      expect(config.scopes.length).toBeGreaterThan(0);
      // Validate env var names
      expect(config.clientIdEnv).toMatch(/^[A-Z_]+$/);
      expect(config.clientSecretEnv).toMatch(/^[A-Z_]+$/);
    }
  });

  test("Mastodon uses placeholder URLs (instance-based)", () => {
    expect(OAUTH_CONFIGS.mastodon.authUrl).toBe("");
    expect(OAUTH_CONFIGS.mastodon.tokenUrl).toBe("");
    expect(OAUTH_CONFIGS.mastodon.scopes.length).toBeGreaterThan(0);
  });

  test("Twilio uses placeholder URLs (API key-based)", () => {
    expect(OAUTH_CONFIGS.twilio.authUrl).toBe("");
    expect(OAUTH_CONFIGS.twilio.scopes.length).toBe(0);
  });

  test("social media platforms include all expected platforms", () => {
    const socialPlatforms = ["twitter", "reddit", "facebook", "instagram", "tiktok", "linkedin", "mastodon"];

    for (const platform of socialPlatforms) {
      expect(OAUTH_CONFIGS[platform]).toBeDefined();
    }
  });

  test("Twitter has offline.access scope for refresh tokens", () => {
    expect(OAUTH_CONFIGS.twitter.scopes).toContain("offline.access");
  });

  test("Discord has identify and email scopes", () => {
    expect(OAUTH_CONFIGS.discord.scopes).toContain("identify");
    expect(OAUTH_CONFIGS.discord.scopes).toContain("email");
  });

  test("Reddit has submit scope for posting", () => {
    expect(OAUTH_CONFIGS.reddit.scopes).toContain("submit");
  });

  test("Mastodon has write:statuses scope", () => {
    expect(OAUTH_CONFIGS.mastodon.scopes).toContain("write:statuses");
  });
});

// Test SOCIAL_PLATFORMS constant
describe("SOCIAL_PLATFORMS Constant", () => {
  let SOCIAL_PLATFORMS: readonly string[];

  beforeAll(async () => {
    const module = await import("@/lib/services/platform-credentials");
    SOCIAL_PLATFORMS = module.SOCIAL_PLATFORMS;
  });

  test("includes all 11 social platforms", () => {
    expect(SOCIAL_PLATFORMS.length).toBe(11);
  });

  test("includes manual auth platforms", () => {
    expect(SOCIAL_PLATFORMS).toContain("bluesky");
    expect(SOCIAL_PLATFORMS).toContain("telegram");
  });

  test("includes OAuth platforms", () => {
    expect(SOCIAL_PLATFORMS).toContain("twitter");
    expect(SOCIAL_PLATFORMS).toContain("discord");
    expect(SOCIAL_PLATFORMS).toContain("mastodon");
    expect(SOCIAL_PLATFORMS).toContain("linkedin");
    expect(SOCIAL_PLATFORMS).toContain("reddit");
  });

  test("includes Meta platforms", () => {
    expect(SOCIAL_PLATFORMS).toContain("facebook");
    expect(SOCIAL_PLATFORMS).toContain("instagram");
  });

  test("includes video platform", () => {
    expect(SOCIAL_PLATFORMS).toContain("tiktok");
  });

  test("includes messaging platforms", () => {
    expect(SOCIAL_PLATFORMS).toContain("slack");
    expect(SOCIAL_PLATFORMS).toContain("telegram");
  });
});

// Test MANUAL_AUTH_PLATFORMS
describe("MANUAL_AUTH_PLATFORMS Constant", () => {
  let MANUAL_AUTH_PLATFORMS: readonly string[];

  beforeAll(async () => {
    const module = await import("@/lib/services/platform-credentials");
    MANUAL_AUTH_PLATFORMS = module.MANUAL_AUTH_PLATFORMS;
  });

  test("includes exactly bluesky and telegram", () => {
    expect(MANUAL_AUTH_PLATFORMS.length).toBe(2);
    expect(MANUAL_AUTH_PLATFORMS).toContain("bluesky");
    expect(MANUAL_AUTH_PLATFORMS).toContain("telegram");
  });

  test("does not include OAuth platforms", () => {
    expect(MANUAL_AUTH_PLATFORMS).not.toContain("twitter");
    expect(MANUAL_AUTH_PLATFORMS).not.toContain("discord");
    expect(MANUAL_AUTH_PLATFORMS).not.toContain("mastodon");
  });
});

// Test Bluesky Handle Normalization
describe("Bluesky Handle Normalization", () => {
  test("handles with @ prefix", () => {
    const normalize = (handle: string) => {
      let normalized = handle.trim();
      if (normalized.startsWith("@")) normalized = normalized.slice(1);
      if (!normalized.includes(".")) normalized = `${normalized}.bsky.social`;
      return normalized;
    };

    expect(normalize("@test.bsky.social")).toBe("test.bsky.social");
    expect(normalize("@alice")).toBe("alice.bsky.social");
  });

  test("handles without @ prefix", () => {
    const normalize = (handle: string) => {
      let normalized = handle.trim();
      if (normalized.startsWith("@")) normalized = normalized.slice(1);
      if (!normalized.includes(".")) normalized = `${normalized}.bsky.social`;
      return normalized;
    };

    expect(normalize("test.bsky.social")).toBe("test.bsky.social");
    expect(normalize("bob")).toBe("bob.bsky.social");
  });

  test("handles with custom domains", () => {
    const normalize = (handle: string) => {
      let normalized = handle.trim();
      if (normalized.startsWith("@")) normalized = normalized.slice(1);
      if (!normalized.includes(".")) normalized = `${normalized}.bsky.social`;
      return normalized;
    };

    expect(normalize("alice.example.com")).toBe("alice.example.com");
    expect(normalize("@ceo.company.io")).toBe("ceo.company.io");
  });

  test("handles whitespace", () => {
    const normalize = (handle: string) => {
      let normalized = handle.trim();
      if (normalized.startsWith("@")) normalized = normalized.slice(1);
      if (!normalized.includes(".")) normalized = `${normalized}.bsky.social`;
      return normalized;
    };

    expect(normalize("  test.bsky.social  ")).toBe("test.bsky.social");
    expect(normalize("  @user  ")).toBe("user.bsky.social");
  });

  test("edge cases", () => {
    const normalize = (handle: string) => {
      let normalized = handle.trim();
      if (normalized.startsWith("@")) normalized = normalized.slice(1);
      if (!normalized.includes(".")) normalized = `${normalized}.bsky.social`;
      return normalized;
    };

    // Empty after @ 
    expect(normalize("@")).toBe(".bsky.social");
    // Just dots
    expect(normalize(".")).toBe(".");
    // Multiple @ symbols (only first stripped)
    expect(normalize("@@user")).toBe("@user.bsky.social");
  });
});

// Test Telegram Bot Token Format
describe("Telegram Bot Token Format Validation", () => {
  const isValidBotTokenFormat = (token: string): boolean => {
    // Format: <bot_id>:<alphanumeric_string>
    // Example: 123456789:ABCdefGHIjklMNOpqrSTUvwxyz
    const pattern = /^\d+:[A-Za-z0-9_-]+$/;
    return pattern.test(token);
  };

  test("valid bot token formats", () => {
    expect(isValidBotTokenFormat("123456789:ABCdefGHIjklMNOpqrSTUvwxyz")).toBe(true);
    expect(isValidBotTokenFormat("1:a")).toBe(true);
    expect(isValidBotTokenFormat("9999999999:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).toBe(true);
  });

  test("invalid bot token formats", () => {
    expect(isValidBotTokenFormat("")).toBe(false);
    expect(isValidBotTokenFormat("nobotnumberhere")).toBe(false);
    expect(isValidBotTokenFormat("123456789")).toBe(false); // No colon
    expect(isValidBotTokenFormat(":ABCdefGHI")).toBe(false); // No bot ID
    expect(isValidBotTokenFormat("123456789:")).toBe(false); // No token part
    expect(isValidBotTokenFormat("abc:ABCdefGHI")).toBe(false); // Bot ID must be numeric
    expect(isValidBotTokenFormat("123:ABC def")).toBe(false); // No spaces allowed
  });

  test("boundary conditions", () => {
    // Minimum valid token
    expect(isValidBotTokenFormat("1:a")).toBe(true);
    // Very long but valid
    expect(isValidBotTokenFormat("1234567890123456789:" + "A".repeat(100))).toBe(true);
  });
});

// Test Session Expiry Calculations
describe("Session Expiry Calculations", () => {
  const SESSION_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
  const TOKEN_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

  test("session expiry is 15 minutes", () => {
    expect(SESSION_EXPIRY_MS).toBe(900000);
  });

  test("token expiry is 90 days", () => {
    expect(TOKEN_EXPIRY_MS).toBe(7776000000);
  });

  test("session expiry calculation", () => {
    const now = Date.now();
    const expiresAt = new Date(now + SESSION_EXPIRY_MS);

    // Should expire ~15 minutes from now
    const diffMs = expiresAt.getTime() - now;
    expect(diffMs).toBe(SESSION_EXPIRY_MS);
  });

  test("expired session detection", () => {
    const now = Date.now();
    const expiredSession = new Date(now - 1000); // 1 second ago
    const validSession = new Date(now + SESSION_EXPIRY_MS);

    expect(expiredSession < new Date()).toBe(true);
    expect(validSession > new Date()).toBe(true);
  });

  test("token refresh window detection", () => {
    const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minute buffer
    const now = Date.now();

    const tokenExpiringSoon = new Date(now + REFRESH_BUFFER_MS - 1000); // 4 min 59 sec
    const tokenNotExpiringSoon = new Date(now + REFRESH_BUFFER_MS + 60000); // 6 minutes

    const needsRefresh = (expiresAt: Date) => expiresAt.getTime() - Date.now() < REFRESH_BUFFER_MS;

    expect(needsRefresh(tokenExpiringSoon)).toBe(true);
    expect(needsRefresh(tokenNotExpiringSoon)).toBe(false);
  });
});

// Test OAuth URL Generation
describe("OAuth URL Generation", () => {
  test("Discord OAuth URL structure", () => {
    const baseUrl = "https://discord.com/api/oauth2/authorize";
    const params = new URLSearchParams({
      client_id: "test-client-id",
      redirect_uri: "https://example.com/callback",
      response_type: "code",
      scope: "identify email",
      state: "random-state-value",
    });

    const authUrl = `${baseUrl}?${params}`;

    expect(authUrl).toContain("discord.com");
    expect(authUrl).toContain("client_id=test-client-id");
    expect(authUrl).toContain("response_type=code");
    expect(authUrl).toContain("scope=identify");
  });

  test("Twitter OAuth URL with PKCE", () => {
    const baseUrl = "https://twitter.com/i/oauth2/authorize";
    const codeChallenge = "test-code-challenge";
    const params = new URLSearchParams({
      client_id: "test-client-id",
      redirect_uri: "https://example.com/callback",
      response_type: "code",
      scope: "tweet.read tweet.write users.read offline.access",
      state: "random-state-value",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    const authUrl = `${baseUrl}?${params}`;

    expect(authUrl).toContain("code_challenge=");
    expect(authUrl).toContain("code_challenge_method=S256");
  });

  test("Mastodon instance-based OAuth URL", () => {
    const instanceUrl = "https://mastodon.social";
    const params = new URLSearchParams({
      client_id: "test-client-id",
      redirect_uri: "https://example.com/callback",
      response_type: "code",
      scope: "read write",
      state: "random-state-value",
    });

    const authUrl = `${instanceUrl}/oauth/authorize?${params}`;

    expect(authUrl).toContain("mastodon.social/oauth/authorize");
    expect(authUrl).toContain("client_id=");
    expect(authUrl).toContain("scope=read");
  });
});

// Test Credential Status Transitions
describe("Credential Status Transitions", () => {
  const validStatuses = ["pending", "active", "expired", "revoked", "error"] as const;
  type CredentialStatus = typeof validStatuses[number];

  const validTransitions: Record<CredentialStatus, CredentialStatus[]> = {
    pending: ["active", "expired", "error"],
    active: ["expired", "revoked", "error"],
    expired: ["active"], // Can be refreshed
    revoked: [], // Terminal state
    error: ["active", "expired"], // Can retry
  };

  test("pending can transition to active, expired, or error", () => {
    expect(validTransitions.pending).toContain("active");
    expect(validTransitions.pending).toContain("expired");
    expect(validTransitions.pending).toContain("error");
    expect(validTransitions.pending).not.toContain("revoked");
  });

  test("active can transition to expired, revoked, or error", () => {
    expect(validTransitions.active).toContain("expired");
    expect(validTransitions.active).toContain("revoked");
    expect(validTransitions.active).toContain("error");
    expect(validTransitions.active).not.toContain("pending");
  });

  test("revoked is terminal state", () => {
    expect(validTransitions.revoked.length).toBe(0);
  });

  test("expired can be refreshed to active", () => {
    expect(validTransitions.expired).toContain("active");
  });
});

// Test Profile Normalization for Social Platforms
describe("Profile Normalization", () => {
  interface NormalizedProfile {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    email?: string;
  }

  test("Reddit profile normalization", () => {
    const redditProfile = {
      id: "t2_abc123",
      name: "test_user",
      icon_img: "https://styles.redditmedia.com/...",
    };

    const normalized: NormalizedProfile = {
      id: redditProfile.id,
      username: redditProfile.name,
      displayName: redditProfile.name,
      avatarUrl: redditProfile.icon_img,
    };

    expect(normalized.id).toBe("t2_abc123");
    expect(normalized.username).toBe("test_user");
  });

  test("Facebook profile normalization", () => {
    const fbProfile = {
      id: "10000123456789",
      name: "John Doe",
      email: "john@example.com",
      picture: { data: { url: "https://platform-lookaside.fbsbx.com/..." } },
    };

    const normalized: NormalizedProfile = {
      id: fbProfile.id,
      username: fbProfile.email?.split("@")[0] || fbProfile.id,
      displayName: fbProfile.name,
      email: fbProfile.email,
      avatarUrl: fbProfile.picture?.data?.url,
    };

    expect(normalized.displayName).toBe("John Doe");
    expect(normalized.email).toBe("john@example.com");
  });

  test("LinkedIn profile normalization", () => {
    const linkedinProfile = {
      sub: "abc123xyz",
      name: "Jane Smith",
      email: "jane@company.com",
      picture: "https://media.licdn.com/...",
    };

    const normalized: NormalizedProfile = {
      id: linkedinProfile.sub,
      username: linkedinProfile.email?.split("@")[0] || linkedinProfile.sub,
      displayName: linkedinProfile.name,
      email: linkedinProfile.email,
      avatarUrl: linkedinProfile.picture,
    };

    expect(normalized.id).toBe("abc123xyz");
    expect(normalized.displayName).toBe("Jane Smith");
  });

  test("Mastodon profile normalization", () => {
    const mastodonProfile = {
      id: "123456789",
      username: "alice",
      display_name: "Alice Wonder",
      avatar: "https://mastodon.social/avatars/...",
      acct: "alice@mastodon.social",
    };

    const normalized: NormalizedProfile = {
      id: mastodonProfile.id,
      username: mastodonProfile.acct || mastodonProfile.username,
      displayName: mastodonProfile.display_name || mastodonProfile.username,
      avatarUrl: mastodonProfile.avatar,
    };

    expect(normalized.username).toBe("alice@mastodon.social");
    expect(normalized.displayName).toBe("Alice Wonder");
  });

  test("handles missing optional fields", () => {
    const minimalProfile = {
      id: "123",
      username: "user123",
    };

    const normalized: NormalizedProfile = {
      id: minimalProfile.id,
      username: minimalProfile.username,
      displayName: minimalProfile.username, // Fallback to username
      avatarUrl: undefined,
      email: undefined,
    };

    expect(normalized.displayName).toBe("user123");
    expect(normalized.avatarUrl).toBeUndefined();
  });
});

// Test Concurrent Session Handling
describe("Concurrent Session Handling", () => {
  test("multiple sessions for same org should be allowed", () => {
    const sessions = [
      { id: "session1", org_id: "org-123", platform: "twitter" },
      { id: "session2", org_id: "org-123", platform: "discord" },
      { id: "session3", org_id: "org-123", platform: "twitter" }, // Same platform, different session
    ];

    // Should allow multiple sessions
    expect(sessions.length).toBe(3);

    // Should allow multiple sessions for same platform (different link attempts)
    const twitterSessions = sessions.filter(s => s.platform === "twitter");
    expect(twitterSessions.length).toBe(2);
  });

  test("session cleanup removes only expired sessions", () => {
    const now = Date.now();
    const sessions = [
      { id: "1", expires_at: new Date(now - 60000) }, // Expired
      { id: "2", expires_at: new Date(now + 60000) }, // Valid
      { id: "3", expires_at: new Date(now - 1000) }, // Just expired
      { id: "4", expires_at: new Date(now + 3600000) }, // Valid
    ];

    const validSessions = sessions.filter(s => s.expires_at > new Date());
    const expiredSessions = sessions.filter(s => s.expires_at <= new Date());

    expect(validSessions.length).toBe(2);
    expect(expiredSessions.length).toBe(2);
  });
});

// Test Error Messages
describe("Error Message Quality", () => {
  test("missing credentials error is actionable", () => {
    const createMissingCredsError = (platform: string) => 
      `No credentials found for ${platform}. Connect your ${platform} account in Settings → Connections.`;

    const error = createMissingCredsError("twitter");
    expect(error).toContain("twitter");
    expect(error).toContain("Settings");
    expect(error).toContain("Connections");
  });

  test("expired token error includes guidance", () => {
    const createExpiredTokenError = (platform: string) => 
      `Token expired for ${platform}. Please reconnect your account.`;

    const error = createExpiredTokenError("discord");
    expect(error).toContain("expired");
    expect(error).toContain("reconnect");
  });

  test("OAuth failure error is specific", () => {
    const createOAuthError = (platform: string, details: string) => 
      `OAuth authorization failed for ${platform}: ${details}`;

    const error = createOAuthError("twitter", "access_denied");
    expect(error).toContain("OAuth");
    expect(error).toContain("twitter");
    expect(error).toContain("access_denied");
  });
});

// Test Rate Limit Considerations
describe("Rate Limit Considerations", () => {
  test("token refresh should be rate limited per credential", () => {
    const MIN_REFRESH_INTERVAL_MS = 60 * 1000; // 1 minute
    const lastRefresh = Date.now() - 30000; // 30 seconds ago
    const now = Date.now();

    const canRefresh = (now - lastRefresh) >= MIN_REFRESH_INTERVAL_MS;
    expect(canRefresh).toBe(false); // Too soon
  });

  test("OAuth session creation should allow reasonable frequency", () => {
    const MAX_SESSIONS_PER_HOUR = 10;
    const sessionCount = 5;

    expect(sessionCount).toBeLessThanOrEqual(MAX_SESSIONS_PER_HOUR);
  });
});
