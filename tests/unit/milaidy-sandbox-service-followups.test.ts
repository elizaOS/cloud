import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockTransaction = mock();

const mockMiladySandboxesRepository = {
  create: mock(),
  findByIdAndOrg: mock(),
  findByIdAndOrgForWrite: mock(),
  listByOrganization: mock(),
  delete: mock(),
  update: mock(),
  findRunningSandbox: mock(),
  getLatestBackup: mock(),
  createBackup: mock(),
  pruneBackups: mock(),
  getBackupById: mock(),
  findById: mock(),
  trySetProvisioning: mock(),
};

const mockJobsRepository = {
  findByDataFieldForWrite: mock(),
};

mock.module("@/db/repositories/milady-sandboxes", () => ({
  miladySandboxesRepository: mockMiladySandboxesRepository,
}));

mock.module("@/db/repositories/jobs", () => ({
  jobsRepository: mockJobsRepository,
}));

mock.module("@/db/helpers", () => ({
  dbWrite: {
    transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

mock.module("@/lib/services/neon-client", () => ({
  NeonClientError: class NeonClientError extends Error {
    constructor(
      message: string,
      public readonly code = "API_ERROR",
      public readonly statusCode?: number,
    ) {
      super(message);
    }
  },
  getNeonClient: mock(() => ({
    createProject: mock(),
    deleteProject: mock(),
  })),
}));

mock.module("@/db/repositories/docker-nodes", () => ({
  dockerNodesRepository: {
    findByNodeId: mock(),
  },
}));

mock.module("@/lib/services/sandbox-provider", () => ({
  createSandboxProvider: mock(() => ({
    create: mock(),
    checkHealth: mock(),
    stop: mock(),
  })),
}));

mock.module("@/lib/utils/logger", () => ({
  logger: {
    info: mock(),
    warn: mock(),
    error: mock(),
    debug: mock(),
  },
}));

import { MiladySandboxService } from "@/lib/services/milaidy-sandbox";

describe("MiladySandboxService follow-ups", () => {
  const provider = {
    create: mock(),
    checkHealth: mock(),
    stop: mock(),
  };

  beforeEach(() => {
    provider.create.mockReset();
    provider.checkHealth.mockReset();
    provider.stop.mockReset();
    mockTransaction.mockReset();

    for (const repo of [mockMiladySandboxesRepository, mockJobsRepository]) {
      for (const value of Object.values(repo)) value.mockReset();
    }
  });

  test("shutdown returns a conflict when an active provision job exists", async () => {
    const service = new MiladySandboxService(provider as never);

    const sandbox = {
      id: "agent-1",
      organization_id: "org-1",
      user_id: "user-1",
      character_id: null,
      sandbox_id: null,
      status: "stopped",
      bridge_url: null,
      health_url: null,
      agent_name: "Test Agent",
      agent_config: null,
      neon_project_id: null,
      neon_branch_id: null,
      database_uri: null,
      database_status: "none",
      database_error: null,
      snapshot_id: null,
      last_backup_at: null,
      last_heartbeat_at: null,
      error_message: null,
      error_count: 0,
      environment_vars: {},
      node_id: null,
      container_name: null,
      bridge_port: null,
      web_ui_port: null,
      headscale_ip: null,
      docker_image: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const execute = mock()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [sandbox] })
      .mockResolvedValueOnce({ rows: [{ id: "job-1" }] });

    mockTransaction.mockImplementation(
      async (fn: (tx: { execute: typeof execute }) => unknown) =>
        fn({ execute }),
    );

    const result = await service.shutdown("agent-1", "org-1");

    expect(result).toEqual({
      success: false,
      error: "Agent provisioning is in progress",
    });
    expect(provider.stop).not.toHaveBeenCalled();
    expect(mockMiladySandboxesRepository.update).not.toHaveBeenCalled();
  });

  test("deleteAgent returns a conflict when an active provision job exists", async () => {
    const service = new MiladySandboxService(provider as never);

    const sandbox = {
      id: "agent-1",
      organization_id: "org-1",
      user_id: "user-1",
      character_id: null,
      sandbox_id: "sandbox-1",
      status: "stopped",
      bridge_url: null,
      health_url: null,
      agent_name: "Test Agent",
      agent_config: null,
      neon_project_id: null,
      neon_branch_id: null,
      database_uri: null,
      database_status: "none",
      database_error: null,
      snapshot_id: null,
      last_backup_at: null,
      last_heartbeat_at: null,
      error_message: null,
      error_count: 0,
      environment_vars: {},
      node_id: null,
      container_name: null,
      bridge_port: null,
      web_ui_port: null,
      headscale_ip: null,
      docker_image: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const execute = mock()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [sandbox] })
      .mockResolvedValueOnce({ rows: [{ id: "job-1" }] });

    mockTransaction.mockImplementation(
      async (fn: (tx: { execute: typeof execute }) => unknown) =>
        fn({ execute }),
    );

    const result = await service.deleteAgent("agent-1", "org-1");

    expect(result).toEqual({
      success: false,
      error: "Agent provisioning is in progress",
    });
    expect(provider.stop).not.toHaveBeenCalled();
    expect(mockMiladySandboxesRepository.delete).not.toHaveBeenCalled();
  });
});
