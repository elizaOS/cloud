import { beforeEach, describe, expect, mock, test } from "bun:test";
import { jsonRequest } from "./route-test-helpers";

const mockRequireAuthOrApiKeyWithOrg = mock();
const mockCharacterCreate = mock();
const mockFindByTokenAddress = mock();
const mockTrackServerEvent = mock();
const mockFindOrganization = mock();
const mockCountWhere = mock();

mock.module("@/lib/auth", () => ({
  requireAuthOrApiKeyWithOrg: mockRequireAuthOrApiKeyWithOrg,
}));

mock.module("@/lib/services/characters", () => ({
  charactersService: {
    create: mockCharacterCreate,
  },
}));

mock.module("@/db/repositories/characters", () => ({
  userCharactersRepository: {
    findByTokenAddress: mockFindByTokenAddress,
  },
}));

mock.module("@/lib/analytics/posthog-server", () => ({
  trackServerEvent: mockTrackServerEvent,
}));

mock.module("@/db/client", () => ({
  dbRead: {
    query: {
      organizations: {
        findFirst: mockFindOrganization,
      },
    },
    select: () => ({
      from: () => ({
        where: mockCountWhere,
      }),
    }),
  },
}));

mock.module("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: (...args: unknown[]) => unknown) => handler,
  RateLimitPresets: {
    STANDARD: {},
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

import { POST } from "@/app/api/v1/app/agents/route";

describe("POST /api/v1/app/agents", () => {
  beforeEach(() => {
    mockRequireAuthOrApiKeyWithOrg.mockReset();
    mockCharacterCreate.mockReset();
    mockFindByTokenAddress.mockReset();
    mockTrackServerEvent.mockReset();
    mockFindOrganization.mockReset();
    mockCountWhere.mockReset();

    mockRequireAuthOrApiKeyWithOrg.mockResolvedValue({
      user: {
        id: "user-1",
        role: "member",
        organization_id: "org-1",
      },
    });
    mockFindOrganization.mockResolvedValue({
      id: "org-1",
      credit_balance: "100.00",
      settings: {},
    });
    mockCountWhere.mockResolvedValue([{ count: 0 }]);
  });

  test("returns 409 when token-agent linkage races on unique constraint", async () => {
    mockFindByTokenAddress
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "existing-agent-2" });
    mockCharacterCreate.mockRejectedValueOnce(
      Object.assign(new Error("duplicate key value violates unique constraint"), {
        code: "23505",
      }),
    );

    const response = await POST(
      jsonRequest("https://example.com/api/v1/app/agents", "POST", {
        name: "Test Agent",
        tokenAddress: "0xAbCdEf1234567890aBCDef1234567890ABCDef12",
        tokenChain: "base",
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      success: false,
      error:
        "An agent is already linked to token 0xabcdef1234567890abcdef1234567890abcdef12 on base",
      existingAgentId: "existing-agent-2",
    });
    expect(mockTrackServerEvent).not.toHaveBeenCalled();
  });
});
