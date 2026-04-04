import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockTransaction = vi.fn();
const mockPruneBackups = vi.fn();
const mockDeleteProject = vi.fn();

vi.mock("@/db/helpers", () => ({
  dbWrite: {
    transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("@/db/repositories/milady-sandboxes", () => ({
  miladySandboxesRepository: {
    pruneBackups: mockPruneBackups,
    findByIdAndOrg: vi.fn(),
    findByIdAndOrgForWrite: vi.fn(),
    findRunningSandbox: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    listByOrganization: vi.fn(),
    getLatestBackup: vi.fn(),
    createBackup: vi.fn(),
    getBackupById: vi.fn(),
    listBackups: vi.fn(),
    findById: vi.fn(),
    trySetProvisioning: vi.fn(),
  },
}));

vi.mock("@/lib/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@/lib/security/outbound-url", () => ({
  assertSafeOutboundUrl: vi.fn(async (url: string) => new URL(url)),
}));

vi.mock("@/lib/services/provisioning-jobs", () => ({
  JOB_TYPES: {
    MILADY_PROVISION: "milady_provision",
  },
}));

vi.mock("@/lib/services/neon-client", () => ({
  NeonClientError: class NeonClientError extends Error {
    constructor(
      message: string,
      public readonly code = "API_ERROR",
      public readonly statusCode?: number,
    ) {
      super(message);
    }
  },
  getNeonClient: () => ({
    deleteProject: mockDeleteProject,
  }),
}));

vi.mock("@/db/repositories/docker-nodes", () => ({
  dockerNodesRepository: {
    findByNodeId: vi.fn(),
  },
}));

vi.mock("@/lib/services/sandbox-provider", () => ({
  createSandboxProvider: vi.fn(),
}));

import { MiladySandboxService } from "@/lib/services/milady-sandbox";
import type { SandboxProvider } from "@/lib/services/sandbox-provider";

function testSandboxProvider(overrides: Partial<SandboxProvider> = {}): SandboxProvider {
  return {
    create: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
    checkHealth: vi.fn(),
    ...overrides,
  };
}

describe("MiladySandboxService lifecycle guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockReset();
    mockPruneBackups.mockResolvedValue(0);
    mockDeleteProject.mockResolvedValue(undefined);
  });

  afterEach(() => {
    (vi as unknown as { restoreAllMocks: () => void }).restoreAllMocks();
  });

  it("stops an orphanable sandbox on delete even when DB status is disconnected", async () => {
    const deletedSandbox = {
      id: "agent-1",
      organization_id: "org-1",
      user_id: "user-1",
      character_id: null,
      sandbox_id: "sandbox-123",
      status: "disconnected",
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
      billing_status: "active",
      last_billed_at: null,
      hourly_rate: "0.0100",
      total_billed: "0.00",
      shutdown_warning_sent_at: null,
      scheduled_shutdown_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [deletedSandbox] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [deletedSandbox] });

    mockTransaction.mockImplementation(async (fn: (tx: { execute: typeof execute }) => unknown) =>
      fn({ execute }),
    );

    const provider = testSandboxProvider();

    const service = new MiladySandboxService(provider);
    const result = await service.deleteAgent("agent-1", "org-1");

    expect(result).toEqual({ success: true, deletedSandbox });
    expect(provider.stop).toHaveBeenCalledWith("sandbox-123");
  });

  it("refuses delete while a provisioning job is already active", async () => {
    const sandbox = {
      id: "agent-1",
      organization_id: "org-1",
      user_id: "user-1",
      character_id: null,
      sandbox_id: null,
      status: "pending",
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
      billing_status: "active",
      last_billed_at: null,
      hourly_rate: "0.0100",
      total_billed: "0.00",
      shutdown_warning_sent_at: null,
      scheduled_shutdown_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [sandbox] })
      .mockResolvedValueOnce({ rows: [{ id: "job-1" }] });

    mockTransaction.mockImplementation(async (fn: (tx: { execute: typeof execute }) => unknown) =>
      fn({ execute }),
    );

    const provider = testSandboxProvider();

    const service = new MiladySandboxService(provider);
    const result = await service.deleteAgent("agent-1", "org-1");

    expect(result).toEqual({
      success: false,
      error: "Agent provisioning is in progress",
    });
    expect(provider.stop).not.toHaveBeenCalled();
  });

  it("allows delete to proceed when the backing sandbox is already gone", async () => {
    const deletedSandbox = {
      id: "agent-1",
      organization_id: "org-1",
      user_id: "user-1",
      character_id: null,
      sandbox_id: "sandbox-123",
      status: "disconnected",
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
      billing_status: "active",
      last_billed_at: null,
      hourly_rate: "0.0100",
      total_billed: "0.00",
      shutdown_warning_sent_at: null,
      scheduled_shutdown_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [deletedSandbox] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [deletedSandbox] });

    mockTransaction.mockImplementation(async (fn: (tx: { execute: typeof execute }) => unknown) =>
      fn({ execute }),
    );

    const provider = testSandboxProvider({
      stop: vi.fn().mockRejectedValue(new Error("Container not found in memory or DB")),
    });

    const service = new MiladySandboxService(provider);
    const result = await service.deleteAgent("agent-1", "org-1");

    expect(result).toEqual({ success: true, deletedSandbox });
  });
});
