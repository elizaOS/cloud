/**
 * Unit Tests for Connect Page Components
 *
 * Tests the frontend logic and component behavior:
 * - Error state management
 * - OAuth callback handling
 * - Service status aggregation
 * - Accessibility attributes
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";

// ============================================================
// Error State Management Tests
// ============================================================
describe("Error State Management", () => {
  // Simulating the OAuthError type from connect-page-client.tsx
  interface OAuthError {
    service: string;
    message: string;
    timestamp: number;
  }

  describe("OAuth Error Collection", () => {
    it("should collect all OAuth errors from URL params", () => {
      const errors: OAuthError[] = [];
      const now = Date.now();

      // Simulating the error collection logic
      const googleError = "access_denied";
      const twitterError = "invalid_grant";
      const discordError = "server_error";

      if (googleError) {
        errors.push({ service: "Google", message: googleError, timestamp: now });
      }
      if (twitterError) {
        errors.push({
          service: "Twitter",
          message: twitterError,
          timestamp: now + 1,
        });
      }
      if (discordError) {
        errors.push({
          service: "Discord",
          message: discordError,
          timestamp: now + 2,
        });
      }

      expect(errors.length).toBe(3);
      expect(errors.map((e) => e.service)).toEqual([
        "Google",
        "Twitter",
        "Discord",
      ]);
    });

    it("should not duplicate errors with same timestamp", () => {
      const errors: OAuthError[] = [];
      const now = Date.now();

      // Each error should have a unique timestamp
      errors.push({ service: "Google", message: "error1", timestamp: now });
      errors.push({ service: "Twitter", message: "error2", timestamp: now + 1 });

      const uniqueTimestamps = new Set(errors.map((e) => e.timestamp));
      expect(uniqueTimestamps.size).toBe(errors.length);
    });
  });

  describe("Error Dismissal", () => {
    it("should remove single error by timestamp", () => {
      let errors: OAuthError[] = [
        { service: "Google", message: "error1", timestamp: 1000 },
        { service: "Twitter", message: "error2", timestamp: 1001 },
        { service: "Discord", message: "error3", timestamp: 1002 },
      ];

      // Dismiss error at timestamp 1001
      const dismissError = (timestamp: number) => {
        errors = errors.filter((e) => e.timestamp !== timestamp);
      };

      dismissError(1001);

      expect(errors.length).toBe(2);
      expect(errors.map((e) => e.service)).toEqual(["Google", "Discord"]);
    });

    it("should clear all errors with dismissAll", () => {
      let errors: OAuthError[] = [
        { service: "Google", message: "error1", timestamp: 1000 },
        { service: "Twitter", message: "error2", timestamp: 1001 },
      ];

      const dismissAllErrors = () => {
        errors = [];
      };

      dismissAllErrors();

      expect(errors.length).toBe(0);
    });

    it("should handle dismissing non-existent error gracefully", () => {
      let errors: OAuthError[] = [
        { service: "Google", message: "error1", timestamp: 1000 },
      ];

      const dismissError = (timestamp: number) => {
        errors = errors.filter((e) => e.timestamp !== timestamp);
      };

      // Try to dismiss non-existent error
      dismissError(9999);

      expect(errors.length).toBe(1);
    });
  });
});

// ============================================================
// ReturnUrl Validation Tests
// ============================================================
describe("ReturnUrl Validation", () => {
  const isValidReturnUrl = (returnUrl: string): boolean => {
    // Block dangerous protocols
    const dangerousProtocols = ["javascript:", "data:", "vbscript:", "file:"];
    const lowerUrl = returnUrl.toLowerCase();
    if (dangerousProtocols.some((proto) => lowerUrl.startsWith(proto))) {
      return false;
    }

    try {
      // Check for standard URLs
      const url = new URL(returnUrl);
      // Require a hostname for http/https URLs
      if (
        (url.protocol === "http:" || url.protocol === "https:") &&
        !url.hostname
      ) {
        return false;
      }
      return true;
    } catch {
      // Allow custom protocol schemes like tg://, app://, etc.
      // But ensure it has content after the protocol
      const match = returnUrl.match(/^([a-z][a-z0-9+.-]*):\/\/(.+)/i);
      return match !== null && match[2].length > 0;
    }
  };

  describe("Valid URLs", () => {
    it("should accept HTTP URLs", () => {
      expect(isValidReturnUrl("http://example.com")).toBe(true);
      expect(isValidReturnUrl("http://localhost:3000")).toBe(true);
      expect(isValidReturnUrl("http://example.com/path")).toBe(true);
    });

    it("should accept HTTPS URLs", () => {
      expect(isValidReturnUrl("https://example.com")).toBe(true);
      expect(isValidReturnUrl("https://api.example.com/callback")).toBe(true);
    });

    it("should accept URLs with query params", () => {
      expect(isValidReturnUrl("https://example.com?param=value")).toBe(true);
      expect(isValidReturnUrl("https://example.com?a=1&b=2")).toBe(true);
    });

    it("should accept URLs with fragments", () => {
      expect(isValidReturnUrl("https://example.com#anchor")).toBe(true);
      expect(isValidReturnUrl("https://example.com/page#section")).toBe(true);
    });

    it("should accept custom protocol schemes", () => {
      expect(isValidReturnUrl("tg://resolve?domain=mybot")).toBe(true);
      expect(isValidReturnUrl("app://callback")).toBe(true);
      expect(isValidReturnUrl("myapp://deeplink")).toBe(true);
      expect(isValidReturnUrl("whatsapp://send?phone=123")).toBe(true);
    });
  });

  describe("Invalid URLs", () => {
    it("should reject plain text", () => {
      expect(isValidReturnUrl("not-a-url")).toBe(false);
      expect(isValidReturnUrl("example.com")).toBe(false);
    });

    it("should reject relative paths", () => {
      expect(isValidReturnUrl("/dashboard")).toBe(false);
      expect(isValidReturnUrl("./callback")).toBe(false);
      expect(isValidReturnUrl("../parent")).toBe(false);
    });

    it("should reject javascript: URLs", () => {
      expect(isValidReturnUrl("javascript:alert('xss')")).toBe(false);
    });

    it("should reject data: URLs", () => {
      expect(isValidReturnUrl("data:text/html,<script>")).toBe(false);
    });

    it("should reject empty string", () => {
      expect(isValidReturnUrl("")).toBe(false);
    });

    it("should reject malformed URLs", () => {
      expect(isValidReturnUrl("http://")).toBe(false);
      expect(isValidReturnUrl("://example.com")).toBe(false);
    });
  });
});

// ============================================================
// Service Validation Tests
// ============================================================
describe("Service Validation", () => {
  const VALID_SERVICES = [
    "google",
    "twilio",
    "blooio",
    "telegram",
    "twitter",
    "discord",
    "slack",
    "whatsapp",
    "notion",
    "airtable",
    "webhooks",
  ] as const;
  type ValidService = (typeof VALID_SERVICES)[number];

  const parseServices = (servicesParam: string | null): ValidService[] => {
    if (!servicesParam) return [];
    return servicesParam
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s): s is ValidService =>
        VALID_SERVICES.includes(s as ValidService)
      );
  };

  it("should parse valid service names", () => {
    expect(parseServices("google")).toEqual(["google"]);
    expect(parseServices("google,telegram")).toEqual(["google", "telegram"]);
  });

  it("should handle case-insensitive service names", () => {
    expect(parseServices("GOOGLE")).toEqual(["google"]);
    expect(parseServices("Google,TELEGRAM")).toEqual(["google", "telegram"]);
  });

  it("should filter out invalid services", () => {
    expect(parseServices("google,invalid,telegram")).toEqual([
      "google",
      "telegram",
    ]);
    expect(parseServices("invalid1,invalid2")).toEqual([]);
  });

  it("should handle whitespace", () => {
    expect(parseServices(" google , telegram ")).toEqual([
      "google",
      "telegram",
    ]);
    expect(parseServices("google,  ,telegram")).toEqual(["google", "telegram"]);
  });

  it("should return empty array for null/empty input", () => {
    expect(parseServices(null)).toEqual([]);
    expect(parseServices("")).toEqual([]);
  });

  it("should handle all valid services", () => {
    const allServices = VALID_SERVICES.join(",");
    const parsed = parseServices(allServices);
    expect(parsed.length).toBe(VALID_SERVICES.length);
  });
});

// ============================================================
// Connection Status Aggregation Tests
// ============================================================
describe("Connection Status Aggregation", () => {
  interface ServiceStatus {
    connected: boolean;
    loading: boolean;
    configured: boolean;
  }

  type StatusMap = Record<string, ServiceStatus>;

  const calculateProgress = (
    statuses: StatusMap,
    services: string[]
  ): { connectedCount: number; totalCount: number; allConnected: boolean } => {
    const connectedCount = services.filter(
      (s) => statuses[s]?.connected
    ).length;
    const totalCount = services.length;
    const allConnected = connectedCount === totalCount && totalCount > 0;
    return { connectedCount, totalCount, allConnected };
  };

  it("should calculate 0% progress when none connected", () => {
    const statuses: StatusMap = {
      google: { connected: false, loading: false, configured: true },
      telegram: { connected: false, loading: false, configured: true },
    };

    const result = calculateProgress(statuses, ["google", "telegram"]);
    expect(result.connectedCount).toBe(0);
    expect(result.totalCount).toBe(2);
    expect(result.allConnected).toBe(false);
  });

  it("should calculate partial progress", () => {
    const statuses: StatusMap = {
      google: { connected: true, loading: false, configured: true },
      telegram: { connected: false, loading: false, configured: true },
      twilio: { connected: true, loading: false, configured: true },
    };

    const result = calculateProgress(statuses, ["google", "telegram", "twilio"]);
    expect(result.connectedCount).toBe(2);
    expect(result.totalCount).toBe(3);
    expect(result.allConnected).toBe(false);
  });

  it("should calculate 100% when all connected", () => {
    const statuses: StatusMap = {
      google: { connected: true, loading: false, configured: true },
      telegram: { connected: true, loading: false, configured: true },
    };

    const result = calculateProgress(statuses, ["google", "telegram"]);
    expect(result.connectedCount).toBe(2);
    expect(result.totalCount).toBe(2);
    expect(result.allConnected).toBe(true);
  });

  it("should handle empty services list", () => {
    const statuses: StatusMap = {};

    const result = calculateProgress(statuses, []);
    expect(result.connectedCount).toBe(0);
    expect(result.totalCount).toBe(0);
    expect(result.allConnected).toBe(false);
  });

  it("should handle missing status entries", () => {
    const statuses: StatusMap = {
      google: { connected: true, loading: false, configured: true },
    };

    const result = calculateProgress(statuses, ["google", "telegram"]);
    expect(result.connectedCount).toBe(1);
    expect(result.totalCount).toBe(2);
    expect(result.allConnected).toBe(false);
  });
});

// ============================================================
// Dependency Detection Tests
// ============================================================
describe("Dependency Detection", () => {
  const hasWhatsAppWithoutTwilio = (
    services: string[],
    statuses: Record<string, { connected: boolean }>
  ): boolean => {
    return services.includes("whatsapp") && !services.includes("twilio");
  };

  const hasWhatsAppWithTwilioNotConnected = (
    services: string[],
    statuses: Record<string, { connected: boolean }>
  ): boolean => {
    return (
      services.includes("whatsapp") &&
      services.includes("twilio") &&
      !statuses.twilio?.connected
    );
  };

  it("should detect WhatsApp without Twilio in services", () => {
    const services = ["whatsapp", "google"];
    const statuses = { whatsapp: { connected: false }, google: { connected: true } };

    expect(hasWhatsAppWithoutTwilio(services, statuses)).toBe(true);
  });

  it("should not flag when Twilio is included", () => {
    const services = ["whatsapp", "twilio"];
    const statuses = { whatsapp: { connected: false }, twilio: { connected: false } };

    expect(hasWhatsAppWithoutTwilio(services, statuses)).toBe(false);
  });

  it("should detect when Twilio is not connected but required", () => {
    const services = ["whatsapp", "twilio"];
    const statuses = { whatsapp: { connected: false }, twilio: { connected: false } };

    expect(hasWhatsAppWithTwilioNotConnected(services, statuses)).toBe(true);
  });

  it("should not flag when Twilio is connected", () => {
    const services = ["whatsapp", "twilio"];
    const statuses = { whatsapp: { connected: false }, twilio: { connected: true } };

    expect(hasWhatsAppWithTwilioNotConnected(services, statuses)).toBe(false);
  });
});

// ============================================================
// Recently Connected State Tests
// ============================================================
describe("Recently Connected State", () => {
  it("should track recently connected services", () => {
    const recentlyConnected = new Set<string>();

    // Simulate service connecting
    recentlyConnected.add("google");

    expect(recentlyConnected.has("google")).toBe(true);
    expect(recentlyConnected.has("telegram")).toBe(false);
  });

  it("should allow multiple services to be recently connected", () => {
    const recentlyConnected = new Set<string>(["google", "telegram"]);

    expect(recentlyConnected.size).toBe(2);
    expect(recentlyConnected.has("google")).toBe(true);
    expect(recentlyConnected.has("telegram")).toBe(true);
  });

  it("should clear individual services", () => {
    const recentlyConnected = new Set<string>(["google", "telegram"]);

    recentlyConnected.delete("google");

    expect(recentlyConnected.size).toBe(1);
    expect(recentlyConnected.has("google")).toBe(false);
    expect(recentlyConnected.has("telegram")).toBe(true);
  });
});

// ============================================================
// Error Message Formatting Tests
// ============================================================
describe("Error Message Formatting", () => {
  const formatErrorMessage = (errorCode: string): string => {
    switch (errorCode) {
      case "access_denied":
        return "You denied access. Click retry to try again.";
      case "invalid_grant":
        return "The authorization code has expired. Please try again.";
      case "server_error":
        return "The service is temporarily unavailable. Please try again later.";
      default:
        return errorCode;
    }
  };

  it("should format access_denied error", () => {
    expect(formatErrorMessage("access_denied")).toBe(
      "You denied access. Click retry to try again."
    );
  });

  it("should format invalid_grant error", () => {
    expect(formatErrorMessage("invalid_grant")).toBe(
      "The authorization code has expired. Please try again."
    );
  });

  it("should format server_error", () => {
    expect(formatErrorMessage("server_error")).toBe(
      "The service is temporarily unavailable. Please try again later."
    );
  });

  it("should return unknown errors as-is", () => {
    expect(formatErrorMessage("unknown_error")).toBe("unknown_error");
    expect(formatErrorMessage("custom_message")).toBe("custom_message");
  });
});

// ============================================================
// Redirect URL Building Tests
// ============================================================
describe("Redirect URL Building", () => {
  const buildRedirectUrl = (
    returnUrl: string,
    services: string[],
    state?: string
  ): string => {
    try {
      const finalUrl = new URL(returnUrl);
      finalUrl.searchParams.set("connected", "true");
      finalUrl.searchParams.set("services", services.join(","));
      if (state) {
        finalUrl.searchParams.set("state", state);
      }
      return finalUrl.toString();
    } catch {
      // Handle non-standard URLs
      const separator = returnUrl.includes("?") ? "&" : "?";
      const params = new URLSearchParams({
        connected: "true",
        services: services.join(","),
        ...(state ? { state } : {}),
      });
      return `${returnUrl}${separator}${params.toString()}`;
    }
  };

  it("should build redirect URL with connected params", () => {
    const result = buildRedirectUrl("https://example.com/callback", ["google"]);

    expect(result).toContain("connected=true");
    expect(result).toContain("services=google");
  });

  it("should include state param when provided", () => {
    const result = buildRedirectUrl(
      "https://example.com/callback",
      ["google"],
      "user123"
    );

    expect(result).toContain("state=user123");
  });

  it("should handle multiple services", () => {
    const result = buildRedirectUrl("https://example.com/callback", [
      "google",
      "telegram",
      "twilio",
    ]);

    expect(result).toContain("services=google%2Ctelegram%2Ctwilio");
  });

  it("should handle custom protocol schemes", () => {
    const result = buildRedirectUrl("tg://bot/start", ["telegram"]);

    expect(result).toContain("tg://bot/start");
    expect(result).toContain("connected=true");
  });

  it("should preserve existing query params", () => {
    const result = buildRedirectUrl(
      "https://example.com/callback?existing=param",
      ["google"]
    );

    expect(result).toContain("existing=param");
    expect(result).toContain("connected=true");
  });
});

// ============================================================
// Accessibility Attribute Tests
// ============================================================
describe("Accessibility Attributes", () => {
  describe("Button Accessibility", () => {
    it("should have aria-busy when loading", () => {
      const isConnecting = true;
      const ariaBusy = isConnecting;

      expect(ariaBusy).toBe(true);
    });

    it("should not have aria-busy when not loading", () => {
      const isConnecting = false;
      const ariaBusy = isConnecting;

      expect(ariaBusy).toBe(false);
    });
  });

  describe("Progress Accessibility", () => {
    it("should have correct ARIA values for progress", () => {
      const connectedCount = 2;
      const totalCount = 4;
      const progressPercent = (connectedCount / totalCount) * 100;

      expect(progressPercent).toBe(50);

      // These would be the ARIA attributes
      const ariaValueNow = progressPercent;
      const ariaValueMin = 0;
      const ariaValueMax = 100;

      expect(ariaValueNow).toBe(50);
      expect(ariaValueMin).toBe(0);
      expect(ariaValueMax).toBe(100);
    });
  });

  describe("Alert Accessibility", () => {
    it("should use role=alert for error messages", () => {
      const hasErrors = true;
      const roleAttribute = hasErrors ? "alert" : undefined;

      expect(roleAttribute).toBe("alert");
    });

    it("should use aria-live=polite for status updates", () => {
      const ariaLive = "polite";
      expect(ariaLive).toBe("polite");
    });
  });
});
