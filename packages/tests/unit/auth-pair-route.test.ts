import { beforeEach, describe, expect, mock, test } from "bun:test";
import { jsonRequest } from "./api/route-test-helpers";

const mockValidateToken = mock();
const mockFindByIdAndOrg = mock();

mock.module("@/lib/services/pairing-token", () => ({
  getPairingTokenService: () => ({
    validateToken: mockValidateToken,
  }),
}));

mock.module("@/db/repositories/milady-sandboxes", () => ({
  miladySandboxesRepository: {
    findByIdAndOrg: mockFindByIdAndOrg,
  },
}));

import { POST } from "@/app/api/auth/pair/route";

describe("POST /api/auth/pair", () => {
  beforeEach(() => {
    mockValidateToken.mockReset();
    mockFindByIdAndOrg.mockReset();
  });

  test("requires a pairing code", async () => {
    const response = await POST(jsonRequest("https://example.com/api/auth/pair", "POST", {}));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Pairing code required",
    });
    expect(mockValidateToken).not.toHaveBeenCalled();
  });

  test("requires an Origin header", async () => {
    const response = await POST(
      jsonRequest("https://example.com/api/auth/pair", "POST", {
        token: "pairing-token",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Origin header required",
    });
    expect(mockValidateToken).not.toHaveBeenCalled();
  });

  test("rejects invalid or expired pairing codes", async () => {
    mockValidateToken.mockResolvedValue(null);

    const response = await POST(
      jsonRequest(
        "https://example.com/api/auth/pair",
        "POST",
        { token: "pairing-token" },
        { Origin: "https://agent.example.com" },
      ),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Invalid or expired pairing code",
    });
    expect(mockValidateToken).toHaveBeenCalledWith("pairing-token", "https://agent.example.com");
  });

  test("returns only the explicit Milady API token", async () => {
    mockValidateToken.mockResolvedValue({
      agentId: "agent-1",
      orgId: "org-1",
    });
    mockFindByIdAndOrg.mockResolvedValue({
      agent_name: "Milady Agent",
      environment_vars: {
        MILADY_API_TOKEN: "milady-token",
        JWT_SECRET: "jwt-secret",
        SERVER_API_KEY: "server-key",
        AGENT_API_KEY: "agent-key",
      },
    });

    const response = await POST(
      jsonRequest(
        "https://example.com/api/auth/pair",
        "POST",
        { token: "pairing-token" },
        { Origin: "https://agent.example.com" },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      message: "Paired successfully",
      apiKey: "milady-token",
      agentName: "Milady Agent",
    });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  test("does not fall back to generic secrets when no Milady API token exists", async () => {
    mockValidateToken.mockResolvedValue({
      agentId: "agent-1",
      orgId: "org-1",
    });
    mockFindByIdAndOrg.mockResolvedValue({
      agent_name: "Milady Agent",
      environment_vars: {
        JWT_SECRET: "jwt-secret",
        SERVER_API_KEY: "server-key",
      },
    });

    const response = await POST(
      jsonRequest(
        "https://example.com/api/auth/pair",
        "POST",
        { token: "pairing-token" },
        { Origin: "https://agent.example.com" },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      message: "Paired successfully",
      apiKey: null,
      agentName: "Milady Agent",
    });
  });

  test("returns 404 when the token org does not own the agent", async () => {
    mockValidateToken.mockResolvedValue({
      agentId: "agent-1",
      orgId: "org-2",
    });
    mockFindByIdAndOrg.mockResolvedValue(null);

    const response = await POST(
      jsonRequest(
        "https://example.com/api/auth/pair",
        "POST",
        { token: "pairing-token" },
        { Origin: "https://agent.example.com" },
      ),
    );

    expect(mockFindByIdAndOrg).toHaveBeenCalledWith("agent-1", "org-2");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Agent not found",
    });
  });
});
