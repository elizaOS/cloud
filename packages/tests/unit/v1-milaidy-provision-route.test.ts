import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

import { NextRequest } from "next/server";
import { mockMiladyPricingMinimumDepositForRouteTests } from "../helpers/mock-milady-pricing-for-route-tests";
import { routeParams } from "./api/route-test-helpers";

afterAll(() => {
  mock.restore();
});

const mockRequireAuthOrApiKeyWithOrg = mock();
const mockAssertSafeOutboundUrl = mock();
const mockGetAgentForWrite = mock();
const mockProvision = mock();
const mockEnqueueMiladyProvisionOnce = mock();
const mockLoggerError = mock();
const mockCheckMiladyCreditGate = mock();

mock.module("@/lib/auth", () => ({
  requireAuthOrApiKeyWithOrg: mockRequireAuthOrApiKeyWithOrg,
}));

mock.module("@/lib/security/outbound-url", () => ({
  assertSafeOutboundUrl: mockAssertSafeOutboundUrl,
}));

mock.module("@/lib/services/milaidy-sandbox", () => ({
  miladySandboxService: {
    getAgentForWrite: mockGetAgentForWrite,
    provision: mockProvision,
  },
}));

mock.module("@/lib/services/milady-sandbox", () => ({
  miladySandboxService: {
    getAgentForWrite: mockGetAgentForWrite,
    provision: mockProvision,
  },
}));

mock.module("@/lib/services/provisioning-jobs", () => ({
  provisioningJobService: {
    enqueueMiladyProvisionOnce: mockEnqueueMiladyProvisionOnce,
  },
}));

mock.module("@/lib/services/milady-billing-gate", () => ({
  checkMiladyCreditGate: mockCheckMiladyCreditGate,
}));

mockMiladyPricingMinimumDepositForRouteTests(5);

mock.module("@/lib/utils/logger", () => ({
  logger: {
    info: mock(),
    warn: mock(),
    error: mockLoggerError,
    debug: mock(),
  },
}));

import { POST } from "@/app/api/v1/milaidy/agents/[agentId]/provision/route";

describe("POST /api/v1/milaidy/agents/[agentId]/provision", () => {
  beforeEach(() => {
    mockRequireAuthOrApiKeyWithOrg.mockReset();
    mockAssertSafeOutboundUrl.mockReset();
    mockGetAgentForWrite.mockReset();
    mockProvision.mockReset();
    mockEnqueueMiladyProvisionOnce.mockReset();
    mockLoggerError.mockReset();
    mockCheckMiladyCreditGate.mockReset();

    mockCheckMiladyCreditGate.mockResolvedValue({ allowed: true, balance: 100 });
    mockRequireAuthOrApiKeyWithOrg.mockResolvedValue({
      user: {
        id: "user-1",
        organization_id: "org-1",
      },
    });
    mockGetAgentForWrite.mockResolvedValue({
      id: "agent-1",
      agent_name: "Agent One",
      status: "pending",
      bridge_url: null,
      health_url: null,
      updated_at: new Date("2026-03-13T09:00:00.000Z"),
    });
    mockAssertSafeOutboundUrl.mockResolvedValue(new URL("https://hooks.example.com/job"));
  });

  test("sanitizes sync provision 500 errors", async () => {
    mockProvision.mockResolvedValue({
      success: false,
      error: "Database provisioning failed: password authentication failed for user postgres",
    });

    const response = await POST(
      new NextRequest("https://example.com/api/v1/milaidy/agents/agent-1/provision?sync=true", {
        method: "POST",
      }),
      routeParams({ agentId: "agent-1" }),
    );

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.success).toBe(false);
    // Error message is sanitized — must not leak internal details
    expect(typeof body.error).toBe("string");
    expect(body.error).not.toContain("password authentication");
  });

  test("sanitizes async enqueue 500 errors", async () => {
    mockEnqueueMiladyProvisionOnce.mockRejectedValue(
      new Error('duplicate key value violates unique constraint "jobs_pkey"'),
    );

    const response = await POST(
      new NextRequest("https://example.com/api/v1/milaidy/agents/agent-1/provision", {
        method: "POST",
      }),
      routeParams({ agentId: "agent-1" }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: "Failed to start provisioning",
    });
    expect(mockLoggerError).toHaveBeenCalled();
  });
});
