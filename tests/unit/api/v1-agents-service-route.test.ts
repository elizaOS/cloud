import { beforeEach, describe, expect, mock, test } from "bun:test";
import { jsonRequest } from "./route-test-helpers";

const mockRequireServiceKey = mock();
const mockCreateAgent = mock();
const mockEnqueueMiladyProvision = mock();
const mockFindByTokenAddress = mock();
const mockGetAllUsernames = mock();
const mockCharacterCreate = mock();
const mockCharacterCreateDB = mock();

mock.module("@/lib/auth/service-key", () => ({
  requireServiceKey: mockRequireServiceKey,
  ServiceKeyAuthError: class ServiceKeyAuthError extends Error {},
}));

mock.module("@/lib/services/milaidy-sandbox", () => ({
  miladySandboxService: {
    createAgent: mockCreateAgent,
  },
}));

mock.module("@/lib/services/provisioning-jobs", () => ({
  provisioningJobService: {
    enqueueMiladyProvision: mockEnqueueMiladyProvision,
  },
}));

mock.module("@/db/repositories/characters", () => ({
  userCharactersRepository: {
    findByTokenAddress: mockFindByTokenAddress,
    getAllUsernames: mockGetAllUsernames,
    create: mockCharacterCreateDB,
  },
}));

mock.module("@/lib/services/characters/characters", () => ({
  charactersService: {
    create: mockCharacterCreate,
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

import { POST } from "@/app/api/v1/agents/route";

describe("POST /api/v1/agents", () => {
  beforeEach(() => {
    mockRequireServiceKey.mockReset();
    mockCreateAgent.mockReset();
    mockEnqueueMiladyProvision.mockReset();
    mockFindByTokenAddress.mockReset();
    mockGetAllUsernames.mockReset();
    mockCharacterCreate.mockReset();
    mockCharacterCreateDB.mockReset();

    mockRequireServiceKey.mockReturnValue({
      organizationId: "org-1",
      userId: "user-1",
    });

    mockGetAllUsernames.mockResolvedValue(new Set());
  });

  test("returns 409 when token-agent linkage races on unique constraint", async () => {
    mockFindByTokenAddress
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "existing-agent-1" });
    mockCharacterCreate.mockRejectedValueOnce(
      Object.assign(new Error("duplicate key value violates unique constraint"), {
        code: "23505",
      }),
    );

    const response = await POST(
      jsonRequest("https://example.com/api/v1/agents", "POST", {
        tokenContractAddress: "0xAbCdEf1234567890aBCDef1234567890ABCDef12",
        chain: "base",
        chainId: 8453,
        tokenName: "Test Token",
        tokenTicker: "TEST",
        launchType: "native",
      }, {
        "X-Service-Key": "test-service-key",
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error:
        "An agent is already linked to token 0xAbCdEf1234567890aBCDef1234567890ABCDef12 on base",
      existingAgentId: "existing-agent-1",
    });
    expect(mockCreateAgent).not.toHaveBeenCalled();
    expect(mockEnqueueMiladyProvision).not.toHaveBeenCalled();
  });

  test("stores normalized token address in agent config and environment vars", async () => {
    mockFindByTokenAddress.mockResolvedValueOnce(null);
    mockCharacterCreate.mockResolvedValueOnce({
      id: "char-1",
      token_address: "0xabcdef1234567890abcdef1234567890abcdef12",
      token_chain: "base",
      token_name: "Test Token",
      token_ticker: "TEST",
    });
    mockCreateAgent.mockResolvedValueOnce({ id: "agent-1" });
    mockEnqueueMiladyProvision.mockResolvedValueOnce({ id: "job-1" });

    const response = await POST(
      jsonRequest("https://example.com/api/v1/agents", "POST", {
        tokenContractAddress: "0xAbCdEf1234567890aBCDef1234567890ABCDef12",
        chain: "base",
        chainId: 8453,
        tokenName: "Test Token",
        tokenTicker: "TEST",
        launchType: "native",
      }, {
        "X-Service-Key": "test-service-key",
      }),
    );

    expect(response.status).toBe(202);
    expect(mockCreateAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentConfig: expect.objectContaining({
          tokenContractAddress: "0xabcdef1234567890abcdef1234567890abcdef12",
        }),
        environmentVars: expect.objectContaining({
          TOKEN_CONTRACT_ADDRESS: "0xabcdef1234567890abcdef1234567890abcdef12",
        }),
      }),
    );
  });
});
