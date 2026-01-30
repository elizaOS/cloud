/**
 * Unit Tests for Connect Page Components
 *
 * Tests for:
 * - URL validation logic (returnUrl)
 * - Service filtering
 * - Error message formatting
 * - Progress calculations
 * - ConfiguredCount logic
 */

import { describe, it, expect } from "bun:test";

// Recreate the validation logic from the connect page for testing
const VALID_SERVICES = [
  "google",
  "twilio",
  "blooio",
  "telegram",
  "twitter",
  "discord",
] as const;

type ServiceType = (typeof VALID_SERVICES)[number];

/**
 * Validate if a return URL is safe to redirect to
 */
function isValidReturnUrl(url: string): boolean {
  if (!url || url.trim() === "") return false;

  const lowerUrl = url.toLowerCase();

  // Block dangerous protocols
  const dangerousProtocols = ["javascript:", "data:", "vbscript:", "file:"];
  for (const protocol of dangerousProtocols) {
    if (lowerUrl.startsWith(protocol)) {
      return false;
    }
  }

  // For http/https, require a hostname
  if (lowerUrl.startsWith("http://") || lowerUrl.startsWith("https://")) {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.hostname.length > 0;
    } catch {
      return false;
    }
  }

  // For custom protocols (e.g., tg://, myapp://), require content after ://
  const protocolMatch = url.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  if (protocolMatch) {
    const afterProtocol = url.slice(protocolMatch[0].length);
    return afterProtocol.length > 0;
  }

  // Relative URLs are valid
  if (url.startsWith("/")) {
    return true;
  }

  return false;
}

/**
 * Filter and validate services
 */
function filterValidServices(services: string[]): ServiceType[] {
  return services.filter((s): s is ServiceType =>
    VALID_SERVICES.includes(s as ServiceType),
  );
}

/**
 * Format OAuth error for display
 */
function formatOAuthError(errorCode: string): string {
  const errorMessages: Record<string, string> = {
    access_denied: "Access was denied. Please try again.",
    invalid_request: "Invalid request. Please try again.",
    invalid_grant: "Authorization expired. Please try again.",
    unauthorized_client: "Unauthorized client. Please contact support.",
    server_error: "Server error occurred. Please try again later.",
    temporarily_unavailable: "Service temporarily unavailable. Please try again later.",
  };

  return errorMessages[errorCode] || `Connection failed: ${errorCode}`;
}

/**
 * Calculate progress percentage
 */
function calculateProgress(
  connectedCount: number,
  configuredCount: number,
): number {
  if (configuredCount === 0) return 0;
  return Math.round((connectedCount / configuredCount) * 100);
}

/**
 * Check if all services are connected (accounting for unconfigured)
 */
function isAllConnected(
  connectedCount: number,
  unconfiguredCount: number,
  totalCount: number,
): boolean {
  return connectedCount + unconfiguredCount === totalCount && totalCount > 0;
}

describe("ReturnUrl Validation", () => {
  describe("Valid URLs", () => {
    it("accepts http with hostname", () => {
      expect(isValidReturnUrl("http://localhost:3000/dashboard")).toBe(true);
    });

    it("accepts https with hostname", () => {
      expect(isValidReturnUrl("https://example.com/callback")).toBe(true);
    });

    it("accepts custom protocol with path", () => {
      expect(isValidReturnUrl("tg://bot/start")).toBe(true);
      expect(isValidReturnUrl("myapp://callback")).toBe(true);
      expect(isValidReturnUrl("custom-app://deep/link")).toBe(true);
    });

    it("accepts relative URLs", () => {
      expect(isValidReturnUrl("/dashboard")).toBe(true);
      expect(isValidReturnUrl("/settings?tab=connections")).toBe(true);
    });

    it("accepts URLs with query parameters", () => {
      expect(isValidReturnUrl("https://example.com?param=value")).toBe(true);
      expect(isValidReturnUrl("http://localhost:3000/path?a=1&b=2")).toBe(true);
    });

    it("accepts URLs with fragments", () => {
      expect(isValidReturnUrl("https://example.com#section")).toBe(true);
      expect(isValidReturnUrl("http://localhost:3000/path#anchor")).toBe(true);
    });

    it("accepts URLs with port numbers", () => {
      expect(isValidReturnUrl("http://localhost:8080/callback")).toBe(true);
      expect(isValidReturnUrl("https://example.com:443/path")).toBe(true);
    });
  });

  describe("Invalid URLs - Dangerous Protocols", () => {
    it("rejects javascript: protocol", () => {
      expect(isValidReturnUrl("javascript:alert('xss')")).toBe(false);
      expect(isValidReturnUrl("javascript:void(0)")).toBe(false);
    });

    it("rejects data: protocol", () => {
      expect(isValidReturnUrl("data:text/html,<script>alert('xss')</script>")).toBe(false);
      expect(isValidReturnUrl("data:application/pdf;base64,test")).toBe(false);
    });

    it("rejects vbscript: protocol", () => {
      expect(isValidReturnUrl("vbscript:msgbox('xss')")).toBe(false);
    });

    it("rejects file: protocol", () => {
      expect(isValidReturnUrl("file:///etc/passwd")).toBe(false);
      expect(isValidReturnUrl("file://c:/windows/system.ini")).toBe(false);
    });

    it("rejects dangerous protocols with case variations", () => {
      expect(isValidReturnUrl("JAVASCRIPT:alert(1)")).toBe(false);
      expect(isValidReturnUrl("JavaScript:alert(1)")).toBe(false);
      expect(isValidReturnUrl("jAvAsCrIpT:alert(1)")).toBe(false);
      expect(isValidReturnUrl("DATA:text/html,test")).toBe(false);
      expect(isValidReturnUrl("VBSCRIPT:test")).toBe(false);
      expect(isValidReturnUrl("FILE:///test")).toBe(false);
    });
  });

  describe("Invalid URLs - Missing Components", () => {
    it("rejects empty string", () => {
      expect(isValidReturnUrl("")).toBe(false);
    });

    it("rejects whitespace only", () => {
      expect(isValidReturnUrl("   ")).toBe(false);
      expect(isValidReturnUrl("\t\n")).toBe(false);
    });

    it("rejects http:// without hostname", () => {
      expect(isValidReturnUrl("http://")).toBe(false);
    });

    it("rejects https:// without hostname", () => {
      expect(isValidReturnUrl("https://")).toBe(false);
    });

    it("rejects custom protocol without content", () => {
      expect(isValidReturnUrl("myapp://")).toBe(false);
      expect(isValidReturnUrl("tg://")).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("handles malformed URLs gracefully", () => {
      expect(isValidReturnUrl("not a url")).toBe(false);
      expect(isValidReturnUrl("://missing-protocol")).toBe(false);
    });

    it("handles special characters in path", () => {
      expect(isValidReturnUrl("https://example.com/path%20with%20spaces")).toBe(true);
      expect(isValidReturnUrl("https://example.com/path?q=hello+world")).toBe(true);
    });

    it("handles international domain names", () => {
      expect(isValidReturnUrl("https://例え.jp/path")).toBe(true);
    });

    it("handles IPv4 addresses", () => {
      expect(isValidReturnUrl("http://192.168.1.1:3000/callback")).toBe(true);
    });

    it("handles IPv6 addresses", () => {
      expect(isValidReturnUrl("http://[::1]:3000/callback")).toBe(true);
    });
  });
});

describe("Service Filtering", () => {
  describe("Valid Services", () => {
    it("filters valid services correctly", () => {
      const input = ["google", "twilio", "blooio"];
      const result = filterValidServices(input);
      expect(result).toEqual(["google", "twilio", "blooio"]);
    });

    it("returns all services when all are valid", () => {
      const input = ["google", "twilio", "blooio", "telegram", "twitter", "discord"];
      const result = filterValidServices(input);
      expect(result).toHaveLength(6);
    });

    it("handles single valid service", () => {
      const result = filterValidServices(["google"]);
      expect(result).toEqual(["google"]);
    });
  });

  describe("Invalid Services", () => {
    it("filters out invalid services", () => {
      const input = ["google", "invalid_service", "twilio"];
      const result = filterValidServices(input);
      expect(result).toEqual(["google", "twilio"]);
    });

    it("returns empty array for all invalid services", () => {
      const input = ["foo", "bar", "baz"];
      const result = filterValidServices(input);
      expect(result).toEqual([]);
    });

    it("handles empty input", () => {
      const result = filterValidServices([]);
      expect(result).toEqual([]);
    });

    it("handles case sensitivity", () => {
      // Services should be lowercase
      const input = ["GOOGLE", "Google", "google"];
      const result = filterValidServices(input);
      expect(result).toEqual(["google"]);
    });
  });

  describe("Edge Cases", () => {
    it("handles duplicates", () => {
      const input = ["google", "google", "twilio"];
      const result = filterValidServices(input);
      expect(result).toEqual(["google", "google", "twilio"]);
    });

    it("handles whitespace in service names", () => {
      const input = ["google ", " twilio", " blooio "];
      const result = filterValidServices(input);
      expect(result).toEqual([]);
    });
  });
});

describe("OAuth Error Formatting", () => {
  describe("Known Error Codes", () => {
    it("formats access_denied correctly", () => {
      const result = formatOAuthError("access_denied");
      expect(result).toContain("denied");
    });

    it("formats invalid_request correctly", () => {
      const result = formatOAuthError("invalid_request");
      expect(result).toContain("Invalid");
    });

    it("formats invalid_grant correctly", () => {
      const result = formatOAuthError("invalid_grant");
      expect(result).toContain("expired");
    });

    it("formats unauthorized_client correctly", () => {
      const result = formatOAuthError("unauthorized_client");
      expect(result).toContain("Unauthorized");
    });

    it("formats server_error correctly", () => {
      const result = formatOAuthError("server_error");
      expect(result).toContain("Server error");
    });

    it("formats temporarily_unavailable correctly", () => {
      const result = formatOAuthError("temporarily_unavailable");
      expect(result).toContain("temporarily unavailable");
    });
  });

  describe("Unknown Error Codes", () => {
    it("formats unknown error codes with fallback", () => {
      const result = formatOAuthError("unknown_error_code");
      expect(result).toContain("unknown_error_code");
    });

    it("handles empty string", () => {
      const result = formatOAuthError("");
      expect(result).toBeDefined();
    });
  });
});

describe("Progress Calculation", () => {
  describe("Normal Cases", () => {
    it("calculates 0% when none connected", () => {
      expect(calculateProgress(0, 6)).toBe(0);
    });

    it("calculates 50% when half connected", () => {
      expect(calculateProgress(3, 6)).toBe(50);
    });

    it("calculates 100% when all connected", () => {
      expect(calculateProgress(6, 6)).toBe(100);
    });

    it("rounds to nearest integer", () => {
      expect(calculateProgress(1, 3)).toBe(33);
      expect(calculateProgress(2, 3)).toBe(67);
    });
  });

  describe("Edge Cases", () => {
    it("returns 0 when configuredCount is 0", () => {
      expect(calculateProgress(0, 0)).toBe(0);
    });

    it("handles single service", () => {
      expect(calculateProgress(0, 1)).toBe(0);
      expect(calculateProgress(1, 1)).toBe(100);
    });
  });
});

describe("AllConnected Logic", () => {
  describe("Without Unconfigured Services", () => {
    it("returns true when all connected", () => {
      expect(isAllConnected(6, 0, 6)).toBe(true);
    });

    it("returns false when none connected", () => {
      expect(isAllConnected(0, 0, 6)).toBe(false);
    });

    it("returns false when partially connected", () => {
      expect(isAllConnected(3, 0, 6)).toBe(false);
    });
  });

  describe("With Unconfigured Services", () => {
    it("returns true when connected + unconfigured = total", () => {
      // 4 connected + 2 unconfigured = 6 total
      expect(isAllConnected(4, 2, 6)).toBe(true);
    });

    it("returns true when all unconfigured", () => {
      // 0 connected + 6 unconfigured = 6 total
      expect(isAllConnected(0, 6, 6)).toBe(true);
    });

    it("returns false when connected + unconfigured < total", () => {
      // 2 connected + 1 unconfigured = 3, but total is 6
      expect(isAllConnected(2, 1, 6)).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("returns false when total is 0", () => {
      expect(isAllConnected(0, 0, 0)).toBe(false);
    });

    it("handles single service", () => {
      expect(isAllConnected(1, 0, 1)).toBe(true);
      expect(isAllConnected(0, 1, 1)).toBe(true);
      expect(isAllConnected(0, 0, 1)).toBe(false);
    });
  });
});

describe("ServiceStatus Interface", () => {
  interface ServiceStatus {
    connected: boolean;
    configured?: boolean;
    loading?: boolean;
    error?: string;
    details?: Record<string, unknown>;
  }

  describe("Status State Combinations", () => {
    it("handles disconnected and configured", () => {
      const status: ServiceStatus = {
        connected: false,
        configured: true,
        loading: false,
      };
      expect(status.connected).toBe(false);
      expect(status.configured).toBe(true);
    });

    it("handles connected state", () => {
      const status: ServiceStatus = {
        connected: true,
        configured: true,
        loading: false,
        details: { email: "test@example.com" },
      };
      expect(status.connected).toBe(true);
      expect(status.details?.email).toBe("test@example.com");
    });

    it("handles unconfigured state", () => {
      const status: ServiceStatus = {
        connected: false,
        configured: false,
        loading: false,
      };
      expect(status.connected).toBe(false);
      expect(status.configured).toBe(false);
    });

    it("handles loading state", () => {
      const status: ServiceStatus = {
        connected: false,
        configured: true,
        loading: true,
      };
      expect(status.loading).toBe(true);
    });

    it("handles error state", () => {
      const status: ServiceStatus = {
        connected: false,
        configured: true,
        loading: false,
        error: "Connection failed",
      };
      expect(status.error).toBe("Connection failed");
    });
  });
});

describe("OAuth Error Types", () => {
  interface OAuthError {
    service: string;
    message: string;
    timestamp: number;
  }

  describe("Error Object Structure", () => {
    it("creates valid error object", () => {
      const error: OAuthError = {
        service: "google",
        message: "Access denied",
        timestamp: Date.now(),
      };
      expect(error.service).toBe("google");
      expect(error.message).toBe("Access denied");
      expect(typeof error.timestamp).toBe("number");
    });

    it("handles multiple errors", () => {
      const errors: OAuthError[] = [
        { service: "google", message: "Error 1", timestamp: 1 },
        { service: "discord", message: "Error 2", timestamp: 2 },
      ];
      expect(errors).toHaveLength(2);
      expect(errors[0].service).toBe("google");
      expect(errors[1].service).toBe("discord");
    });
  });

  describe("Error Filtering", () => {
    it("filters errors by timestamp", () => {
      const errors: OAuthError[] = [
        { service: "google", message: "Error", timestamp: 1 },
        { service: "discord", message: "Error", timestamp: 2 },
        { service: "twitter", message: "Error", timestamp: 3 },
      ];

      const filtered = errors.filter((e) => e.timestamp !== 2);
      expect(filtered).toHaveLength(2);
      expect(filtered.map((e) => e.service)).toEqual(["google", "twitter"]);
    });

    it("filters errors by service", () => {
      const errors: OAuthError[] = [
        { service: "google", message: "Error 1", timestamp: 1 },
        { service: "google", message: "Error 2", timestamp: 2 },
        { service: "discord", message: "Error 3", timestamp: 3 },
      ];

      const googleErrors = errors.filter((e) => e.service === "google");
      expect(googleErrors).toHaveLength(2);
    });
  });
});

describe("Recently Connected Set", () => {
  describe("Set Operations", () => {
    it("adds services to set", () => {
      const recentlyConnected = new Set<string>();
      recentlyConnected.add("google");
      recentlyConnected.add("twilio");
      expect(recentlyConnected.has("google")).toBe(true);
      expect(recentlyConnected.has("twilio")).toBe(true);
    });

    it("removes services from set", () => {
      const recentlyConnected = new Set<string>(["google", "twilio"]);
      recentlyConnected.delete("google");
      expect(recentlyConnected.has("google")).toBe(false);
      expect(recentlyConnected.has("twilio")).toBe(true);
    });

    it("handles duplicate additions", () => {
      const recentlyConnected = new Set<string>();
      recentlyConnected.add("google");
      recentlyConnected.add("google");
      expect(recentlyConnected.size).toBe(1);
    });

    it("clears all services", () => {
      const recentlyConnected = new Set<string>(["google", "twilio", "discord"]);
      recentlyConnected.clear();
      expect(recentlyConnected.size).toBe(0);
    });
  });
});

describe("URL Search Params Parsing", () => {
  describe("Services Parameter", () => {
    it("parses comma-separated services", () => {
      const params = new URLSearchParams("services=google,twilio,blooio");
      const services = params.get("services")?.split(",") || [];
      expect(services).toEqual(["google", "twilio", "blooio"]);
    });

    it("handles single service", () => {
      const params = new URLSearchParams("services=google");
      const services = params.get("services")?.split(",") || [];
      expect(services).toEqual(["google"]);
    });

    it("handles empty services", () => {
      const params = new URLSearchParams("services=");
      const services = params.get("services")?.split(",").filter(Boolean) || [];
      expect(services).toEqual([]);
    });

    it("handles missing services parameter", () => {
      const params = new URLSearchParams("returnUrl=http://example.com");
      const services = params.get("services")?.split(",") || [];
      expect(services).toEqual([]);
    });
  });

  describe("Error Parameters", () => {
    it("parses OAuth error parameters", () => {
      const params = new URLSearchParams("google_error=access_denied&discord_error=invalid_grant");
      expect(params.get("google_error")).toBe("access_denied");
      expect(params.get("discord_error")).toBe("invalid_grant");
    });

    it("handles URL-encoded error messages", () => {
      const params = new URLSearchParams("google_error=User%20denied%20access");
      expect(params.get("google_error")).toBe("User denied access");
    });
  });

  describe("State Parameter", () => {
    it("parses state parameter", () => {
      const params = new URLSearchParams("state=custom_state_123");
      expect(params.get("state")).toBe("custom_state_123");
    });

    it("handles complex state values", () => {
      const params = new URLSearchParams("state=eyJhcHBJZCI6IjEyMyJ9");
      expect(params.get("state")).toBe("eyJhcHBJZCI6IjEyMyJ9");
    });
  });
});
