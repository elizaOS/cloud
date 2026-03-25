/**
 * Tests for GET /api/v1/jobs/[jobId] route.
 *
 * Verifies authorization, job lookup, and response shape.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetJobForOrg = vi.fn();

vi.mock("@/lib/services/provisioning-jobs", () => ({
  provisioningJobService: {
    getJobForOrg: (...args: unknown[]) => mockGetJobForOrg(...args),
  },
}));

const mockRequireAuth = vi.fn();
const mockValidateServiceKey = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireAuthOrApiKeyWithOrg: (...args: unknown[]) => mockRequireAuth(...args),
}));

vi.mock("@/lib/auth/service-key", () => ({
  validateServiceKey: (...args: unknown[]) => mockValidateServiceKey(...args),
}));

vi.mock("@/lib/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Import route handler after mocks
// ---------------------------------------------------------------------------

import { GET } from "@/app/api/v1/jobs/[jobId]/route";

// Helpers
function makeRequest(jobId: string): [Request, { params: Promise<{ jobId: string }> }] {
  const url = `http://localhost:3000/api/v1/jobs/${jobId}`;
  const req = new Request(url, { method: "GET" });
  return [req as any, { params: Promise.resolve({ jobId }) }];
}

describe("GET /api/v1/jobs/[jobId]", () => {
  const TEST_ORG_ID = "org-001";
  const TEST_JOB_ID = "job-001";

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no service key, regular auth succeeds
    mockValidateServiceKey.mockReturnValue(null);
    mockRequireAuth.mockResolvedValue({
      user: { id: "user-001", organization_id: TEST_ORG_ID },
    });
  });

  it("returns 404 for non-existent job", async () => {
    mockGetJobForOrg.mockResolvedValue(undefined);

    const [req, ctx] = makeRequest(TEST_JOB_ID);
    const response = await GET(req as any, ctx);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Job not found");
  });

  it("scopes job lookup to the caller's organization", async () => {
    mockGetJobForOrg.mockResolvedValue(undefined);

    const [req, ctx] = makeRequest(TEST_JOB_ID);
    const response = await GET(req as any, ctx);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Job not found");
    expect(mockGetJobForOrg).toHaveBeenCalledWith(TEST_JOB_ID, TEST_ORG_ID);
  });

  it("returns full job data for owned job", async () => {
    const now = new Date();
    mockGetJobForOrg.mockResolvedValue({
      id: TEST_JOB_ID,
      type: "milady_provision",
      status: "completed",
      result: { cloudAgentId: "agent-1", status: "running" },
      error: null,
      attempts: 1,
      max_attempts: 3,
      estimated_completion_at: now,
      scheduled_for: now,
      started_at: now,
      completed_at: now,
      created_at: now,
      updated_at: now,
      organization_id: TEST_ORG_ID,
    });

    const [req, ctx] = makeRequest(TEST_JOB_ID);
    const response = await GET(req as any, ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(TEST_JOB_ID);
    expect(body.data.type).toBe("milady_provision");
    expect(body.data.status).toBe("completed");
    expect(body.data.result).toEqual({ cloudAgentId: "agent-1", status: "running" });
    expect(body.data.attempts).toBe(1);
    expect(body.data.maxAttempts).toBe(3);
  });

  it("returns polling hints for in_progress job", async () => {
    mockGetJobForOrg.mockResolvedValue({
      id: TEST_JOB_ID,
      type: "milady_provision",
      status: "in_progress",
      organization_id: TEST_ORG_ID,
      attempts: 1,
      max_attempts: 3,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const [req, ctx] = makeRequest(TEST_JOB_ID);
    const response = await GET(req as any, ctx);
    const body = await response.json();

    expect(body.polling.shouldContinue).toBe(true);
    expect(body.polling.intervalMs).toBe(5000);
  });

  it("returns shouldContinue=false for completed job", async () => {
    mockGetJobForOrg.mockResolvedValue({
      id: TEST_JOB_ID,
      status: "completed",
      organization_id: TEST_ORG_ID,
      attempts: 1,
      max_attempts: 3,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const [req, ctx] = makeRequest(TEST_JOB_ID);
    const response = await GET(req as any, ctx);
    const body = await response.json();

    expect(body.polling.shouldContinue).toBe(false);
  });

  it("returns shouldContinue=false for failed job", async () => {
    mockGetJobForOrg.mockResolvedValue({
      id: TEST_JOB_ID,
      status: "failed",
      error: "Max attempts reached",
      organization_id: TEST_ORG_ID,
      attempts: 3,
      max_attempts: 3,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const [req, ctx] = makeRequest(TEST_JOB_ID);
    const response = await GET(req as any, ctx);
    const body = await response.json();

    expect(body.polling.shouldContinue).toBe(false);
    expect(body.data.error).toBe("Max attempts reached");
  });

  it("returns 401 for auth errors", async () => {
    mockRequireAuth.mockRejectedValue(new Error("Unauthorized"));

    const [req, ctx] = makeRequest(TEST_JOB_ID);
    const response = await GET(req as any, ctx);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  // ─────────────────────────────────────────────────────────────────
  // Service-key auth (X-Service-Key)
  // ─────────────────────────────────────────────────────────────────

  it("allows service-key callers to poll their org's jobs", async () => {
    const SERVICE_ORG_ID = "service-org-001";
    mockValidateServiceKey.mockReturnValue({
      organizationId: SERVICE_ORG_ID,
      userId: "service-user-001",
    });

    mockGetJobForOrg.mockResolvedValue({
      id: TEST_JOB_ID,
      type: "milady_provision",
      status: "in_progress",
      organization_id: SERVICE_ORG_ID,
      attempts: 0,
      max_attempts: 3,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const [req, ctx] = makeRequest(TEST_JOB_ID);
    const response = await GET(req as any, ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(TEST_JOB_ID);
    // Should NOT have called requireAuthOrApiKeyWithOrg
    expect(mockRequireAuth).not.toHaveBeenCalled();
  });

  it("scopes service-key polling to the service org", async () => {
    mockValidateServiceKey.mockReturnValue({
      organizationId: "service-org-001",
      userId: "service-user-001",
    });

    mockGetJobForOrg.mockResolvedValue(undefined);

    const [req, ctx] = makeRequest(TEST_JOB_ID);
    const response = await GET(req as any, ctx);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Job not found");
    expect(mockGetJobForOrg).toHaveBeenCalledWith(TEST_JOB_ID, "service-org-001");
  });

  it("falls back to user auth when no service key is present", async () => {
    mockValidateServiceKey.mockReturnValue(null);

    mockGetJobForOrg.mockResolvedValue({
      id: TEST_JOB_ID,
      status: "completed",
      organization_id: TEST_ORG_ID,
      attempts: 1,
      max_attempts: 3,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const [req, ctx] = makeRequest(TEST_JOB_ID);
    const response = await GET(req as any, ctx);

    expect(response.status).toBe(200);
    expect(mockRequireAuth).toHaveBeenCalled();
  });
});
