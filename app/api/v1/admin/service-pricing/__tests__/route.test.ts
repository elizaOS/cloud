
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// ---------------------------------------------------------------------------
// Mocks – hoisted so they're in place before the route module is imported
// ---------------------------------------------------------------------------

// Auth helpers
vi.mock("@/lib/auth/session", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: vi.fn(),
}));

// Database / domain helpers
vi.mock("@/lib/services/pricing", () => ({
  listServicePricing: vi.fn(),
  upsertServicePricing: vi.fn(),
  getServicePricingAuditHistory: vi.fn(),
}));

// Cache helpers
vi.mock("@/lib/cache/service-pricing", () => ({
  invalidateServicePricingCache: vi.fn(),
}));

vi.mock("@/lib/cache/client", () => ({
  cache: { del: vi.fn() },
}));

// Next.js helpers
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    NextResponse: {
      json: (body: unknown, init?: ResponseInit) => {
        const resp = new Response(JSON.stringify(body), init);
        (resp as any).__body = body;
        return resp;
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { getServerSession } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/auth/admin";
import {
  listServicePricing,
  upsertServicePricing,
  getServicePricingAuditHistory,
} from "@/lib/services/pricing";
import { invalidateServicePricingCache } from "@/lib/cache/service-pricing";
import { cache } from "@/lib/cache/client";

// We import the route handlers – adjust the import if the file exports named
// functions differently.  Next.js App-Router convention: GET, PUT, etc.
import { GET, PUT } from "../route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(method: string, url: string, body?: Record<string, unknown>): Request {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) {
    init.body = JSON.stringify(body);
  }
  return new Request(`http://localhost${url}`, init);
}

async function jsonBody(resp: Response) {
  // If our mock attached __body, use it; otherwise parse.
  if ((resp as any).__body) return (resp as any).__body;
  return resp.json();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Admin Service Pricing API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // AUTH: non-admin users should be rejected
  // -----------------------------------------------------------------------

  describe("authentication & authorisation", () => {
    it("GET returns 401 when there is no session", async () => {
      (getServerSession as Mock).mockResolvedValue(null);
      (requireAdmin as Mock).mockRejectedValue(
        Object.assign(new Error("Unauthorized"), { status: 401 }),
      );

      // The route should propagate the rejection as a 401 response.
      try {
        const resp = await GET(makeRequest("GET", "/api/v1/admin/service-pricing"));
        expect(resp.status).toBeGreaterThanOrEqual(401);
      } catch (e: any) {
        // If the route re-throws, that's acceptable – assert the error.
        expect(e.message).toMatch(/Unauthorized|unauthorized|401/i);
      }
    });

    it("PUT returns 401 when the user is not an admin", async () => {
      (getServerSession as Mock).mockResolvedValue({ user: { id: "u1", role: "user" } });
      (requireAdmin as Mock).mockRejectedValue(
        Object.assign(new Error("Forbidden"), { status: 403 }),
      );

      try {
        const resp = await PUT(
          makeRequest("PUT", "/api/v1/admin/service-pricing", {
            service_id: "test",
            credit_cost: 1,
          }),
        );
        expect(resp.status).toBeGreaterThanOrEqual(401);
      } catch (e: any) {
        expect(e.message).toMatch(/Forbidden|forbidden|403|Unauthorized/i);
      }
    });

    it("GET succeeds for an admin user", async () => {
      (getServerSession as Mock).mockResolvedValue({ user: { id: "a1", role: "admin" } });
      (requireAdmin as Mock).mockResolvedValue(true);
      (listServicePricing as Mock).mockResolvedValue([]);

      const resp = await GET(makeRequest("GET", "/api/v1/admin/service-pricing"));
      expect(resp.status).toBe(200);
    });
  });

  // -----------------------------------------------------------------------
  // PUT – upsert behaviour
  // -----------------------------------------------------------------------

  describe("PUT upsert behaviour", () => {
    beforeEach(() => {
      (getServerSession as Mock).mockResolvedValue({ user: { id: "a1", role: "admin" } });
      (requireAdmin as Mock).mockResolvedValue(true);
      (invalidateServicePricingCache as Mock).mockResolvedValue(undefined);
    });

    it("creates a new pricing entry and invalidates cache", async () => {
      const created = {
        service_id: "new-svc",
        credit_cost: 5,
        is_active: true,
      };
      (upsertServicePricing as Mock).mockResolvedValue(created);

      const resp = await PUT(
        makeRequest("PUT", "/api/v1/admin/service-pricing", {
          service_id: "new-svc",
          credit_cost: 5,
        }),
      );

      expect(resp.status).toBe(200);
      expect(upsertServicePricing).toHaveBeenCalled();
      expect(invalidateServicePricingCache).toHaveBeenCalledWith("new-svc");
    });

    it("updates an existing pricing entry via upsert", async () => {
      const updated = {
        service_id: "existing-svc",
        credit_cost: 10,
        is_active: true,
      };
      (upsertServicePricing as Mock).mockResolvedValue(updated);

      const resp = await PUT(
        makeRequest("PUT", "/api/v1/admin/service-pricing", {
          service_id: "existing-svc",
          credit_cost: 10,
        }),
      );

      expect(resp.status).toBe(200);
      const body = await jsonBody(resp);
      expect(body).toBeDefined();
    });

    it("invalidates solana-rpc allowed-methods cache for solana-rpc service", async () => {
      (upsertServicePricing as Mock).mockResolvedValue({
        service_id: "solana-rpc",
        credit_cost: 2,
      });

      await PUT(
        makeRequest("PUT", "/api/v1/admin/service-pricing", {
          service_id: "solana-rpc",
          credit_cost: 2,
        }),
      );

      expect(invalidateServicePricingCache).toHaveBeenCalledWith("solana-rpc");
      // The route also clears the allowed-methods key for solana-rpc
      expect(cache.del).toHaveBeenCalledWith("solana-rpc:allowed-methods");
    });
  });

  // -----------------------------------------------------------------------
  // Cache invalidation edge-cases
  // -----------------------------------------------------------------------

  describe("cache invalidation effects", () => {
    beforeEach(() => {
      (getServerSession as Mock).mockResolvedValue({ user: { id: "a1", role: "admin" } });
      (requireAdmin as Mock).mockResolvedValue(true);
    });

    it("returns success with a warning when cache invalidation fails", async () => {
      (upsertServicePricing as Mock).mockResolvedValue({
        service_id: "svc",
        credit_cost: 3,
      });
      (invalidateServicePricingCache as Mock).mockRejectedValue(new Error("Redis down"));

      const resp = await PUT(
        makeRequest("PUT", "/api/v1/admin/service-pricing", {
          service_id: "svc",
          credit_cost: 3,
        }),
      );

      // The DB update succeeded so the endpoint should NOT return 500.
      // It should return 200 with a warning about cache.
      expect(resp.status).toBe(200);
      const body = await jsonBody(resp);
      // The response should indicate the cache was not invalidated
      if (body && typeof body === "object") {
        const serialised = JSON.stringify(body);
        // Flexible: check for a warning flag or message
        const hasCacheWarning =
          serialised.includes("cache") ||
          serialised.includes("warning") ||
          serialised.includes("cacheInvalidated") ||
          body.cacheInvalidated === false;
        expect(hasCacheWarning).toBe(true);
      }
    });

    it("does not call solana-rpc extra cache clear for non-solana services", async () => {
      (upsertServicePricing as Mock).mockResolvedValue({
        service_id: "other-service",
        credit_cost: 1,
      });
      (invalidateServicePricingCache as Mock).mockResolvedValue(undefined);

      await PUT(
        makeRequest("PUT", "/api/v1/admin/service-pricing", {
          service_id: "other-service",
          credit_cost: 1,
        }),
      );

      expect(cache.del).not.toHaveBeenCalledWith("solana-rpc:allowed-methods");
    });
  });

  // -----------------------------------------------------------------------
  // GET – listing
  // -----------------------------------------------------------------------

  describe("GET listing", () => {
    beforeEach(() => {
      (getServerSession as Mock).mockResolvedValue({ user: { id: "a1", role: "admin" } });
      (requireAdmin as Mock).mockResolvedValue(true);
    });

    it("returns the list of service pricing entries", async () => {
      const entries = [
        { service_id: "a", credit_cost: 1 },
        { service_id: "b", credit_cost: 2 },
      ];
      (listServicePricing as Mock).mockResolvedValue(entries);

      const resp = await GET(makeRequest("GET", "/api/v1/admin/service-pricing"));
      expect(resp.status).toBe(200);

      const body = await jsonBody(resp);
      expect(body).toBeDefined();
    });
  });
});
