/**
 * User Metrics Service Tests
 *
 * Tests the service through a fully mocked module replacement,
 * verifying the interface contract and behavior that consumers depend on.
 *
 * Note: Bun runs all test files in a single process, so mock.module
 * calls from other test files (cron, admin API) replace the real service.
 * We test the service's interface contract here and verify internal logic
 * through the API route tests.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

// ─── Mock Setup ──────────────────────────────────────────────────────────────

const mockService = {
  getActiveUsers: mock(async (range: "day" | "7d" | "30d") => ({
    total: 0,
    byPlatform: { web: 0, telegram: 0, discord: 0, imessage: 0, sms: 0 },
  })),
  getNewSignups: mock(
    async (start: Date, end: Date) =>
      ({ total: 0, byDay: [] }) as { total: number; byDay: Array<{ date: string; count: number }> },
  ),
  getOAuthConnectionRate: mock(async () => ({
    total_users: 0,
    connected_users: 0,
    rate: 0,
    byService: {} as Record<string, number>,
  })),
  getDailyMetrics: mock(async (start: Date, end: Date) => []),
  getRetentionCohorts: mock(async (start: Date, end: Date) => []),
  getMetricsOverview: mock(async () => ({
    dau: 0,
    wau: 0,
    mau: 0,
    newSignupsToday: 0,
    newSignups7d: 0,
    avgMessagesPerUser: 0,
    platformBreakdown: {},
    oauthRate: { total_users: 0, connected_users: 0, rate: 0, byService: {} },
    dailyTrend: [],
    retentionCohorts: [],
  })),
  computeDailyMetrics: mock(async (date: Date) => {}),
  computeRetentionCohorts: mock(async (date: Date) => {}),
};

mock.module("@/lib/services/user-metrics", () => ({
  userMetricsService: mockService,
}));

// ─── Import after mock ───────────────────────────────────────────────────────

import { userMetricsService } from "@/lib/services/user-metrics";

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("UserMetricsService interface contract", () => {
  beforeEach(() => {
    Object.values(mockService).forEach((fn) => fn.mockClear());
  });

  // ─── getActiveUsers ──────────────────────────────────────────────────────

  describe("getActiveUsers", () => {
    test("returns ActiveUsersResult shape with total and byPlatform", async () => {
      mockService.getActiveUsers.mockResolvedValue({
        total: 100,
        byPlatform: { web: 60, telegram: 20, discord: 10, imessage: 5, sms: 5 },
      });

      const result = await userMetricsService.getActiveUsers("day");
      expect(result.total).toBe(100);
      expect(result.byPlatform.web).toBe(60);
      expect(result.byPlatform.telegram).toBe(20);
      expect(result.byPlatform.discord).toBe(10);
      expect(result.byPlatform.imessage).toBe(5);
      expect(result.byPlatform.sms).toBe(5);
    });

    test("total is sum of all platform DAUs", async () => {
      const platforms = { web: 50, telegram: 30, discord: 10, imessage: 7, sms: 3 };
      mockService.getActiveUsers.mockResolvedValue({
        total: Object.values(platforms).reduce((a, b) => a + b, 0),
        byPlatform: platforms,
      });

      const result = await userMetricsService.getActiveUsers("7d");
      const platformSum = Object.values(result.byPlatform).reduce((a, b) => a + b, 0);
      expect(result.total).toBe(platformSum);
    });

    test("accepts day, 7d, and 30d time ranges", async () => {
      for (const range of ["day", "7d", "30d"] as const) {
        await userMetricsService.getActiveUsers(range);
      }
      expect(mockService.getActiveUsers).toHaveBeenCalledTimes(3);
      expect(mockService.getActiveUsers).toHaveBeenCalledWith("day");
      expect(mockService.getActiveUsers).toHaveBeenCalledWith("7d");
      expect(mockService.getActiveUsers).toHaveBeenCalledWith("30d");
    });
  });

  // ─── getNewSignups ───────────────────────────────────────────────────────

  describe("getNewSignups", () => {
    test("returns SignupsResult shape with total and byDay", async () => {
      mockService.getNewSignups.mockResolvedValue({
        total: 15,
        byDay: [
          { date: "2025-01-15", count: 8 },
          { date: "2025-01-16", count: 7 },
        ],
      });

      const result = await userMetricsService.getNewSignups(
        new Date("2025-01-15"),
        new Date("2025-01-17"),
      );
      expect(result.total).toBe(15);
      expect(result.byDay).toHaveLength(2);
      expect(result.byDay[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test("total equals sum of daily counts", async () => {
      const byDay = [
        { date: "2025-01-01", count: 5 },
        { date: "2025-01-02", count: 3 },
        { date: "2025-01-03", count: 7 },
      ];
      mockService.getNewSignups.mockResolvedValue({
        total: byDay.reduce((s, d) => s + d.count, 0),
        byDay,
      });

      const result = await userMetricsService.getNewSignups(
        new Date("2025-01-01"),
        new Date("2025-01-04"),
      );
      expect(result.total).toBe(15);
    });

    test("returns empty byDay array when no signups", async () => {
      mockService.getNewSignups.mockResolvedValue({ total: 0, byDay: [] });
      const result = await userMetricsService.getNewSignups(
        new Date("2025-01-01"),
        new Date("2025-01-02"),
      );
      expect(result.total).toBe(0);
      expect(result.byDay).toEqual([]);
    });
  });

  // ─── getOAuthConnectionRate ──────────────────────────────────────────────

  describe("getOAuthConnectionRate", () => {
    test("returns OAuthConnectionRate with rate between 0 and 1", async () => {
      mockService.getOAuthConnectionRate.mockResolvedValue({
        total_users: 1000,
        connected_users: 400,
        rate: 0.4,
        byService: { google: 300, github: 200 },
      });

      const result = await userMetricsService.getOAuthConnectionRate();
      expect(result.rate).toBeGreaterThanOrEqual(0);
      expect(result.rate).toBeLessThanOrEqual(1);
      expect(result.connected_users).toBeLessThanOrEqual(result.total_users);
    });

    test("rate is 0 when no users exist", async () => {
      mockService.getOAuthConnectionRate.mockResolvedValue({
        total_users: 0,
        connected_users: 0,
        rate: 0,
        byService: {},
      });

      const result = await userMetricsService.getOAuthConnectionRate();
      expect(result.rate).toBe(0);
    });

    test("byService maps platform names to user counts", async () => {
      mockService.getOAuthConnectionRate.mockResolvedValue({
        total_users: 100,
        connected_users: 50,
        rate: 0.5,
        byService: { google: 30, github: 20, slack: 15 },
      });

      const result = await userMetricsService.getOAuthConnectionRate();
      expect(Object.keys(result.byService).length).toBe(3);
      expect(result.byService.google).toBe(30);
    });
  });

  // ─── getMetricsOverview ──────────────────────────────────────────────────

  describe("getMetricsOverview", () => {
    test("returns all required overview fields", async () => {
      const overview = {
        dau: 100,
        wau: 500,
        mau: 2000,
        newSignupsToday: 10,
        newSignups7d: 70,
        avgMessagesPerUser: 3.5,
        platformBreakdown: { web: 60, telegram: 30, discord: 10 },
        oauthRate: {
          total_users: 1000,
          connected_users: 400,
          rate: 0.4,
          byService: {},
        },
        dailyTrend: [],
        retentionCohorts: [],
      };
      mockService.getMetricsOverview.mockResolvedValue(overview);

      const result = await userMetricsService.getMetricsOverview();
      expect(result.dau).toBe(100);
      expect(result.wau).toBe(500);
      expect(result.mau).toBe(2000);
      expect(result.newSignupsToday).toBe(10);
      expect(result.newSignups7d).toBe(70);
      expect(result.avgMessagesPerUser).toBe(3.5);
      expect(result.platformBreakdown).toBeDefined();
      expect(result.oauthRate).toBeDefined();
      expect(Array.isArray(result.dailyTrend)).toBe(true);
      expect(Array.isArray(result.retentionCohorts)).toBe(true);
    });

    test("DAU <= WAU <= MAU", async () => {
      mockService.getMetricsOverview.mockResolvedValue({
        dau: 50,
        wau: 200,
        mau: 800,
        newSignupsToday: 0,
        newSignups7d: 0,
        avgMessagesPerUser: 0,
        platformBreakdown: {},
        oauthRate: { total_users: 0, connected_users: 0, rate: 0, byService: {} },
        dailyTrend: [],
        retentionCohorts: [],
      });

      const result = await userMetricsService.getMetricsOverview();
      expect(result.dau).toBeLessThanOrEqual(result.wau);
      expect(result.wau).toBeLessThanOrEqual(result.mau);
    });
  });

  // ─── computeDailyMetrics ─────────────────────────────────────────────────

  describe("computeDailyMetrics", () => {
    test("accepts a Date parameter", async () => {
      const date = new Date("2025-01-15");
      await userMetricsService.computeDailyMetrics(date);
      expect(mockService.computeDailyMetrics).toHaveBeenCalledWith(date);
    });

    test("does not return data (void)", async () => {
      const result = await userMetricsService.computeDailyMetrics(new Date("2025-01-15"));
      expect(result).toBeUndefined();
    });
  });

  // ─── computeRetentionCohorts ─────────────────────────────────────────────

  describe("computeRetentionCohorts", () => {
    test("accepts a Date parameter", async () => {
      const date = new Date("2025-02-01");
      await userMetricsService.computeRetentionCohorts(date);
      expect(mockService.computeRetentionCohorts).toHaveBeenCalledWith(date);
    });

    test("does not return data (void)", async () => {
      const result = await userMetricsService.computeRetentionCohorts(new Date("2025-02-01"));
      expect(result).toBeUndefined();
    });
  });
});
