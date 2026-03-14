import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { routeParams } from "./api/route-test-helpers";

const mockRequireServiceKey = mock();
const mockAuthenticateWaifuBridge = mock();
const mockRequireAuthOrApiKeyWithOrg = mock();
const mockGetAgent = mock();
const mockGetAgentForWrite = mock();
const mockSnapshot = mock();
const mockProvision = mock();
const mockDeleteAgent = mock();

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
    getAgentForWrite: mockGetAgentForWrite,
    deleteAgent: mockDeleteAgent,
    snapshot: mockSnapshot,
    provision: mockProvision,
  },
}));

const mockCharacterDelete = mock();

mock.module("@/db/repositories/characters", () => ({
  userCharactersRepository: {
    delete: mockCharacterDelete,
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
import {
  GET as getCompatAgent,
  DELETE as deleteCompatAgent,
} from "@/app/api/compat/agents/[id]/route";
import { POST as restartAgent } from "@/app/api/compat/agents/[id]/restart/route";

describe("compat auth", () => {
  beforeEach(() => {
    mockRequireServiceKey.mockReset();
    mockAuthenticateWaifuBridge.mockReset();
    mockRequireAuthOrApiKeyWithOrg.mockReset();
    mockGetAgent.mockReset();
    mockDeleteAgent.mockReset();
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
      throw new MockServiceKeyAuthError("Invalid or missing service key");
    });

    await expect(
      requireCompatAuth(
        new NextRequest("https://example.com/api/compat/agents", {
          headers: { "X-Service-Key": "bad-key" },
        }),
      ),
    ).rejects.toThrow("Invalid or missing service key");

    expect(mockAuthenticateWaifuBridge).not.toHaveBeenCalled();
    expect(mockRequireAuthOrApiKeyWithOrg).not.toHaveBeenCalled();
  });

  test("preserves 500 for service-key env misconfiguration instead of swallowing into 401", async () => {
    // When requireServiceKey throws a plain Error (misconfiguration), it
    // should bubble up as-is (500-level) rather than being converted to
    // ServiceKeyAuthError (401-level).
    const configError = new Error(
      "WAIFU_SERVICE_ORG_ID and WAIFU_SERVICE_USER_ID must be set when WAIFU_SERVICE_KEY is configured",
    );
    mockRequireServiceKey.mockImplementation(() => {
      throw configError;
    });

    await expect(
      requireCompatAuth(
        new NextRequest("https://example.com/api/compat/agents", {
          headers: { "X-Service-Key": "valid-key" },
        }),
      ),
    ).rejects.toThrow(configError.message);

    // The thrown error should NOT be a ServiceKeyAuthError
    try {
      await requireCompatAuth(
        new NextRequest("https://example.com/api/compat/agents", {
          headers: { "X-Service-Key": "valid-key" },
        }),
      );
    } catch (err) {
      expect(err).not.toBeInstanceOf(MockServiceKeyAuthError);
      expect(err).toBeInstanceOf(Error);
    }
  });
});

describe("GET/DELETE /api/compat/agents/[id]", () => {
  beforeEach(() => {
    mockRequireServiceKey.mockReset();
    mockAuthenticateWaifuBridge.mockReset();
    mockRequireAuthOrApiKeyWithOrg.mockReset();
    mockGetAgent.mockReset();
    mockGetAgentForWrite.mockReset();
    mockDeleteAgent.mockReset();
    mockCharacterDelete.mockReset();
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

  test("GET returns 404 error envelope when agent is missing", async () => {
    mockGetAgent.mockResolvedValue(null);

    const response = await getCompatAgent(
      new NextRequest("https://example.com/api/compat/agents/agent-404"),
      routeParams({ id: "agent-404" }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Agent not found",
    });
  });

  test("DELETE returns 404 error envelope when agent is missing", async () => {
    mockDeleteAgent.mockResolvedValue({
      success: false,
      error: "Agent not found",
    });

    const response = await deleteCompatAgent(
      new NextRequest("https://example.com/api/compat/agents/agent-404", {
        method: "DELETE",
      }),
      routeParams({ id: "agent-404" }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Agent not found",
    });
  });

  test("DELETE returns 500 for infrastructure cleanup failures", async () => {
    mockDeleteAgent.mockResolvedValue({
      success: false,
      error: "Failed to delete sandbox",
    });

    const response = await deleteCompatAgent(
      new NextRequest("https://example.com/api/compat/agents/agent-500", {
        method: "DELETE",
      }),
      routeParams({ id: "agent-500" }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: "Failed to delete sandbox",
    });
  });

  test("DELETE cleans up linked character row after agent deletion", async () => {
    const mockSandbox = {
      id: "agent-del",
      character_id: "char-linked",
      agent_name: "TestAgent",
      agent_config: null,
      status: "running",
      organization_id: "org-1",
    };
    mockDeleteAgent.mockResolvedValue({
      success: true,
      deletedSandbox: mockSandbox,
    });
    mockCharacterDelete.mockResolvedValue(undefined);

    const response = await deleteCompatAgent(
      new NextRequest("https://example.com/api/compat/agents/agent-del", {
        method: "DELETE",
      }),
      routeParams({ id: "agent-del" }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    // Verify character cleanup was called with the correct ID
    expect(mockCharacterDelete).toHaveBeenCalledWith("char-linked");
  });

  test("DELETE succeeds even if character cleanup fails (best-effort)", async () => {
    const mockSandbox = {
      id: "agent-del2",
      character_id: "char-broken",
      agent_name: "TestAgent2",
      agent_config: null,
      status: "running",
      organization_id: "org-1",
    };
    mockDeleteAgent.mockResolvedValue({
      success: true,
      deletedSandbox: mockSandbox,
    });
    mockCharacterDelete.mockRejectedValue(new Error("DB connection lost"));

    const response = await deleteCompatAgent(
      new NextRequest("https://example.com/api/compat/agents/agent-del2", {
        method: "DELETE",
      }),
      routeParams({ id: "agent-del2" }),
    );

    // Should still succeed — character cleanup is best-effort
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(mockCharacterDelete).toHaveBeenCalledWith("char-broken");
  });

  test("DELETE skips character cleanup when no character_id linked", async () => {
    const mockSandbox = {
      id: "agent-no-char",
      character_id: null,
      agent_name: "NoCharAgent",
      agent_config: null,
      status: "running",
      organization_id: "org-1",
    };
    mockDeleteAgent.mockResolvedValue({
      success: true,
      deletedSandbox: mockSandbox,
    });

    const response = await deleteCompatAgent(
      new NextRequest("https://example.com/api/compat/agents/agent-no-char", {
        method: "DELETE",
      }),
      routeParams({ id: "agent-no-char" }),
    );

    expect(response.status).toBe(200);
    expect(mockCharacterDelete).not.toHaveBeenCalled();
  });
});

describe("POST /api/compat/agents/[id]/restart", () => {
  beforeEach(() => {
    mockRequireServiceKey.mockReset();
    mockAuthenticateWaifuBridge.mockReset();
    mockRequireAuthOrApiKeyWithOrg.mockReset();
    mockGetAgent.mockReset();
    mockDeleteAgent.mockReset();
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
