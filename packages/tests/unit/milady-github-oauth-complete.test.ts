import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
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
const mockGetConnection = mock();
const mockConnectAgent = mock();

mock.module("@/db/repositories/milady-sandboxes", () => ({
  miladySandboxesRepository: {
    findByIdAndOrg: mockFindByIdAndOrg,
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
    getConnection: mockGetConnection,
  },
}));

mock.module("@/lib/services/milady-managed-github", () => ({
  managedMiladyGithubService: {
    connectAgent: mockConnectAgent,
  },
}));

// NOTE: milady-agent-config is NOT mocked — we use the real readManagedMiladyGithubBinding
// to avoid leaking mocks to other test files that import it directly.

mock.module("@/lib/utils/logger", () => ({
  logger: {
    info: mock(),
    warn: mock(),
    error: mock(),
    debug: mock(),
  },
}));

import { GET } from "@/app/api/v1/milady/github-oauth-complete/route";

function completionUrl(params: Record<string, string>): string {
  const sp = new URLSearchParams(params);
  return `https://example.com/api/v1/milady/github-oauth-complete?${sp.toString()}`;
}

const VALID_PARAMS = {
  agent_id: "agent-1",
  org_id: "org-1",
  user_id: "user-1",
  connection_id: "conn-1",
  github_connected: "true",
  platform: "github",
};

describe("github-oauth-complete endpoint", () => {
  beforeEach(() => {
    mockFindByIdAndOrg.mockReset();
    mockGetConnection.mockReset();
    mockConnectAgent.mockReset();
  });

  test("success: links connection to agent and redirects to dashboard", async () => {
    mockFindByIdAndOrg.mockResolvedValue({
      id: "agent-1",
      organization_id: "org-1",
      agent_config: {},
      status: "stopped",
    });
    mockGetConnection.mockResolvedValue({
      id: "conn-1",
      platform: "github",
      platformUserId: "12345",
      username: "octocat",
      displayName: "The Octocat",
      avatarUrl: "https://avatars.githubusercontent.com/u/12345",
      email: "octocat@github.com",
      scopes: ["repo", "read:user"],
      userId: "user-1",
    });
    mockConnectAgent.mockResolvedValue({
      restarted: false,
      status: { connected: true },
    });

    const response = await GET(new NextRequest(completionUrl(VALID_PARAMS)));

    expect(response.status).toBe(307);
    const location = response.headers.get("location") || "";
    expect(location).toContain("github=connected");
    expect(location).toContain("managed=1");
    expect(location).toContain("agentId=agent-1");
    expect(location).toContain("githubUsername=octocat");
    expect(location).toContain("restarted=0");

    expect(mockFindByIdAndOrg).toHaveBeenCalledWith("agent-1", "org-1");
    expect(mockGetConnection).toHaveBeenCalledWith({
      organizationId: "org-1",
      connectionId: "conn-1",
    });
    expect(mockConnectAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent-1",
        organizationId: "org-1",
        binding: expect.objectContaining({
          mode: "cloud-managed",
          connectionId: "conn-1",
          githubUserId: "12345",
          githubUsername: "octocat",
          adminElizaUserId: "user-1",
        }),
      }),
    );
  });

  test("success with restart: shows restarted=1 when agent was running", async () => {
    mockFindByIdAndOrg.mockResolvedValue({
      id: "agent-1",
      organization_id: "org-1",
      agent_config: {},
      status: "running",
    });
    mockGetConnection.mockResolvedValue({
      id: "conn-1",
      platform: "github",
      platformUserId: "12345",
      username: "octocat",
      scopes: ["repo"],
    });
    mockConnectAgent.mockResolvedValue({
      restarted: true,
      status: { connected: true },
    });

    const response = await GET(new NextRequest(completionUrl(VALID_PARAMS)));

    expect(response.status).toBe(307);
    const location = response.headers.get("location") || "";
    expect(location).toContain("restarted=1");
  });

  test("idempotency: skips re-linking if connection already bound", async () => {
    mockFindByIdAndOrg.mockResolvedValue({
      id: "agent-1",
      organization_id: "org-1",
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

    const response = await GET(new NextRequest(completionUrl(VALID_PARAMS)));

    expect(response.status).toBe(307);
    const location = response.headers.get("location") || "";
    expect(location).toContain("github=connected");
    expect(location).toContain("githubUsername=octocat");
    expect(location).toContain("restarted=0");
    expect(mockConnectAgent).not.toHaveBeenCalled();
  });

  test("error: missing agent_id redirects with error", async () => {
    const params = { ...VALID_PARAMS };
    delete (params as Record<string, string | undefined>).agent_id;

    const response = await GET(new NextRequest(completionUrl(params)));

    expect(response.status).toBe(307);
    const location = response.headers.get("location") || "";
    expect(location).toContain("github_error=");
    expect(location).toContain("Missing");
  });

  test("error: missing connection_id redirects with error", async () => {
    const params = { ...VALID_PARAMS };
    delete (params as Record<string, string | undefined>).connection_id;

    const response = await GET(new NextRequest(completionUrl(params)));

    expect(response.status).toBe(307);
    const location = response.headers.get("location") || "";
    expect(location).toContain("github_error=");
  });

  test("error: missing org_id redirects with error", async () => {
    const params = { ...VALID_PARAMS };
    delete (params as Record<string, string | undefined>).org_id;

    const response = await GET(new NextRequest(completionUrl(params)));

    expect(response.status).toBe(307);
    const location = response.headers.get("location") || "";
    expect(location).toContain("github_error=");
  });

  test("error: github_error param is forwarded as-is", async () => {
    const response = await GET(
      new NextRequest(
        completionUrl({
          agent_id: "agent-1",
          github_error: "access_denied",
        }),
      ),
    );

    expect(response.status).toBe(307);
    const location = response.headers.get("location") || "";
    expect(location).toContain("github_error=access_denied");
    expect(mockFindByIdAndOrg).not.toHaveBeenCalled();
  });

  test("error: agent not found redirects with error", async () => {
    mockFindByIdAndOrg.mockResolvedValue(undefined);

    const response = await GET(new NextRequest(completionUrl(VALID_PARAMS)));

    expect(response.status).toBe(307);
    const location = response.headers.get("location") || "";
    expect(location).toContain("github_error=");
    expect(location).toContain("Agent");
  });

  test("error: connection not found redirects with error", async () => {
    mockFindByIdAndOrg.mockResolvedValue({
      id: "agent-1",
      organization_id: "org-1",
      agent_config: {},
    });
    mockGetConnection.mockResolvedValue(null);

    const response = await GET(new NextRequest(completionUrl(VALID_PARAMS)));

    expect(response.status).toBe(307);
    const location = response.headers.get("location") || "";
    expect(location).toContain("github_error=");
    expect(location).toContain("connection");
  });

  test("error: connectAgent throws, redirects with error message", async () => {
    mockFindByIdAndOrg.mockResolvedValue({
      id: "agent-1",
      organization_id: "org-1",
      agent_config: {},
    });
    mockGetConnection.mockResolvedValue({
      id: "conn-1",
      platform: "github",
      platformUserId: "12345",
      username: "octocat",
      scopes: [],
    });
    mockConnectAgent.mockRejectedValue(new Error("Failed to restart agent"));

    const response = await GET(new NextRequest(completionUrl(VALID_PARAMS)));

    expect(response.status).toBe(307);
    const location = response.headers.get("location") || "";
    expect(location).toContain("github_error=");
    expect(location).toContain("Failed");
  });
});
