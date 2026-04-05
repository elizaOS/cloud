import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { OAuthConnection } from "@/lib/services/oauth/types";

const mockListConnections = mock();
const mockGetValidTokenByPlatformWithConnectionId = mock();
const mockInitiateAuth = mock();
const mockRevokeConnection = mock();
const mockDbLimit = mock();
const mockDbWhere = mock(() => ({ limit: mockDbLimit }));
const mockDbFrom = mock(() => ({ where: mockDbWhere }));
const mockDbSelect = mock(() => ({ from: mockDbFrom }));
const originalFetch = globalThis.fetch;
const providerEnvKeys = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const;
let savedProviderEnv: Record<(typeof providerEnvKeys)[number], string | undefined> = {
  GOOGLE_CLIENT_ID: undefined,
  GOOGLE_CLIENT_SECRET: undefined,
};

mock.module("drizzle-orm", () => ({
  and: (...args: unknown[]) => args,
  eq: (left: unknown, right: unknown) => ({ left, right }),
}));

mock.module("@/db/client", () => ({
  dbRead: {
    select: mockDbSelect,
  },
}));

mock.module("@/db/schemas/platform-credentials", () => ({
  platformCredentials: {
    organization_id: "organization_id",
    id: "id",
  },
}));

mock.module("@/lib/services/oauth", () => ({
  oauthService: {
    listConnections: mockListConnections,
    getValidTokenByPlatformWithConnectionId: mockGetValidTokenByPlatformWithConnectionId,
    initiateAuth: mockInitiateAuth,
    revokeConnection: mockRevokeConnection,
  },
}));

mock.module("@/lib/services/oauth/oauth-service", () => ({
  getPreferredActiveConnection: (
    connections: OAuthConnection[],
    userId?: string,
    connectionRole?: "owner" | "agent",
  ) =>
    connections.find(
      (connection) =>
        connection.status === "active" &&
        (!userId || connection.userId === userId) &&
        (!connectionRole || connection.connectionRole === connectionRole),
    ) ??
    connections.find(
      (connection) =>
        connection.status === "active" &&
        (!connectionRole || connection.connectionRole === connectionRole),
    ) ??
    connections.find((connection) => connection.status === "active") ??
    null,
}));

import {
  disconnectManagedGoogleConnection,
  fetchManagedGoogleCalendarFeed,
  fetchManagedGoogleGmailTriage,
  getManagedGoogleConnectorStatus,
  initiateManagedGoogleConnection,
  sendManagedGoogleReply,
} from "@/lib/services/milady-google-connector";

// Drop the top-level module mocks after importing the service under test so
// they don't leak into later test files loaded by the same Bun process.
mock.restore();

function saveProviderEnv() {
  savedProviderEnv = {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  };
}

function restoreProviderEnv() {
  for (const key of providerEnvKeys) {
    const value = savedProviderEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function createConnection(overrides: Partial<OAuthConnection> = {}): OAuthConnection {
  return {
    id: "conn-google-1",
    userId: "user-1",
    connectionRole: "owner",
    platform: "google",
    platformUserId: "google-user-1",
    email: "founder@example.com",
    username: "founder",
    displayName: "Founder Example",
    avatarUrl: "https://example.com/avatar.png",
    status: "active",
    scopes: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/gmail.metadata",
      "https://www.googleapis.com/auth/gmail.send",
    ],
    linkedAt: new Date("2026-04-04T15:00:00.000Z"),
    lastUsedAt: new Date("2026-04-04T16:00:00.000Z"),
    tokenExpired: false,
    source: "platform_credentials",
    ...overrides,
  };
}

describe("milady Google connector service", () => {
  beforeEach(() => {
    saveProviderEnv();
    process.env.GOOGLE_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
    mockListConnections.mockReset();
    mockGetValidTokenByPlatformWithConnectionId.mockReset();
    mockInitiateAuth.mockReset();
    mockRevokeConnection.mockReset();
    mockDbLimit.mockReset();
    mockDbWhere.mockClear();
    mockDbFrom.mockClear();
    mockDbSelect.mockClear();
    mockDbLimit.mockResolvedValue([
      {
        token_expires_at: new Date("2026-04-05T00:00:00.000Z"),
        refresh_token_secret_id: "refresh-secret-1",
      },
    ]);
    mockGetValidTokenByPlatformWithConnectionId.mockResolvedValue({
      token: {
        accessToken: "google-access-token",
      },
      connectionId: "conn-google-1",
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    restoreProviderEnv();
  });

  test("reports managed Google connector status from the active owner connection", async () => {
    mockListConnections.mockResolvedValue([createConnection()]);

    const status = await getManagedGoogleConnectorStatus({
      organizationId: "org-1",
      userId: "user-1",
      side: "owner",
    });

    expect(status).toEqual({
      provider: "google",
      side: "owner",
      mode: "cloud_managed",
      configured: true,
      connected: true,
      reason: "connected",
      identity: {
        id: "google-user-1",
        email: "founder@example.com",
        name: "Founder Example",
        avatarUrl: "https://example.com/avatar.png",
      },
      grantedCapabilities: [
        "google.basic_identity",
        "google.calendar.read",
        "google.gmail.triage",
        "google.gmail.send",
      ],
      grantedScopes: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/gmail.metadata",
        "https://www.googleapis.com/auth/gmail.send",
      ],
      expiresAt: "2026-04-05T00:00:00.000Z",
      hasRefreshToken: true,
      connectionId: "conn-google-1",
      linkedAt: "2026-04-04T15:00:00.000Z",
      lastUsedAt: "2026-04-04T16:00:00.000Z",
    });
    expect(mockListConnections).toHaveBeenCalledWith({
      organizationId: "org-1",
      userId: "user-1",
      platform: "google",
      connectionRole: "owner",
    });
  });

  test("reports managed Google connector status from the agent-side connection", async () => {
    mockListConnections.mockResolvedValue([
      createConnection({
        id: "conn-google-agent",
        userId: null,
        connectionRole: "agent",
        email: "milady-agent@example.com",
        username: "milady-agent",
        displayName: "Milady Agent",
      }),
    ]);

    const status = await getManagedGoogleConnectorStatus({
      organizationId: "org-1",
      userId: "user-1",
      side: "agent",
    });

    expect(status.side).toBe("agent");
    expect(status.connectionId).toBe("conn-google-agent");
    expect(status.identity).toEqual({
      id: "google-user-1",
      email: "milady-agent@example.com",
      name: "Milady Agent",
      avatarUrl: "https://example.com/avatar.png",
    });
    expect(mockListConnections).toHaveBeenCalledWith({
      organizationId: "org-1",
      userId: "user-1",
      platform: "google",
      connectionRole: "agent",
    });
  });

  test("initiates managed Google auth with the requested Milady capability scopes", async () => {
    mockInitiateAuth.mockResolvedValue({
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=managed-google",
    });

    const result = await initiateManagedGoogleConnection({
      organizationId: "org-1",
      userId: "user-1",
      side: "agent",
      redirectUrl: "https://www.elizacloud.ai/auth/success?platform=google",
      capabilities: ["google.calendar.read", "google.gmail.triage", "google.gmail.send"],
    });

    expect(mockInitiateAuth).toHaveBeenCalledWith({
      organizationId: "org-1",
      userId: "user-1",
      platform: "google",
      redirectUrl: "https://www.elizacloud.ai/auth/success?platform=google",
      scopes: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/gmail.metadata",
        "https://www.googleapis.com/auth/gmail.send",
      ],
      connectionRole: "agent",
    });
    expect(result.side).toBe("agent");
    expect(result.mode).toBe("cloud_managed");
    expect(result.requestedCapabilities).toEqual([
      "google.basic_identity",
      "google.calendar.read",
      "google.gmail.triage",
      "google.gmail.send",
    ]);
  });

  test("normalizes Google Calendar events into the Milady managed feed shape", async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                id: "event-1",
                summary: "Founder sync",
                description: "Review the launch plan",
                location: "HQ",
                status: "confirmed",
                htmlLink: "https://calendar.google.com/event?eid=event-1",
                start: {
                  dateTime: "2026-04-04T10:00:00-07:00",
                  timeZone: "America/Los_Angeles",
                },
                end: {
                  dateTime: "2026-04-04T10:30:00-07:00",
                  timeZone: "America/Los_Angeles",
                },
                organizer: {
                  email: "founder@example.com",
                  displayName: "Founder Example",
                },
                attendees: [
                  {
                    email: "teammate@example.com",
                    displayName: "Teammate",
                    responseStatus: "accepted",
                  },
                ],
              },
            ],
          }),
        ),
    ) as unknown as typeof fetch;

    const feed = await fetchManagedGoogleCalendarFeed({
      organizationId: "org-1",
      userId: "user-1",
      side: "owner",
      calendarId: "primary",
      timeMin: "2026-04-04T00:00:00.000Z",
      timeMax: "2026-04-05T00:00:00.000Z",
      timeZone: "America/Los_Angeles",
    });

    expect(feed.calendarId).toBe("primary");
    expect(feed.events).toHaveLength(1);
    expect(feed.events[0]).toMatchObject({
      externalId: "event-1",
      calendarId: "primary",
      title: "Founder sync",
      description: "Review the launch plan",
      location: "HQ",
      timezone: "America/Los_Angeles",
    });
  });

  test("classifies Gmail triage messages using the connected Google identity", async () => {
    mockListConnections.mockResolvedValue([createConnection()]);
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const urlString = url.toString();
      if (urlString.includes("/messages?")) {
        return new Response(
          JSON.stringify({
            messages: [{ id: "msg-1", threadId: "thread-1" }],
          }),
        );
      }
      return new Response(
        JSON.stringify({
          id: "msg-1",
          threadId: "thread-1",
          labelIds: ["INBOX", "UNREAD", "IMPORTANT"],
          snippet: "Can you review the plan today?",
          internalDate: "1775327400000",
          historyId: "history-1",
          sizeEstimate: 1234,
          payload: {
            headers: [
              { name: "Subject", value: "Project sync" },
              { name: "From", value: "CEO Example <ceo@example.com>" },
              { name: "To", value: "founder@example.com" },
              { name: "Reply-To", value: "ceo@example.com" },
              { name: "Message-Id", value: "<msg-1@example.com>" },
            ],
          },
        }),
      );
    }) as unknown as typeof fetch;

    const triage = await fetchManagedGoogleGmailTriage({
      organizationId: "org-1",
      userId: "user-1",
      side: "owner",
      maxResults: 5,
    });

    expect(triage.messages).toHaveLength(1);
    expect(triage.messages[0]).toMatchObject({
      externalId: "msg-1",
      threadId: "thread-1",
      subject: "Project sync",
      fromEmail: "ceo@example.com",
      replyTo: "ceo@example.com",
      isUnread: true,
      isImportant: true,
      likelyReplyNeeded: true,
    });
    expect(triage.messages[0]?.triageReason).toContain("unread");
  });

  test("sends Gmail replies with sanitized RFC822 headers", async () => {
    const fetchMock = mock(async () => new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await sendManagedGoogleReply({
      organizationId: "org-1",
      userId: "user-1",
      side: "owner",
      to: ["founder@example.com"],
      cc: ["ops@example.com"],
      subject: "Project sync",
      bodyText: "Reviewing it now.",
      inReplyTo: "<msg-1@example.com>",
      references: "<thread-1@example.com>",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, { body?: string }];
    expect(url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    const payload = JSON.parse(String(options.body)) as { raw: string };
    const decoded = Buffer.from(payload.raw, "base64url").toString("utf-8");
    expect(decoded).toContain("To: founder@example.com");
    expect(decoded).toContain("Cc: ops@example.com");
    expect(decoded).toContain("Subject: Re: Project sync");
    expect(decoded).toContain("In-Reply-To: <msg-1@example.com>");
    expect(decoded).toContain("References: <thread-1@example.com>");
    expect(decoded).toContain("Reviewing it now.");
  });

  test("disconnects the preferred active Google connection for the requested side", async () => {
    mockListConnections.mockResolvedValue([
      createConnection({
        id: "conn-google-agent",
        userId: null,
        connectionRole: "agent",
      }),
      createConnection({
        id: "conn-google-2",
        connectionRole: "owner",
        status: "revoked",
        linkedAt: new Date("2026-04-03T15:00:00.000Z"),
      }),
    ]);

    await disconnectManagedGoogleConnection({
      organizationId: "org-1",
      userId: "user-1",
      side: "agent",
    });

    expect(mockRevokeConnection).toHaveBeenCalledWith({
      organizationId: "org-1",
      connectionId: "conn-google-agent",
    });
  });
});
