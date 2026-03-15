/**
 * Google MCP Tools Tests
 *
 * Mocks: fetch (Google APIs) and OAuth service.
 * Real: all handler logic, helpers, mappers, error formatting.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { authContextStorage } from "@/app/api/mcp/lib/context";

// ── Mock fetch ──────────────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;
let mockFetchResponses: Map<
  string,
  { status: number; body: any; headers?: Record<string, string> }
> = new Map();

function setupMockFetch() {
  globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = url.toString();
    for (const [pattern, response] of mockFetchResponses) {
      if (urlStr.includes(pattern)) {
        return new Response(JSON.stringify(response.body), {
          status: response.status,
          headers: { "Content-Type": "application/json", ...(response.headers || {}) },
        });
      }
    }
    return new Response(JSON.stringify({ error: { message: "Not found" } }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

function resetMockFetch() {
  globalThis.fetch = originalFetch;
  mockFetchResponses.clear();
}

// ── Mock OAuth ──────────────────────────────────────────────────────────────

const mockOAuth = {
  getValidTokenByPlatform: mock(async () => ({ accessToken: "test-token" })),
  listConnections: mock(async () => [
    {
      id: "c1",
      status: "active",
      email: "user@test.com",
      scopes: ["gmail.send", "calendar.events"],
      linkedAt: "2026-01-01T00:00:00Z",
    },
  ]),
};

mock.module("@/lib/services/oauth", () => ({ oauthService: mockOAuth }));

// ── Test helpers ────────────────────────────────────────────────────────────

type AnyFn = (...args: unknown[]) => unknown;

function auth(orgId = "org-1") {
  return {
    user: {
      id: `u-${orgId}`,
      organization_id: orgId,
      organization: { id: orgId, name: "Org", credit_balance: 100 },
    },
  } as any;
}

async function callTool(name: string, args: Record<string, unknown> = {}, orgId = "org-1") {
  const { registerGoogleTools } = await import("@/app/api/mcp/tools/google");
  let handler: AnyFn | undefined;
  const mockServer = {
    registerTool: (n: string, _s: unknown, h: AnyFn) => {
      if (n === name) handler = h;
    },
  } as any;
  registerGoogleTools(mockServer);
  if (!handler) throw new Error(`Tool "${name}" not found`);
  const h = handler;
  return authContextStorage.run(auth(orgId), () => h(args));
}

function parse(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text);
}

// ══════════════════════════════════════════════════════════════════════════════

describe("Google MCP Tools", () => {
  beforeEach(() => {
    setupMockFetch();
    mockOAuth.getValidTokenByPlatform.mockReset();
    mockOAuth.getValidTokenByPlatform.mockImplementation(async () => ({
      accessToken: "test-token",
    }));
    mockOAuth.listConnections.mockReset();
    mockOAuth.listConnections.mockImplementation(async () => [
      {
        id: "c1",
        status: "active",
        email: "user@test.com",
        scopes: ["gmail.send", "calendar.events"],
        linkedAt: "2026-01-01T00:00:00Z",
      },
    ]);
  });

  afterEach(() => {
    resetMockFetch();
  });

  // ── Registration ──────────────────────────────────────────────────────────

  describe("Registration", () => {
    test("exports registerGoogleTools", async () => {
      const mod = await import("@/app/api/mcp/tools/google");
      expect(typeof mod.registerGoogleTools).toBe("function");
    });

    test("registers all expected tools", async () => {
      const { registerGoogleTools } = await import("@/app/api/mcp/tools/google");
      const names: string[] = [];
      registerGoogleTools({
        registerTool: (n: string) => {
          names.push(n);
        },
      } as any);

      const expectedTools = [
        "google_status",
        "gmail_send",
        "gmail_list",
        "gmail_read",
        "calendar_list_events",
        "calendar_create_event",
        "calendar_update_event",
        "calendar_delete_event",
        "contacts_list",
      ];
      expect(names.length).toBe(expectedTools.length);
      for (const t of expectedTools) {
        expect(names).toContain(t);
      }
    });
  });

  // ── google_status ─────────────────────────────────────────────────────────

  describe("google_status", () => {
    test("returns connected with email when active", async () => {
      const p = parse(await callTool("google_status"));
      expect(p.connected).toBe(true);
      expect(p.email).toBe("user@test.com");
      expect(p.scopes).toContain("gmail.send");
      expect(p.linkedAt).toBe("2026-01-01T00:00:00Z");
    });

    test("returns connected=false when no active connection", async () => {
      mockOAuth.listConnections.mockImplementation(async () => []);
      const p = parse(await callTool("google_status"));
      expect(p.connected).toBe(false);
      expect(p.message).toContain("not connected");
    });

    test("filters out revoked/expired connections", async () => {
      mockOAuth.listConnections.mockImplementation(async () => [
        { id: "c1", status: "revoked", email: "old@test.com" },
        { id: "c2", status: "expired", email: "expired@test.com" },
      ]);
      const p = parse(await callTool("google_status"));
      expect(p.connected).toBe(false);
    });

    test("returns error on service failure", async () => {
      mockOAuth.listConnections.mockImplementation(async () => {
        throw new Error("DB down");
      });
      const r = await callTool("google_status");
      expect(r.isError).toBe(true);
      expect(parse(r).error).toContain("DB down");
    });
  });

  // ── gmail_send ────────────────────────────────────────────────────────────

  describe("gmail_send", () => {
    test("sends email successfully", async () => {
      mockFetchResponses.set("gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        status: 200,
        body: { id: "msg-123", threadId: "thread-456" },
      });

      const p = parse(
        await callTool("gmail_send", {
          to: "recipient@example.com",
          subject: "Test Subject",
          body: "Test body content",
        }),
      );
      expect(p.success).toBe(true);
      expect(p.messageId).toBe("msg-123");
      expect(p.threadId).toBe("thread-456");
    });

    test("handles CC and BCC recipients", async () => {
      let capturedInit: RequestInit | undefined;
      globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
        capturedInit = init;
        return new Response(JSON.stringify({ id: "msg-1", threadId: "t-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      await callTool("gmail_send", {
        to: "to@example.com",
        subject: "Test",
        body: "Body",
        cc: "cc@example.com",
        bcc: "bcc@example.com",
      });

      expect(capturedInit).toBeDefined();
      const raw = JSON.parse(capturedInit!.body as string).raw;
      const decoded = Buffer.from(raw, "base64").toString("utf-8");
      expect(decoded).toContain("Cc: cc@example.com");
      expect(decoded).toContain("Bcc: bcc@example.com");
    });

    test("sends HTML email with correct content type", async () => {
      let capturedBody: any;
      globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({ id: "msg-1", threadId: "t-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      await callTool("gmail_send", {
        to: "to@example.com",
        subject: "HTML",
        body: "<h1>Hello</h1>",
        isHtml: true,
      });

      const decoded = Buffer.from(capturedBody.raw, "base64").toString("utf-8");
      expect(decoded).toContain("text/html");
    });

    test("returns error when not connected", async () => {
      mockOAuth.getValidTokenByPlatform.mockImplementation(async () => {
        throw new Error("Not connected");
      });
      const r = await callTool("gmail_send", { to: "a@b.com", subject: "X", body: "Y" });
      expect(r.isError).toBe(true);
      expect(parse(r).error).toContain("not connected");
    });

    test("returns error on Gmail API failure", async () => {
      mockFetchResponses.set("gmail.googleapis.com", {
        status: 403,
        body: { error: { message: "Insufficient permissions", code: 403 } },
      });
      const r = await callTool("gmail_send", { to: "a@b.com", subject: "X", body: "Y" });
      expect(r.isError).toBe(true);
      expect(parse(r).error).toContain("Insufficient permissions");
    });
  });

  // ── gmail_list ────────────────────────────────────────────────────────────

  describe("gmail_list", () => {
    test("returns empty list when no messages", async () => {
      mockFetchResponses.set("gmail.googleapis.com/gmail/v1/users/me/messages", {
        status: 200,
        body: { messages: [], resultSizeEstimate: 0 },
      });

      const p = parse(await callTool("gmail_list"));
      expect(p.resultCount).toBe(0);
      expect(p.messages).toEqual([]);
      expect(p.nextPageToken).toBeNull();
    });

    test("returns messages with mapped fields", async () => {
      globalThis.fetch = mock(async (url: string) => {
        const urlStr = url.toString();
        if (urlStr.includes("/messages?")) {
          return new Response(
            JSON.stringify({
              messages: [{ id: "msg-1" }],
              nextPageToken: "page2-tok",
              resultSizeEstimate: 42,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (urlStr.includes("/messages/msg-1")) {
          return new Response(
            JSON.stringify({
              id: "msg-1",
              threadId: "t-1",
              snippet: "Hello...",
              labelIds: ["INBOX"],
              internalDate: "1708416000000",
              payload: {
                headers: [
                  { name: "From", value: "sender@test.com" },
                  { name: "Subject", value: "Hi" },
                ],
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("{}", { status: 404 });
      }) as typeof fetch;

      const p = parse(await callTool("gmail_list"));
      expect(p.resultCount).toBe(1);
      expect(p.nextPageToken).toBe("page2-tok");
      expect(p.resultSizeEstimate).toBe(42);
      expect(p.messages[0].id).toBe("msg-1");
      expect(p.messages[0].headers.From).toBe("sender@test.com");
      expect(p.messages[0].headers.Subject).toBe("Hi");
    });

    test("passes pageToken to Gmail API", async () => {
      let capturedUrl = "";
      globalThis.fetch = mock(async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ messages: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      await callTool("gmail_list", { pageToken: "next-page-token" });
      expect(capturedUrl).toContain("pageToken=next-page-token");
    });

    test("converts after/before dates to Gmail query syntax", async () => {
      let capturedUrl = "";
      globalThis.fetch = mock(async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ messages: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      await callTool("gmail_list", {
        after: "2026-02-13T00:00:00Z",
        before: "2026-02-20T00:00:00Z",
      });

      expect(capturedUrl).toContain("after%3A2026%2F2%2F13");
      expect(capturedUrl).toContain("before%3A2026%2F2%2F20");
    });

    test("combines after/before with existing query", async () => {
      let capturedUrl = "";
      globalThis.fetch = mock(async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ messages: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      await callTool("gmail_list", {
        query: "from:boss@company.com",
        after: "2026-02-13T00:00:00Z",
      });

      const decodedUrl = decodeURIComponent(capturedUrl);
      expect(decodedUrl).toContain("from:boss@company.com");
      expect(decodedUrl).toContain("after:2026/2/13");
    });

    test("handles partial message fetch failures", async () => {
      globalThis.fetch = mock(async (url: string) => {
        if (url.includes("/messages?")) {
          return new Response(
            JSON.stringify({
              messages: [{ id: "msg-1" }, { id: "msg-2" }, { id: "msg-3" }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("msg-2")) {
          return new Response(JSON.stringify({ error: { message: "Not found" } }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        const id = url.includes("msg-1") ? "msg-1" : "msg-3";
        return new Response(
          JSON.stringify({
            id,
            threadId: "t-1",
            snippet: "Test",
            payload: { headers: [] },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof fetch;

      const p = parse(await callTool("gmail_list"));
      expect(p.resultCount).toBe(2);
      expect(p.failedToFetch).toBe(1);
    });

    test("passes maxResults parameter", async () => {
      let capturedUrl = "";
      globalThis.fetch = mock(async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ messages: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      await callTool("gmail_list", { maxResults: 25 });
      expect(capturedUrl).toContain("maxResults=25");
    });

    test("passes labelIds to Gmail API", async () => {
      let capturedUrl = "";
      globalThis.fetch = mock(async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ messages: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      await callTool("gmail_list", { labelIds: "INBOX,UNREAD" });
      expect(capturedUrl).toContain("labelIds=INBOX");
      expect(capturedUrl).toContain("labelIds=UNREAD");
    });
  });

  // ── gmail_read ────────────────────────────────────────────────────────────

  describe("gmail_read", () => {
    test("reads message with full content", async () => {
      mockFetchResponses.set("gmail.googleapis.com/gmail/v1/users/me/messages/msg-123", {
        status: 200,
        body: {
          id: "msg-123",
          threadId: "thread-456",
          labelIds: ["INBOX", "UNREAD"],
          snippet: "Preview...",
          internalDate: "1704067200000",
          payload: {
            headers: [
              { name: "From", value: "sender@example.com" },
              { name: "Subject", value: "Test Subject" },
            ],
            body: { data: Buffer.from("Hello, this is the email body!").toString("base64") },
          },
        },
      });

      const p = parse(await callTool("gmail_read", { messageId: "msg-123" }));
      expect(p.id).toBe("msg-123");
      expect(p.headers.From).toBe("sender@example.com");
      expect(p.body).toBe("Hello, this is the email body!");
      expect(p.internalDate).toBeDefined();
    });

    test("handles multipart messages preferring text/plain", async () => {
      mockFetchResponses.set("gmail.googleapis.com/gmail/v1/users/me/messages/msg-mp", {
        status: 200,
        body: {
          id: "msg-mp",
          threadId: "t-1",
          payload: {
            headers: [],
            parts: [
              {
                mimeType: "text/plain",
                body: { data: Buffer.from("Plain text").toString("base64") },
              },
              {
                mimeType: "text/html",
                body: { data: Buffer.from("<p>HTML</p>").toString("base64") },
              },
            ],
          },
        },
      });

      const p = parse(await callTool("gmail_read", { messageId: "msg-mp" }));
      expect(p.body).toBe("Plain text");
    });

    test("handles deeply nested multipart messages", async () => {
      mockFetchResponses.set("gmail.googleapis.com/gmail/v1/users/me/messages/msg-nested", {
        status: 200,
        body: {
          id: "msg-nested",
          threadId: "t-1",
          payload: {
            mimeType: "multipart/mixed",
            headers: [],
            parts: [
              {
                mimeType: "multipart/alternative",
                parts: [
                  {
                    mimeType: "text/plain",
                    body: { data: Buffer.from("Nested plain text").toString("base64") },
                  },
                  {
                    mimeType: "text/html",
                    body: { data: Buffer.from("<p>Nested HTML</p>").toString("base64") },
                  },
                ],
              },
              {
                mimeType: "application/pdf",
                filename: "attachment.pdf",
                body: { attachmentId: "att-1" },
              },
            ],
          },
        },
      });

      const p = parse(await callTool("gmail_read", { messageId: "msg-nested" }));
      expect(p.body).toBe("Nested plain text");
    });

    test("handles missing payload gracefully (null safety)", async () => {
      mockFetchResponses.set("gmail.googleapis.com/gmail/v1/users/me/messages/msg-no-payload", {
        status: 200,
        body: {
          id: "msg-no-payload",
          threadId: "t-1",
          labelIds: ["INBOX"],
          snippet: "Preview",
        },
      });

      const p = parse(await callTool("gmail_read", { messageId: "msg-no-payload" }));
      expect(p.id).toBe("msg-no-payload");
      expect(p.headers).toEqual({});
      expect(p.body).toBe("");
    });

    test("returns error for non-existent message", async () => {
      mockFetchResponses.set("gmail.googleapis.com", {
        status: 404,
        body: { error: { message: "Requested entity was not found." } },
      });
      const r = await callTool("gmail_read", { messageId: "nonexistent" });
      expect(r.isError).toBe(true);
      expect(parse(r).error).toContain("not found");
    });
  });

  // ── calendar_list_events ──────────────────────────────────────────────────

  describe("calendar_list_events", () => {
    test("lists events with default parameters", async () => {
      mockFetchResponses.set("googleapis.com/calendar/v3/calendars", {
        status: 200,
        body: {
          items: [
            {
              id: "evt-1",
              summary: "Team Meeting",
              start: { dateTime: "2026-02-20T10:00:00Z" },
              end: { dateTime: "2026-02-20T11:00:00Z" },
              status: "confirmed",
            },
          ],
        },
      });

      const p = parse(await callTool("calendar_list_events"));
      expect(p.resultCount).toBe(1);
      expect(p.events[0].summary).toBe("Team Meeting");
      expect(p.events[0].start).toBe("2026-02-20T10:00:00Z");
      expect(p.nextPageToken).toBeNull();
    });

    test("returns past events when timeMin is set to past date", async () => {
      let capturedUrl = "";
      globalThis.fetch = mock(async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      await callTool("calendar_list_events", {
        timeMin: "2026-01-01T00:00:00Z",
        timeMax: "2026-02-01T00:00:00Z",
      });

      expect(capturedUrl).toContain("timeMin=2026-01-01T00%3A00%3A00Z");
      expect(capturedUrl).toContain("timeMax=2026-02-01T00%3A00%3A00Z");
    });

    test("defaults to upcoming when no date filters provided", async () => {
      let capturedUrl = "";
      globalThis.fetch = mock(async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      await callTool("calendar_list_events");
      expect(capturedUrl).toContain("timeMin=");
    });

    test("does NOT default timeMin when timeMax is provided alone", async () => {
      let capturedUrl = "";
      globalThis.fetch = mock(async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      await callTool("calendar_list_events", {
        timeMax: "2026-03-01T00:00:00Z",
      });

      expect(capturedUrl).not.toContain("timeMin=");
      expect(capturedUrl).toContain("timeMax=");
    });

    test("passes pageToken to Calendar API", async () => {
      let capturedUrl = "";
      globalThis.fetch = mock(async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      await callTool("calendar_list_events", { pageToken: "cal-page-2" });
      expect(capturedUrl).toContain("pageToken=cal-page-2");
    });

    test("returns nextPageToken from response", async () => {
      mockFetchResponses.set("googleapis.com/calendar/v3/calendars", {
        status: 200,
        body: {
          items: [
            {
              id: "evt-1",
              summary: "Meeting",
              start: { dateTime: "2026-02-20T10:00:00Z" },
              end: { dateTime: "2026-02-20T11:00:00Z" },
            },
          ],
          nextPageToken: "next-cal-page",
        },
      });

      const p = parse(await callTool("calendar_list_events"));
      expect(p.nextPageToken).toBe("next-cal-page");
    });

    test("handles all-day events (date without time)", async () => {
      mockFetchResponses.set("googleapis.com/calendar/v3/calendars", {
        status: 200,
        body: {
          items: [
            {
              id: "evt-1",
              summary: "Holiday",
              start: { date: "2026-02-20" },
              end: { date: "2026-02-21" },
            },
          ],
        },
      });

      const p = parse(await callTool("calendar_list_events"));
      expect(p.events[0].start).toBe("2026-02-20");
    });

    test("handles empty event list", async () => {
      mockFetchResponses.set("googleapis.com/calendar/v3/calendars", {
        status: 200,
        body: { items: [] },
      });

      const p = parse(await callTool("calendar_list_events"));
      expect(p.resultCount).toBe(0);
      expect(p.events).toEqual([]);
      expect(p.nextPageToken).toBeNull();
    });

    test("passes search query to API", async () => {
      let capturedUrl = "";
      globalThis.fetch = mock(async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      await callTool("calendar_list_events", { query: "standup" });
      expect(capturedUrl).toContain("q=standup");
    });
  });

  // ── calendar_create_event ─────────────────────────────────────────────────

  describe("calendar_create_event", () => {
    test("creates event successfully", async () => {
      mockFetchResponses.set("googleapis.com/calendar/v3/calendars", {
        status: 200,
        body: {
          id: "new-evt-1",
          htmlLink: "https://calendar.google.com/event/1",
          status: "confirmed",
        },
      });

      const p = parse(
        await callTool("calendar_create_event", {
          summary: "Project Kickoff",
          start: "2026-02-20T14:00:00Z",
          end: "2026-02-20T15:00:00Z",
        }),
      );
      expect(p.success).toBe(true);
      expect(p.eventId).toBe("new-evt-1");
      expect(p.htmlLink).toContain("calendar.google.com");
    });

    test("creates event with attendees", async () => {
      let capturedBody: any;
      globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
        if (init?.method === "POST") capturedBody = JSON.parse(init.body as string);
        return new Response(
          JSON.stringify({ id: "evt-1", htmlLink: "https://cal.google.com", status: "confirmed" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }) as typeof fetch;

      await callTool("calendar_create_event", {
        summary: "Sync",
        start: "2026-02-20T14:00:00Z",
        end: "2026-02-20T15:00:00Z",
        attendees: ["alice@example.com", "bob@example.com"],
      });

      expect(capturedBody.attendees).toHaveLength(2);
      expect(capturedBody.attendees[0].email).toBe("alice@example.com");
    });

    test("includes optional fields when provided", async () => {
      let capturedBody: any;
      globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
        if (init?.method === "POST") capturedBody = JSON.parse(init.body as string);
        return new Response(
          JSON.stringify({ id: "evt-1", htmlLink: "https://cal.google.com", status: "confirmed" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }) as typeof fetch;

      await callTool("calendar_create_event", {
        summary: "Meeting",
        start: "2026-02-20T14:00:00Z",
        end: "2026-02-20T15:00:00Z",
        description: "Quarterly review",
        location: "Room A",
      });

      expect(capturedBody.description).toBe("Quarterly review");
      expect(capturedBody.location).toBe("Room A");
    });
  });

  // ── calendar_update_event ─────────────────────────────────────────────────

  describe("calendar_update_event", () => {
    test("updates event by merging with existing data", async () => {
      let requestCount = 0;
      let capturedBody: any;
      globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
        requestCount++;
        if (requestCount === 1) {
          return new Response(
            JSON.stringify({
              id: "evt-1",
              summary: "Old Title",
              start: { dateTime: "2026-02-20T10:00:00Z" },
              end: { dateTime: "2026-02-20T11:00:00Z" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        capturedBody = JSON.parse(init?.body as string);
        return new Response(
          JSON.stringify({
            id: "evt-1",
            htmlLink: "https://cal.google.com",
            updated: "2026-02-20T16:00:00Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof fetch;

      const p = parse(
        await callTool("calendar_update_event", {
          eventId: "evt-1",
          summary: "New Title",
        }),
      );

      expect(p.success).toBe(true);
      expect(capturedBody.summary).toBe("New Title");
      expect(capturedBody.start.dateTime).toBe("2026-02-20T10:00:00Z");
    });

    test("returns error when event not found (null safety)", async () => {
      globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify({ error: { message: "Not Found", code: 404 } }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      const r = await callTool("calendar_update_event", { eventId: "nonexistent" });
      expect(r.isError).toBe(true);
      expect(parse(r).error).toContain("Not Found");
    });
  });

  // ── calendar_delete_event ─────────────────────────────────────────────────

  describe("calendar_delete_event", () => {
    test("deletes event successfully (204 response)", async () => {
      globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
        if (init?.method === "DELETE") {
          return new Response("", { status: 204 });
        }
        return new Response("", { status: 404 });
      }) as typeof fetch;

      const p = parse(await callTool("calendar_delete_event", { eventId: "evt-to-delete" }));
      expect(p.success).toBe(true);
      expect(p.deleted).toBe(true);
      expect(p.eventId).toBe("evt-to-delete");
    });

    test("returns error on deletion failure", async () => {
      mockFetchResponses.set("googleapis.com/calendar/v3/calendars", {
        status: 404,
        body: { error: { message: "Not Found" } },
      });

      const r = await callTool("calendar_delete_event", { eventId: "nonexistent" });
      expect(r.isError).toBe(true);
    });
  });

  // ── contacts_list ─────────────────────────────────────────────────────────

  describe("contacts_list", () => {
    test("lists contacts from connections API", async () => {
      mockFetchResponses.set("people.googleapis.com/v1/people/me/connections", {
        status: 200,
        body: {
          connections: [
            {
              resourceName: "people/123",
              names: [{ displayName: "John Doe" }],
              emailAddresses: [{ value: "john@example.com" }],
              phoneNumbers: [{ value: "+1-555-1234" }],
              organizations: [{ name: "Acme Corp" }],
            },
          ],
          nextPageToken: "contacts-page-2",
        },
      });

      const p = parse(await callTool("contacts_list"));
      expect(p.resultCount).toBe(1);
      expect(p.contacts[0].name).toBe("John Doe");
      expect(p.contacts[0].email).toBe("john@example.com");
      expect(p.contacts[0].phone).toBe("+1-555-1234");
      expect(p.contacts[0].organization).toBe("Acme Corp");
      expect(p.nextPageToken).toBe("contacts-page-2");
    });

    test("uses search API when query provided", async () => {
      let capturedUrl = "";
      globalThis.fetch = mock(async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      await callTool("contacts_list", { query: "John" });
      expect(capturedUrl).toContain("searchContacts");
      expect(capturedUrl).toContain("query=John");
    });

    test("passes pageToken for pagination", async () => {
      let capturedUrl = "";
      globalThis.fetch = mock(async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ connections: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      await callTool("contacts_list", { pageToken: "ct-page-2" });
      expect(capturedUrl).toContain("pageToken=ct-page-2");
    });

    test("handles empty contacts list", async () => {
      mockFetchResponses.set("people.googleapis.com", {
        status: 200,
        body: { connections: [] },
      });

      const p = parse(await callTool("contacts_list"));
      expect(p.resultCount).toBe(0);
      expect(p.contacts).toEqual([]);
      expect(p.nextPageToken).toBeNull();
    });

    test("handles contacts with missing fields", async () => {
      mockFetchResponses.set("people.googleapis.com/v1/people/me/connections", {
        status: 200,
        body: {
          connections: [{ resourceName: "people/456" }],
        },
      });

      const p = parse(await callTool("contacts_list"));
      expect(p.contacts[0].resourceName).toBe("people/456");
      expect(p.contacts[0].name).toBeUndefined();
      expect(p.contacts[0].email).toBeUndefined();
    });
  });

  // ── Error handling & edge cases ───────────────────────────────────────────

  describe("Error handling", () => {
    test("googleFetch extracts API error message from response", async () => {
      mockFetchResponses.set("gmail.googleapis.com", {
        status: 403,
        body: {
          error: { message: "Insufficient Permission", code: 403, status: "PERMISSION_DENIED" },
        },
      });

      const r = await callTool("gmail_list");
      expect(r.isError).toBe(true);
      expect(parse(r).error).toContain("Insufficient Permission");
    });

    test("googleFetch handles rate limit (429) with retry info", async () => {
      mockFetchResponses.set("gmail.googleapis.com", {
        status: 429,
        body: { error: { message: "Rate Limit Exceeded" } },
        headers: { "Retry-After": "60" },
      });

      const r = await callTool("gmail_list");
      expect(r.isError).toBe(true);
      const msg = parse(r).error;
      expect(msg).toContain("Rate Limit Exceeded");
    });

    test("googleFetch handles non-JSON error responses", async () => {
      globalThis.fetch = mock(async () => {
        return new Response("Internal Server Error", {
          status: 500,
          statusText: "Internal Server Error",
        });
      }) as typeof fetch;

      const r = await callTool("gmail_list");
      expect(r.isError).toBe(true);
      expect(parse(r).error).toContain("500");
    });

    test("handles non-Error thrown objects", async () => {
      mockOAuth.getValidTokenByPlatform.mockImplementation(async () => {
        throw "string error";
      });
      const r = await callTool("gmail_list");
      expect(r.isError).toBe(true);
      expect(parse(r).error).toContain("not connected");
    });

    test("handles network timeout", async () => {
      globalThis.fetch = mock(async () => {
        throw new Error("Network request failed");
      }) as typeof fetch;
      const r = await callTool("gmail_list");
      expect(r.isError).toBe(true);
      expect(parse(r).error).toContain("Network request failed");
    });
  });

  // ── Concurrent request isolation ──────────────────────────────────────────

  describe("Concurrent request isolation", () => {
    test("handles concurrent requests with different orgs", async () => {
      const orgRequests: string[] = [];
      mockOAuth.listConnections.mockImplementation(async ({ organizationId }) => {
        orgRequests.push(organizationId);
        await new Promise((r) => setTimeout(r, Math.random() * 50));
        return [
          {
            id: `conn-${organizationId}`,
            status: "active",
            email: `${organizationId}@test.com`,
            scopes: [],
          },
        ];
      });

      const results = await Promise.all([
        callTool("google_status", {}, "org-A"),
        callTool("google_status", {}, "org-B"),
        callTool("google_status", {}, "org-C"),
      ]);

      for (const r of results) {
        expect(parse(r).connected).toBe(true);
      }
      expect(orgRequests).toContain("org-A");
      expect(orgRequests).toContain("org-B");
      expect(orgRequests).toContain("org-C");
    });
  });

  // ── Special characters & CRLF injection ───────────────────────────────────

  describe("Security", () => {
    test("sanitizes CRLF from email headers to prevent header injection", async () => {
      let capturedBody: any;
      globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({ id: "msg-1", threadId: "t-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      await callTool("gmail_send", {
        to: "safe@example.com",
        subject: "Normal\r\nBcc: attacker@evil.com",
        body: "Body",
      });

      const decoded = Buffer.from(capturedBody.raw, "base64").toString("utf-8");
      // CRLF stripped — "Bcc: attacker..." is collapsed into Subject line, NOT a separate header
      expect(decoded).toContain("Subject: NormalBcc: attacker@evil.com");
      // Verify it's NOT a separate Bcc header line (no CRLF before it)
      expect(decoded).not.toContain("\r\nBcc:");
    });

    test("handles special characters in email body", async () => {
      let capturedBody: any;
      globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({ id: "msg-1", threadId: "t-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      await callTool("gmail_send", {
        to: "to@example.com",
        subject: 'Test: Special chars & <> "quotes"',
        body: "Body with émojis 🎉 and ünïcödé",
      });

      expect(capturedBody.raw).toBeDefined();
      const decoded = Buffer.from(capturedBody.raw, "base64").toString("utf-8");
      expect(decoded).toContain("Special chars");
    });
  });

  // ── URL encoding & defensive edge cases ───────────────────────────────────

  describe("URL encoding", () => {
    test("gmail_read encodes messageId in URL", async () => {
      let capturedUrl = "";
      globalThis.fetch = mock(async (url: string) => {
        capturedUrl = url;
        return new Response(
          JSON.stringify({
            id: "msg+special/chars",
            threadId: "t-1",
            payload: { headers: [] },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof fetch;

      await callTool("gmail_read", { messageId: "msg+special/chars" });
      expect(capturedUrl).toContain("msg%2Bspecial%2Fchars");
      expect(capturedUrl).not.toContain("msg+special/chars");
    });

    test("gmail_list encodes messageIds in metadata fetch URLs", async () => {
      const capturedUrls: string[] = [];
      globalThis.fetch = mock(async (url: string) => {
        capturedUrls.push(url);
        if (url.includes("/messages?")) {
          return new Response(
            JSON.stringify({
              messages: [{ id: "id+with/slash" }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            id: "id+with/slash",
            threadId: "t-1",
            snippet: "Test",
            payload: { headers: [] },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof fetch;

      await callTool("gmail_list");
      const metadataUrl = capturedUrls.find((u) => u.includes("id%2Bwith%2Fslash"));
      expect(metadataUrl).toBeDefined();
    });
  });

  // ── Date validation ───────────────────────────────────────────────────────

  describe("Date validation", () => {
    test("returns error for invalid 'after' date", async () => {
      const r = await callTool("gmail_list", { after: "banana" });
      expect(r.isError).toBe(true);
      expect(parse(r).error).toContain("Invalid 'after' date");
      expect(parse(r).error).toContain("banana");
      expect(parse(r).error).toContain("ISO 8601");
    });

    test("returns error for invalid 'before' date", async () => {
      const r = await callTool("gmail_list", { before: "not-a-date" });
      expect(r.isError).toBe(true);
      expect(parse(r).error).toContain("Invalid 'before' date");
      expect(parse(r).error).toContain("not-a-date");
    });

    test("accepts valid ISO 8601 dates without error", async () => {
      globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify({ messages: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      const r = await callTool("gmail_list", {
        after: "2026-02-13T00:00:00Z",
        before: "2026-02-20T23:59:59Z",
      });
      expect(r.isError).toBeUndefined();
      expect(parse(r).resultCount).toBe(0);
    });
  });

  // ── Contacts search pagination ────────────────────────────────────────────

  describe("Contacts search pagination", () => {
    test("surfaces note when pageToken is ignored during search", async () => {
      globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      const p = parse(
        await callTool("contacts_list", {
          query: "John",
          pageToken: "some-token",
        }),
      );
      expect(p.note).toBeDefined();
      expect(p.note).toContain("does not support pagination");
      expect(p.note).toContain("pageToken was ignored");
    });

    test("no note when listing without search query", async () => {
      mockFetchResponses.set("people.googleapis.com/v1/people/me/connections", {
        status: 200,
        body: { connections: [] },
      });

      const p = parse(await callTool("contacts_list", { pageToken: "page2" }));
      expect(p.note).toBeUndefined();
    });

    test("no note when searching without pageToken", async () => {
      globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      const p = parse(await callTool("contacts_list", { query: "John" }));
      expect(p.note).toBeUndefined();
    });
  });

  // ── Boundary conditions ───────────────────────────────────────────────────

  describe("Boundary conditions", () => {
    test("gmail_list with maxResults=1 fetches exactly one message", async () => {
      let listUrl = "";
      globalThis.fetch = mock(async (url: string) => {
        if (url.includes("/messages?")) {
          listUrl = url;
          return new Response(
            JSON.stringify({
              messages: [{ id: "msg-1" }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            id: "msg-1",
            threadId: "t-1",
            snippet: "Only one",
            payload: { headers: [{ name: "Subject", value: "Solo" }] },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof fetch;

      const p = parse(await callTool("gmail_list", { maxResults: 1 }));
      expect(listUrl).toContain("maxResults=1");
      expect(p.resultCount).toBe(1);
      expect(p.messages).toHaveLength(1);
      expect(p.messages[0].headers.Subject).toBe("Solo");
    });

    test("gmail_list with no messages returns null nextPageToken and zero resultSizeEstimate", async () => {
      mockFetchResponses.set("gmail.googleapis.com/gmail/v1/users/me/messages", {
        status: 200,
        body: {},
      });

      const p = parse(await callTool("gmail_list"));
      expect(p.resultCount).toBe(0);
      expect(p.messages).toEqual([]);
      expect(p.nextPageToken).toBeNull();
      expect(p.resultSizeEstimate).toBe(0);
    });

    test("calendar_list_events with maxResults=250 passes to API", async () => {
      let capturedUrl = "";
      globalThis.fetch = mock(async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      await callTool("calendar_list_events", { maxResults: 250 });
      expect(capturedUrl).toContain("maxResults=250");
    });

    test("gmail_send plain text email has correct MIME structure", async () => {
      let capturedBody: any;
      globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({ id: "msg-1", threadId: "t-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      await callTool("gmail_send", {
        to: "test@example.com",
        subject: "Plain Test",
        body: "Hello plain",
      });

      const decoded = Buffer.from(capturedBody.raw, "base64").toString("utf-8");
      expect(decoded).toContain("To: test@example.com");
      expect(decoded).toContain("Subject: Plain Test");
      expect(decoded).toContain("text/plain");
      expect(decoded).toContain("Hello plain");
      expect(decoded).not.toContain("text/html");
    });

    test("gmail_read with format=metadata does not attempt body extraction", async () => {
      let capturedUrl = "";
      globalThis.fetch = mock(async (url: string) => {
        capturedUrl = url;
        return new Response(
          JSON.stringify({
            id: "msg-meta",
            threadId: "t-1",
            payload: { headers: [{ name: "From", value: "a@b.com" }] },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof fetch;

      const p = parse(await callTool("gmail_read", { messageId: "msg-meta", format: "metadata" }));
      expect(capturedUrl).toContain("format=metadata");
      expect(p.id).toBe("msg-meta");
      expect(p.headers.From).toBe("a@b.com");
      expect(p.body).toBe("");
    });

    test("calendar_create_event excludes optional fields when not provided", async () => {
      let capturedBody: any;
      globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
        if (init?.method === "POST") capturedBody = JSON.parse(init.body as string);
        return new Response(
          JSON.stringify({ id: "evt-1", htmlLink: "link", status: "confirmed" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }) as typeof fetch;

      await callTool("calendar_create_event", {
        summary: "Minimal",
        start: "2026-02-20T14:00:00Z",
        end: "2026-02-20T15:00:00Z",
      });

      expect(capturedBody.summary).toBe("Minimal");
      expect(capturedBody.description).toBeUndefined();
      expect(capturedBody.location).toBeUndefined();
      expect(capturedBody.attendees).toBeUndefined();
    });

    test("calendar_update_event converts timed event start/end and clears date field", async () => {
      let requestCount = 0;
      let capturedBody: any;
      globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
        requestCount++;
        if (requestCount === 1) {
          return new Response(
            JSON.stringify({
              id: "evt-allday",
              summary: "All Day",
              start: { date: "2026-02-20" },
              end: { date: "2026-02-21" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        capturedBody = JSON.parse(init?.body as string);
        return new Response(
          JSON.stringify({
            id: "evt-allday",
            htmlLink: "link",
            updated: "2026-02-20T16:00:00Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof fetch;

      await callTool("calendar_update_event", {
        eventId: "evt-allday",
        start: "2026-02-20T09:00:00Z",
        end: "2026-02-20T10:00:00Z",
      });

      expect(capturedBody.start.dateTime).toBe("2026-02-20T09:00:00Z");
      expect(capturedBody.start.date).toBeUndefined();
      expect(capturedBody.end.dateTime).toBe("2026-02-20T10:00:00Z");
      expect(capturedBody.end.date).toBeUndefined();
    });

    test("calendar_delete_event passes sendUpdates and calendarId to URL", async () => {
      let capturedUrl = "";
      globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
        if (init?.method === "DELETE") {
          capturedUrl = url;
          return new Response("", { status: 204 });
        }
        return new Response("", { status: 404 });
      }) as typeof fetch;

      await callTool("calendar_delete_event", {
        eventId: "evt-1",
        calendarId: "work@group.calendar.google.com",
        sendUpdates: "none",
      });

      expect(capturedUrl).toContain("work%40group.calendar.google.com");
      expect(capturedUrl).toContain("sendUpdates=none");
    });

    test("after date at year boundary converts correctly", async () => {
      let capturedUrl = "";
      globalThis.fetch = mock(async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ messages: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      await callTool("gmail_list", { after: "2025-12-31T23:59:59Z" });
      const decodedUrl = decodeURIComponent(capturedUrl);
      expect(decodedUrl).toContain("after:2025/12/31");
    });

    test("contacts_list with pageSize=100 passes to API", async () => {
      let capturedUrl = "";
      globalThis.fetch = mock(async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ connections: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      await callTool("contacts_list", { pageSize: 100 });
      expect(capturedUrl).toContain("pageSize=100");
    });

    test("mapGmailMessage handles missing internalDate", async () => {
      globalThis.fetch = mock(async (url: string) => {
        if (url.includes("/messages?")) {
          return new Response(
            JSON.stringify({
              messages: [{ id: "msg-nodate" }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            id: "msg-nodate",
            threadId: "t-1",
            snippet: "No date",
            payload: { headers: [] },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof fetch;

      const p = parse(await callTool("gmail_list"));
      expect(p.messages[0].id).toBe("msg-nodate");
      expect(p.messages[0].internalDate).toBeUndefined();
    });

    test("mapCalendarEvent handles event with attendees and organizer", async () => {
      mockFetchResponses.set("googleapis.com/calendar/v3/calendars", {
        status: 200,
        body: {
          items: [
            {
              id: "evt-full",
              summary: "Full Event",
              start: { dateTime: "2026-02-20T10:00:00Z" },
              end: { dateTime: "2026-02-20T11:00:00Z" },
              location: "Room B",
              status: "confirmed",
              htmlLink: "https://cal.google.com/evt-full",
              attendees: [
                { email: "a@test.com", displayName: "Alice", responseStatus: "accepted" },
                { email: "b@test.com", displayName: "Bob", responseStatus: "needsAction" },
              ],
              organizer: { email: "org@test.com", displayName: "Organizer" },
            },
          ],
        },
      });

      const p = parse(await callTool("calendar_list_events"));
      const evt = p.events[0];
      expect(evt.id).toBe("evt-full");
      expect(evt.location).toBe("Room B");
      expect(evt.htmlLink).toContain("evt-full");
      expect(evt.attendees).toHaveLength(2);
      expect(evt.attendees[0].email).toBe("a@test.com");
      expect(evt.attendees[0].responseStatus).toBe("accepted");
      expect(evt.attendees[1].displayName).toBe("Bob");
      expect(evt.organizer.email).toBe("org@test.com");
    });
  });

  // ── Additional edge cases (thorough testing) ───────────────────────────────

  describe("Thorough edge cases", () => {
    test("gmail_list where ALL individual message fetches fail returns 0 results with failedToFetch count", async () => {
      globalThis.fetch = mock(async (url: string) => {
        if (url.includes("/messages?")) {
          return new Response(
            JSON.stringify({
              messages: [{ id: "m1" }, { id: "m2" }],
              resultSizeEstimate: 2,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ error: { message: "Gone" } }), {
          status: 410,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      const p = parse(await callTool("gmail_list"));
      expect(p.resultCount).toBe(0);
      expect(p.failedToFetch).toBe(2);
      expect(p.messages).toEqual([]);
    });

    test("calendar_update_event can clear description by passing empty string", async () => {
      let requestCount = 0;
      let capturedBody: any;
      globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
        requestCount++;
        if (requestCount === 1) {
          return new Response(
            JSON.stringify({
              id: "evt-desc",
              summary: "Has Description",
              description: "Old description",
              start: { dateTime: "2026-02-20T10:00:00Z" },
              end: { dateTime: "2026-02-20T11:00:00Z" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        capturedBody = JSON.parse(init?.body as string);
        return new Response(
          JSON.stringify({
            id: "evt-desc",
            htmlLink: "link",
            updated: "2026-02-20T16:00:00Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof fetch;

      const p = parse(
        await callTool("calendar_update_event", {
          eventId: "evt-desc",
          description: "",
        }),
      );

      expect(p.success).toBe(true);
      expect(capturedBody.description).toBe("");
    });

    test("contacts_list search results use person wrapper format from searchContacts API", async () => {
      globalThis.fetch = mock(async () => {
        return new Response(
          JSON.stringify({
            results: [
              {
                person: {
                  resourceName: "people/search-1",
                  names: [{ displayName: "Search Result" }],
                  emailAddresses: [{ value: "found@example.com" }],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof fetch;

      const p = parse(await callTool("contacts_list", { query: "Search" }));
      expect(p.resultCount).toBe(1);
      expect(p.contacts[0].resourceName).toBe("people/search-1");
      expect(p.contacts[0].name).toBe("Search Result");
      expect(p.contacts[0].email).toBe("found@example.com");
    });

    test("calendar_list_events encodes custom calendarId in URL", async () => {
      let capturedUrl = "";
      globalThis.fetch = mock(async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      await callTool("calendar_list_events", {
        calendarId: "team@group.calendar.google.com",
      });

      expect(capturedUrl).toContain("team%40group.calendar.google.com");
      expect(capturedUrl).not.toContain("team@group.calendar.google.com/");
    });

    test("googleFetch treats 204 as success (not an error)", async () => {
      globalThis.fetch = mock(async () => {
        return new Response("", { status: 204 });
      }) as typeof fetch;

      const p = parse(await callTool("calendar_delete_event", { eventId: "evt-204" }));
      expect(p.success).toBe(true);
      expect(p.deleted).toBe(true);
    });

    test("gmail_read falls back to text/html when text/plain is absent", async () => {
      mockFetchResponses.set("gmail.googleapis.com/gmail/v1/users/me/messages/msg-html-only", {
        status: 200,
        body: {
          id: "msg-html-only",
          threadId: "t-1",
          payload: {
            headers: [],
            parts: [
              {
                mimeType: "text/html",
                body: { data: Buffer.from("<p>HTML only</p>").toString("base64") },
              },
            ],
          },
        },
      });

      const p = parse(await callTool("gmail_read", { messageId: "msg-html-only" }));
      expect(p.body).toBe("<p>HTML only</p>");
    });

    test("gmail_list with after + before + query + labelIds exercises full URL construction", async () => {
      let capturedUrl = "";
      globalThis.fetch = mock(async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ messages: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      await callTool("gmail_list", {
        query: "is:unread from:ceo@acme.com",
        after: "2026-01-01T00:00:00Z",
        before: "2026-02-01T00:00:00Z",
        labelIds: "INBOX,IMPORTANT",
        maxResults: 5,
        pageToken: "tok-abc",
      });

      expect(capturedUrl).toContain("is%3Aunread+from%3Aceo%40acme.com");
      const decoded = decodeURIComponent(capturedUrl.replace(/\+/g, " "));
      expect(decoded).toContain("after:2026/1/1");
      expect(decoded).toContain("before:2026/2/1");
      expect(capturedUrl).toContain("labelIds=INBOX");
      expect(capturedUrl).toContain("labelIds=IMPORTANT");
      expect(capturedUrl).toContain("maxResults=5");
      expect(capturedUrl).toContain("pageToken=tok-abc");
    });

    test("errMsg returns fallback when error is not an Error instance", async () => {
      mockOAuth.listConnections.mockImplementation(async () => {
        throw "just a string";
      });
      const r = await callTool("google_status");
      expect(r.isError).toBe(true);
      expect(parse(r).error).toBe("Failed to check status");
    });

    test("errMsg returns fallback when error is null", async () => {
      mockOAuth.listConnections.mockImplementation(async () => {
        throw null;
      });
      const r = await callTool("google_status");
      expect(r.isError).toBe(true);
      expect(parse(r).error).toBe("Failed to check status");
    });

    test("calendar_create_event URL encodes calendarId", async () => {
      let capturedUrl = "";
      globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") capturedUrl = url;
        return new Response(
          JSON.stringify({ id: "evt-1", htmlLink: "link", status: "confirmed" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }) as typeof fetch;

      await callTool("calendar_create_event", {
        summary: "Team Sync",
        start: "2026-02-20T14:00:00Z",
        end: "2026-02-20T15:00:00Z",
        calendarId: "shared@group.calendar.google.com",
      });

      expect(capturedUrl).toContain("shared%40group.calendar.google.com");
    });
  });

  // ── LARP assessment fixes ──────────────────────────────────────────────────

  describe("LARP: Validation that validates", () => {
    test("calendar_list_events rejects invalid timeMin", async () => {
      const r = await callTool("calendar_list_events", { timeMin: "last week" });
      expect(r.isError).toBe(true);
      expect(parse(r).error).toContain("Invalid 'timeMin' date");
      expect(parse(r).error).toContain("last week");
      expect(parse(r).error).toContain("ISO 8601");
    });

    test("calendar_list_events rejects invalid timeMax", async () => {
      const r = await callTool("calendar_list_events", { timeMax: "banana" });
      expect(r.isError).toBe(true);
      expect(parse(r).error).toContain("Invalid 'timeMax' date");
      expect(parse(r).error).toContain("banana");
    });

    test("calendar_list_events accepts valid ISO dates after validation", async () => {
      globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      const r = await callTool("calendar_list_events", {
        timeMin: "2026-01-01T00:00:00Z",
        timeMax: "2026-02-01T23:59:59Z",
      });
      expect(r.isError).toBeUndefined();
      expect(parse(r).resultCount).toBe(0);
    });
  });

  describe("LARP: Zod schemas actually reject bad input", () => {
    test("captures and validates schemas from registerTool", async () => {
      const { registerGoogleTools } = await import("@/app/api/mcp/tools/google");
      const schemas: Record<string, Record<string, unknown>> = {};
      const captureServer = {
        registerTool: (name: string, config: { inputSchema: Record<string, unknown> }) => {
          schemas[name] = config.inputSchema;
        },
      } as any;
      registerGoogleTools(captureServer);

      const { z } = await import("zod/v3");

      const gmailSendSchema = z.object(schemas.gmail_send as any);
      expect(() => gmailSendSchema.parse({ to: "", subject: "X", body: "Y" })).toThrow();
      expect(() => gmailSendSchema.parse({ to: "a@b.com", subject: "", body: "Y" })).toThrow();
      expect(() => gmailSendSchema.parse({ to: "a@b.com", subject: "X", body: "" })).toThrow();
      expect(() => gmailSendSchema.parse({ to: "a@b.com", subject: "X", body: "Y" })).not.toThrow();

      const calCreateSchema = z.object(schemas.calendar_create_event as any);
      expect(() => calCreateSchema.parse({ summary: "", start: "x", end: "y" })).toThrow();
      expect(() => calCreateSchema.parse({ summary: "X", start: "", end: "y" })).toThrow();
      expect(() => calCreateSchema.parse({ summary: "X", start: "x", end: "" })).toThrow();
      expect(() =>
        calCreateSchema.parse({
          summary: "Valid",
          start: "2026-02-20T10:00:00Z",
          end: "2026-02-20T11:00:00Z",
          attendees: ["not-an-email"],
        }),
      ).toThrow();
      expect(() =>
        calCreateSchema.parse({
          summary: "Valid",
          start: "2026-02-20T10:00:00Z",
          end: "2026-02-20T11:00:00Z",
          attendees: ["alice@example.com"],
        }),
      ).not.toThrow();

      const gmailListSchema = z.object(schemas.gmail_list as any);
      expect(() => gmailListSchema.parse({ maxResults: 0 })).toThrow();
      expect(() => gmailListSchema.parse({ maxResults: 51 })).toThrow();
      expect(() => gmailListSchema.parse({ maxResults: 25 })).not.toThrow();

      const calListSchema = z.object(schemas.calendar_list_events as any);
      expect(() => calListSchema.parse({ maxResults: 0 })).toThrow();
      expect(() => calListSchema.parse({ maxResults: 251 })).toThrow();
      expect(() => calListSchema.parse({ maxResults: 100 })).not.toThrow();

      const calDeleteSchema = z.object(schemas.calendar_delete_event as any);
      expect(() => calDeleteSchema.parse({ eventId: "" })).toThrow();
      expect(() => calDeleteSchema.parse({ eventId: "evt-1" })).not.toThrow();
      expect(() => calDeleteSchema.parse({ eventId: "evt-1", sendUpdates: "invalid" })).toThrow();
      expect(() => calDeleteSchema.parse({ eventId: "evt-1", sendUpdates: "none" })).not.toThrow();
    });
  });

  describe("LARP: Unverified code paths", () => {
    test("extractBody returns empty string for attachment-only email (no text parts)", async () => {
      mockFetchResponses.set("gmail.googleapis.com/gmail/v1/users/me/messages/msg-attach-only", {
        status: 200,
        body: {
          id: "msg-attach-only",
          threadId: "t-1",
          payload: {
            mimeType: "multipart/mixed",
            headers: [{ name: "Subject", value: "Invoice" }],
            parts: [
              {
                mimeType: "application/pdf",
                filename: "invoice.pdf",
                body: { attachmentId: "att-1", size: 12345 },
              },
              {
                mimeType: "image/png",
                filename: "logo.png",
                body: { attachmentId: "att-2", size: 5000 },
              },
            ],
          },
        },
      });

      const p = parse(await callTool("gmail_read", { messageId: "msg-attach-only" }));
      expect(p.id).toBe("msg-attach-only");
      expect(p.body).toBe("");
      expect(p.headers.Subject).toBe("Invoice");
    });

    test("gmail_send base64 output uses URL-safe alphabet", async () => {
      let capturedBody: Record<string, string> | undefined;
      globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({ id: "msg-1", threadId: "t-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      await callTool("gmail_send", {
        to: "test@example.com",
        subject: "Binary chars: >>>???",
        body: "Content with chars that produce +/= in base64: \xff\xfe\xfd",
      });

      const raw = capturedBody!.raw;
      expect(raw).not.toContain("+");
      expect(raw).not.toContain("/");
      expect(raw).not.toContain("=");
    });
  });

  // ── Timeout / abort behavior ────────────────────────────────────────────

  describe("Request timeout", () => {
    test("googleFetch passes AbortController signal to fetch", async () => {
      let receivedSignal: AbortSignal | null = null;
      globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        receivedSignal = init?.signal ?? null;
        return new Response(JSON.stringify({ messages: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      await callTool("gmail_list");
      expect(receivedSignal).not.toBeNull();
      expect(receivedSignal).toBeInstanceOf(AbortSignal);
    });

    test("aborted fetch produces a user-friendly timeout error", async () => {
      globalThis.fetch = mock(async () => {
        const err = new DOMException("The operation was aborted.", "AbortError");
        throw err;
      }) as typeof fetch;

      const result = parse(await callTool("gmail_list"));
      expect(result.error).toContain("timed out");
      expect(result.error).toContain("30s");
    });

    test("non-abort fetch errors propagate normally", async () => {
      globalThis.fetch = mock(async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch;

      const result = parse(await callTool("gmail_list"));
      expect(result.error).toContain("fetch failed");
    });
  });

  // ── Multi-tool flow (real code path simulation) ───────────────────────────

  describe("Multi-tool flows", () => {
    test("list then read: message ID from list works in read", async () => {
      globalThis.fetch = mock(async (url: string) => {
        if (url.includes("/messages?")) {
          return new Response(
            JSON.stringify({
              messages: [{ id: "flow-msg-1" }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            id: "flow-msg-1",
            threadId: "flow-t-1",
            snippet: "Flow test",
            internalDate: "1708416000000",
            payload: {
              headers: [{ name: "Subject", value: "Flow Subject" }],
              body: { data: Buffer.from("Flow body content").toString("base64") },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof fetch;

      const listResult = parse(await callTool("gmail_list"));
      const msgId = listResult.messages[0].id;
      expect(msgId).toBe("flow-msg-1");

      const readResult = parse(await callTool("gmail_read", { messageId: msgId }));
      expect(readResult.id).toBe("flow-msg-1");
      expect(readResult.body).toBe("Flow body content");
      expect(readResult.headers.Subject).toBe("Flow Subject");
    });

    test("create then delete event: eventId from create works in delete", async () => {
      let requestCount = 0;
      globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
        requestCount++;
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({
              id: "flow-evt-1",
              htmlLink: "https://cal.google.com",
              status: "confirmed",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (init?.method === "DELETE") {
          return new Response("", { status: 204 });
        }
        return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
      }) as typeof fetch;

      const createResult = parse(
        await callTool("calendar_create_event", {
          summary: "Temp Meeting",
          start: "2026-02-20T14:00:00Z",
          end: "2026-02-20T15:00:00Z",
        }),
      );
      expect(createResult.success).toBe(true);
      const eventId = createResult.eventId;
      expect(eventId).toBe("flow-evt-1");

      const deleteResult = parse(await callTool("calendar_delete_event", { eventId }));
      expect(deleteResult.success).toBe(true);
      expect(deleteResult.deleted).toBe(true);
      expect(deleteResult.eventId).toBe("flow-evt-1");
      expect(requestCount).toBe(2);
    });
  });
});
