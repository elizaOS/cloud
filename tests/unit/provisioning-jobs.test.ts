/**
 * Tests for the async provisioning job service.
 *
 * Tests the ProvisioningJobService in isolation by mocking the
 * jobsRepository and miladySandboxService dependencies.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock setup — must come before importing the service under test
// ---------------------------------------------------------------------------

const mockJobsRepository = {
  create: vi.fn(),
  findById: vi.fn(),
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

vi.mock("@/db/repositories/jobs", () => ({
  jobsRepository: mockJobsRepository,
  JobsRepository: vi.fn(),
}));

vi.mock("@/lib/services/milaidy-sandbox", () => ({
  miladySandboxService: mockMiladySandboxService,
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

import {
  ProvisioningJobService,
  JOB_TYPES,
} from "@/lib/services/provisioning-jobs";

describe("ProvisioningJobService", () => {
  let service: ProvisioningJobService;

  const TEST_ORG_ID = "org-001";
  const TEST_USER_ID = "user-001";
  const TEST_AGENT_ID = "agent-001";
  const TEST_JOB_ID = "job-001";

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ProvisioningJobService();
  });

  // ─────────────────────────────────────────────────────────────────
  // Enqueue
  // ─────────────────────────────────────────────────────────────────

  describe("enqueueMiladyProvision", () => {
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

      mockJobsRepository.create.mockResolvedValue(fakeJob);

      const result = await service.enqueueMiladyProvision({
        agentId: TEST_AGENT_ID,
        organizationId: TEST_ORG_ID,
        userId: TEST_USER_ID,
        agentName: "TestAgent",
      });

      expect(result.id).toBe(TEST_JOB_ID);
      expect(result.type).toBe(JOB_TYPES.MILADY_PROVISION);
      expect(result.status).toBe("pending");

      expect(mockJobsRepository.create).toHaveBeenCalledOnce();
      const createArg = mockJobsRepository.create.mock.calls[0][0];
      expect(createArg.type).toBe("milady_provision");
      expect(createArg.status).toBe("pending");
      expect(createArg.max_attempts).toBe(3);
      expect(createArg.data.agentId).toBe(TEST_AGENT_ID);
    });

    it("passes webhook URL when provided", async () => {
      mockJobsRepository.create.mockResolvedValue({
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

      const createArg = mockJobsRepository.create.mock.calls[0][0];
      expect(createArg.webhook_url).toBe("https://example.com/webhook");
    });

    it("sets estimated completion to ~90s from now", async () => {
      mockJobsRepository.create.mockResolvedValue({ id: TEST_JOB_ID });

      const before = Date.now();
      await service.enqueueMiladyProvision({
        agentId: TEST_AGENT_ID,
        organizationId: TEST_ORG_ID,
        userId: TEST_USER_ID,
        agentName: "TestAgent",
      });

      const createArg = mockJobsRepository.create.mock.calls[0][0];
      const estimated = new Date(createArg.estimated_completion_at).getTime();
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
      mockJobsRepository.claimPendingJobs
        .mockResolvedValueOnce([job]); // milady_provision

      // findByFilters still used for stale-job recovery
      mockJobsRepository.findByFilters
        .mockResolvedValueOnce([]); // in_progress check for recovery

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
      expect(mockMiladySandboxService.provision).toHaveBeenCalledWith(
        TEST_AGENT_ID,
        TEST_ORG_ID,
      );

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

      mockJobsRepository.claimPendingJobs
        .mockResolvedValueOnce([job]);
      mockJobsRepository.findByFilters
        .mockResolvedValueOnce([]);

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
      mockJobsRepository.findByFilters.mockResolvedValue([]);

      const result = await service.processPendingJobs(5);

      expect(result.claimed).toBe(0);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(0);
    });

    it("stores partial result in job data on failure", async () => {
      const job = makePendingJob(TEST_JOB_ID, TEST_AGENT_ID);

      mockJobsRepository.claimPendingJobs
        .mockResolvedValueOnce([job]);
      mockJobsRepository.findByFilters
        .mockResolvedValueOnce([]);

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

    it("uses atomic claimPendingJobs instead of read-then-update", async () => {
      // Verify that processPendingJobs delegates to claimPendingJobs
      // (FOR UPDATE SKIP LOCKED) rather than findByFilters + updateStatus
      mockJobsRepository.claimPendingJobs.mockResolvedValue([]);
      mockJobsRepository.findByFilters.mockResolvedValue([]); // stale recovery

      await service.processPendingJobs(10);

      // Must call claimPendingJobs for each job type
      expect(mockJobsRepository.claimPendingJobs).toHaveBeenCalledWith({
        type: JOB_TYPES.MILADY_PROVISION,
        limit: 10,
      });

      // Should NOT call findByFilters for pending jobs (only for stale recovery)
      const findCalls = mockJobsRepository.findByFilters.mock.calls;
      for (const call of findCalls) {
        // stale recovery queries in_progress, never pending
        expect(call[0].status).not.toBe("pending");
      }
    });

    it("does not call updateStatus('in_progress') — claiming handles that atomically", async () => {
      const job = makePendingJob(TEST_JOB_ID, TEST_AGENT_ID);

      mockJobsRepository.claimPendingJobs.mockResolvedValueOnce([job]);
      mockJobsRepository.findByFilters.mockResolvedValueOnce([]);
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

      mockJobsRepository.claimPendingJobs
        .mockResolvedValueOnce([job]);
      mockJobsRepository.findByFilters
        .mockResolvedValueOnce([]);

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
      global.fetch = mockFetch;

      await service.processPendingJobs(5);

      // Should have called fetch with webhook URL
      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/hook",
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
  });

  // ─────────────────────────────────────────────────────────────────
  // Job type constants
  // ─────────────────────────────────────────────────────────────────

  describe("JOB_TYPES", () => {
    it("has expected type constants", () => {
      expect(JOB_TYPES.MILADY_PROVISION).toBe("milady_provision");
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
