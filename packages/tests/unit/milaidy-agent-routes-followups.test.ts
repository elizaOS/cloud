import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { jsonRequest, routeParams } from "./api/route-test-helpers";

const mockRequireAuthOrApiKeyWithOrg = mock();
const mockRequireServiceKey = mock();
const mockAuthenticateWaifuBridge = mock();
const mockCreateAgent = mock();
const mockGetAgent = mock();
const mockGetAgentForWrite = mock();
const mockShutdown = mock();
const mockDeleteAgent = mock();
const mockProvision = mock();
const mockRestore = mock();
const mockEnqueueMiladyProvisionOnce = mock();
const mockFindCharacterForWrite = mock();
const mockCharacterDelete = mock();
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
    getAgent: mockGetAgent,
    getAgentForWrite: mockGetAgentForWrite,
    shutdown: mockShutdown,
    deleteAgent: mockDeleteAgent,
    provision: mockProvision,
    restore: mockRestore,
  },
}));

mock.module("@/lib/services/milady-sandbox", () => ({
  miladySandboxService: {
    createAgent: mockCreateAgent,
    getAgent: mockGetAgent,
    getAgentForWrite: mockGetAgentForWrite,
    shutdown: mockShutdown,
    deleteAgent: mockDeleteAgent,
    provision: mockProvision,
    restore: mockRestore,
  },
}));

mock.module("@/lib/services/milady-managed-launch", () => ({
  prepareManagedMiladyEnvironment: mockPrepareManagedMiladyEnvironment,
}));

mock.module("@/lib/services/provisioning-jobs", () => ({
  provisioningJobService: {
    enqueueMiladyProvisionOnce: mockEnqueueMiladyProvisionOnce,
  },
}));

mock.module("@/db/repositories/characters", () => ({
  userCharactersRepository: {
    findByIdInOrganizationForWrite: mockFindCharacterForWrite,
    delete: mockCharacterDelete,
  },
}));

mock.module("@/lib/security/outbound-url", () => ({
  assertSafeOutboundUrl: mock(async (url: string) => new URL(url)),
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

import { POST as postCompatAgents } from "@/app/api/compat/agents/route";
import { POST as postProvisionRoute } from "@/app/api/v1/milaidy/agents/[agentId]/provision/route";
import { POST as postRestoreRoute } from "@/app/api/v1/milaidy/agents/[agentId]/restore/route";
import {
  DELETE as deleteMilaidyAgent,
  PATCH as patchMilaidyAgent,
} from "@/app/api/v1/milaidy/agents/[agentId]/route";
import { POST as postV1MilaidyAgents } from "@/app/api/v1/milaidy/agents/route";

describe("milady agent route follow-ups", () => {
  beforeEach(() => {
    delete process.env.WAIFU_AUTO_PROVISION;

    mockRequireAuthOrApiKeyWithOrg.mockReset();
    mockRequireServiceKey.mockReset();
    mockAuthenticateWaifuBridge.mockReset();
    mockCreateAgent.mockReset();
    mockGetAgent.mockReset();
    mockGetAgentForWrite.mockReset();
    mockShutdown.mockReset();
    mockDeleteAgent.mockReset();
    mockProvision.mockReset();
    mockRestore.mockReset();
    mockEnqueueMiladyProvisionOnce.mockReset();
    mockFindCharacterForWrite.mockReset();
    mockCharacterDelete.mockReset();
    mockPrepareManagedMiladyEnvironment.mockReset();
    mockCheckMiladyCreditGate.mockReset();

    mockCheckMiladyCreditGate.mockResolvedValue({ allowed: true, balance: 100 });
    mockRequireAuthOrApiKeyWithOrg.mockResolvedValue({
      user: {
        id: "user-1",
        organization_id: "org-1",
      },
    });

    mockAuthenticateWaifuBridge.mockResolvedValue(null);
    mockPrepareManagedMiladyEnvironment.mockImplementation(async ({ existingEnv }) => ({
      environmentVars: existingEnv ?? {},
    }));
  });

  test("POST /api/v1/milaidy/agents strips reserved __milady keys case-insensitively", async () => {
    mockFindCharacterForWrite.mockResolvedValue({ id: "char-1" });
    mockCreateAgent.mockResolvedValue({
      id: "agent-1",
      agent_name: "Agent One",
      status: "pending",
      created_at: new Date("2026-01-01T00:00:00.000Z"),
    });

    const response = await postV1MilaidyAgents(
      jsonRequest("https://example.com/api/v1/milaidy/agents", "POST", {
        agentName: "Agent One",
        characterId: "11111111-1111-4111-8111-111111111111",
        agentConfig: {
          keepMe: true,
          __miladyCharacterOwnership: "spoofed",
          __MILADYInjected: "spoofed-too",
        },
      }),
    );

    expect(response.status).toBe(201);
    expect(mockCreateAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentConfig: {
          keepMe: true,
          __miladyCharacterOwnership: "reuse-existing",
        },
      }),
    );
  });

  test("POST /api/compat/agents strips reserved __milady keys case-insensitively", async () => {
    mockCreateAgent.mockResolvedValue({
      id: "agent-compat-1",
      agent_name: "Compat Agent",
      status: "pending",
      node_id: null,
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      updated_at: new Date("2026-01-01T00:00:00.000Z"),
    });

    const response = await postCompatAgents(
      jsonRequest("https://example.com/api/compat/agents", "POST", {
        agentName: "Compat Agent",
        agentConfig: {
          safe: "value",
          __MILADYOwnership: "spoofed",
          __miladyOther: true,
        },
      }),
    );

    expect(response.status).toBe(201);
    expect(mockCreateAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentConfig: { safe: "value" },
      }),
    );
  });

  test("POST /api/v1/milaidy/agents/[agentId]/provision returns 409 for stale expectedUpdatedAt state", async () => {
    const updatedAt = new Date("2026-03-01T12:00:00.000Z");
    mockGetAgentForWrite.mockResolvedValue({
      id: "agent-1",
      agent_name: "Agent One",
      status: "stopped",
      updated_at: updatedAt,
    });
    mockEnqueueMiladyProvisionOnce.mockRejectedValue(
      new Error("Agent state changed while starting"),
    );

    const response = await postProvisionRoute(
      new NextRequest("https://example.com/api/v1/milaidy/agents/agent-1/provision", {
        method: "POST",
      }),
      routeParams({ agentId: "agent-1" }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      success: false,
      error: "Agent state changed while starting",
    });
    expect(mockEnqueueMiladyProvisionOnce).toHaveBeenCalledWith(
      expect.objectContaining({ expectedUpdatedAt: updatedAt }),
    );
  });

  test("POST /api/v1/milaidy/agents/[agentId]/provision returns existing job details on duplicate enqueue", async () => {
    const updatedAt = new Date("2026-03-01T12:00:00.000Z");
    const estimatedCompletionAt = new Date("2026-03-01T12:01:30.000Z");
    mockGetAgentForWrite.mockResolvedValue({
      id: "agent-1",
      agent_name: "Agent One",
      status: "stopped",
      updated_at: updatedAt,
    });
    mockEnqueueMiladyProvisionOnce.mockResolvedValue({
      created: false,
      job: {
        id: "job-existing",
        status: "pending",
        estimated_completion_at: estimatedCompletionAt,
      },
    });

    const response = await postProvisionRoute(
      new NextRequest("https://example.com/api/v1/milaidy/agents/agent-1/provision", {
        method: "POST",
      }),
      routeParams({ agentId: "agent-1" }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      success: true,
      created: false,
      alreadyInProgress: true,
      message: "Provisioning is already in progress. Poll the existing job for status.",
      data: {
        jobId: "job-existing",
        agentId: "agent-1",
        status: "pending",
        estimatedCompletionAt: estimatedCompletionAt.toISOString(),
      },
      polling: {
        endpoint: "/api/v1/jobs/job-existing",
        intervalMs: 5000,
        expectedDurationMs: 90000,
      },
    });
  });

  test("PATCH /api/v1/milaidy/agents/[agentId] rejects invalid lifecycle payloads", async () => {
    const response = await patchMilaidyAgent(
      jsonRequest("https://example.com/api/v1/milaidy/agents/agent-1", "PATCH", {
        action: "restart",
      }),
      routeParams({ agentId: "agent-1" }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Invalid request data");
  });

  test("PATCH /api/v1/milaidy/agents/[agentId] maps active provisioning shutdown conflicts to 409", async () => {
    mockGetAgentForWrite.mockResolvedValue({
      id: "agent-1",
      status: "running",
    });
    mockShutdown.mockResolvedValue({
      success: false,
      error: "Agent provisioning is in progress",
    });

    const response = await patchMilaidyAgent(
      jsonRequest("https://example.com/api/v1/milaidy/agents/agent-1", "PATCH", {
        action: "shutdown",
      }),
      routeParams({ agentId: "agent-1" }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      success: false,
      error: "Agent provisioning is in progress",
    });
  });

  test("DELETE /api/v1/milaidy/agents/[agentId] maps active provisioning conflicts to 409", async () => {
    mockGetAgentForWrite.mockResolvedValue({
      id: "agent-1",
      character_id: "char-1",
      agent_config: null,
    });
    mockDeleteAgent.mockResolvedValue({
      success: false,
      error: "Agent provisioning is in progress",
    });

    const response = await deleteMilaidyAgent(
      new NextRequest("https://example.com/api/v1/milaidy/agents/agent-1", {
        method: "DELETE",
      }),
      routeParams({ agentId: "agent-1" }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      success: false,
      error: "Agent provisioning is in progress",
    });
    expect(mockCharacterDelete).not.toHaveBeenCalled();
  });

  test("POST /api/v1/milaidy/agents/[agentId]/restore maps stopped historical restore attempts to 409", async () => {
    mockRestore.mockResolvedValue({
      success: false,
      error: "Stopped agents can only restore the latest backup",
    });

    const response = await postRestoreRoute(
      jsonRequest("https://example.com/api/v1/milaidy/agents/agent-1/restore", "POST", {
        backupId: "11111111-1111-4111-8111-111111111111",
      }),
      routeParams({ agentId: "agent-1" }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      success: false,
      error: "Stopped agents can only restore the latest backup",
    });
  });

  test("DELETE /api/v1/milaidy/agents/[agentId] maps infrastructure delete failures to 500", async () => {
    mockDeleteAgent.mockResolvedValue({
      success: false,
      error: "Failed to delete sandbox",
    });

    const response = await deleteMilaidyAgent(
      new NextRequest("https://example.com/api/v1/milaidy/agents/agent-1", {
        method: "DELETE",
      }),
      routeParams({ agentId: "agent-1" }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: "Failed to delete agent",
    });
  });
});
