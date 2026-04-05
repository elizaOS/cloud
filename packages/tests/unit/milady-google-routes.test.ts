import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { jsonRequest } from "./api/route-test-helpers";

const mockRequireAuthOrApiKeyWithOrg = mock();
const mockGetStatus = mock();
const mockInitiateConnection = mock();
const mockDisconnectConnection = mock();
const mockFetchCalendarFeed = mock();
const mockCreateCalendarEvent = mock();
const mockFetchGmailTriage = mock();
const mockSendReply = mock();

mock.module("@/lib/auth", () => ({
  requireAuthOrApiKeyWithOrg: mockRequireAuthOrApiKeyWithOrg,
}));

mock.module("@/lib/services/milady-google-connector", () => ({
  getManagedGoogleConnectorStatus: mockGetStatus,
  initiateManagedGoogleConnection: mockInitiateConnection,
  disconnectManagedGoogleConnection: mockDisconnectConnection,
  fetchManagedGoogleCalendarFeed: mockFetchCalendarFeed,
  createManagedGoogleCalendarEvent: mockCreateCalendarEvent,
  fetchManagedGoogleGmailTriage: mockFetchGmailTriage,
  sendManagedGoogleReply: mockSendReply,
  MiladyGoogleConnectorError: class MiladyGoogleConnectorError extends Error {
    constructor(
      public readonly status: number,
      message: string,
    ) {
      super(message);
      this.name = "MiladyGoogleConnectorError";
    }
  },
}));

import { POST as postCalendarEvent } from "@/app/api/v1/milady/google/calendar/events/route";
import { GET as getCalendarFeed } from "@/app/api/v1/milady/google/calendar/feed/route";
import { POST as postConnectInitiate } from "@/app/api/v1/milady/google/connect/initiate/route";
import { POST as postDisconnect } from "@/app/api/v1/milady/google/disconnect/route";
import { POST as postReplySend } from "@/app/api/v1/milady/google/gmail/reply-send/route";
import { GET as getGmailTriage } from "@/app/api/v1/milady/google/gmail/triage/route";
import { GET as getStatus } from "@/app/api/v1/milady/google/status/route";

describe("Milady managed Google routes", () => {
  beforeEach(() => {
    mockRequireAuthOrApiKeyWithOrg.mockReset();
    mockGetStatus.mockReset();
    mockInitiateConnection.mockReset();
    mockDisconnectConnection.mockReset();
    mockFetchCalendarFeed.mockReset();
    mockCreateCalendarEvent.mockReset();
    mockFetchGmailTriage.mockReset();
    mockSendReply.mockReset();

    mockRequireAuthOrApiKeyWithOrg.mockResolvedValue({
      user: {
        id: "user-1",
        organization_id: "org-1",
      },
    });
  });

  test("GET /api/v1/milady/google/status returns the managed connector status", async () => {
    mockGetStatus.mockResolvedValue({
      provider: "google",
      mode: "cloud_managed",
      configured: true,
      connected: true,
      reason: "connected",
      identity: { email: "founder@example.com" },
      grantedCapabilities: ["google.basic_identity"],
      grantedScopes: ["openid", "email", "profile"],
      expiresAt: null,
      hasRefreshToken: true,
      connectionId: "conn-1",
      linkedAt: "2026-04-04T15:00:00.000Z",
      lastUsedAt: "2026-04-04T16:00:00.000Z",
    });

    const response = await getStatus(
      new NextRequest("https://example.com/api/v1/milady/google/status"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      provider: "google",
      mode: "cloud_managed",
      connected: true,
      connectionId: "conn-1",
    });
  });

  test("POST /api/v1/milady/google/connect/initiate validates capabilities and delegates to the service", async () => {
    mockInitiateConnection.mockResolvedValue({
      provider: "google",
      mode: "cloud_managed",
      requestedCapabilities: ["google.basic_identity", "google.calendar.read"],
      redirectUri: "https://www.elizacloud.ai/auth/success?platform=google",
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=managed-google",
    });

    const response = await postConnectInitiate(
      jsonRequest("https://example.com/api/v1/milady/google/connect/initiate", "POST", {
        redirectUrl: "https://www.elizacloud.ai/auth/success?platform=google",
        capabilities: ["google.calendar.read"],
      }),
    );

    expect(response.status).toBe(200);
    expect(mockInitiateConnection).toHaveBeenCalledWith({
      organizationId: "org-1",
      userId: "user-1",
      redirectUrl: "https://www.elizacloud.ai/auth/success?platform=google",
      capabilities: ["google.calendar.read"],
    });
  });

  test("GET /api/v1/milady/google/calendar/feed requires an explicit time window", async () => {
    const response = await getCalendarFeed(
      new NextRequest("https://example.com/api/v1/milady/google/calendar/feed?calendarId=primary"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "timeMin and timeMax are required.",
    });
  });

  test("POST /api/v1/milady/google/calendar/events creates calendar events through the service", async () => {
    mockCreateCalendarEvent.mockResolvedValue({
      event: {
        externalId: "event-1",
        calendarId: "primary",
        title: "Founder sync",
        description: "",
        location: "",
        status: "confirmed",
        startAt: "2026-04-04T19:00:00.000Z",
        endAt: "2026-04-04T19:30:00.000Z",
        isAllDay: false,
        timezone: "UTC",
        htmlLink: null,
        conferenceLink: null,
        organizer: null,
        attendees: [],
        metadata: {},
      },
    });

    const response = await postCalendarEvent(
      jsonRequest("https://example.com/api/v1/milady/google/calendar/events", "POST", {
        title: "Founder sync",
        startAt: "2026-04-04T19:00:00.000Z",
        endAt: "2026-04-04T19:30:00.000Z",
        timeZone: "UTC",
      }),
    );

    expect(response.status).toBe(201);
    expect(mockCreateCalendarEvent).toHaveBeenCalledWith({
      organizationId: "org-1",
      userId: "user-1",
      calendarId: "primary",
      title: "Founder sync",
      description: undefined,
      location: undefined,
      startAt: "2026-04-04T19:00:00.000Z",
      endAt: "2026-04-04T19:30:00.000Z",
      timeZone: "UTC",
      attendees: undefined,
    });
  });

  test("GET /api/v1/milady/google/gmail/triage rejects non-positive maxResults", async () => {
    const response = await getGmailTriage(
      new NextRequest("https://example.com/api/v1/milady/google/gmail/triage?maxResults=0"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "maxResults must be a positive integer.",
    });
  });

  test("POST /api/v1/milady/google/gmail/reply-send validates the payload and delegates to the service", async () => {
    mockSendReply.mockResolvedValue(undefined);

    const response = await postReplySend(
      jsonRequest("https://example.com/api/v1/milady/google/gmail/reply-send", "POST", {
        to: ["founder@example.com"],
        subject: "Project sync",
        bodyText: "Reviewing it now.",
        inReplyTo: "<msg-1@example.com>",
      }),
    );

    expect(response.status).toBe(200);
    expect(mockSendReply).toHaveBeenCalledWith({
      organizationId: "org-1",
      userId: "user-1",
      to: ["founder@example.com"],
      cc: undefined,
      subject: "Project sync",
      bodyText: "Reviewing it now.",
      inReplyTo: "<msg-1@example.com>",
      references: null,
    });
  });

  test("POST /api/v1/milady/google/disconnect disconnects the current Google connection", async () => {
    mockDisconnectConnection.mockResolvedValue(undefined);

    const response = await postDisconnect(
      jsonRequest("https://example.com/api/v1/milady/google/disconnect", "POST", {}),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mockDisconnectConnection).toHaveBeenCalledWith({
      organizationId: "org-1",
      userId: "user-1",
      connectionId: null,
    });
  });
});
