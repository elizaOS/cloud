import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

afterAll(() => {
  mock.restore();
});

const mockProcessPendingJobs = mock();

mock.module("@/lib/services/provisioning-jobs", () => ({
  provisioningJobService: {
    processPendingJobs: mockProcessPendingJobs,
  },
}));

mock.module("@/lib/utils/logger", () => ({
  logger: {
    info: mock(),
    warn: mock(),
    error: mock(),
    debug: mock(),
  },
}));

import { GET } from "@/app/api/v1/cron/process-provisioning-jobs/route";

describe("GET /api/v1/cron/process-provisioning-jobs", () => {
  const savedCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = "super-secret";
    mockProcessPendingJobs.mockReset();
    mockProcessPendingJobs.mockResolvedValue({
      claimed: 1,
      succeeded: 1,
      failed: 0,
      recovered: 0,
    });
  });

  afterEach(() => {
    if (savedCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = savedCronSecret;
    }
  });

  test("rejects requests with an invalid bearer token", async () => {
    const response = await GET(
      new NextRequest("https://example.com/api/v1/cron/process-provisioning-jobs", {
        headers: {
          authorization: "Bearer wrong-secret",
        },
      }),
    );

    expect(response.status).toBe(401);
    expect(mockProcessPendingJobs).not.toHaveBeenCalled();
  });

  test("processes jobs when the bearer token matches", async () => {
    const response = await GET(
      new NextRequest("https://example.com/api/v1/cron/process-provisioning-jobs", {
        headers: {
          authorization: "Bearer super-secret",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mockProcessPendingJobs).toHaveBeenCalledWith(5);
    expect(await response.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        claimed: 1,
        succeeded: 1,
        failed: 0,
        recovered: 0,
        timestamp: expect.any(String),
      }),
    });
  });

  test("returns 500 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(
      new NextRequest("https://example.com/api/v1/cron/process-provisioning-jobs"),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: "Server configuration error: CRON_SECRET not set",
    });
    expect(mockProcessPendingJobs).not.toHaveBeenCalled();
  });
});
