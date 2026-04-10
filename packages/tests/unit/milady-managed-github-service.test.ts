import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  ERROR_STATUS_MAP,
  Errors,
  internalErrorResponse,
  OAuthError,
  OAuthErrorCode,
  validationErrorResponse,
} from "@/lib/services/oauth/errors";

afterAll(() => {
  mock.restore();
});

const mockFindByIdAndOrg = mock();
const mockUpdate = mock();
const mockGetValidToken = mock();
const mockRevokeConnection = mock();
const mockGetAgent = mock();
const mockShutdown = mock();
const mockProvision = mock();

mock.module("@/db/repositories/milady-sandboxes", () => ({
  miladySandboxesRepository: {
    findByIdAndOrg: mockFindByIdAndOrg,
    update: mockUpdate,
  },
}));

mock.module("@/lib/services/milady-sandbox", () => ({
  miladySandboxService: {
    getAgent: mockGetAgent,
    shutdown: mockShutdown,
    provision: mockProvision,
  },
}));

mock.module("@/lib/services/oauth", () => ({
  ERROR_STATUS_MAP,
  Errors,
  internalErrorResponse,
  OAuthError,
  OAuthErrorCode,
  validationErrorResponse,
  oauthService: {
    getValidToken: mockGetValidToken,
    revokeConnection: mockRevokeConnection,
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

import { ManagedMiladyGithubService } from "@/lib/services/milady-managed-github";

const service = new ManagedMiladyGithubService();

const BINDING = {
  mode: "cloud-managed" as const,
  connectionId: "conn-1",
  githubUserId: "12345",
  githubUsername: "octocat",
  scopes: ["repo"],
  adminElizaUserId: "user-1",
  connectedAt: "2026-04-05T12:00:00.000Z",
};

describe("ManagedMiladyGithubService", () => {
  beforeEach(() => {
    mockFindByIdAndOrg.mockReset();
    mockUpdate.mockReset();
    mockGetValidToken.mockReset();
    mockRevokeConnection.mockReset();
    mockShutdown.mockReset();
    mockProvision.mockReset();

    // Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET for isGithubOAuthConfigured
    process.env.GITHUB_CLIENT_ID = "test-id";
    process.env.GITHUB_CLIENT_SECRET = "test-secret";
  });

  // --- getStatus ---

  describe("getStatus", () => {
    test("returns status when agent exists with binding", async () => {
      mockFindByIdAndOrg.mockResolvedValue({
        id: "agent-1",
        agent_config: {
          __miladyManagedGithub: {
            mode: "cloud-managed",
            connectionId: "conn-1",
            githubUserId: "12345",
            githubUsername: "octocat",
            scopes: ["repo"],
            adminElizaUserId: "user-1",
            connectedAt: "2026-04-05T12:00:00.000Z",
          },
        },
      });

      const status = await service.getStatus({
        agentId: "agent-1",
        organizationId: "org-1",
      });

      expect(status).not.toBeNull();
      expect(status!.connected).toBe(true);
      expect(status!.githubUsername).toBe("octocat");
      expect(status!.configured).toBe(true);
    });

    test("returns not-connected status when agent has no binding", async () => {
      mockFindByIdAndOrg.mockResolvedValue({
        id: "agent-1",
        agent_config: {},
      });

      const status = await service.getStatus({
        agentId: "agent-1",
        organizationId: "org-1",
      });

      expect(status).not.toBeNull();
      expect(status!.connected).toBe(false);
      expect(status!.githubUsername).toBeNull();
    });

    test("returns null when agent not found", async () => {
      mockFindByIdAndOrg.mockResolvedValue(undefined);

      const status = await service.getStatus({
        agentId: "nonexistent",
        organizationId: "org-1",
      });

      expect(status).toBeNull();
    });
  });

  // --- connectAgent ---

  describe("connectAgent", () => {
    test("connects agent and updates config (agent stopped)", async () => {
      mockFindByIdAndOrg.mockResolvedValue({
        id: "agent-1",
        organization_id: "org-1",
        agent_config: {},
        status: "stopped",
      });
      mockUpdate.mockResolvedValue(undefined);

      const result = await service.connectAgent({
        agentId: "agent-1",
        organizationId: "org-1",
        binding: BINDING,
      });

      expect(result.restarted).toBe(false);
      expect(result.status.connected).toBe(true);
      expect(result.status.githubUsername).toBe("octocat");
      expect(mockUpdate).toHaveBeenCalledWith(
        "agent-1",
        expect.objectContaining({
          agent_config: expect.objectContaining({
            __miladyManagedGithub: expect.objectContaining({
              connectionId: "conn-1",
              githubUsername: "octocat",
            }),
          }),
        }),
      );
      expect(mockShutdown).not.toHaveBeenCalled();
      expect(mockProvision).not.toHaveBeenCalled();
    });

    test("connects agent and restarts (agent running)", async () => {
      mockFindByIdAndOrg.mockResolvedValue({
        id: "agent-1",
        organization_id: "org-1",
        agent_config: {},
        status: "running",
      });
      mockUpdate.mockResolvedValue(undefined);
      mockShutdown.mockResolvedValue({ success: true });
      mockProvision.mockResolvedValue({ success: true });

      const result = await service.connectAgent({
        agentId: "agent-1",
        organizationId: "org-1",
        binding: BINDING,
      });

      expect(result.restarted).toBe(true);
      expect(mockShutdown).toHaveBeenCalledWith("agent-1", "org-1");
      expect(mockProvision).toHaveBeenCalledWith("agent-1", "org-1");
    });

    test("throws when agent not found", async () => {
      mockFindByIdAndOrg.mockResolvedValue(undefined);

      await expect(
        service.connectAgent({
          agentId: "nonexistent",
          organizationId: "org-1",
          binding: BINDING,
        }),
      ).rejects.toThrow("Agent not found");
    });

    test("throws when shutdown fails", async () => {
      mockFindByIdAndOrg.mockResolvedValue({
        id: "agent-1",
        organization_id: "org-1",
        agent_config: {},
        status: "running",
      });
      mockUpdate.mockResolvedValue(undefined);
      mockShutdown.mockResolvedValue({ success: false, error: "Timeout" });

      await expect(
        service.connectAgent({
          agentId: "agent-1",
          organizationId: "org-1",
          binding: BINDING,
        }),
      ).rejects.toThrow("Timeout");
    });

    test("throws when provision fails", async () => {
      mockFindByIdAndOrg.mockResolvedValue({
        id: "agent-1",
        organization_id: "org-1",
        agent_config: {},
        status: "running",
      });
      mockUpdate.mockResolvedValue(undefined);
      mockShutdown.mockResolvedValue({ success: true });
      mockProvision.mockResolvedValue({ success: false, error: "No resources" });

      await expect(
        service.connectAgent({
          agentId: "agent-1",
          organizationId: "org-1",
          binding: BINDING,
        }),
      ).rejects.toThrow("No resources");
    });
  });

  // --- disconnectAgent ---

  describe("disconnectAgent", () => {
    test("disconnects agent and revokes connection (agent stopped)", async () => {
      mockFindByIdAndOrg.mockResolvedValue({
        id: "agent-1",
        organization_id: "org-1",
        agent_config: {
          __miladyManagedGithub: {
            connectionId: "conn-1",
            githubUserId: "12345",
            githubUsername: "octocat",
            scopes: ["repo"],
            adminElizaUserId: "user-1",
            connectedAt: "2026-04-05T12:00:00.000Z",
          },
        },
        status: "stopped",
      });
      mockUpdate.mockResolvedValue(undefined);
      mockRevokeConnection.mockResolvedValue(undefined);

      const result = await service.disconnectAgent({
        agentId: "agent-1",
        organizationId: "org-1",
      });

      expect(result.restarted).toBe(false);
      expect(result.status.connected).toBe(false);
      expect(mockRevokeConnection).toHaveBeenCalledWith({
        organizationId: "org-1",
        connectionId: "conn-1",
      });
    });

    test("continues if revoke fails (graceful degradation)", async () => {
      mockFindByIdAndOrg.mockResolvedValue({
        id: "agent-1",
        organization_id: "org-1",
        agent_config: {
          __miladyManagedGithub: {
            connectionId: "conn-1",
            githubUserId: "12345",
            githubUsername: "octocat",
            scopes: [],
            adminElizaUserId: "user-1",
            connectedAt: "2026-04-05T12:00:00.000Z",
          },
        },
        status: "stopped",
      });
      mockUpdate.mockResolvedValue(undefined);
      mockRevokeConnection.mockRejectedValue(new Error("Already revoked"));

      const result = await service.disconnectAgent({
        agentId: "agent-1",
        organizationId: "org-1",
      });

      // Should succeed despite revoke failure
      expect(result.status.connected).toBe(false);
    });

    test("throws when agent not found", async () => {
      mockFindByIdAndOrg.mockResolvedValue(undefined);

      await expect(
        service.disconnectAgent({
          agentId: "nonexistent",
          organizationId: "org-1",
        }),
      ).rejects.toThrow("Agent not found");
    });
  });

  // --- getAgentToken ---

  describe("getAgentToken", () => {
    test("returns token when binding exists", async () => {
      mockFindByIdAndOrg.mockResolvedValue({
        id: "agent-1",
        agent_config: {
          __miladyManagedGithub: {
            connectionId: "conn-1",
            githubUserId: "12345",
            githubUsername: "octocat",
            scopes: ["repo"],
            adminElizaUserId: "user-1",
            connectedAt: "2026-04-05T12:00:00.000Z",
          },
        },
      });
      mockGetValidToken.mockResolvedValue({
        accessToken: "gho_abc123",
      });

      const result = await service.getAgentToken({
        agentId: "agent-1",
        organizationId: "org-1",
      });

      expect(result).not.toBeNull();
      expect(result!.accessToken).toBe("gho_abc123");
      expect(result!.githubUsername).toBe("octocat");
      expect(mockGetValidToken).toHaveBeenCalledWith({
        organizationId: "org-1",
        connectionId: "conn-1",
      });
    });

    test("returns null when agent not found", async () => {
      mockFindByIdAndOrg.mockResolvedValue(undefined);

      const result = await service.getAgentToken({
        agentId: "nonexistent",
        organizationId: "org-1",
      });

      expect(result).toBeNull();
    });

    test("returns null when no binding exists", async () => {
      mockFindByIdAndOrg.mockResolvedValue({
        id: "agent-1",
        agent_config: {},
      });

      const result = await service.getAgentToken({
        agentId: "agent-1",
        organizationId: "org-1",
      });

      expect(result).toBeNull();
      expect(mockGetValidToken).not.toHaveBeenCalled();
    });
  });
});
