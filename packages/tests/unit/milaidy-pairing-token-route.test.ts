import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

import { routeParams } from "./api/route-test-helpers";

const mockRequireAuthOrApiKeyWithOrg = mock();
const mockFindByIdAndOrg = mock();
const mockGenerateToken = mock();

const savedAgentBaseDomain = process.env.ELIZA_CLOUD_AGENT_BASE_DOMAIN;

mock.module("@/lib/auth", () => ({
  requireAuthOrApiKeyWithOrg: mockRequireAuthOrApiKeyWithOrg,
}));

mock.module("@/db/repositories/milady-sandboxes", () => ({
  miladySandboxesRepository: {
    findByIdAndOrg: mockFindByIdAndOrg,
  },
}));

mock.module("@/lib/services/pairing-token", () => ({
  getPairingTokenService: () => ({
    generateToken: mockGenerateToken,
  }),
}));

import { POST } from "@/app/api/v1/milaidy/agents/[agentId]/pairing-token/route";

describe("POST /api/v1/milaidy/agents/[agentId]/pairing-token", () => {
  beforeEach(() => {
    process.env.ELIZA_CLOUD_AGENT_BASE_DOMAIN = "waifu.fun";

    mockRequireAuthOrApiKeyWithOrg.mockReset();
    mockFindByIdAndOrg.mockReset();
    mockGenerateToken.mockReset();

    mockRequireAuthOrApiKeyWithOrg.mockResolvedValue({
      user: {
        id: "user-1",
        organization_id: "org-1",
      },
    });
  });

  afterEach(() => {
    if (savedAgentBaseDomain === undefined) {
      delete process.env.ELIZA_CLOUD_AGENT_BASE_DOMAIN;
    } else {
      process.env.ELIZA_CLOUD_AGENT_BASE_DOMAIN = savedAgentBaseDomain;
    }
  });

  afterAll(() => {
    mock.restore();
  });

  test("returns 404 when the agent is not visible in the caller org", async () => {
    mockFindByIdAndOrg.mockResolvedValue(null);

    const response = await POST(
      new NextRequest("https://example.com/api/v1/milaidy/agents/agent-1/pairing-token", {
        method: "POST",
      }),
      routeParams({ agentId: "agent-1" }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Agent not found",
    });
  });

  test("returns a pairing redirect for a running agent with UI auth enabled", async () => {
    mockFindByIdAndOrg.mockResolvedValue({
      id: "agent-1",
      status: "running",
      headscale_ip: null,
      environment_vars: {
        MILADY_API_TOKEN: "ui-token",
      },
    });
    mockGenerateToken.mockResolvedValue("pair-token");

    const response = await POST(
      new NextRequest("https://example.com/api/v1/milaidy/agents/agent-1/pairing-token", {
        method: "POST",
      }),
      routeParams({ agentId: "agent-1" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        token: "pair-token",
        redirectUrl: "https://agent-1.waifu.fun/pair?token=pair-token",
        expiresIn: 60,
      },
    });
    expect(mockGenerateToken).toHaveBeenCalledWith(
      "user-1",
      "org-1",
      "agent-1",
      "https://agent-1.waifu.fun",
    );
  });

  test("opens the web UI directly when the sandbox has no UI API token", async () => {
    mockFindByIdAndOrg.mockResolvedValue({
      id: "agent-1",
      status: "running",
      headscale_ip: null,
      environment_vars: {
        MILADY_API_TOKEN: "",
        ELIZA_API_TOKEN: "",
      },
    });
    mockGenerateToken.mockResolvedValue("pair-token");

    const response = await POST(
      new NextRequest("https://example.com/api/v1/milaidy/agents/agent-1/pairing-token", {
        method: "POST",
      }),
      routeParams({ agentId: "agent-1" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        token: "pair-token",
        redirectUrl: "https://agent-1.waifu.fun",
        expiresIn: 60,
      },
    });
  });
});
