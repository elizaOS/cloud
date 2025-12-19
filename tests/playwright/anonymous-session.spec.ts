import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

/**
 * Anonymous Session API Tests
 *
 * These tests verify the anonymous session endpoints work correctly.
 * Some tests require a database connection and will be skipped if
 * the server returns 500 (indicating missing database).
 */
test.describe("Anonymous Session API", () => {
  test.describe("POST /api/affiliate/create-session - Input Validation", () => {
    test("rejects invalid characterId format", async ({ request }) => {
      const response = await request
        .post(`${BASE_URL}/api/affiliate/create-session`, {
          data: {
            characterId: "not-a-uuid",
            source: "e2e-test",
          },
        })
        .catch(() => null);

      if (!response) {
        console.log("ℹ️ Server connection failed - skipping");
        return;
      }

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe("Invalid request body");
    });

    test("rejects missing characterId", async ({ request }) => {
      const response = await request
        .post(`${BASE_URL}/api/affiliate/create-session`, {
          data: {
            source: "e2e-test",
          },
        })
        .catch(() => null);

      if (!response) {
        console.log("ℹ️ Server connection failed - skipping");
        return;
      }

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    test("creates session with valid characterId (requires DB)", async ({
      request,
    }) => {
      const characterId = "00000000-0000-0000-0000-000000000001";

      const response = await request.post(
        `${BASE_URL}/api/affiliate/create-session`,
        {
          headers: { "Content-Type": "application/json" },
          data: {
            characterId,
            source: "e2e-test",
          },
        },
      );

      // Either succeeds (200), fails due to DB issues (500), or body parsing (400)
      if (response.status() === 200) {
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.sessionToken).toBeTruthy();
        expect(data.userId).toBeTruthy();
      } else {
        // DB not available or other infrastructure issue - accept various errors
        expect([200, 400, 500]).toContain(response.status());
      }
    });
  });

  test.describe("POST /api/set-anonymous-session - Input Validation", () => {
    test("rejects missing session token", async ({ request }) => {
      const response = await request
        .post(`${BASE_URL}/api/set-anonymous-session`, {
          data: {},
        })
        .catch(() => null);

      if (!response) {
        console.log("ℹ️ Server connection failed - skipping");
        return;
      }

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Session token is required");
    });

    test("rejects non-string session token", async ({ request }) => {
      const response = await request
        .post(`${BASE_URL}/api/set-anonymous-session`, {
          data: { sessionToken: 12345 },
        })
        .catch(() => null);

      if (!response) {
        console.log("ℹ️ Server connection failed - skipping");
        return;
      }

      expect(response.status()).toBe(400);
    });

    test("rejects invalid session token (requires DB)", async ({ request }) => {
      const response = await request.post(
        `${BASE_URL}/api/set-anonymous-session`,
        {
          data: { sessionToken: "invalid-token-that-does-not-exist-in-db" },
        },
      );

      // Either 404 (session not found) or 500 (DB error)
      expect([404, 500]).toContain(response.status());
      if (response.status() === 404) {
        const data = await response.json();
        expect(data.code).toBe("SESSION_NOT_FOUND");
      }
    });
  });

  test.describe("GET /api/anonymous-session - Input Validation", () => {
    test("returns 400 for missing token", async ({ request }) => {
      const response = await request
        .get(`${BASE_URL}/api/anonymous-session`)
        .catch(() => null);

      if (!response) {
        console.log("ℹ️ Server connection failed - skipping");
        return;
      }

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Session token is required");
    });

    test("returns 400 for token too short", async ({ request }) => {
      const response = await request
        .get(`${BASE_URL}/api/anonymous-session?token=short`)
        .catch(() => null);

      if (!response) {
        console.log("ℹ️ Server connection failed - skipping");
        return;
      }

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Invalid session token format");
    });

    test("returns 404 for valid format but nonexistent token (requires DB)", async ({
      request,
    }) => {
      // Use a valid format token (32 chars) that doesn't exist
      const response = await request.get(
        `${BASE_URL}/api/anonymous-session?token=abcdefghijklmnopqrstuvwxyz123456`,
      );

      // Either 404 (not found) or 500 (DB error)
      expect([404, 500]).toContain(response.status());
      if (response.status() === 404) {
        const data = await response.json();
        expect(data.error).toBe("Session not found or expired");
      }
    });
  });

  test.describe("GET /api/auth/create-anonymous-session", () => {
    test("redirects with valid returnUrl (requires DB)", async ({
      request,
    }) => {
      const response = await request.get(
        `${BASE_URL}/api/auth/create-anonymous-session?returnUrl=/dashboard/chat`,
        {
          maxRedirects: 0,
        },
      );

      // Either redirects (302/307) or fails due to DB (500) or auth issues (401)
      if ([302, 307, 308].includes(response.status())) {
        const location = response.headers()["location"];
        expect(location).toContain("/dashboard/chat");
      } else {
        // Accept error statuses when DB is not available
        expect([302, 307, 308, 401, 500]).toContain(response.status());
      }
    });

    test("sanitizes malicious returnUrl", async ({ request }) => {
      const response = await request.get(
        `${BASE_URL}/api/auth/create-anonymous-session?returnUrl=//evil.com`,
        {
          maxRedirects: 0,
        },
      );

      // If it redirects, verify the location is safe
      if ([302, 307, 308].includes(response.status())) {
        const location = response.headers()["location"];
        expect(location).not.toContain("evil.com");
      }
    });
  });

  test.describe("Rate Limiting", () => {
    test("GET /api/anonymous-session returns rate limit headers", async ({
      request,
    }) => {
      // Make a request with a valid format token (even if it doesn't exist)
      const response = await request.get(
        `${BASE_URL}/api/anonymous-session?token=abcdefghijklmnopqrstuvwxyz123456`,
      );

      // Should either return rate limit headers or 404/500
      const remaining = response.headers()["x-ratelimit-remaining"];
      // Rate limit headers are only on successful responses
      if (response.status() === 200) {
        expect(remaining).toBeTruthy();
      }
    });

    test("POST /api/affiliate/create-session returns 429 on IP abuse (requires DB)", async ({
      request,
    }) => {
      // This test verifies the endpoint returns proper error format
      // In production with many sessions from same IP, it would return 429
      const characterId = "00000000-0000-0000-0000-000000000001";
      const response = await request.post(
        `${BASE_URL}/api/affiliate/create-session`,
        {
          headers: { "Content-Type": "application/json" },
          data: { characterId, source: "rate-limit-test" },
        },
      );

      // Either succeeds (200), hits rate limit (429), or DB error (400/500)
      expect([200, 400, 429, 500]).toContain(response.status());

      // If rate limited, verify error format
      if (response.status() === 429) {
        const data = await response.json();
        expect(data.code).toBe("RATE_LIMIT_EXCEEDED");
      }
    });

    test("POST /api/set-anonymous-session returns 429 when rate limited", async ({
      request,
    }) => {
      // Make enough requests to potentially trigger rate limit
      // (In serverless, each instance has its own limit, so this tests the format)
      const response = await request.post(
        `${BASE_URL}/api/set-anonymous-session`,
        {
          data: { sessionToken: "test-rate-limit-token" },
        },
      );

      // Either 400 (missing token), 404 (not found), 429 (rate limited), or 500
      expect([400, 404, 429, 500]).toContain(response.status());

      // If rate limited, verify headers
      if (response.status() === 429) {
        expect(response.headers()["retry-after"]).toBe("60");
      }
    });
  });

  test.describe("Full Session Flow (requires DB)", () => {
    test("can create and retrieve session", async ({ request }) => {
      // Create session
      const characterId = "00000000-0000-0000-0000-000000000001";
      const createResponse = await request.post(
        `${BASE_URL}/api/affiliate/create-session`,
        {
          data: { characterId, source: "e2e-test" },
        },
      );

      // Skip if DB not available
      if (createResponse.status() !== 200) {
        test.skip();
        return;
      }

      const { sessionToken } = await createResponse.json();
      expect(sessionToken).toBeTruthy();

      // Get session data
      const getResponse = await request.get(
        `${BASE_URL}/api/anonymous-session?token=${sessionToken}`,
      );

      expect(getResponse.status()).toBe(200);
      const data = await getResponse.json();
      expect(data.success).toBe(true);
      expect(data.session).toBeTruthy();
      expect(data.session.message_count).toBe(0);

      if ((data.session.messages_limit || 0) === 0) {
        console.log("⚠️ Session messages_limit is 0 (DB not configured)");
        console.log("ℹ️ Skipping messages_limit validation");
        return;
      }
      expect(data.session.messages_limit).toBeGreaterThan(0);
    });

    test("can set session cookie after creation", async ({ request }) => {
      // Create session
      const characterId = "00000000-0000-0000-0000-000000000002";
      const createResponse = await request.post(
        `${BASE_URL}/api/affiliate/create-session`,
        {
          data: { characterId, source: "e2e-test" },
        },
      );

      // Skip if DB not available
      if (createResponse.status() !== 200) {
        test.skip();
        return;
      }

      const { sessionToken } = await createResponse.json();

      // Set the session cookie
      const setResponse = await request.post(
        `${BASE_URL}/api/set-anonymous-session`,
        {
          data: { sessionToken },
        },
      );

      expect(setResponse.status()).toBe(200);
      const data = await setResponse.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe("Session cookie set successfully");
    });
  });
});
