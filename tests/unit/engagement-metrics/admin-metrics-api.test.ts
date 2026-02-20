/**
 * Admin Metrics API Route Tests
 *
 * Tests the /api/v1/admin/metrics endpoint including:
 * - Admin authentication enforcement
 * - View parameter routing (overview, daily, retention, active, signups, oauth)
 * - Time range parameter handling
 * - Error handling for unknown views
 * - Error handling for service failures
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";
import { NextRequest } from "next/server";

// ─── Mock Setup ──────────────────────────────────────────────────────────────

const mockOverview = {
  dau: 100,
  wau: 500,
  mau: 2000,
  newSignupsToday: 10,
  newSignups7d: 70,
  avgMessagesPerUser: 3.5,
  platformBreakdown: { web: 60, telegram: 30, discord: 10 },
  oauthRate: { total_users: 1000, connected_users: 400, rate: 0.4, byService: {} },
  dailyTrend: [],
  retentionCohorts: [],
};
const mockDailyMetrics = [{ id: "1", date: "2025-01-15", dau: 50 }];
const mockRetentionCohorts = [
  { id: "1", cohort_date: "2025-01-01", cohort_size: 100, d1_retained: 40 },
];
const mockActiveUsers = { total: 100, byPlatform: { web: 100 } };
const mockSignups = { total: 10, byDay: [] };
const mockOAuthRate = {
  total_users: 1000,
  connected_users: 400,
  rate: 0.4,
  byService: { google: 300 },
};

const mockGetMetricsOverview = mock(() => Promise.resolve(mockOverview));
const mockGetDailyMetrics = mock(() => Promise.resolve(mockDailyMetrics));
const mockGetRetentionCohorts = mock(() =>
  Promise.resolve(mockRetentionCohorts),
);
const mockGetActiveUsers = mock(() => Promise.resolve(mockActiveUsers));
const mockGetNewSignups = mock(() => Promise.resolve(mockSignups));
const mockGetOAuthConnectionRate = mock(() => Promise.resolve(mockOAuthRate));

mock.module("@/lib/services/user-metrics", () => ({
  userMetricsService: {
    getMetricsOverview: mockGetMetricsOverview,
    getDailyMetrics: mockGetDailyMetrics,
    getRetentionCohorts: mockGetRetentionCohorts,
    getActiveUsers: mockGetActiveUsers,
    getNewSignups: mockGetNewSignups,
    getOAuthConnectionRate: mockGetOAuthConnectionRate,
  },
}));

let mockRequireAdminShouldFail = false;
let mockRequireAdminError = "Admin access required";
let mockAdminRole: string | null = "super_admin";
mock.module("@/lib/auth", () => ({
  requireAdmin: mock(async () => {
    if (mockRequireAdminShouldFail) {
      throw new Error(mockRequireAdminError);
    }
    return {
      user: { id: "admin-1", wallet_address: "0xadmin" },
      isAdmin: true,
      role: mockAdminRole,
    };
  }),
}));

mock.module("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function, _config: any) => handler,
  RateLimitPresets: { STANDARD: {} },
}));

mock.module("@/lib/utils/logger", () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

import { GET } from "@/app/api/v1/admin/metrics/route";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL("http://localhost:3000/api/v1/admin/metrics");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString(), { method: "GET" });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Admin Metrics API", () => {
  beforeEach(() => {
    mockRequireAdminShouldFail = false;
    mockRequireAdminError = "Admin access required";
    mockAdminRole = "super_admin";
    mockGetMetricsOverview.mockReset();
    mockGetDailyMetrics.mockReset();
    mockGetRetentionCohorts.mockReset();
    mockGetActiveUsers.mockReset();
    mockGetNewSignups.mockReset();
    mockGetOAuthConnectionRate.mockReset();

    mockGetMetricsOverview.mockResolvedValue(mockOverview);
    mockGetDailyMetrics.mockResolvedValue(mockDailyMetrics);
    mockGetRetentionCohorts.mockResolvedValue(mockRetentionCohorts);
    mockGetActiveUsers.mockResolvedValue(mockActiveUsers);
    mockGetNewSignups.mockResolvedValue(mockSignups);
    mockGetOAuthConnectionRate.mockResolvedValue(mockOAuthRate);
  });

  describe("authentication", () => {
    test("returns 403 when admin check fails", async () => {
      mockRequireAdminShouldFail = true;
      const res = await GET(makeRequest());
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Admin access required");
    });

    test("returns 403 with custom error message", async () => {
      mockRequireAdminShouldFail = true;
      mockRequireAdminError = "Wallet not recognized";
      const res = await GET(makeRequest());
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Wallet not recognized");
    });

    test("succeeds when admin check passes with super_admin role", async () => {
      const res = await GET(makeRequest());
      expect(res.status).toBe(200);
    });

    test("returns 403 for moderator role", async () => {
      mockAdminRole = "moderator";
      const res = await GET(makeRequest());
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain("super_admin");
    });

    test("returns 403 for viewer role", async () => {
      mockAdminRole = "viewer";
      const res = await GET(makeRequest());
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain("super_admin");
    });

    test("returns 403 when role is null", async () => {
      mockAdminRole = null;
      const res = await GET(makeRequest());
      expect(res.status).toBe(403);
    });
  });

  describe("view routing", () => {
    test("defaults to overview when no view specified", async () => {
      const res = await GET(makeRequest());
      expect(res.status).toBe(200);
      expect(mockGetMetricsOverview).toHaveBeenCalled();
      expect(mockGetMetricsOverview).toHaveBeenCalledWith(30);
    });

    test("returns overview data for view=overview", async () => {
      const res = await GET(makeRequest({ view: "overview" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.dau).toBe(100);
      expect(body.wau).toBe(500);
      expect(body.mau).toBe(2000);
    });

    test("passes time range to overview as rangeDays", async () => {
      await GET(makeRequest({ view: "overview", timeRange: "7d" }));
      expect(mockGetMetricsOverview).toHaveBeenCalledWith(7);

      mockGetMetricsOverview.mockClear();
      await GET(makeRequest({ view: "overview", timeRange: "90d" }));
      expect(mockGetMetricsOverview).toHaveBeenCalledWith(90);
    });

    test("returns daily data for view=daily", async () => {
      const res = await GET(makeRequest({ view: "daily" }));
      expect(res.status).toBe(200);
      expect(mockGetDailyMetrics).toHaveBeenCalled();
    });

    test("returns retention data for view=retention", async () => {
      const res = await GET(makeRequest({ view: "retention" }));
      expect(res.status).toBe(200);
      expect(mockGetRetentionCohorts).toHaveBeenCalled();
    });

    test("returns active users for view=active", async () => {
      const res = await GET(makeRequest({ view: "active" }));
      expect(res.status).toBe(200);
      expect(mockGetActiveUsers).toHaveBeenCalled();
    });

    test("returns signups for view=signups", async () => {
      const res = await GET(makeRequest({ view: "signups" }));
      expect(res.status).toBe(200);
      expect(mockGetNewSignups).toHaveBeenCalled();
    });

    test("returns oauth rate for view=oauth", async () => {
      const res = await GET(makeRequest({ view: "oauth" }));
      expect(res.status).toBe(200);
      expect(mockGetOAuthConnectionRate).toHaveBeenCalled();
    });

    test("returns 400 for unknown view", async () => {
      const res = await GET(makeRequest({ view: "invalid" }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Unknown view");
    });
  });

  describe("time range handling", () => {
    test("defaults to 30d when no timeRange specified", async () => {
      const res = await GET(makeRequest({ view: "daily" }));
      expect(res.status).toBe(200);

      const calledArgs = mockGetDailyMetrics.mock.calls[0];
      const startDate = calledArgs[0] as Date;
      const now = new Date();
      const diffMs = now.getTime() - startDate.getTime();
      const diffDays = diffMs / 86_400_000;
      expect(diffDays).toBeGreaterThan(29);
      expect(diffDays).toBeLessThan(31);
    });

    test("handles 7d time range", async () => {
      const res = await GET(
        makeRequest({ view: "daily", timeRange: "7d" }),
      );
      expect(res.status).toBe(200);

      const calledArgs = mockGetDailyMetrics.mock.calls[0];
      const startDate = calledArgs[0] as Date;
      const now = new Date();
      const diffDays = (now.getTime() - startDate.getTime()) / 86_400_000;
      expect(diffDays).toBeGreaterThan(6);
      expect(diffDays).toBeLessThan(8);
    });

    test("handles 90d time range", async () => {
      const res = await GET(
        makeRequest({ view: "daily", timeRange: "90d" }),
      );
      expect(res.status).toBe(200);

      const calledArgs = mockGetDailyMetrics.mock.calls[0];
      const startDate = calledArgs[0] as Date;
      const now = new Date();
      const diffDays = (now.getTime() - startDate.getTime()) / 86_400_000;
      expect(diffDays).toBeGreaterThan(89);
      expect(diffDays).toBeLessThan(91);
    });

    test("maps active view time ranges correctly", async () => {
      await GET(makeRequest({ view: "active", timeRange: "7d" }));
      expect(mockGetActiveUsers).toHaveBeenCalledWith("7d");

      mockGetActiveUsers.mockClear();
      await GET(makeRequest({ view: "active", timeRange: "30d" }));
      expect(mockGetActiveUsers).toHaveBeenCalledWith("30d");
    });

    test("falls back to 30d for unrecognized time range", async () => {
      const res = await GET(
        makeRequest({ view: "daily", timeRange: "999d" }),
      );
      expect(res.status).toBe(200);

      const calledArgs = mockGetDailyMetrics.mock.calls[0];
      const startDate = calledArgs[0] as Date;
      const now = new Date();
      const diffDays = (now.getTime() - startDate.getTime()) / 86_400_000;
      expect(diffDays).toBeGreaterThan(29);
      expect(diffDays).toBeLessThan(31);
    });
  });

  describe("error handling", () => {
    test("returns 500 when service throws", async () => {
      mockGetMetricsOverview.mockRejectedValue(new Error("DB timeout"));
      const res = await GET(makeRequest());
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Failed to fetch metrics");
    });

    test("returns 500 for daily view failure", async () => {
      mockGetDailyMetrics.mockRejectedValue(new Error("Connection lost"));
      const res = await GET(makeRequest({ view: "daily" }));
      expect(res.status).toBe(500);
    });
  });
});
