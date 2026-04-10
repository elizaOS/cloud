import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { OAuthError } from "@/lib/services/oauth/errors";

const mockRequireAuthOrApiKeyWithOrg = mock();
const mockListConnections = mock();
const mockRevokeConnection = mock();
const mockInvalidateOAuthState = mock();

mock.module("@/lib/auth", () => ({
  requireAuthOrApiKeyWithOrg: mockRequireAuthOrApiKeyWithOrg,
}));

mock.module("@/lib/services/oauth/invalidation", () => ({
  invalidateOAuthState: mockInvalidateOAuthState,
}));

mock.module("@/lib/utils/logger", () => ({
  logger: {
    debug: () => {},
    info: () => {},
    error: () => {},
  },
}));

describe("OAuth connection detail routes", () => {
  beforeEach(async () => {
    const oauthModule = {
      Errors: {
        connectionNotFound: (connectionId: string) => ({
          toResponse: () => ({
            error: "CONNECTION_NOT_FOUND",
            code: "CONNECTION_NOT_FOUND",
            message: `Connection ${connectionId} not found or not accessible.`,
            reconnectRequired: false,
          }),
        }),
      },
      OAuthError,
      internalErrorResponse: (message: string) => ({
        error: "INTERNAL_ERROR",
        code: "INTERNAL_ERROR",
        message,
        reconnectRequired: false,
      }),
      oauthService: {
        listConnections: mockListConnections,
        revokeConnection: mockRevokeConnection,
      },
    };

    mock.module("@/lib/services/oauth", () => oauthModule);
    mock.module("@/lib/services/oauth/index", () => oauthModule);
    mock.module("@/lib/services/oauth/index.ts", () => oauthModule);

    mockRequireAuthOrApiKeyWithOrg.mockReset();
    mockListConnections.mockReset();
    mockRevokeConnection.mockReset();
    mockInvalidateOAuthState.mockReset();

    mockRequireAuthOrApiKeyWithOrg.mockResolvedValue({
      user: {
        id: "user-1",
        organization_id: "org-1",
      },
    });
  });

  test("GET scopes connection lookup to the authenticated user", async () => {
    mockListConnections.mockResolvedValue([
      {
        id: "conn-1",
        userId: "user-1",
        platform: "google",
        platformUserId: "google-user-1",
        status: "active",
        scopes: ["gmail.send"],
        linkedAt: new Date("2026-04-08T00:00:00Z"),
        tokenExpired: false,
        source: "platform_credentials",
      },
    ]);

    const { GET } = await import(`@/app/api/v1/oauth/connections/[id]/route?t=${Date.now()}`);
    const response = await GET(
      new NextRequest("https://example.com/api/v1/oauth/connections/conn-1"),
      { params: Promise.resolve({ id: "conn-1" }) },
    );

    expect(mockListConnections).toHaveBeenCalledWith({
      organizationId: "org-1",
      userId: "user-1",
    });
    expect(response.status).toBe(200);
  });

  test("DELETE returns 404 when the connection is not accessible to the caller", async () => {
    mockListConnections.mockResolvedValue([]);

    const { DELETE } = await import(`@/app/api/v1/oauth/connections/[id]/route?t=${Date.now()}`);
    const response = await DELETE(
      new NextRequest("https://example.com/api/v1/oauth/connections/conn-2", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "conn-2" }) },
    );

    expect(mockListConnections).toHaveBeenCalledWith({
      organizationId: "org-1",
      userId: "user-1",
    });
    expect(mockRevokeConnection).not.toHaveBeenCalled();
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      code: "CONNECTION_NOT_FOUND",
    });
  });
});
