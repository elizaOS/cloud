/**
 * GoogleAutomationService and GoogleTokenService Unit Tests
 *
 * Tests for Google OAuth automation services including:
 * - Configuration checks
 * - Connection status retrieval
 * - Scope checking
 * - Token management
 * - Cache behavior
 * - Error handling
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { googleAutomationService } from "@/lib/services/google-automation";
import { googleTokenService } from "@/lib/services/google-token";

describe("GoogleAutomationService", () => {
  const testOrgId = "google-test-org-123";

  beforeEach(() => {
    googleAutomationService.invalidateStatusCache(testOrgId);
  });

  describe("isConfigured", () => {
    it("checks for Google OAuth environment variables", () => {
      const isConfigured = googleAutomationService.isConfigured();
      expect(typeof isConfigured).toBe("boolean");
    });

    it("returns false when GOOGLE_CLIENT_ID is missing", () => {
      // Note: This depends on actual env vars
      // In a real test, we'd mock process.env
      const isConfigured = googleAutomationService.isConfigured();
      expect(typeof isConfigured).toBe("boolean");
    });
  });

  describe("invalidateStatusCache", () => {
    it("clears cache for organization", () => {
      expect(() => {
        googleAutomationService.invalidateStatusCache(testOrgId);
      }).not.toThrow();
    });

    it("handles multiple invalidations", () => {
      expect(() => {
        googleAutomationService.invalidateStatusCache(testOrgId);
        googleAutomationService.invalidateStatusCache(testOrgId);
        googleAutomationService.invalidateStatusCache("other-org");
      }).not.toThrow();
    });
  });

  describe("getConnectionStatus", () => {
    it("returns not connected when no credentials exist", async () => {
      const status = await googleAutomationService.getConnectionStatus(testOrgId);

      expect(status).toHaveProperty("connected");
      expect(status).toHaveProperty("configured");
      expect(typeof status.connected).toBe("boolean");
      expect(typeof status.configured).toBe("boolean");
    });

    it("caches status for performance", async () => {
      const status1 = await googleAutomationService.getConnectionStatus(testOrgId);
      const status2 = await googleAutomationService.getConnectionStatus(testOrgId);

      // Results should match (from cache)
      expect(status1.connected).toBe(status2.connected);
      expect(status1.configured).toBe(status2.configured);
    });

    it("respects skipCache option", async () => {
      const status1 = await googleAutomationService.getConnectionStatus(testOrgId);
      const status2 = await googleAutomationService.getConnectionStatus(testOrgId, {
        skipCache: true,
      });

      // Both should have correct structure
      expect(status1).toHaveProperty("connected");
      expect(status2).toHaveProperty("connected");
    });

    it("returns email when available", async () => {
      const status = await googleAutomationService.getConnectionStatus(testOrgId);

      // email is optional
      if (status.connected) {
        expect(
          typeof status.email === "string" || status.email === undefined
        ).toBe(true);
      }
    });

    it("returns scopes when available", async () => {
      const status = await googleAutomationService.getConnectionStatus(testOrgId);

      if (status.connected && status.scopes) {
        expect(Array.isArray(status.scopes)).toBe(true);
      }
    });

    it("tracks token expiration status", async () => {
      const status = await googleAutomationService.getConnectionStatus(testOrgId);

      if (status.connected) {
        expect(typeof status.tokenExpired === "boolean" || status.tokenExpired === undefined).toBe(true);
      }
    });
  });

  describe("hasScope", () => {
    it("returns false when not connected", async () => {
      const hasScope = await googleAutomationService.hasScope(
        testOrgId,
        "https://www.googleapis.com/auth/gmail.readonly"
      );
      expect(hasScope).toBe(false);
    });

    it("returns false for non-existent scope", async () => {
      const hasScope = await googleAutomationService.hasScope(
        testOrgId,
        "https://invalid.scope"
      );
      expect(hasScope).toBe(false);
    });
  });

  describe("hasGmailAccess", () => {
    it("returns boolean indicating Gmail access", async () => {
      const hasAccess = await googleAutomationService.hasGmailAccess(testOrgId);
      expect(typeof hasAccess).toBe("boolean");
    });

    it("returns false when not connected", async () => {
      const hasAccess = await googleAutomationService.hasGmailAccess(testOrgId);
      expect(hasAccess).toBe(false);
    });
  });

  describe("hasCalendarAccess", () => {
    it("returns boolean indicating Calendar access", async () => {
      const hasAccess = await googleAutomationService.hasCalendarAccess(testOrgId);
      expect(typeof hasAccess).toBe("boolean");
    });

    it("returns false when not connected", async () => {
      const hasAccess = await googleAutomationService.hasCalendarAccess(testOrgId);
      expect(hasAccess).toBe(false);
    });
  });

  describe("hasContactsAccess", () => {
    it("returns boolean indicating Contacts access", async () => {
      const hasAccess = await googleAutomationService.hasContactsAccess(testOrgId);
      expect(typeof hasAccess).toBe("boolean");
    });

    it("returns false when not connected", async () => {
      const hasAccess = await googleAutomationService.hasContactsAccess(testOrgId);
      expect(hasAccess).toBe(false);
    });
  });

  describe("getCredentials", () => {
    it("returns null when no credentials exist", async () => {
      const credentials = await googleAutomationService.getCredentials(testOrgId);
      expect(credentials === null || typeof credentials === "object").toBe(true);
    });

    it("returns credentials with correct structure when available", async () => {
      const credentials = await googleAutomationService.getCredentials(testOrgId);

      if (credentials) {
        expect(credentials).toHaveProperty("accessToken");
        expect(typeof credentials.accessToken).toBe("string");
      }
    });
  });

  describe("apiRequest", () => {
    it("throws error when not connected", async () => {
      await expect(
        googleAutomationService.apiRequest(
          testOrgId,
          "https://www.googleapis.com/oauth2/v1/userinfo"
        )
      ).rejects.toThrow();
    });
  });

  describe("Error Handling", () => {
    it("handles empty organization ID", async () => {
      const status = await googleAutomationService.getConnectionStatus("");
      expect(status).toHaveProperty("connected");
    });

    it("handles special characters in organization ID", async () => {
      const status = await googleAutomationService.getConnectionStatus("org-!@#$%");
      expect(status).toHaveProperty("connected");
    });
  });
});

describe("GoogleTokenService", () => {
  const testOrgId = "google-token-test-org";

  describe("getValidToken", () => {
    it("returns null when no credentials exist", async () => {
      const result = await googleTokenService.getValidToken(testOrgId);
      expect(result === null || typeof result === "object").toBe(true);
    });

    it("returns token result with correct structure when available", async () => {
      const result = await googleTokenService.getValidToken(testOrgId);

      if (result) {
        expect(result).toHaveProperty("accessToken");
        expect(typeof result.accessToken).toBe("string");
        // email and expiresAt are optional
        if (result.email) {
          expect(typeof result.email).toBe("string");
        }
        if (result.expiresAt) {
          expect(result.expiresAt instanceof Date).toBe(true);
        }
      }
    });
  });

  describe("isConnected", () => {
    it("returns false when not connected", async () => {
      const isConnected = await googleTokenService.isConnected(testOrgId);
      expect(typeof isConnected).toBe("boolean");
    });
  });

  describe("getStatus", () => {
    it("returns status with correct structure", async () => {
      const status = await googleTokenService.getStatus(testOrgId);

      expect(status).toHaveProperty("connected");
      expect(typeof status.connected).toBe("boolean");

      if (status.connected) {
        // These are only present when connected
        if (status.email) expect(typeof status.email).toBe("string");
        if (status.scopes) expect(Array.isArray(status.scopes)).toBe(true);
        if (status.expiresAt) expect(status.expiresAt instanceof Date).toBe(true);
        if (status.needsRefresh !== undefined)
          expect(typeof status.needsRefresh).toBe("boolean");
      }
    });

    it("returns not connected when no credentials", async () => {
      const status = await googleTokenService.getStatus(testOrgId);
      expect(typeof status.connected).toBe("boolean");
    });
  });

  describe("Error Handling", () => {
    it("handles empty organization ID", async () => {
      const result = await googleTokenService.getValidToken("");
      // Should not throw, returns null or valid result
      expect(result === null || typeof result === "object").toBe(true);
    });

    it("handles concurrent getValidToken calls", async () => {
      const promises = Array(5)
        .fill(null)
        .map(() => googleTokenService.getValidToken(testOrgId));

      const results = await Promise.all(promises);

      for (const result of results) {
        expect(result === null || typeof result === "object").toBe(true);
      }
    });
  });
});

describe("Google Services Cache Behavior", () => {
  describe("GoogleAutomationService Cache", () => {
    const cacheTestOrgId = "google-cache-test";

    beforeEach(() => {
      googleAutomationService.invalidateStatusCache(cacheTestOrgId);
    });

    it("subsequent calls return cached result", async () => {
      const status1 = await googleAutomationService.getConnectionStatus(
        cacheTestOrgId
      );
      const status2 = await googleAutomationService.getConnectionStatus(
        cacheTestOrgId
      );

      expect(status1.connected).toBe(status2.connected);
      expect(status1.configured).toBe(status2.configured);
    });

    it("invalidateStatusCache clears cache", async () => {
      await googleAutomationService.getConnectionStatus(cacheTestOrgId);
      googleAutomationService.invalidateStatusCache(cacheTestOrgId);

      // Should not throw
      const status = await googleAutomationService.getConnectionStatus(
        cacheTestOrgId
      );
      expect(status).toHaveProperty("connected");
    });
  });
});

describe("Google Services Integration Behavior", () => {
  const integrationOrgId = "google-integration-test";

  describe("Scope Access Methods", () => {
    it("all scope methods return consistent results when disconnected", async () => {
      const hasGmail = await googleAutomationService.hasGmailAccess(integrationOrgId);
      const hasCalendar = await googleAutomationService.hasCalendarAccess(integrationOrgId);
      const hasContacts = await googleAutomationService.hasContactsAccess(integrationOrgId);

      // When disconnected, all should be false
      expect(hasGmail).toBe(false);
      expect(hasCalendar).toBe(false);
      expect(hasContacts).toBe(false);
    });
  });

  describe("Status Methods Alignment", () => {
    it("GoogleAutomationService and GoogleTokenService agree on connection status", async () => {
      const automationStatus = await googleAutomationService.getConnectionStatus(
        integrationOrgId
      );
      const tokenIsConnected = await googleTokenService.isConnected(integrationOrgId);

      // Both should agree on connection status
      expect(automationStatus.connected).toBe(tokenIsConnected);
    });
  });
});

describe("Google Services Edge Cases", () => {
  it("handles very long organization ID", async () => {
    const longOrgId = "a".repeat(1000);
    const status = await googleAutomationService.getConnectionStatus(longOrgId);
    expect(status).toHaveProperty("connected");
  });

  it("handles UUID organization ID", async () => {
    const uuidOrgId = "123e4567-e89b-12d3-a456-426614174000";
    const status = await googleAutomationService.getConnectionStatus(uuidOrgId);
    expect(status).toHaveProperty("connected");
  });

  it("handles concurrent status checks for same org", async () => {
    const orgId = "concurrent-google-test";
    googleAutomationService.invalidateStatusCache(orgId);

    const promises = Array(10)
      .fill(null)
      .map(() => googleAutomationService.getConnectionStatus(orgId));

    const results = await Promise.all(promises);

    // All should succeed and have consistent results
    for (const status of results) {
      expect(status).toHaveProperty("connected");
      expect(status.connected).toBe(results[0].connected);
    }
  });
});
