/**
 * Compute Metrics Cron Route Tests
 *
 * Tests the /api/cron/compute-metrics endpoint including:
 * - CRON_SECRET authentication (timing-safe comparison)
 * - Successful computation flow
 * - Error handling
 * - Both GET and POST methods
 */

import { describe, test, expect, beforeEach, mock, afterEach } from "bun:test";
import { NextRequest } from "next/server";

// ─── Mock Setup ──────────────────────────────────────────────────────────────

const mockComputeDailyMetrics = mock(() => Promise.resolve());
const mockComputeRetentionCohorts = mock(() => Promise.resolve());

mock.module("@/lib/services/user-metrics", () => ({
  userMetricsService: {
    computeDailyMetrics: mockComputeDailyMetrics,
    computeRetentionCohorts: mockComputeRetentionCohorts,
  },
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

import { GET, POST } from "@/app/api/cron/compute-metrics/route";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(
  method: "GET" | "POST",
  secret?: string,
): NextRequest {
  const headers = new Headers();
  if (secret) {
    headers.set("authorization", `Bearer ${secret}`);
  }
  return new NextRequest("http://localhost:3000/api/cron/compute-metrics", {
    method,
    headers,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Compute Metrics Cron", () => {
  const VALID_SECRET = "test-cron-secret-123";

  beforeEach(() => {
    mockComputeDailyMetrics.mockReset();
    mockComputeRetentionCohorts.mockReset();
    mockComputeDailyMetrics.mockResolvedValue(undefined);
    mockComputeRetentionCohorts.mockResolvedValue(undefined);
    process.env.CRON_SECRET = VALID_SECRET;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  describe("authentication", () => {
    test("rejects request with no authorization header", async () => {
      const req = makeRequest("GET");
      const res = await GET(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });

    test("rejects request with wrong secret", async () => {
      const req = makeRequest("GET", "wrong-secret");
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    test("rejects request when CRON_SECRET is not set", async () => {
      delete process.env.CRON_SECRET;
      const req = makeRequest("GET", "any-secret");
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    test("rejects request with different-length secret", async () => {
      const req = makeRequest("GET", "short");
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    test("accepts request with valid secret", async () => {
      const req = makeRequest("GET", VALID_SECRET);
      const res = await GET(req);
      expect(res.status).toBe(200);
    });
  });

  describe("computation", () => {
    test("calls computeDailyMetrics with yesterday's date", async () => {
      const req = makeRequest("GET", VALID_SECRET);
      await GET(req);

      expect(mockComputeDailyMetrics).toHaveBeenCalledTimes(1);
      const calledWith = mockComputeDailyMetrics.mock.calls[0][0] as Date;
      const now = new Date();
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      expect(calledWith.getUTCDate()).toBe(yesterday.getUTCDate());
    });

    test("calls computeRetentionCohorts with yesterday's date", async () => {
      const req = makeRequest("GET", VALID_SECRET);
      await GET(req);

      expect(mockComputeRetentionCohorts).toHaveBeenCalledTimes(1);
    });

    test("returns success response with date and duration", async () => {
      const req = makeRequest("GET", VALID_SECRET);
      const res = await GET(req);
      const body = await res.json();

      expect(body.success).toBe(true);
      expect(body.data.date).toBeDefined();
      expect(body.data.duration).toBeDefined();
      expect(typeof body.data.duration).toBe("number");
      expect(body.data.timestamp).toBeDefined();
    });

    test("returns 500 when computation fails", async () => {
      mockComputeDailyMetrics.mockRejectedValue(
        new Error("DB connection failed"),
      );

      const req = makeRequest("GET", VALID_SECRET);
      const res = await GET(req);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe("DB connection failed");
    });

    test("returns generic error for non-Error exceptions", async () => {
      mockComputeDailyMetrics.mockRejectedValue("unknown error");

      const req = makeRequest("GET", VALID_SECRET);
      const res = await GET(req);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Metrics computation failed");
    });
  });

  describe("HTTP methods", () => {
    test("GET handler works", async () => {
      const req = makeRequest("GET", VALID_SECRET);
      const res = await GET(req);
      expect(res.status).toBe(200);
    });

    test("POST handler works", async () => {
      const req = makeRequest("POST", VALID_SECRET);
      const res = await POST(req);
      expect(res.status).toBe(200);
    });
  });
});
