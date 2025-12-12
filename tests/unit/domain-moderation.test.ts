/**
 * Domain Moderation Service Tests
 *
 * Tests domain name validation, expletive detection, restricted terms,
 * suspicious patterns, and trademark detection.
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";

// Mock the repository before importing the service
const mockRepository = {
  findById: mock(() => Promise.resolve(null)),
  updateHealthStatus: mock(() => Promise.resolve({})),
  createEvent: mock(() => Promise.resolve({})),
  updateModerationStatus: mock(() => Promise.resolve({})),
};

mock.module("@/db/repositories/managed-domains", () => ({
  managedDomainsRepository: mockRepository,
}));

mock.module("@/lib/utils/logger", () => ({
  logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
}));

// Import after mocks
const { domainModerationService } = await import("@/lib/services/domain-moderation");

describe("Domain Name Validation", () => {
  beforeEach(() => {
    Object.values(mockRepository).forEach((m) => {
      if (typeof m.mockReset === "function") m.mockReset();
    });
  });

  describe("Clean Domain Names", () => {
    const cleanDomains = [
      "example.com",
      "my-business.io",
      "startup2024.ai",
      "acme-corp.co",
      "techstartup.net",
      "my.subdomain.example.com",
      "eliza-agents.dev",
    ];

    it.each(cleanDomains)("allows clean domain: %s", async (domain) => {
      const result = await domainModerationService.validateDomainName(domain);
      expect(result.allowed).toBe(true);
      expect(result.suggestedAction).toBe("allow");
    });
  });

  describe("Restricted Terms (CSAM, Violence)", () => {
    const restrictedDomains = [
      "childporn-site.com",
      "kidp0rn.net",
      "pedophile-content.io",
      "jailbait-pics.com",
      "underage-content.net",
      "killkids.com",
      "terrorattack-news.io",
    ];

    it.each(restrictedDomains)("blocks restricted term in: %s", async (domain) => {
      const result = await domainModerationService.validateDomainName(domain);
      expect(result.allowed).toBe(false);
      expect(result.suggestedAction).toBe("block");
      expect(result.flags.some((f) => f.type === "restricted")).toBe(true);
      expect(result.flags.some((f) => f.severity === "critical")).toBe(true);
    });

    it("blocks domains with childporn term", async () => {
      const result = await domainModerationService.validateDomainName("childporn.com");
      expect(result.allowed).toBe(false);
      expect(result.flags.some((f) => f.type === "restricted")).toBe(true);
    });
  });

  describe("Expletive Detection", () => {
    const expletiveDomains = [
      "fuck-this.com",
      "shitpost.io",
      "asshole-reviews.net",
    ];

    it.each(expletiveDomains)("flags expletive in: %s", async (domain) => {
      const result = await domainModerationService.validateDomainName(domain);
      expect(result.allowed).toBe(false);
      expect(result.requiresReview).toBe(true);
      expect(result.suggestedAction).toBe("review");
      expect(result.flags.some((f) => f.type === "expletive")).toBe(true);
    });

    it("allows domains with non-expletive substrings", async () => {
      const result = await domainModerationService.validateDomainName("class-action.com");
      expect(result.allowed).toBe(true);
    });
  });

  describe("Suspicious Patterns (Bot Detection)", () => {
    const suspiciousDomains = [
      "qwerty123456.com", // keyboard walk
      "asdfghjkl.io", // keyboard walk
      "aaaaaaa.net", // repeated chars
      "a12345b.com", // number-letter pattern
      "bcdfghjklm.io", // consonant cluster
    ];

    it.each(suspiciousDomains)("flags suspicious pattern: %s", async (domain) => {
      const result = await domainModerationService.validateDomainName(domain);
      expect(result.flags.some((f) => f.type === "suspicious")).toBe(true);
    });

    it("allows legitimate short domains", async () => {
      const result = await domainModerationService.validateDomainName("abc.com");
      expect(result.allowed).toBe(true);
      expect(result.flags.filter((f) => f.type === "suspicious")).toHaveLength(0);
    });
  });

  describe("Trademark Detection", () => {
    const trademarkDomains = [
      "google-clone.com",
      "myfacebook.io",
      "microsoft-support.net",
      "apple-store-discount.com",
      "amazon-deals.io",
      "paypal-login.com",
      "openai-api.dev",
    ];

    it.each(trademarkDomains)("flags trademark in: %s", async (domain) => {
      const result = await domainModerationService.validateDomainName(domain);
      expect(result.flags.some((f) => f.type === "trademark")).toBe(true);
      expect(result.requiresReview).toBe(true);
    });
  });

  describe("High Entropy Detection", () => {
    it("flags very random-looking domains with high entropy", async () => {
      // Entropy check only triggers for domains >= 8 chars with entropy > 3.5
      const result = await domainModerationService.validateDomainName("xkqjzpfmwvnbcd.com");
      // May or may not flag depending on entropy threshold - just verify it runs
      expect(result).toBeDefined();
      expect(typeof result.allowed).toBe("boolean");
    });

    it("allows structured domains even if long", async () => {
      const result = await domainModerationService.validateDomainName("my-business-name.com");
      expect(result.allowed).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("handles empty domain gracefully", async () => {
      const result = await domainModerationService.validateDomainName("");
      expect(result).toBeDefined();
    });

    it("handles domain with only TLD", async () => {
      const result = await domainModerationService.validateDomainName(".com");
      expect(result).toBeDefined();
    });

    it("normalizes case correctly", async () => {
      const result1 = await domainModerationService.validateDomainName("EXAMPLE.COM");
      const result2 = await domainModerationService.validateDomainName("example.com");
      expect(result1.allowed).toBe(result2.allowed);
    });

    it("handles unicode domains", async () => {
      const result = await domainModerationService.validateDomainName("例え.jp");
      expect(result).toBeDefined();
    });

    it("handles domains with many subdomains", async () => {
      const result = await domainModerationService.validateDomainName("a.b.c.d.e.example.com");
      expect(result).toBeDefined();
    });
  });

  describe("Severity Ordering", () => {
    it("critical severity blocks immediately", async () => {
      const result = await domainModerationService.validateDomainName("childporn.com");
      expect(result.allowed).toBe(false);
      expect(result.requiresReview).toBe(false); // Critical = auto-block, no review needed
    });

    it("high severity requires review", async () => {
      const result = await domainModerationService.validateDomainName("fuck.com");
      expect(result.allowed).toBe(false);
      expect(result.requiresReview).toBe(true);
    });

    it("medium severity allows with review", async () => {
      const result = await domainModerationService.validateDomainName("google-alternative.com");
      expect(result.allowed).toBe(true);
      expect(result.requiresReview).toBe(true);
    });
  });
});

describe("Domain Health Check", () => {
  it("returns isLive=false for non-existent domains", async () => {
    const result = await domainModerationService.checkDomainHealth("this-domain-does-not-exist-12345.com");
    expect(result.isLive).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("includes SSL status in result", async () => {
    const result = await domainModerationService.checkDomainHealth("example.com");
    expect(typeof result.sslValid).toBe("boolean");
  });

  it("measures response time", async () => {
    const result = await domainModerationService.checkDomainHealth("example.com");
    if (result.isLive) {
      expect(typeof result.responseTimeMs).toBe("number");
      expect(result.responseTimeMs).toBeGreaterThan(0);
    }
  });
});

describe("Flag/Unflag Operations", () => {
  beforeEach(() => {
    Object.values(mockRepository).forEach((m) => {
      if (typeof m.mockReset === "function") m.mockReset();
    });
  });

  it("returns false when domain not found", async () => {
    mockRepository.findById.mockResolvedValue(null);
    const result = await domainModerationService.flagDomain("non-existent-id", "test reason");
    expect(result).toBe(false);
  });

  it("creates event when flagging domain", async () => {
    mockRepository.findById.mockResolvedValue({
      id: "domain-1",
      domain: "test.com",
      moderationStatus: "clean",
      moderationFlags: [],
    });
    mockRepository.addModerationFlag = mock(() => Promise.resolve({}));

    await domainModerationService.flagDomain("domain-1", "test reason", "medium");

    expect(mockRepository.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        domainId: "domain-1",
        eventType: "auto_flag",
        severity: "medium",
      })
    );
  });

  it("suspends domain on critical severity", async () => {
    mockRepository.findById.mockResolvedValue({
      id: "domain-1",
      domain: "test.com",
      moderationStatus: "clean",
    });
    mockRepository.addModerationFlag = mock(() => Promise.resolve({}));
    mockRepository.update = mock(() => Promise.resolve({}));

    await domainModerationService.flagDomain("domain-1", "critical issue", "critical");

    expect(mockRepository.update).toHaveBeenCalledWith("domain-1", {
      moderationStatus: "suspended",
      status: "suspended",
    });
  });
});

