import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

const mockFindAll = mock();
const mockValidateServiceKey = mock();
const mockAuthenticateWaifuBridge = mock();
const mockRequireAuthOrApiKeyWithOrg = mock();

mock.module("@/db/repositories/docker-nodes", () => ({
  dockerNodesRepository: {
    findAll: mockFindAll,
  },
}));

mock.module("@/lib/auth/service-key", () => ({
  validateServiceKey: mockValidateServiceKey,
}));

mock.module("@/lib/auth/waifu-bridge", () => ({
  authenticateWaifuBridge: mockAuthenticateWaifuBridge,
}));

mock.module("@/lib/auth", () => ({
  requireAuthOrApiKeyWithOrg: mockRequireAuthOrApiKeyWithOrg,
}));

import { GET } from "@/app/api/compat/availability/route";

describe("compat availability route", () => {
  beforeEach(() => {
    mockFindAll.mockReset();
    mockValidateServiceKey.mockReset();
    mockAuthenticateWaifuBridge.mockReset();
    mockRequireAuthOrApiKeyWithOrg.mockReset();

    mockFindAll.mockResolvedValue([
      {
        node_id: "node-1",
        hostname: "node-1.internal",
        capacity: 8,
        allocated_count: 3,
        status: "healthy",
      },
    ]);

    mockValidateServiceKey.mockReturnValue(null);
    mockAuthenticateWaifuBridge.mockResolvedValue(null);
    mockRequireAuthOrApiKeyWithOrg.mockRejectedValue(new Error("unauthorized"));
  });

  test("omits per-node topology for unauthenticated requests", async () => {
    const response = await GET(
      new NextRequest("https://example.com/api/compat/availability"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      totalSlots: 8,
      usedSlots: 3,
      availableSlots: 5,
      acceptingNewAgents: true,
    });
  });

  test("includes per-node topology for authenticated requests", async () => {
    mockValidateServiceKey.mockReturnValue({
      organizationId: "org-1",
      userId: "user-1",
    });

    const response = await GET(
      new NextRequest("https://example.com/api/compat/availability", {
        headers: { "X-Service-Key": "test-key" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.nodes).toEqual([
      {
        nodeId: "node-1",
        hostname: "node-1.internal",
        capacity: 8,
        allocated: 3,
        available: 5,
        status: "healthy",
      },
    ]);
  });
});
