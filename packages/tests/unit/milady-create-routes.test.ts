import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { jsonRequest } from "./api/route-test-helpers";

const mockRequireAuthOrApiKeyWithOrg = mock();
const mockRequireServiceKey = mock();
const mockAuthenticateWaifuBridge = mock();
const mockCreateAgent = mock();
const mockFindByIdInOrganizationForWrite = mock();
const mockPrepareManagedMiladyEnvironment = mock();
const mockCheckMiladyCreditGate = mock();

mock.module("@/lib/auth", () => ({
  requireAuthOrApiKeyWithOrg: mockRequireAuthOrApiKeyWithOrg,
}));

mock.module("@/lib/auth/service-key", () => ({
  requireServiceKey: mockRequireServiceKey,
  ServiceKeyAuthError: class ServiceKeyAuthError extends Error {},
}));

mock.module("@/lib/auth/waifu-bridge", () => ({
  authenticateWaifuBridge: mockAuthenticateWaifuBridge,
}));

mock.module("@/lib/services/milaidy-sandbox", () => ({
  miladySandboxService: {
    createAgent: mockCreateAgent,
    provision: mock(),
    listAgents: mock(),
  },
}));

mock.module("@/lib/services/milady-sandbox", () => ({
  miladySandboxService: {
    createAgent: mockCreateAgent,
    provision: mock(),
    listAgents: mock(),
  },
}));

mock.module("@/lib/services/milady-managed-launch", () => ({
  prepareManagedMiladyEnvironment: mockPrepareManagedMiladyEnvironment,
}));

mock.module("@/db/repositories/characters", () => ({
  userCharactersRepository: {
    findByIdInOrganizationForWrite: mockFindByIdInOrganizationForWrite,
    findByIdsInOrganization: mock(),
  },
}));

mock.module("@/lib/services/milady-billing-gate", () => ({
  checkMiladyCreditGate: mockCheckMiladyCreditGate,
}));

mock.module("@/lib/constants/milady-pricing", () => ({
  MILADY_PRICING: { MINIMUM_DEPOSIT: 5 },
}));

mock.module("@/lib/utils/logger", () => ({
  logger: {
    info: mock(),
    warn: mock(),
    error: mock(),
    debug: mock(),
  },
}));

import { POST as postCompatAgent } from "@/app/api/compat/agents/route";
import { POST as postV1MiladyAgent } from "@/app/api/v1/milady/agents/route";

describe("Milady create routes reserved config stripping", () => {
  const savedAutoProvision = process.env.WAIFU_AUTO_PROVISION;

  beforeEach(() => {
    delete process.env.WAIFU_AUTO_PROVISION;

    mockRequireAuthOrApiKeyWithOrg.mockReset();
    mockRequireServiceKey.mockReset();
    mockAuthenticateWaifuBridge.mockReset();
    mockCreateAgent.mockReset();
    mockFindByIdInOrganizationForWrite.mockReset();
    mockPrepareManagedMiladyEnvironment.mockReset();
    mockCheckMiladyCreditGate.mockReset();

    mockCheckMiladyCreditGate.mockResolvedValue({ allowed: true, balance: 100 });
    mockRequireAuthOrApiKeyWithOrg.mockResolvedValue({
      user: {
        id: "user-1",
        organization_id: "org-1",
      },
    });
    mockRequireServiceKey.mockImplementation(() => {
      throw new Error("should not be called");
    });
    mockAuthenticateWaifuBridge.mockResolvedValue(null);
    mockCreateAgent.mockResolvedValue({
      id: "agent-1",
      agent_name: "Test Agent",
      status: "pending",
      created_at: new Date("2026-03-13T09:00:00.000Z"),
    });
    mockPrepareManagedMiladyEnvironment.mockImplementation(async ({ existingEnv }) => ({
      environmentVars: existingEnv ?? {},
    }));
  });

  afterEach(() => {
    if (savedAutoProvision === undefined) {
      delete process.env.WAIFU_AUTO_PROVISION;
    } else {
      process.env.WAIFU_AUTO_PROVISION = savedAutoProvision;
    }
  });

  test("v1 route strips reserved __milady keys case-insensitively", async () => {
    const response = await postV1MiladyAgent(
      jsonRequest("https://example.com/api/v1/milady/agents", "POST", {
        agentName: "Test Agent",
        agentConfig: {
          safe: true,
          __miladyCharacterOwnership: "spoofed",
          __MILADYAdmin: true,
          __MiLaDyShadow: "spoofed",
        },
      }),
    );

    expect(response.status).toBe(201);
    expect(mockCreateAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentConfig: {
          safe: true,
        },
      }),
    );
  });

  test("compat route strips reserved __milady keys case-insensitively", async () => {
    const response = await postCompatAgent(
      jsonRequest("https://example.com/api/compat/agents", "POST", {
        agentName: "Compat Agent",
        agentConfig: {
          safe: "ok",
          __miladyCharacterOwnership: "spoofed",
          __MILADYAdmin: true,
          __MiLaDyShadow: "spoofed",
        },
      }),
    );

    expect(response.status).toBe(201);
    expect(mockCreateAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentConfig: {
          safe: "ok",
        },
      }),
    );
  });
});
