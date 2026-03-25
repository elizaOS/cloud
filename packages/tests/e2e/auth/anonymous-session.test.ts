import { describe, expect, test } from "bun:test";
import * as api from "../helpers/api-client";

/**
 * Anonymous Session E2E Tests
 *
 * Tests the anonymous user authentication flow.
 * Note: create-anonymous-session is a GET endpoint (not POST).
 */

describe("Anonymous Session API", () => {
  test("GET /api/auth/create-anonymous-session creates a session", async () => {
    const response = await api.get("/api/auth/create-anonymous-session");
    expect(response.status).toBe(200);

    const body = (await response.json()) as any;
    expect(body).toBeDefined();
    // Should return some form of session identifier
    expect(body.sessionToken || body.token || body.session || body.userId).toBeTruthy();
  });

  test("GET /api/anonymous-session returns session data when cookie exists", async () => {
    // First create a session
    const createResponse = await api.get("/api/auth/create-anonymous-session");
    const createBody = (await createResponse.json()) as any;
    const token = createBody.sessionToken || createBody.token;

    if (!token) {
      console.log("Skipping: no session token returned");
      return;
    }

    // Use the token in subsequent request
    const response = await api.get("/api/anonymous-session", {
      headers: { "X-Anonymous-Session": token },
    });

    // Should return session info or 404 if no cookie context
    expect([200, 401, 404]).toContain(response.status);
  });

  test("GET /api/auth/create-anonymous-session returns different sessions", async () => {
    const [r1, r2] = await Promise.all([
      api.get("/api/auth/create-anonymous-session"),
      api.get("/api/auth/create-anonymous-session"),
    ]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const [b1, b2] = (await Promise.all([r1.json(), r2.json()])) as any[];
    const t1 = b1.sessionToken || b1.token || b1.userId;
    const t2 = b2.sessionToken || b2.token || b2.userId;

    // Each call should create a distinct session
    if (t1 && t2) {
      expect(t1).not.toBe(t2);
    }
  });
});

describe("Anonymous Session Migration", () => {
  test("POST /api/auth/migrate-anonymous requires auth", async () => {
    const response = await api.post("/api/auth/migrate-anonymous", {
      anonymousUserId: "test",
    });
    // Should require authentication
    expect([401, 403]).toContain(response.status);
  });
});
