/**
 * Tests for the async provisioning job service.
 *
 * Tests the ProvisioningJobService in isolation by mocking the
 * jobsRepository and miladySandboxService dependencies.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock setup — must come before importing the service under test
// ---------------------------------------------------------------------------

const mockJobsRepository = {
  create: vi.fn(),
  findById: vi.fn(),
  findByIdAndOrg: vi.fn(),
  findByFilters: vi.fn(),
  findByDataField: vi.fn(),
  claimPendingJobs: vi.fn(),
  recoverStaleJobs: vi.fn(),
  update: vi.fn(),
  updateStatus: vi.fn(),
  incrementAttempt: vi.fn(),
  delete: vi.fn(),
};

const mockMiladySandboxService = {
  provision: vi.fn(),
  getAgent: vi.fn(),
  createAgent: vi.fn(),
  listAgents: vi.fn(),
  deleteAgent: vi.fn(),
  bridge: vi.fn(),
  bridgeStream: vi.fn(),
  snapshot: vi.fn(),
  restore: vi.fn(),
  listBackups: vi.fn(),
  heartbeat: vi.fn(),
  shutdown: vi.fn(),
};

const mockAssertSafeOutboundUrl = vi.fn();

const mockMiladySandboxesRepository = {
  update: vi.fn(),
};

vi.mock("@/db/repositories/jobs", () => ({
  jobsRepository: mockJobsRepository,
  JobsRepository: vi.fn(),
}));

vi.mock("@/db/repositories/milady-sandboxes", () => ({
  miladySandboxesRepository: mockMiladySandboxesRepository,
}));

vi.mock("@/lib/services/milaidy-sandbox", () => ({
  miladySandboxService: mockMiladySandboxService,
}));

vi.mock("@/lib/services/milady-sandbox", () => ({
  miladySandboxService: mockMiladySandboxService,
}));

vi.mock("@/lib/security/outbound-url", () => ({
  assertSafeOutboundUrl: mockAssertSafeOutboundUrl,
}));

// Mock dbWrite.transaction used by enqueueMiladyProvisionOnce.
// The transaction callback receives a Drizzle-like tx object.
const mockDbWriteTransaction = vi.fn();

vi.mock("@/db/helpers", () => ({
  dbWrite: { transaction: (...args: unknown[]) => mockDbWriteTransaction(...args) },
  dbRead: {},
  db: {},
  useReadDb: vi.fn(),
  useWriteDb: vi.fn(),
  getReadDb: vi.fn(),
  getWriteDb: vi.fn(),
  getCurrentRegion: vi.fn(),
  getDbConnectionInfo: vi.fn(),
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
// Import service under test (after mocks)
// ---------------------------------------------------------------------------

import { JOB_TYPES, ProvisioningJobService } from "@/lib/services/provisioning-jobs";

describe("ProvisioningJobService", () => {
  let service: ProvisioningJobService;
  const originalFetch = globalThis.fetch;

  const TEST_ORG_ID = "org-001";
  const TEST_USER_ID = "user-001";
  const TEST_AGENT_ID = "agent-001";
  const TEST_JOB_ID = "job-001";

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = originalFetch;
    service = new ProvisioningJobService();
    mockAssertSafeOutboundUrl.mockImplementation(async (url: string) => new URL(url));
    mockMiladySandboxesRepository.update.mockResolvedValue(undefined);
    mockDbWriteTransaction.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    (vi as unknown as { restoreAllMocks: () => void }).restoreAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────
  // Enqueue
  // ─────────────────────────────────────────────────────────────────

  describe("enqueueMiladyProvision", () => {
    // Helper: build a fake Drizzle-like tx for the transaction mock.
    // Captures the NewJob passed to insert().values() so we can assert on it.
    function setupTxMock(returnedJob: Record<string, unknown>) {
      let capturedInsertValues: Record<string, unknown> | null = null;
      let selectCall = 0;

      mockDbWriteTransaction.mockImplementation(async (fn: Function) => {
        selectCall = 0;
        const fakeTx = {
          execute: vi.fn().mockResolvedValue(undefined),
          select: vi.fn().mockImplementation(() => {
            selectCall++;
            const current = selectCall;
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  // First select (sandbox existence check) → sandbox found
                  limit: vi
                    .fn()
                    .mockResolvedValue(
                      current === 1 ? [{ id: TEST_AGENT_ID, updated_at: new Date() }] : [],
                    ),
                  // Second select (existing job check) → no existing jobs
                  orderBy: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue([]),
                  }),
                }),
              }),
            };
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockImplementation((newJob: Record<string, unknown>) => {
              capturedInsertValues = newJob;
              return {
                returning: vi.fn().mockResolvedValue([{ ...newJob, ...returnedJob }]),
              };
            }),
          }),
        };
        return fn(fakeTx);
      });

      return () => capturedInsertValues;
    }

    it("creates a pending job with correct data", async () => {
      const fakeJob = {
        id: TEST_JOB_ID,
        type: JOB_TYPES.MILADY_PROVISION,
        status: "pending",
        data: {
          agentId: TEST_AGENT_ID,
          organizationId: TEST_ORG_ID,
          userId: TEST_USER_ID,
          agentName: "TestAgent",
        },
        organization_id: TEST_ORG_ID,
        user_id: TEST_USER_ID,
        max_attempts: 3,
        attempts: 0,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const getCaptured = setupTxMock(fakeJob);

      const result = await service.enqueueMiladyProvision({
        agentId: TEST_AGENT_ID,
        organizationId: TEST_ORG_ID,
        userId: TEST_USER_ID,
        agentName: "TestAgent",
      });

      expect(result.id).toBe(TEST_JOB_ID);

      expect(mockDbWriteTransaction).toHaveBeenCalledOnce();
      const insertArg = getCaptured();
      expect(insertArg).not.toBeNull();
      expect(insertArg!.type).toBe("milady_provision");
      expect(insertArg!.status).toBe("pending");
      expect(insertArg!.max_attempts).toBe(3);
      expect((insertArg!.data as Record<string, unknown>).agentId).toBe(TEST_AGENT_ID);
    });

    it("passes webhook URL when provided", async () => {
      const getCaptured = setupTxMock({
        id: TEST_JOB_ID,
        webhook_url: "https://example.com/webhook",
      });

      await service.enqueueMiladyProvision({
        agentId: TEST_AGENT_ID,
        organizationId: TEST_ORG_ID,
        userId: TEST_USER_ID,
        agentName: "TestAgent",
        webhookUrl: "https://example.com/webhook",
      });

      const insertArg = getCaptured();
      expect(insertArg).not.toBeNull();
      expect(insertArg!.webhook_url).toBe("https://example.com/webhook");
    });

    it("sets estimated completion to ~90s from now", async () => {
      const getCaptured = setupTxMock({ id: TEST_JOB_ID });

      const before = Date.now();
      await service.enqueueMiladyProvision({
        agentId: TEST_AGENT_ID,
        organizationId: TEST_ORG_ID,
        userId: TEST_USER_ID,
        agentName: "TestAgent",
      });

      const insertArg = getCaptured();
      expect(insertArg).not.toBeNull();
      const estimated = new Date(insertArg!.estimated_completion_at as string).getTime();
      expect(estimated).toBeGreaterThanOrEqual(before + 85_000);
      expect(estimated).toBeLessThanOrEqual(before + 95_000);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Get job
  // ─────────────────────────────────────────────────────────────────

  describe("getJob", () => {
    it("delegates to repository findById", async () => {
      const fakeJob = { id: TEST_JOB_ID, status: "completed" };
      mockJobsRepository.findById.mockResolvedValue(fakeJob);

      const result = await service.getJob(TEST_JOB_ID);
      expect(result).toEqual(fakeJob);
      expect(mockJobsRepository.findById).toHaveBeenCalledWith(TEST_JOB_ID);
    });

    it("returns undefined for non-existent job", async () => {
      mockJobsRepository.findById.mockResolvedValue(undefined);
      const result = await service.getJob("nonexistent");
      expect(result).toBeUndefined();
    });
  });

  describe("getJobForOrg", () => {
    it("delegates to repository findByIdAndOrg", async () => {
      const fakeJob = { id: TEST_JOB_ID, organization_id: TEST_ORG_ID };
      mockJobsRepository.findByIdAndOrg.mockResolvedValue(fakeJob);

      const result = await service.getJobForOrg(TEST_JOB_ID, TEST_ORG_ID);
      expect(result).toEqual(fakeJob);
      expect(mockJobsRepository.findByIdAndOrg).toHaveBeenCalledWith(TEST_JOB_ID, TEST_ORG_ID);
    });

    it("returns undefined when org-scoped lookup misses", async () => {
      mockJobsRepository.findByIdAndOrg.mockResolvedValue(undefined);
      const result = await service.getJobForOrg(TEST_JOB_ID, TEST_ORG_ID);
      expect(result).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Process pending jobs
  // ─────────────────────────────────────────────────────────────────

  describe("processPendingJobs", () => {
    const makePendingJob = (id: string, agentId: string) => ({
      id,
      type: JOB_TYPES.MILADY_PROVISION,
      status: "pending",
      data: {
        agentId,
        organizationId: TEST_ORG_ID,
        userId: TEST_USER_ID,
        agentName: "Agent",
      },
      organization_id: TEST_ORG_ID,
      max_attempts: 3,
      attempts: 0,
      created_at: new Date(),
      updated_at: new Date(),
    });

    it("processes pending jobs and marks them completed on success", async () => {
      const job = makePendingJob(TEST_JOB_ID, TEST_AGENT_ID);

      // claimPendingJobs returns atomically claimed jobs
      mockJobsRepository.claimPendingJobs.mockResolvedValueOnce([job]); // milady_provision
      mockJobsRepository.recoverStaleJobs.mockResolvedValueOnce(0);

      mockJobsRepository.updateStatus.mockResolvedValue(undefined);

      mockMiladySandboxService.provision.mockResolvedValue({
        success: true,
        sandboxRecord: { id: TEST_AGENT_ID, status: "running" },
        bridgeUrl: "http://localhost:31337",
        healthUrl: "http://localhost:2138",
      });

      mockJobsRepository.update.mockResolvedValue(undefined);

      const result = await service.processPendingJobs(5);

      expect(result.claimed).toBe(1);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(0);

      // Should have called provision
      expect(mockMiladySandboxService.provision).toHaveBeenCalledWith(TEST_AGENT_ID, TEST_ORG_ID);

      // Should have used claimPendingJobs (atomic FOR UPDATE SKIP LOCKED)
      expect(mockJobsRepository.claimPendingJobs).toHaveBeenCalledWith({
        type: JOB_TYPES.MILADY_PROVISION,
        limit: 5,
      });

      // Should mark completed (claiming already set in_progress)
      expect(mockJobsRepository.updateStatus).toHaveBeenCalledWith(
        TEST_JOB_ID,
        "completed",
        expect.objectContaining({
          result: expect.objectContaining({
            cloudAgentId: TEST_AGENT_ID,
            status: "running",
            bridgeUrl: "http://localhost:31337",
          }),
        }),
      );
    });

    it("increments attempt on provision failure", async () => {
      const job = makePendingJob(TEST_JOB_ID, TEST_AGENT_ID);

      mockJobsRepository.claimPendingJobs.mockResolvedValueOnce([job]);
      mockJobsRepository.recoverStaleJobs.mockResolvedValueOnce(0);

      mockMiladySandboxService.provision.mockResolvedValue({
        success: false,
        error: "Neon DB timeout",
        sandboxRecord: { status: "error" },
      });

      mockJobsRepository.update.mockResolvedValue(undefined);
      mockJobsRepository.incrementAttempt.mockResolvedValue(undefined);

      const result = await service.processPendingJobs(5);

      expect(result.claimed).toBe(1);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors[0].error).toBe("Neon DB timeout");

      expect(mockJobsRepository.incrementAttempt).toHaveBeenCalledWith(
        TEST_JOB_ID,
        "Neon DB timeout",
        3,
      );
    });

    it("returns empty result when no pending jobs", async () => {
      mockJobsRepository.claimPendingJobs.mockResolvedValue([]);
      mockJobsRepository.recoverStaleJobs.mockResolvedValueOnce(0);

      const result = await service.processPendingJobs(5);

      expect(result.claimed).toBe(0);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(0);
    });

    it("stores partial result in job data on failure", async () => {
      const job = makePendingJob(TEST_JOB_ID, TEST_AGENT_ID);

      mockJobsRepository.claimPendingJobs.mockResolvedValueOnce([job]);
      mockJobsRepository.recoverStaleJobs.mockResolvedValueOnce(0);

      mockMiladySandboxService.provision.mockResolvedValue({
        success: false,
        error: "SSH connection refused",
        sandboxRecord: { status: "error" },
      });

      mockJobsRepository.update.mockResolvedValue(undefined);
      mockJobsRepository.incrementAttempt.mockResolvedValue(undefined);

      await service.processPendingJobs(5);

      // Should store partial result before incrementing attempt
      expect(mockJobsRepository.update).toHaveBeenCalledWith(
        TEST_JOB_ID,
        expect.objectContaining({
          result: expect.objectContaining({
            cloudAgentId: TEST_AGENT_ID,
            error: "SSH connection refused",
          }),
        }),
      );
    });

    it("marks sandbox as error when retries are exhausted (permanent failure)", async () => {
      const job = makePendingJob(TEST_JOB_ID, TEST_AGENT_ID);

      mockJobsRepository.claimPendingJobs.mockResolvedValueOnce([job]);
      mockJobsRepository.recoverStaleJobs.mockResolvedValueOnce(0);

      mockMiladySandboxService.provision.mockResolvedValue({
        success: false,
        error: "Node unreachable",
        sandboxRecord: { status: "error" },
      });

      mockJobsRepository.update.mockResolvedValue(undefined);
      // incrementAttempt returns a job with status "failed" → permanent failure
      mockJobsRepository.incrementAttempt.mockResolvedValue({
        ...job,
        status: "failed",
        attempts: 3,
      });

      await service.processPendingJobs(5);

      // Should update the sandbox status to error
      expect(mockMiladySandboxesRepository.update).toHaveBeenCalledWith(
        TEST_AGENT_ID,
        expect.objectContaining({
          status: "error",
          error_message: expect.stringContaining("permanently failed"),
        }),
      );
    });

    it("does NOT mark sandbox as error on retryable failure", async () => {
      const job = makePendingJob(TEST_JOB_ID, TEST_AGENT_ID);

      mockJobsRepository.claimPendingJobs.mockResolvedValueOnce([job]);
      mockJobsRepository.recoverStaleJobs.mockResolvedValueOnce(0);

      mockMiladySandboxService.provision.mockResolvedValue({
        success: false,
        error: "Temporary glitch",
        sandboxRecord: { status: "error" },
      });

      mockJobsRepository.update.mockResolvedValue(undefined);
      // incrementAttempt returns job still "pending" → will retry
      mockJobsRepository.incrementAttempt.mockResolvedValue({
        ...job,
        status: "pending",
        attempts: 1,
      });

      await service.processPendingJobs(5);

      // Should NOT update the sandbox status — job will retry
      expect(mockMiladySandboxesRepository.update).not.toHaveBeenCalled();
    });

    it("uses atomic claimPendingJobs instead of read-then-update", async () => {
      // Verify that processPendingJobs delegates to claimPendingJobs
      // (FOR UPDATE SKIP LOCKED) rather than findByFilters + updateStatus
      mockJobsRepository.claimPendingJobs.mockResolvedValue([]);
      mockJobsRepository.recoverStaleJobs.mockResolvedValueOnce(0);

      await service.processPendingJobs(10);

      // Must call claimPendingJobs for each job type
      expect(mockJobsRepository.claimPendingJobs).toHaveBeenCalledWith({
        type: JOB_TYPES.MILADY_PROVISION,
        limit: 10,
      });

      expect(mockJobsRepository.findByFilters).not.toHaveBeenCalled();
    });

    it("does not call updateStatus('in_progress') — claiming handles that atomically", async () => {
      const job = makePendingJob(TEST_JOB_ID, TEST_AGENT_ID);

      mockJobsRepository.claimPendingJobs.mockResolvedValueOnce([job]);
      mockJobsRepository.recoverStaleJobs.mockResolvedValueOnce(0);
      mockJobsRepository.updateStatus.mockResolvedValue(undefined);

      mockMiladySandboxService.provision.mockResolvedValue({
        success: true,
        sandboxRecord: { id: TEST_AGENT_ID, status: "running" },
        bridgeUrl: "http://localhost:31337",
        healthUrl: "http://localhost:2138",
      });

      mockJobsRepository.update.mockResolvedValue(undefined);

      await service.processPendingJobs(5);

      // updateStatus should only be called for "completed", never "in_progress"
      const statusCalls = mockJobsRepository.updateStatus.mock.calls;
      for (const call of statusCalls) {
        expect(call[1]).not.toBe("in_progress");
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Webhook delivery
  // ─────────────────────────────────────────────────────────────────

  describe("webhook delivery", () => {
    it("fires webhook on successful completion", async () => {
      const job = {
        id: TEST_JOB_ID,
        type: JOB_TYPES.MILADY_PROVISION,
        status: "pending",
        data: {
          agentId: TEST_AGENT_ID,
          organizationId: TEST_ORG_ID,
          userId: TEST_USER_ID,
          agentName: "Agent",
        },
        organization_id: TEST_ORG_ID,
        max_attempts: 3,
        attempts: 0,
        webhook_url: "https://example.com/hook",
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockJobsRepository.claimPendingJobs.mockResolvedValueOnce([job]);
      mockJobsRepository.recoverStaleJobs.mockResolvedValueOnce(0);

      mockJobsRepository.updateStatus.mockResolvedValue(undefined);
      mockJobsRepository.update.mockResolvedValue(undefined);

      mockMiladySandboxService.provision.mockResolvedValue({
        success: true,
        sandboxRecord: { id: TEST_AGENT_ID, status: "running" },
        bridgeUrl: "http://localhost:31337",
        healthUrl: "http://localhost:2138",
      });

      // Mock global fetch for webhook
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      await service.processPendingJobs(5);

      // Should have called fetch with webhook URL
      expect(mockFetch).toHaveBeenCalledWith(
        new URL("https://example.com/hook"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"event":"job.completed"'),
        }),
      );

      // Should update webhook_status
      expect(mockJobsRepository.update).toHaveBeenCalledWith(
        TEST_JOB_ID,
        expect.objectContaining({ webhook_status: "delivered" }),
      );
    });

    it("rejects unsafe webhook destinations before fetch", async () => {
      const job = {
        id: TEST_JOB_ID,
        type: JOB_TYPES.MILADY_PROVISION,
        status: "pending",
        data: {
          agentId: TEST_AGENT_ID,
          organizationId: TEST_ORG_ID,
          userId: TEST_USER_ID,
          agentName: "Agent",
        },
        organization_id: TEST_ORG_ID,
        max_attempts: 3,
        attempts: 0,
        webhook_url: "http://127.0.0.1:8080/hook",
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockJobsRepository.claimPendingJobs.mockResolvedValueOnce([job]);
      mockJobsRepository.findByFilters.mockResolvedValueOnce([]);
      mockJobsRepository.updateStatus.mockResolvedValue(undefined);
      mockJobsRepository.update.mockResolvedValue(undefined);
      mockMiladySandboxService.provision.mockResolvedValue({
        success: true,
        sandboxRecord: { id: TEST_AGENT_ID, status: "running" },
        bridgeUrl: "http://localhost:31337",
        healthUrl: "http://localhost:2138",
      });

      mockAssertSafeOutboundUrl.mockRejectedValue(
        new Error("Private or reserved IP addresses are not allowed"),
      );

      const mockFetch = vi.fn();
      global.fetch = mockFetch as unknown as typeof fetch;

      await service.processPendingJobs(5);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockJobsRepository.update).toHaveBeenCalledWith(
        TEST_JOB_ID,
        expect.objectContaining({ webhook_status: "error" }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Job type constants
  // ─────────────────────────────────────────────────────────────────

  describe("JOB_TYPES", () => {
    it("has expected type constants", () => {
      expect(JOB_TYPES.MILADY_PROVISION).toBe("milady_provision");
    });
  });

  describe("stale recovery", () => {
    it("recovers stale jobs once per type without per-org scans", async () => {
      mockJobsRepository.claimPendingJobs.mockResolvedValueOnce([]);
      mockJobsRepository.recoverStaleJobs.mockResolvedValueOnce(2);

      const result = await service.processPendingJobs(5);

      expect(result).toMatchObject({
        claimed: 0,
        succeeded: 0,
        failed: 0,
      });
      expect(mockJobsRepository.recoverStaleJobs).toHaveBeenCalledWith({
        type: JOB_TYPES.MILADY_PROVISION,
        staleThresholdMs: 5 * 60 * 1000,
        maxAttempts: 3,
      });
      expect(mockJobsRepository.findByFilters).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // getJobsForOrg
  // ─────────────────────────────────────────────────────────────────

  describe("getJobsForOrg", () => {
    it("delegates to repository with correct filters", async () => {
      mockJobsRepository.findByFilters.mockResolvedValue([]);

      await service.getJobsForOrg(TEST_ORG_ID, JOB_TYPES.MILADY_PROVISION, 10);

      expect(mockJobsRepository.findByFilters).toHaveBeenCalledWith({
        organizationId: TEST_ORG_ID,
        type: "milady_provision",
        limit: 10,
        orderBy: "desc",
      });
    });

    it("uses defaults for optional params", async () => {
      mockJobsRepository.findByFilters.mockResolvedValue([]);

      await service.getJobsForOrg(TEST_ORG_ID);

      expect(mockJobsRepository.findByFilters).toHaveBeenCalledWith({
        organizationId: TEST_ORG_ID,
        type: undefined,
        limit: 20,
        orderBy: "desc",
      });
    });
  });
});
