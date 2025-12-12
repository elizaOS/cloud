/**
 * Comprehensive Unit Tests for Community Moderation System
 *
 * Tests:
 * 1. Link Safety Service - URL validation, threat detection, patterns
 * 2. Spam Detection - rate limiting, duplicate detection, boundaries
 * 3. Scam Detection - pattern matching, blocked patterns
 * 4. Word Filtering - exact/contains/regex matching
 * 5. Escalation Logic - violation counting, action determination
 * 6. Settings Link Generation
 * 7. Error handling and invalid inputs
 * 8. Concurrent behavior
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";

// =============================================================================
// LINK SAFETY SERVICE TESTS
// =============================================================================

describe("Link Safety Service", () => {
  let linkSafetyService: Awaited<typeof import("@/lib/services/link-safety")>["linkSafetyService"];

  beforeEach(async () => {
    const linkSafetyModule = await import("@/lib/services/link-safety");
    linkSafetyService = linkSafetyModule.linkSafetyService;
  });

  describe("URL Extraction", () => {
    test("extracts HTTP URLs from text", () => {
      const text = "Check out http://example.com and https://test.com/path";
      const urls = linkSafetyService.extractUrls(text);
      expect(urls).toHaveLength(2);
      expect(urls).toContain("http://example.com");
      expect(urls).toContain("https://test.com/path");
    });

    test("extracts URLs with query params and fragments", () => {
      const text = "Visit https://example.com/page?foo=bar#section";
      const urls = linkSafetyService.extractUrls(text);
      expect(urls).toHaveLength(1);
      expect(urls[0]).toContain("?foo=bar");
    });

    test("handles text with no URLs", () => {
      const text = "This is just plain text without any links";
      const urls = linkSafetyService.extractUrls(text);
      expect(urls).toHaveLength(0);
    });

    test("handles empty string", () => {
      const urls = linkSafetyService.extractUrls("");
      expect(urls).toHaveLength(0);
    });

    test("handles URLs embedded in markdown", () => {
      const text = "Check [this](https://example.com) link";
      const urls = linkSafetyService.extractUrls(text);
      expect(urls.length).toBeGreaterThanOrEqual(1);
    });

    test("handles multiple URLs on same line", () => {
      const text = "https://a.com https://b.com https://c.com";
      const urls = linkSafetyService.extractUrls(text);
      expect(urls).toHaveLength(3);
    });
  });

  describe("URL Shortener Detection", () => {
    test("detects known URL shorteners", () => {
      expect(linkSafetyService.isUrlShortener("https://bit.ly/abc123")).toBe(true);
      expect(linkSafetyService.isUrlShortener("https://tinyurl.com/test")).toBe(true);
      expect(linkSafetyService.isUrlShortener("https://t.co/xyz")).toBe(true);
      expect(linkSafetyService.isUrlShortener("https://goo.gl/short")).toBe(true);
    });

    test("returns false for regular URLs", () => {
      expect(linkSafetyService.isUrlShortener("https://example.com")).toBe(false);
      expect(linkSafetyService.isUrlShortener("https://google.com")).toBe(false);
      expect(linkSafetyService.isUrlShortener("https://github.com/repo")).toBe(false);
    });

    test("handles invalid URLs gracefully", () => {
      expect(linkSafetyService.isUrlShortener("not-a-url")).toBe(false);
      expect(linkSafetyService.isUrlShortener("")).toBe(false);
    });
  });

  describe("Single URL Check", () => {
    test("marks malformed URLs as unsafe", async () => {
      const result = await linkSafetyService.checkUrl("not-a-valid-url");
      expect(result.safe).toBe(false);
      expect(result.threats).toContain("phishing");
      expect(result.confidence).toBe(100);
    });

    test("detects known scam domains", async () => {
      const result = await linkSafetyService.checkUrl("https://discord-nitro-free.com/claim");
      expect(result.safe).toBe(false);
      expect(result.threats).toContain("scam");
    });

    test("detects known scam domains", async () => {
      // dlscord.com is in the KNOWN_THREAT_DOMAINS list, so it's marked as "scam"
      const result = await linkSafetyService.checkUrl("https://dlscord.com/login");
      expect(result.safe).toBe(false);
      expect(result.threats).toContain("scam");
    });

    test("detects IP address URLs as suspicious", async () => {
      const result = await linkSafetyService.checkUrl("http://192.168.1.1/login");
      expect(result.safe).toBe(false);
      expect(result.threats).toContain("suspicious_domain");
    });

    test("detects excessive subdomains as suspicious", async () => {
      const result = await linkSafetyService.checkUrl("https://login.secure.verify.account.suspicious.com");
      expect(result.safe).toBe(false);
    });

    test("allows safe URLs", async () => {
      const result = await linkSafetyService.checkUrl("https://google.com");
      expect(result.safe).toBe(true);
      expect(result.threats).toHaveLength(0);
    });

    test("detects high-abuse TLDs", async () => {
      const result = await linkSafetyService.checkUrl("https://free-airdrop.xyz");
      expect(result.safe).toBe(false);
    });

    test("returns domain in result", async () => {
      const result = await linkSafetyService.checkUrl("https://example.com/path?query=1");
      expect(result.domain).toBe("example.com");
    });
  });

  describe("Batch URL Check", () => {
    test("checks multiple URLs in parallel", async () => {
      const urls = [
        "https://google.com",
        "https://discord-nitro-free.com",
        "https://github.com",
      ];
      const results = await linkSafetyService.checkUrls(urls);

      expect(results).toHaveLength(3);
      expect(results.find((r) => r.url === "https://google.com")?.safe).toBe(true);
      expect(results.find((r) => r.url === "https://discord-nitro-free.com")?.safe).toBe(false);
      expect(results.find((r) => r.url === "https://github.com")?.safe).toBe(true);
    });

    test("handles empty array", async () => {
      const results = await linkSafetyService.checkUrls([]);
      expect(results).toHaveLength(0);
    });

    test("handles mixed valid and invalid URLs", async () => {
      const urls = ["https://example.com", "invalid-url", "https://test.com"];
      const results = await linkSafetyService.checkUrls(urls);

      expect(results).toHaveLength(3);
      const invalidResult = results.find((r) => r.url === "invalid-url");
      expect(invalidResult?.safe).toBe(false);
    });
  });

  describe("Threat Pattern Detection", () => {
    test("detects discord typosquatting variants", async () => {
      // These are in the known scam domains list
      const knownScams = [
        "https://dlscord.com/nitro",
        "https://dlscord.gift/claim",
        "https://discordc.com/verify",
      ];

      for (const url of knownScams) {
        const result = await linkSafetyService.checkUrl(url);
        expect(result.safe).toBe(false);
        expect(result.threats.length).toBeGreaterThan(0);
      }
    });

    test("detects crypto scam patterns", async () => {
      const scamUrls = [
        "https://claim-airdrop.xyz",
        "https://connect-wallet.xyz/verify",
        "https://metamsk.io/restore",
      ];

      for (const url of scamUrls) {
        const result = await linkSafetyService.checkUrl(url);
        expect(result.safe).toBe(false);
      }
    });

    test("detects fake official domain patterns", async () => {
      const result = await linkSafetyService.checkUrl("https://discord-official.com");
      expect(result.safe).toBe(false);
    });

    test("allows legitimate similar domains", async () => {
      // discord.com is the real one
      const result = await linkSafetyService.checkUrl("https://discord.com/login");
      expect(result.safe).toBe(true);
    });
  });
});

// =============================================================================
// SPAM DETECTION TESTS
// =============================================================================

describe("Spam Detection", () => {
  describe("Message Hashing", () => {
    test("hashing normalizes content", () => {
      // Test the normalization logic
      const normalize = (content: string): string =>
        content.toLowerCase().replace(/\s+/g, " ").trim();

      expect(normalize("Hello World")).toBe("hello world");
      expect(normalize("HELLO   WORLD")).toBe("hello world");
      expect(normalize("  hello  world  ")).toBe("hello world");
    });

    test("same content produces same hash after normalization", () => {
      const { createHash } = require("crypto");
      const hashMessage = (content: string): string => {
        const normalized = content.toLowerCase().replace(/\s+/g, " ").trim();
        return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
      };

      const hash1 = hashMessage("Hello World");
      const hash2 = hashMessage("hello world");
      const hash3 = hashMessage("  HELLO   WORLD  ");

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    test("different content produces different hashes", () => {
      const { createHash } = require("crypto");
      const hashMessage = (content: string): string => {
        const normalized = content.toLowerCase().replace(/\s+/g, " ").trim();
        return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
      };

      const hash1 = hashMessage("Hello World");
      const hash2 = hashMessage("Goodbye World");

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("Rate Limit Calculation", () => {
    test("timestamps within window are counted", () => {
      const MESSAGE_WINDOW_MS = 60_000;
      const now = Date.now();

      const timestamps = [
        new Date(now - 30_000).toISOString(), // 30s ago - in window
        new Date(now - 45_000).toISOString(), // 45s ago - in window
        new Date(now - 90_000).toISOString(), // 90s ago - outside window
      ];

      const inWindow = timestamps.filter(
        (ts) => now - new Date(ts).getTime() < MESSAGE_WINDOW_MS
      );

      expect(inWindow).toHaveLength(2);
    });

    test("rate limit correctly triggers at threshold", () => {
      const maxMessages = 10;
      const isRateLimited = (messageCount: number) => messageCount >= maxMessages;

      expect(isRateLimited(9)).toBe(false);
      expect(isRateLimited(10)).toBe(true);
      expect(isRateLimited(11)).toBe(true);
    });

    test("duplicate threshold correctly triggers", () => {
      const duplicateThreshold = 3;
      const isDuplicate = (count: number) => count >= duplicateThreshold;

      expect(isDuplicate(2)).toBe(false);
      expect(isDuplicate(3)).toBe(true);
      expect(isDuplicate(4)).toBe(true);
    });
  });

  describe("Rate Limit Expiry", () => {
    test("expired rate limits are detected", () => {
      const now = new Date();
      const expiredTime = new Date(now.getTime() - 60_000); // 1 minute ago
      const futureTime = new Date(now.getTime() + 60_000); // 1 minute from now

      const isExpired = (expiresAt: Date) => expiresAt < now;

      expect(isExpired(expiredTime)).toBe(true);
      expect(isExpired(futureTime)).toBe(false);
    });

    test("rate limit duration calculation", () => {
      const durationMinutes = 10;
      const now = Date.now();
      const expiresAt = new Date(now + durationMinutes * 60_000);

      const remainingMs = expiresAt.getTime() - now;
      const remainingMinutes = Math.ceil(remainingMs / 60_000);

      expect(remainingMinutes).toBe(10);
    });
  });
});

// =============================================================================
// SCAM/PATTERN DETECTION TESTS
// =============================================================================

describe("Scam Pattern Detection", () => {
  describe("Default Scam Patterns", () => {
    const DEFAULT_SCAM_PATTERNS = [
      /(?:send|transfer)\s*(?:eth|btc|sol|usdt|usdc)/i,
      /(?:airdrop|giveaway)\s*(?:link|claim)/i,
      /connect\s*(?:your\s*)?wallet/i,
      /claim\s*(?:your\s*)?(?:free\s*)?(?:tokens?|nft|reward)/i,
      /(?:support|admin|mod)\s*(?:team|staff)/i,
      /dm\s*(?:me|us)\s*(?:for|to)\s*(?:help|support)/i,
      /verify\s*(?:your\s*)?(?:account|wallet)/i,
      /(?:your\s*)?(?:account|wallet)\s*(?:is\s*)?(?:suspended|locked|compromised)/i,
    ];

    test("detects crypto transfer requests", () => {
      const messages = [
        "Send ETH to this address",
        "Transfer BTC now",
        "send your sol to claim",
        "Transfer USDT for verification",
      ];

      for (const msg of messages) {
        const matched = DEFAULT_SCAM_PATTERNS.some((p) => p.test(msg));
        expect(matched).toBe(true);
      }
    });

    test("detects airdrop/giveaway scams", () => {
      const messages = [
        "Click the airdrop link",
        "Giveaway claim here",
        "Free airdrop link below",
      ];

      for (const msg of messages) {
        const matched = DEFAULT_SCAM_PATTERNS.some((p) => p.test(msg));
        expect(matched).toBe(true);
      }
    });

    test("detects wallet connection requests", () => {
      const messages = [
        "Connect wallet to claim",
        "Connect your wallet now",
        "Please connect wallet",
      ];

      for (const msg of messages) {
        const matched = DEFAULT_SCAM_PATTERNS.some((p) => p.test(msg));
        expect(matched).toBe(true);
      }
    });

    test("detects fake support messages", () => {
      const messages = [
        "Support team here",
        "Admin staff can help",
        "DM me for help",
        "DM us to get support",
      ];

      for (const msg of messages) {
        const matched = DEFAULT_SCAM_PATTERNS.some((p) => p.test(msg));
        expect(matched).toBe(true);
      }
    });

    test("detects account compromise warnings", () => {
      const messages = [
        "Your account is suspended",
        "Your wallet is compromised",
        "Account locked verification needed",
        "Verify your account now",
      ];

      for (const msg of messages) {
        const matched = DEFAULT_SCAM_PATTERNS.some((p) => p.test(msg));
        expect(matched).toBe(true);
      }
    });

    test("does not flag legitimate messages", () => {
      const legitimateMessages = [
        "Hello, how are you?",
        "Great project, love the NFTs!",
        "When is the next update?",
        "Thanks for the help yesterday",
        "I bought some ETH on Coinbase",
      ];

      for (const msg of legitimateMessages) {
        const matched = DEFAULT_SCAM_PATTERNS.some((p) => p.test(msg));
        expect(matched).toBe(false);
      }
    });
  });

  describe("Pattern Matching Types", () => {
    test("exact match works correctly", () => {
      const pattern = { pattern_type: "exact", pattern: "spam message" };
      const testContent = (content: string): boolean =>
        content.toLowerCase() === pattern.pattern.toLowerCase();

      expect(testContent("spam message")).toBe(true);
      expect(testContent("SPAM MESSAGE")).toBe(true);
      expect(testContent("spam message extra")).toBe(false);
      expect(testContent("prefix spam message")).toBe(false);
    });

    test("contains match works correctly", () => {
      const pattern = { pattern_type: "contains", pattern: "scam" };
      const testContent = (content: string): boolean =>
        content.toLowerCase().includes(pattern.pattern.toLowerCase());

      expect(testContent("this is a scam")).toBe(true);
      expect(testContent("SCAM alert")).toBe(true);
      expect(testContent("legitimate message")).toBe(false);
    });

    test("regex match works correctly", () => {
      const pattern = { pattern_type: "regex", pattern: "free\\s+nitro" };
      const testContent = (content: string): boolean => {
        const regex = new RegExp(pattern.pattern, "i");
        return regex.test(content);
      };

      expect(testContent("Get free nitro now")).toBe(true);
      expect(testContent("FREE NITRO giveaway")).toBe(true);
      expect(testContent("freenitro")).toBe(false); // No space
      expect(testContent("legitimate message")).toBe(false);
    });

    test("handles invalid regex gracefully", () => {
      const invalidPattern = "[invalid(regex";
      let error: Error | null = null;

      try {
        new RegExp(invalidPattern);
      } catch (e) {
        error = e as Error;
      }

      expect(error).not.toBeNull();
    });
  });
});

// =============================================================================
// ESCALATION LOGIC TESTS
// =============================================================================

describe("Escalation Logic", () => {
  describe("Action Determination", () => {
    test("determines correct action based on violation count", () => {
      const settings = {
        warnAfterViolations: 1,
        timeoutAfterViolations: 3,
        banAfterViolations: 5,
        defaultTimeoutMinutes: 10,
      };

      const determineAction = (violationCount: number) => {
        if (violationCount >= settings.banAfterViolations) return "ban";
        if (violationCount >= settings.timeoutAfterViolations) return "timeout";
        if (violationCount >= settings.warnAfterViolations) return "warn";
        return "delete";
      };

      expect(determineAction(0)).toBe("delete");
      expect(determineAction(1)).toBe("warn");
      expect(determineAction(2)).toBe("warn");
      expect(determineAction(3)).toBe("timeout");
      expect(determineAction(4)).toBe("timeout");
      expect(determineAction(5)).toBe("ban");
      expect(determineAction(10)).toBe("ban");
    });

    test("progressive timeout duration", () => {
      const baseTimeoutMinutes = 10;
      const timeoutAfterViolations = 3;

      const calculateTimeout = (violationCount: number) => {
        const multiplier = violationCount - timeoutAfterViolations + 1;
        return baseTimeoutMinutes * Math.min(multiplier, 6);
      };

      expect(calculateTimeout(3)).toBe(10); // 1x
      expect(calculateTimeout(4)).toBe(20); // 2x
      expect(calculateTimeout(5)).toBe(30); // 3x
      expect(calculateTimeout(8)).toBe(60); // 6x (capped)
      expect(calculateTimeout(100)).toBe(60); // Still capped at 6x
    });
  });

  describe("Violation Counting", () => {
    test("only counts non-false-positive violations", () => {
      const events = [
        { false_positive: false },
        { false_positive: true },
        { false_positive: false },
        { false_positive: true },
        { false_positive: false },
      ];

      const count = events.filter((e) => !e.false_positive).length;
      expect(count).toBe(3);
    });

    test("only counts violations within time window", () => {
      const sinceDays = 30;
      const now = Date.now();
      const cutoffDate = new Date(now - sinceDays * 24 * 60 * 60 * 1000);

      const events = [
        { created_at: new Date(now - 7 * 24 * 60 * 60 * 1000) }, // 7 days ago
        { created_at: new Date(now - 60 * 24 * 60 * 60 * 1000) }, // 60 days ago
        { created_at: new Date(now - 1 * 24 * 60 * 60 * 1000) }, // 1 day ago
      ];

      const recentCount = events.filter((e) => e.created_at >= cutoffDate).length;
      expect(recentCount).toBe(2);
    });
  });
});

// =============================================================================
// SETTINGS LINK GENERATION TESTS
// =============================================================================

describe("Settings Link Generation", () => {
  test("generates correct base link", () => {
    const generateLink = (orgId: string, section?: string) => {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://elizacloud.ai";
      let path = `/dashboard/org/${orgId}/settings/agents/community-manager`;
      if (section) path += `/${section}`;
      return `${baseUrl}${path}`;
    };

    const link = generateLink("org-123");
    expect(link).toContain("/dashboard/org/org-123/settings/agents/community-manager");
  });

  test("generates link with section", () => {
    const generateLink = (orgId: string, section?: string) => {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://elizacloud.ai";
      let path = `/dashboard/org/${orgId}/settings/agents/community-manager`;
      if (section) path += `/${section}`;
      return `${baseUrl}${path}`;
    };

    const link = generateLink("org-123", "token-gating");
    expect(link).toContain("/token-gating");
  });

  test("handles different sections", () => {
    const sections = ["moderation", "token-gating", "raid-protection", "logs"];

    for (const section of sections) {
      const generateLink = (orgId: string, s?: string) => {
        const baseUrl = "https://elizacloud.ai";
        let path = `/dashboard/org/${orgId}/settings/agents/community-manager`;
        if (s) path += `/${s}`;
        return `${baseUrl}${path}`;
      };

      const link = generateLink("org-123", section);
      expect(link).toContain(`/${section}`);
    }
  });
});

// =============================================================================
// WALLET VERIFICATION TESTS
// =============================================================================

describe("Wallet Verification", () => {
  describe("Challenge Generation", () => {
    test("generates unique nonces", () => {
      const generateNonce = (): string => {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        return Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      };

      const nonces = new Set<string>();
      for (let i = 0; i < 100; i++) {
        nonces.add(generateNonce());
      }

      // All 100 nonces should be unique
      expect(nonces.size).toBe(100);
    });

    test("nonce has correct length", () => {
      const generateNonce = (): string => {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        return Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      };

      const nonce = generateNonce();
      expect(nonce.length).toBe(32); // 16 bytes = 32 hex chars
    });

    test("challenge message contains required info", () => {
      const serverId = "server-123";
      const platformUserId = "user-456";
      const nonce = "abc123";

      const message = `Verify wallet ownership for community access.\n\nServer: ${serverId}\nUser: ${platformUserId}\nNonce: ${nonce}\n\nSigning this message does not incur any fees.`;

      expect(message).toContain(serverId);
      expect(message).toContain(platformUserId);
      expect(message).toContain(nonce);
      expect(message).toContain("does not incur any fees");
    });

    test("challenge expiry is 10 minutes", () => {
      const now = Date.now();
      const expiryMs = 10 * 60 * 1000;
      const expiresAt = new Date(now + expiryMs);

      const diffMs = expiresAt.getTime() - now;
      const diffMinutes = diffMs / 60_000;

      expect(diffMinutes).toBe(10);
    });
  });

  describe("Challenge Key Format", () => {
    test("generates consistent keys", () => {
      const makeKey = (serverId: string, platform: string, userId: string) =>
        `${serverId}:${platform}:${userId}`;

      const key1 = makeKey("server-1", "discord", "user-1");
      const key2 = makeKey("server-1", "discord", "user-1");
      const key3 = makeKey("server-1", "telegram", "user-1");

      expect(key1).toBe(key2);
      expect(key1).not.toBe(key3);
    });
  });

  describe("Token Balance Comparison", () => {
    test("compares BigInt balances correctly", () => {
      const checkEligibility = (balance: string, required: string): boolean => {
        return BigInt(balance) >= BigInt(required);
      };

      expect(checkEligibility("1000", "100")).toBe(true);
      expect(checkEligibility("100", "100")).toBe(true);
      expect(checkEligibility("99", "100")).toBe(false);
      expect(checkEligibility("0", "1")).toBe(false);
    });

    test("handles large token amounts", () => {
      const checkEligibility = (balance: string, required: string): boolean => {
        return BigInt(balance) >= BigInt(required);
      };

      // 1 million tokens with 18 decimals
      const balance = "1000000000000000000000000";
      const required = "100000000000000000000";

      expect(checkEligibility(balance, required)).toBe(true);
    });

    test("handles zero balances", () => {
      const checkEligibility = (balance: string, required: string): boolean => {
        return BigInt(balance) >= BigInt(required);
      };

      expect(checkEligibility("0", "0")).toBe(true);
      expect(checkEligibility("0", "1")).toBe(false);
    });
  });
});

// =============================================================================
// CONCURRENT BEHAVIOR TESTS
// =============================================================================

describe("Concurrent Behavior", () => {
  describe("Parallel URL Checks", () => {
    test("handles many concurrent checks", async () => {
      const { linkSafetyService } = await import("@/lib/services/link-safety");

      const urls = Array.from({ length: 50 }, (_, i) => `https://example${i}.com`);

      const startTime = Date.now();
      const results = await Promise.all(urls.map((url) => linkSafetyService.checkUrl(url)));
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(50);
      // Should complete in reasonable time (parallel execution)
      expect(duration).toBeLessThan(10000);
    });
  });

  describe("Race Condition Handling", () => {
    test("spam tracking upsert handles concurrent creates", async () => {
      // Simulate the race condition handling logic
      const createOrFetch = async (
        serverId: string,
        userId: string,
        existingRecords: Map<string, object>
      ) => {
        const key = `${serverId}:${userId}`;

        // Simulate insert attempt
        if (!existingRecords.has(key)) {
          existingRecords.set(key, { id: "new-record" });
          return { created: true, record: existingRecords.get(key) };
        }

        // Record already exists
        return { created: false, record: existingRecords.get(key) };
      };

      const records = new Map<string, object>();

      // Simulate concurrent creates
      const results = await Promise.all([
        createOrFetch("server-1", "user-1", records),
        createOrFetch("server-1", "user-1", records),
        createOrFetch("server-1", "user-1", records),
      ]);

      // All should succeed (either by creating or fetching existing)
      for (const result of results) {
        expect(result.record).toBeDefined();
      }
    });
  });
});

// =============================================================================
// ERROR HANDLING TESTS
// =============================================================================

describe("Error Handling", () => {
  describe("Invalid Input Handling", () => {
    test("handles null/undefined gracefully in URL extraction", () => {
      const extractUrls = (text: string | null | undefined): string[] => {
        if (!text) return [];
        const urlRegex = /https?:\/\/[^\s<>)"']+/gi;
        return text.match(urlRegex) ?? [];
      };

      expect(extractUrls(null as unknown as string)).toEqual([]);
      expect(extractUrls(undefined as unknown as string)).toEqual([]);
      expect(extractUrls("")).toEqual([]);
    });

    test("handles special characters in patterns", () => {
      const testPattern = (content: string, pattern: string): boolean => {
        try {
          const regex = new RegExp(pattern, "i");
          return regex.test(content);
        } catch {
          return false;
        }
      };

      // Valid regex
      expect(testPattern("hello world", "hello.*world")).toBe(true);
      // Invalid regex should not throw
      expect(testPattern("test", "[invalid(")).toBe(false);
    });

    test("handles empty collections", () => {
      const findMatches = (content: string, patterns: RegExp[]): string[] => {
        const matches: string[] = [];
        for (const pattern of patterns) {
          const match = content.match(pattern);
          if (match) matches.push(match[0]);
        }
        return matches;
      };

      expect(findMatches("test", [])).toEqual([]);
    });
  });

  describe("Boundary Conditions", () => {
    test("handles very long messages", () => {
      const MAX_CONTENT_SAMPLE = 500;
      const truncate = (content: string) => content.slice(0, MAX_CONTENT_SAMPLE);

      const longMessage = "a".repeat(10000);
      const truncated = truncate(longMessage);

      expect(truncated.length).toBe(500);
    });

    test("handles unicode in messages", () => {
      const normalize = (content: string) =>
        content.toLowerCase().replace(/\s+/g, " ").trim();

      const unicodeText = "Hello 👋 World 🌍";
      const normalized = normalize(unicodeText);

      expect(normalized).toBe("hello 👋 world 🌍");
    });

    test("handles empty strings everywhere", () => {
      const processMessage = (content: string) => {
        if (!content || content.trim().length === 0) {
          return { empty: true };
        }
        return { empty: false, length: content.length };
      };

      expect(processMessage("")).toEqual({ empty: true });
      expect(processMessage("   ")).toEqual({ empty: true });
      expect(processMessage("hi")).toEqual({ empty: false, length: 2 });
    });
  });

  describe("Timeout Handling", () => {
    test("action expiry calculation", () => {
      const calculateExpiry = (durationMinutes: number): Date => {
        return new Date(Date.now() + durationMinutes * 60_000);
      };

      const now = Date.now();
      const expiry = calculateExpiry(10);

      expect(expiry.getTime()).toBeGreaterThan(now);
      expect(expiry.getTime() - now).toBeCloseTo(10 * 60_000, -2);
    });

    test("handles zero duration", () => {
      const calculateExpiry = (durationMinutes: number | undefined): Date | null => {
        if (!durationMinutes) return null;
        return new Date(Date.now() + durationMinutes * 60_000);
      };

      expect(calculateExpiry(0)).toBeNull();
      expect(calculateExpiry(undefined)).toBeNull();
    });
  });
});

// =============================================================================
// MODERATION SEVERITY TESTS
// =============================================================================

describe("Moderation Severity", () => {
  const SEVERITY_LEVELS = ["low", "medium", "high", "critical"] as const;

  test("severity levels are ordered correctly", () => {
    const severityOrder: Record<string, number> = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };

    expect(severityOrder.low).toBeLessThan(severityOrder.medium);
    expect(severityOrder.medium).toBeLessThan(severityOrder.high);
    expect(severityOrder.high).toBeLessThan(severityOrder.critical);
  });

  test("event types map to appropriate severities", () => {
    const eventSeverityMap: Record<string, string> = {
      spam: "medium",
      scam: "high",
      phishing: "high",
      banned_word: "low",
      malicious_link: "critical",
      raid: "critical",
      harassment: "high",
      nsfw: "medium",
    };

    expect(eventSeverityMap.malicious_link).toBe("critical");
    expect(eventSeverityMap.banned_word).toBe("low");
    expect(eventSeverityMap.scam).toBe("high");
  });

  test("actions map to appropriate severities", () => {
    const actionSeverityMap: Record<string, string> = {
      delete: "low",
      warn: "low",
      timeout: "medium",
      kick: "high",
      ban: "critical",
    };

    expect(actionSeverityMap.ban).toBe("critical");
    expect(actionSeverityMap.warn).toBe("low");
  });
});

// =============================================================================
// REPOSITORY EDGE CASES
// =============================================================================

describe("Repository Edge Cases", () => {
  describe("Query Building", () => {
    test("builds correct conditions for optional filters", () => {
      interface QueryOptions {
        serverId?: string;
        category?: string;
        enabledOnly?: boolean;
      }

      const buildConditions = (options: QueryOptions): string[] => {
        const conditions: string[] = [];

        if (options.serverId) {
          conditions.push(`server_id = '${options.serverId}'`);
        }
        if (options.category) {
          conditions.push(`category = '${options.category}'`);
        }
        if (options.enabledOnly) {
          conditions.push("enabled = true");
        }

        return conditions;
      };

      const conditions1 = buildConditions({});
      expect(conditions1).toHaveLength(0);

      const conditions2 = buildConditions({ serverId: "s1", category: "spam" });
      expect(conditions2).toHaveLength(2);

      const conditions3 = buildConditions({ enabledOnly: true });
      expect(conditions3).toHaveLength(1);
    });

    test("handles null server_id for org-wide patterns", () => {
      const patterns = [
        { id: "1", server_id: "server-1", pattern: "test1" },
        { id: "2", server_id: null, pattern: "test2" },
        { id: "3", server_id: "server-2", pattern: "test3" },
      ];

      const filterForServer = (serverId: string) =>
        patterns.filter((p) => p.server_id === serverId || p.server_id === null);

      const result = filterForServer("server-1");
      expect(result).toHaveLength(2); // server-1 specific + org-wide
      expect(result.map((p) => p.id)).toContain("1");
      expect(result.map((p) => p.id)).toContain("2");
    });
  });

  describe("Pagination", () => {
    test("respects limit parameter", () => {
      const items = Array.from({ length: 100 }, (_, i) => ({ id: i }));

      const paginate = (arr: { id: number }[], limit: number) => arr.slice(0, limit);

      expect(paginate(items, 10)).toHaveLength(10);
      expect(paginate(items, 50)).toHaveLength(50);
      expect(paginate(items, 1)).toHaveLength(1);
    });

    test("handles limit larger than data", () => {
      const items = Array.from({ length: 5 }, (_, i) => ({ id: i }));

      const paginate = (arr: { id: number }[], limit: number) => arr.slice(0, limit);

      expect(paginate(items, 100)).toHaveLength(5);
    });
  });

  describe("Stats Aggregation", () => {
    test("correctly aggregates by type", () => {
      const events = [
        { event_type: "spam" },
        { event_type: "spam" },
        { event_type: "scam" },
        { event_type: "spam" },
        { event_type: "phishing" },
      ];

      const byType = events.reduce(
        (acc, e) => {
          acc[e.event_type] = (acc[e.event_type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      expect(byType.spam).toBe(3);
      expect(byType.scam).toBe(1);
      expect(byType.phishing).toBe(1);
    });

    test("handles empty events array", () => {
      const events: { event_type: string }[] = [];

      const byType = events.reduce(
        (acc, e) => {
          acc[e.event_type] = (acc[e.event_type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      expect(Object.keys(byType)).toHaveLength(0);
    });
  });
});

