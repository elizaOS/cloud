import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { routeParams } from "./api/route-test-helpers";

const mockRequireServiceKey = mock();
const mockAuthenticateWaifuBridge = mock();
const mockRequireAuthOrApiKeyWithOrg = mock();
const mockGetAgent = mock();
const mockSnapshot = mock();
const mockProvision = mock();

class MockServiceKeyAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceKeyAuthError";
  }
}

mock.module("@/lib/auth/service-key", () => ({
  requireServiceKey: mockRequireServiceKey,
  ServiceKeyAuthError: MockServiceKeyAuthError,
}));

mock.module("@/lib/auth/waifu-bridge", () => ({
  authenticateWaifuBridge: mockAuthenticateWaifuBridge,
}));

mock.module("@/lib/auth", () => ({
  requireAuthOrApiKeyWithOrg: mockRequireAuthOrApiKeyWithOrg,
}));

mock.module("@/lib/services/milaidy-sandbox", () => ({
  miladySandboxService: {
    getAgent: mockGetAgent,
    snapshot: mockSnapshot,
    provision: mockProvision,
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

import { requireCompatAuth } from "@/app/api/compat/_lib/auth";
import { POST as restartAgent } from "@/app/api/compat/agents/[id]/restart/route";

describe("compat auth", () => {
  beforeEach(() => {
    mockRequireServiceKey.mockReset();
    mockAuthenticateWaifuBridge.mockReset();
    mockRequireAuthOrApiKeyWithOrg.mockReset();
    mockGetAgent.mockReset();
    mockSnapshot.mockReset();
    mockProvision.mockReset();

    mockAuthenticateWaifuBridge.mockResolvedValue(null);
    mockRequireAuthOrApiKeyWithOrg.mockResolvedValue({
      user: {
        id: "user-1",
        organization_id: "org-1",
      },
    });
  });

  test("rejects invalid service-key attempts instead of falling through", async () => {
    mockRequireServiceKey.mockImplementation(() => {
      throw new Error("WAIFU_SERVICE_KEY is not configured");
    });

    await expect(
      requireCompatAuth(
        new NextRequest("https://example.com/api/compat/agents", {
          headers: { "X-Service-Key": "bad-key" },
        }),
      ),
    ).rejects.toThrow("Invalid service key");

    expect(mockAuthenticateWaifuBridge).not.toHaveBeenCalled();
    expect(mockRequireAuthOrApiKeyWithOrg).not.toHaveBeenCalled();
  });
});

describe("POST /api/compat/agents/[id]/restart", () => {
  beforeEach(() => {
    mockRequireServiceKey.mockReset();
    mockAuthenticateWaifuBridge.mockReset();
    mockRequireAuthOrApiKeyWithOrg.mockReset();
    mockGetAgent.mockReset();
    mockSnapshot.mockReset();
    mockProvision.mockReset();

    mockAuthenticateWaifuBridge.mockResolvedValue(null);
    mockRequireAuthOrApiKeyWithOrg.mockResolvedValue({
      user: {
        id: "user-1",
        organization_id: "org-1",
      },
    });
    mockGetAgent.mockResolvedValue({
      id: "agent-1",
      organization_id: "org-1",
    });
    mockSnapshot.mockResolvedValue(undefined);
  });

  test("returns 502 with failed op result when restart fails", async () => {
    mockProvision.mockResolvedValue({
      success: false,
      error: "container restart failed",
    });

    const response = await restartAgent(
      new NextRequest("https://example.com/api/compat/agents/agent-1/restart", {
        method: "POST",
      }),
      routeParams({ id: "agent-1" }),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        jobId: "agent-1",
        status: "failed",
        message: "agent restart failed",
      },
    });
  });
});
