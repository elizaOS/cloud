import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

const mockValidateAuthHeader = mock();
const mockListConnections = mock();
const mockInitiateAuth = mock();

mock.module("@/lib/services/eliza-app", () => ({
  elizaAppSessionService: {
    validateAuthHeader: mockValidateAuthHeader,
  },
}));

mock.module("@/lib/services/oauth", () => ({
  oauthService: {
    listConnections: mockListConnections,
    initiateAuth: mockInitiateAuth,
  },
}));

let GET: typeof import("@/app/api/eliza-app/connections/route").GET;
let POST: typeof import("@/app/api/eliza-app/connections/[platform]/initiate/route").POST;

beforeAll(async () => {
  ({ GET } = await import("@/app/api/eliza-app/connections/route"));
  ({ POST } = await import("@/app/api/eliza-app/connections/[platform]/initiate/route"));
  mock.restore();
});

describe("Eliza App connections routes", () => {
  beforeEach(() => {
    mockValidateAuthHeader.mockReset();
    mockListConnections.mockReset();
    mockInitiateAuth.mockReset();

    mockValidateAuthHeader.mockResolvedValue({
      userId: "user-1",
      organizationId: "org-1",
    });
  });

  test("returns user-scoped Google connection status", async () => {
    mockListConnections.mockResolvedValue([
      {
        id: "conn-1",
        userId: "user-1",
        platform: "google",
        platformUserId: "google-user-1",
        email: "user@example.com",
        status: "active",
        scopes: ["gmail.send", "calendar.events"],
        linkedAt: new Date("2026-04-04T12:00:00Z"),
        tokenExpired: false,
        source: "platform_credentials",
      },
    ]);

    const response = await GET(
      new NextRequest("https://elizacloud.ai/api/eliza-app/connections?platform=google", {
        headers: { Authorization: "Bearer session-token" },
      }),
    );

    expect(response.status).toBe(200);
    expect(mockListConnections).toHaveBeenCalledWith({
      organizationId: "org-1",
      userId: "user-1",
      platform: "google",
    });

    const json = await response.json();
    expect(json.connected).toBe(true);
    expect(json.status).toBe("active");
    expect(json.email).toBe("user@example.com");
  });

  test("initiates Google OAuth with Eliza App callback bridge", async () => {
    mockInitiateAuth.mockResolvedValue({
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=test-state",
      state: "test-state",
    });

    const response = await POST(
      new NextRequest("https://elizacloud.ai/api/eliza-app/connections/google/initiate", {
        method: "POST",
        headers: {
          Authorization: "Bearer session-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ returnPath: "/connected" }),
      }),
      { params: Promise.resolve({ platform: "google" }) },
    );

    expect(response.status).toBe(200);
    expect(mockInitiateAuth).toHaveBeenCalledWith({
      organizationId: "org-1",
      userId: "user-1",
      platform: "google",
      redirectUrl:
        "/api/eliza-app/auth/connection-success?source=eliza-app&return_path=%2Fconnected",
      scopes: undefined,
    });

    const json = await response.json();
    expect(json.authUrl).toContain("accounts.google.com");
    expect(json.provider.name).toBe("Google");
  });
});
