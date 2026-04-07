import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { jsonRequest, routeParams } from "./api/route-test-helpers";

const mockRequireAuthOrApiKeyWithOrg = mock();
const mockGetAgent = mock();
const mockGetStatus = mock();
const mockDisconnectAgent = mock();
const mockConnectAgent = mock();
const mockGetAgentToken = mock();
const mockGetProvider = mock();
const mockIsProviderConfigured = mock();
const mockInitiateOAuth2 = mock();
const mockGetConnection = mock();
const mockRevokeConnection = mock();

let postLinkGithub: typeof import("@/app/api/v1/milady/agents/[agentId]/github/link/route").POST;
let postManagedGithubOauth: typeof import("@/app/api/v1/milady/agents/[agentId]/github/oauth/route").POST;
let getManagedGithub: typeof import("@/app/api/v1/milady/agents/[agentId]/github/route").GET;
let deleteManagedGithub: typeof import("@/app/api/v1/milady/agents/[agentId]/github/route").DELETE;
let getGithubToken: typeof import("@/app/api/v1/milady/agents/[agentId]/github/token/route").GET;

describe("managed Milady GitHub routes", () => {
  beforeAll(async () => {
    mock.module("@/lib/auth", () => ({
      requireAuthOrApiKeyWithOrg: mockRequireAuthOrApiKeyWithOrg,
    }));

    mock.module("@/lib/services/milady-sandbox", () => ({
      miladySandboxService: {
        getAgent: mockGetAgent,
      },
    }));

    mock.module("@/lib/services/milady-managed-github", () => ({
      managedMiladyGithubService: {
        getStatus: mockGetStatus,
        disconnectAgent: mockDisconnectAgent,
        connectAgent: mockConnectAgent,
        getAgentToken: mockGetAgentToken,
      },
    }));

    mock.module("@/lib/services/oauth/provider-registry", () => ({
      getProvider: mockGetProvider,
      isProviderConfigured: mockIsProviderConfigured,
    }));

    mock.module("@/lib/services/oauth/providers", () => ({
      initiateOAuth2: mockInitiateOAuth2,
    }));

    mock.module("@/lib/services/oauth", () => ({
      oauthService: {
        getConnection: mockGetConnection,
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

    const cacheKey = Date.now();
    ({ POST: postLinkGithub } = await import(
      `@/app/api/v1/milady/agents/[agentId]/github/link/route?t=${cacheKey}`
    ));
    ({ POST: postManagedGithubOauth } = await import(
      `@/app/api/v1/milady/agents/[agentId]/github/oauth/route?t=${cacheKey}`
    ));
    ({
      DELETE: deleteManagedGithub,
      GET: getManagedGithub,
    } = await import(`@/app/api/v1/milady/agents/[agentId]/github/route?t=${cacheKey}`));
    ({ GET: getGithubToken } = await import(
      `@/app/api/v1/milady/agents/[agentId]/github/token/route?t=${cacheKey}`
    ));
  });

  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockRequireAuthOrApiKeyWithOrg.mockReset();
    mockGetAgent.mockReset();
    mockGetStatus.mockReset();
    mockDisconnectAgent.mockReset();
    mockConnectAgent.mockReset();
    mockGetAgentToken.mockReset();
    mockGetProvider.mockReset();
    mockIsProviderConfigured.mockReset();
    mockInitiateOAuth2.mockReset();
    mockGetConnection.mockReset();
    mockRevokeConnection.mockReset();

    mockRequireAuthOrApiKeyWithOrg.mockResolvedValue({
      user: {
        id: "user-1",
        organization_id: "org-1",
      },
    });
    mockGetProvider.mockReturnValue({
      id: "github",
      name: "GitHub",
      type: "oauth2",
      defaultScopes: ["read:user", "user:email", "repo"],
    });
    mockIsProviderConfigured.mockReturnValue(true);
  });

  test("POST /github/oauth returns an authorize URL", async () => {
    mockGetAgent.mockResolvedValue({
      id: "agent-1",
      agent_name: "Coder",
    });
    mockInitiateOAuth2.mockResolvedValue({
      authUrl: "https://github.com/login/oauth/authorize?mock=1",
      state: "state-123",
    });

    const response = await postManagedGithubOauth(
      jsonRequest("https://example.com/api/v1/milady/agents/agent-1/github/oauth", "POST", {
        scopes: ["repo", "workflow"],
      }),
      routeParams({ agentId: "agent-1" }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.authorizeUrl).toBe("https://github.com/login/oauth/authorize?mock=1");
    expect(mockInitiateOAuth2).toHaveBeenCalledWith(
      expect.objectContaining({ id: "github" }),
      expect.objectContaining({
        organizationId: "org-1",
        userId: "user-1",
        connectionRole: "agent",
        scopes: ["repo", "workflow"],
      }),
    );
  });

  test("GET /github returns managed GitHub status", async () => {
    mockGetStatus.mockResolvedValue({
      configured: true,
      connected: true,
      connectionId: "conn-1",
      githubUserId: "12345",
      githubUsername: "octocat",
      githubDisplayName: "The Octocat",
      githubAvatarUrl: null,
      githubEmail: "octocat@github.com",
      scopes: ["repo"],
      adminElizaUserId: "user-1",
      connectedAt: "2026-04-05T16:00:00.000Z",
    });

    const response = await getManagedGithub(
      new NextRequest("https://example.com/api/v1/milady/agents/agent-1/github"),
      routeParams({ agentId: "agent-1" }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.connected).toBe(true);
    expect(body.data.githubUsername).toBe("octocat");
  });

  test("POST /github/link binds an OAuth connection to the agent", async () => {
    mockGetConnection.mockResolvedValue({
      id: "conn-1",
      platform: "github",
      platformUserId: "12345",
      username: "octocat",
      displayName: "The Octocat",
      avatarUrl: "https://avatars.githubusercontent.com/u/12345",
      email: "octocat@github.com",
      scopes: ["repo", "read:user"],
    });
    mockConnectAgent.mockResolvedValue({
      restarted: true,
      status: {
        configured: true,
        connected: true,
        connectionId: "conn-1",
        githubUsername: "octocat",
      },
    });

    const response = await postLinkGithub(
      jsonRequest("https://example.com/api/v1/milady/agents/agent-1/github/link", "POST", {
        connectionId: "conn-1",
      }),
      routeParams({ agentId: "agent-1" }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.restarted).toBe(true);
    expect(mockConnectAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent-1",
        organizationId: "org-1",
        binding: expect.objectContaining({
          mode: "cloud-managed",
          connectionId: "conn-1",
          githubUserId: "12345",
          githubUsername: "octocat",
        }),
      }),
    );
  });

  test("GET /github/token returns the agent's GitHub access token", async () => {
    mockGetAgentToken.mockResolvedValue({
      accessToken: "gho_test_token_123",
      githubUsername: "octocat",
    });

    const response = await getGithubToken(
      new NextRequest("https://example.com/api/v1/milady/agents/agent-1/github/token"),
      routeParams({ agentId: "agent-1" }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.accessToken).toBe("gho_test_token_123");
    expect(body.data.githubUsername).toBe("octocat");
  });

  test("DELETE /github disconnects managed GitHub", async () => {
    mockDisconnectAgent.mockResolvedValue({
      restarted: false,
      status: {
        configured: true,
        connected: false,
        connectionId: null,
        githubUserId: null,
        githubUsername: null,
        githubDisplayName: null,
        githubAvatarUrl: null,
        githubEmail: null,
        scopes: [],
        adminElizaUserId: null,
        connectedAt: null,
      },
    });

    const response = await deleteManagedGithub(
      new NextRequest("https://example.com/api/v1/milady/agents/agent-1/github", {
        method: "DELETE",
      }),
      routeParams({ agentId: "agent-1" }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.connected).toBe(false);
    expect(body.data.restarted).toBe(false);
  });

  test("POST /github/oauth returns 503 when GitHub provider is not configured", async () => {
    mockIsProviderConfigured.mockReturnValue(false);

    const response = await postManagedGithubOauth(
      jsonRequest("https://example.com/api/v1/milady/agents/agent-1/github/oauth", "POST", {}),
      routeParams({ agentId: "agent-1" }),
    );

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("not configured");
  });

  test("POST /github/oauth returns 404 when agent does not exist", async () => {
    mockGetAgent.mockResolvedValue(null);

    const response = await postManagedGithubOauth(
      jsonRequest("https://example.com/api/v1/milady/agents/nonexistent/github/oauth", "POST", {}),
      routeParams({ agentId: "nonexistent" }),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("GET /github/token returns 404 when no GitHub connection exists", async () => {
    mockGetAgentToken.mockResolvedValue(null);

    const response = await getGithubToken(
      new NextRequest("https://example.com/api/v1/milady/agents/agent-1/github/token"),
      routeParams({ agentId: "agent-1" }),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("POST /github/link returns 400 for non-GitHub connections", async () => {
    mockGetConnection.mockResolvedValue({
      id: "conn-1",
      platform: "google",
      platformUserId: "12345",
    });

    const response = await postLinkGithub(
      jsonRequest("https://example.com/api/v1/milady/agents/agent-1/github/link", "POST", {
        connectionId: "conn-1",
      }),
      routeParams({ agentId: "agent-1" }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("not a GitHub connection");
  });

  test("POST /github/link returns 404 when connection not found", async () => {
    mockGetConnection.mockResolvedValue(null);

    const response = await postLinkGithub(
      jsonRequest("https://example.com/api/v1/milady/agents/agent-1/github/link", "POST", {
        connectionId: "nonexistent",
      }),
      routeParams({ agentId: "agent-1" }),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toContain("not found");
  });

  test("POST /github/link returns 400 when connectionId is missing", async () => {
    const response = await postLinkGithub(
      jsonRequest("https://example.com/api/v1/milady/agents/agent-1/github/link", "POST", {}),
      routeParams({ agentId: "agent-1" }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("GET /github returns 404 when agent not found", async () => {
    mockGetStatus.mockResolvedValue(null);

    const response = await getManagedGithub(
      new NextRequest("https://example.com/api/v1/milady/agents/nonexistent/github"),
      routeParams({ agentId: "nonexistent" }),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
  });
});
