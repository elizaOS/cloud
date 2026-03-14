import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockJobsRepository = {
  claimPendingJobs: mock(),
  recoverStaleJobs: mock(),
  incrementAttempt: mock(),
  update: mock(),
  updateStatus: mock(),
};

const mockMiladySandboxService = {
  provision: mock(),
};

const mockMiladySandboxesRepository = {
  update: mock(),
};

const mockAssertSafeOutboundUrl = mock(async (url: string) => new URL(url));
const mockDbWriteTransaction = mock();

mock.module("@/db/repositories/jobs", () => ({
  jobsRepository: mockJobsRepository,
  jobs: {},
}));

mock.module("@/db/repositories/milady-sandboxes", () => ({
  miladySandboxesRepository: mockMiladySandboxesRepository,
}));

mock.module("@/lib/services/milaidy-sandbox", () => ({
  miladySandboxService: mockMiladySandboxService,
}));

mock.module("@/lib/security/outbound-url", () => ({
  assertSafeOutboundUrl: mockAssertSafeOutboundUrl,
}));

mock.module("@/db/helpers", () => ({
  dbWrite: { transaction: (...args: unknown[]) => mockDbWriteTransaction(...args) },
  dbRead: {},
  db: {},
  useReadDb: mock(),
  useWriteDb: mock(),
  getReadDb: mock(),
  getWriteDb: mock(),
  getCurrentRegion: mock(),
  getDbConnectionInfo: mock(),
}));

mock.module("@/lib/utils/logger", () => ({
  logger: {
    info: mock(),
    warn: mock(),
    error: mock(),
    debug: mock(),
  },
}));

import {
  JOB_TYPES,
  ProvisioningJobService,
} from "@/lib/services/provisioning-jobs";

describe("ProvisioningJobService follow-ups", () => {
  beforeEach(() => {
    for (const repo of [
      mockJobsRepository,
      mockMiladySandboxService,
      mockMiladySandboxesRepository,
    ]) {
      for (const value of Object.values(repo)) value.mockReset();
    }
    mockAssertSafeOutboundUrl.mockReset();
    mockAssertSafeOutboundUrl.mockImplementation(async (url: string) => new URL(url));
    mockDbWriteTransaction.mockReset();
  });

  test("enqueueMiladyProvisionOnce reuses an existing active job without inserting a duplicate", async () => {
    const service = new ProvisioningJobService();
    let insertCalled = false;

    mockDbWriteTransaction.mockImplementation(async (fn: Function) => {
      let selectCall = 0;
      const tx = {
        execute: mock(async () => undefined),
        select: mock(() => {
          selectCall += 1;
          if (selectCall === 1) {
            return {
              from: mock(() => ({
                where: mock(() => ({
                  limit: mock(async () => [
                    {
                      id: "agent-1",
                      updated_at: new Date("2026-03-01T12:00:00.000Z"),
                    },
                  ]),
                })),
              })),
            };
          }

          return {
            from: mock(() => ({
              where: mock(() => ({
                orderBy: mock(() => ({
                  limit: mock(async () => [
                    {
                      id: "job-existing",
                      status: "pending",
                      estimated_completion_at: new Date(
                        "2026-03-01T12:01:30.000Z",
                      ),
                    },
                  ]),
                })),
              })),
            })),
          };
        }),
        insert: mock(() => ({
          values: mock(() => {
            insertCalled = true;
            return { returning: mock(async () => []) };
          }),
        })),
      };

      return fn(tx);
    });

    const result = await service.enqueueMiladyProvisionOnce({
      agentId: "agent-1",
      organizationId: "org-1",
      userId: "user-1",
      agentName: "Agent One",
      expectedUpdatedAt: new Date("2026-03-01T12:00:00.000Z"),
    });

    expect(result).toEqual({
      created: false,
      job: {
        id: "job-existing",
        status: "pending",
        estimated_completion_at: new Date("2026-03-01T12:01:30.000Z"),
      },
    });
    expect(insertCalled).toBe(false);
  });

  test("enqueueMiladyProvisionOnce rejects stale expectedUpdatedAt values", async () => {
    const service = new ProvisioningJobService();

    mockDbWriteTransaction.mockImplementation(async (fn: Function) => {
      const tx = {
        execute: mock(async () => undefined),
        select: mock(() => ({
          from: mock(() => ({
            where: mock(() => ({
              limit: mock(async () => [
                {
                  id: "agent-1",
                  updated_at: new Date("2026-03-01T12:00:01.000Z"),
                },
              ]),
            })),
          })),
        })),
        insert: mock(() => ({
          values: mock(() => ({ returning: mock(async () => []) })),
        })),
      };

      return fn(tx);
    });

    await expect(
      service.enqueueMiladyProvisionOnce({
        agentId: "agent-1",
        organizationId: "org-1",
        userId: "user-1",
        agentName: "Agent One",
        expectedUpdatedAt: new Date("2026-03-01T12:00:00.000Z"),
      }),
    ).rejects.toThrow("Agent state changed while starting");
  });

  test("processPendingJobs fails mismatched org payloads before provision executes", async () => {
    const service = new ProvisioningJobService();

    mockJobsRepository.claimPendingJobs.mockResolvedValue([
      {
        id: "job-1",
        type: JOB_TYPES.MILADY_PROVISION,
        organization_id: "org-column",
        data: {
          agentId: "agent-1",
          organizationId: "org-payload",
          userId: "user-1",
          agentName: "Agent One",
        },
        max_attempts: 3,
      },
    ]);
    mockJobsRepository.recoverStaleJobs.mockResolvedValue(0);
    mockJobsRepository.incrementAttempt.mockResolvedValue({ status: "pending" });

    const result = await service.processPendingJobs(1);

    expect(result).toMatchObject({
      claimed: 1,
      succeeded: 0,
      failed: 1,
    });
    expect(result.errors[0]?.error).toContain("Organization ID mismatch");
    expect(mockMiladySandboxService.provision).not.toHaveBeenCalled();
    expect(mockJobsRepository.incrementAttempt).toHaveBeenCalledWith(
      "job-1",
      expect.stringContaining("Organization ID mismatch"),
      3,
    );
  });
});
