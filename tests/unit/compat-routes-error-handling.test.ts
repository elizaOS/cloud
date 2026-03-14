/**
 * Integration-level tests verifying that all compat routes use handleCompatError
 * so auth failures return 401/403 instead of 500.
 *
 * Also tests:
 * - Resume route org-scoped pre-check (item 3)
 * - POST /agents auto-provision warning field (item 4)
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { routeParams } from "./api/route-test-helpers";

// ── Mocks ────────────────────────────────────────────────────────────
const mockRequireServiceKey = mock();
const mockAuthenticateWaifuBridge = mock();
const mockRequireAuthOrApiKeyWithOrg = mock();
const mockGetAgent = mock();
const mockListAgents = mock();
const mockCreateAgent = mock();
const mockShutdown = mock();
const mockProvision = mock();
const mockSnapshot = mock();
const mockDeleteAgent = mock();

class MockServiceKeyAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceKeyAuthError";
  }
}

mock.module("@/lib/auth/service-key", () => ({
  requireServiceKey: mockRequireServiceKey,
  ServiceKeyAuthError: MockServiceKeyAuthError,
}));

mock.module("@/lib/auth/waifu-bridge", () => ({
  authenticateWaifuBridge: mockAuthenticateWaifuBridge,
}));

mock.module("@/lib/auth", () => ({
  requireAuthOrApiKeyWithOrg: mockRequireAuthOrApiKeyWithOrg,
}));

mock.module("@/lib/services/milaidy-sandbox", () => ({
  miladySandboxService: {
    getAgent: mockGetAgent,
    listAgents: mockListAgents,
    createAgent: mockCreateAgent,
    deleteAgent: mockDeleteAgent,
    shutdown: mockShutdown,
    provision: mockProvision,
    snapshot: mockSnapshot,
  },
}));

mock.module("@/lib/utils/logger", () => ({
  logger: {
    info: mock(),
    warn: mock(),
    error: mock(),
    debug: mock(),
  },
}));

mock.module("@/lib/security/outbound-url", () => ({
  assertSafeOutboundUrl: mock(),
}));

import { GET as getLogs } from "@/app/api/compat/agents/[id]/logs/route";
import { POST as restartAgent } from "@/app/api/compat/agents/[id]/restart/route";
import { POST as resumeAgent } from "@/app/api/compat/agents/[id]/resume/route";
import { GET as getStatus } from "@/app/api/compat/agents/[id]/status/route";
import { POST as suspendAgent } from "@/app/api/compat/agents/[id]/suspend/route";
import { POST as createAgent } from "@/app/api/compat/agents/route";
import { GET as getJob } from "@/app/api/compat/jobs/[jobId]/route";

function makeAuthFailRequest(path: string, method = "GET") {
  return new NextRequest(`https://example.com${path}`, {
    method,
    headers: { "X-Service-Key": "bad-key" },
  });
}

function setupAuthFailure() {
  mockRequireServiceKey.mockImplementation(() => {
    throw new MockServiceKeyAuthError("Invalid or missing service key");
  });
}

function setupAuthSuccess() {
  mockAuthenticateWaifuBridge.mockResolvedValue(null);
  mockRequireAuthOrApiKeyWithOrg.mockResolvedValue({
    user: { id: "user-1", organization_id: "org-1" },
  });
}

function resetAll() {
  mockRequireServiceKey.mockReset();
  mockAuthenticateWaifuBridge.mockReset();
  mockRequireAuthOrApiKeyWithOrg.mockReset();
  mockGetAgent.mockReset();
  mockListAgents.mockReset();
  mockCreateAgent.mockReset();
  mockShutdown.mockReset();
  mockProvision.mockReset();
  mockSnapshot.mockReset();
  mockDeleteAgent.mockReset();
}

// ── Auth error → 401 across all routes ───────────────────────────────

describe("all compat routes return 401 on auth failure (not 500)", () => {
  beforeEach(() => {
    resetAll();
    setupAuthFailure();
  });

  test("GET /agents/[id]/status → 401", async () => {
    const res = await getStatus(
      makeAuthFailRequest("/api/compat/agents/a1/status"),
      routeParams({ id: "a1" }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("service key");
  });

  test("GET /agents/[id]/logs → 401", async () => {
    const res = await getLogs(
      makeAuthFailRequest("/api/compat/agents/a1/logs"),
      routeParams({ id: "a1" }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).success).toBe(false);
  });

  test("POST /agents/[id]/suspend → 401", async () => {
    const res = await suspendAgent(
      makeAuthFailRequest("/api/compat/agents/a1/suspend", "POST"),
      routeParams({ id: "a1" }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).success).toBe(false);
  });

  test("POST /agents/[id]/resume → 401", async () => {
    const res = await resumeAgent(
      makeAuthFailRequest("/api/compat/agents/a1/resume", "POST"),
      routeParams({ id: "a1" }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).success).toBe(false);
  });

  test("POST /agents/[id]/restart → 401", async () => {
    const res = await restartAgent(
      makeAuthFailRequest("/api/compat/agents/a1/restart", "POST"),
      routeParams({ id: "a1" }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).success).toBe(false);
  });

  test("GET /jobs/[jobId] → 401", async () => {
    const res = await getJob(
      makeAuthFailRequest("/api/compat/jobs/j1"),
      routeParams({ jobId: "j1" }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).success).toBe(false);
  });
});

// ── 500-level errors don't leak internals ────────────────────────────

describe("500-level errors return generic message across all routes", () => {
  beforeEach(() => {
    resetAll();
    // Simulate a server misconfiguration error from auth
    mockRequireServiceKey.mockImplementation(() => {
      // No X-Service-Key header → falls through
      return null;
    });
    mockAuthenticateWaifuBridge.mockRejectedValue(
      new Error("FATAL: password authentication failed for user 'neon_admin'"),
    );
  });

  test("GET /agents/[id]/status → 500 generic", async () => {
    const res = await getStatus(
      new NextRequest("https://example.com/api/compat/agents/a1/status"),
      routeParams({ id: "a1" }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
    expect(body.error).not.toContain("password");
    expect(body.error).not.toContain("neon_admin");
  });

  test("GET /jobs/[jobId] → 500 generic", async () => {
    const res = await getJob(
      new NextRequest("https://example.com/api/compat/jobs/j1"),
      routeParams({ jobId: "j1" }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
  });
});

// ── Resume route org-scoped pre-check (item 3) ──────────────────────

describe("POST /agents/[id]/resume — org-scoped pre-check", () => {
  beforeEach(() => {
    resetAll();
    setupAuthSuccess();
  });

  test("returns 404 when agent doesn't exist for this org", async () => {
    mockGetAgent.mockResolvedValue(null);

    const res = await resumeAgent(
      new NextRequest("https://example.com/api/compat/agents/a1/resume", {
        method: "POST",
      }),
      routeParams({ id: "a1" }),
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      success: false,
      error: "Agent not found",
    });
    // provision should NOT have been called
    expect(mockProvision).not.toHaveBeenCalled();
  });

  test("proceeds to provision when agent exists", async () => {
    mockGetAgent.mockResolvedValue({
      id: "a1",
      organization_id: "org-1",
      status: "stopped",
    });
    mockProvision.mockResolvedValue({ success: true });

    const res = await resumeAgent(
      new NextRequest("https://example.com/api/compat/agents/a1/resume", {
        method: "POST",
      }),
      routeParams({ id: "a1" }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("completed");
    expect(mockGetAgent).toHaveBeenCalledWith("a1", "org-1");
    expect(mockProvision).toHaveBeenCalledWith("a1", "org-1");
  });
});

// ── POST /agents auto-provision warning (item 4) ────────────────────

describe("POST /agents — auto-provision warning field", () => {
  const savedEnv = process.env.WAIFU_AUTO_PROVISION;

  beforeEach(() => {
    resetAll();
    setupAuthSuccess();
    mockCreateAgent.mockResolvedValue({
      id: "new-1",
      agent_name: "TestAgent",
      status: "pending",
      node_id: null,
      created_at: new Date(),
      updated_at: new Date(),
    });
  });

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env.WAIFU_AUTO_PROVISION;
    } else {
      process.env.WAIFU_AUTO_PROVISION = savedEnv;
    }
  });

  function makeCreateRequest() {
    return new NextRequest("https://example.com/api/compat/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentName: "TestAgent" }),
    });
  }

  test("no warning when auto-provision is disabled", async () => {
    delete process.env.WAIFU_AUTO_PROVISION;

    const res = await createAgent(makeCreateRequest());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.warning).toBeUndefined();
  });

  test("no warning when auto-provision succeeds", async () => {
    process.env.WAIFU_AUTO_PROVISION = "true";
    mockProvision.mockResolvedValue({
      success: true,
      sandboxRecord: {
        id: "new-1",
        agent_name: "TestAgent",
        status: "running",
        node_id: "n1",
        created_at: new Date(),
        updated_at: new Date(),
      },
    });

    const res = await createAgent(makeCreateRequest());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.warning).toBeUndefined();
  });

  test("includes warning when auto-provision fails (throws)", async () => {
    process.env.WAIFU_AUTO_PROVISION = "true";
    mockProvision.mockRejectedValue(new Error("Docker daemon unreachable"));

    const res = await createAgent(makeCreateRequest());
    expect(res.status).toBe(201); // agent was created, just provision failed
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.warning).toBeDefined();
    expect(body.warning).toContain("Auto-provision");
    // Must not leak the raw error
    expect(body.warning).not.toContain("Docker");
  });

  test("includes warning when auto-provision returns !success", async () => {
    process.env.WAIFU_AUTO_PROVISION = "true";
    mockProvision.mockResolvedValue({
      success: false,
      error: "Node capacity exceeded",
    });

    const res = await createAgent(makeCreateRequest());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.warning).toBeDefined();
    expect(body.warning).toContain("Auto-provision");
    // Must not leak internal error detail
    expect(body.warning).not.toContain("capacity");
  });
});

// Import afterEach at module level
import { afterEach } from "bun:test";
