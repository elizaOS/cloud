import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const mockFindRunningSandbox = mock();
const mockFindByIdAndOrg = mock();
const mockGetLatestBackup = mock();
const mockCreateBackup = mock();
const mockPruneBackups = mock();
const mockUpdateSandbox = mock();
const mockAssertSafeOutboundUrl = mock();
const mockCreateSandboxProvider = mock(() => ({}));

mock.module("@/db/repositories/milady-sandboxes", () => ({
  miladySandboxesRepository: {
    findRunningSandbox: mockFindRunningSandbox,
    findByIdAndOrg: mockFindByIdAndOrg,
    getLatestBackup: mockGetLatestBackup,
    createBackup: mockCreateBackup,
    pruneBackups: mockPruneBackups,
    update: mockUpdateSandbox,
  },
}));

mock.module("@/db/repositories/jobs", () => ({
  jobsRepository: {},
}));

mock.module("@/lib/security/outbound-url", () => ({
  assertSafeOutboundUrl: mockAssertSafeOutboundUrl,
}));

mock.module("@/lib/services/sandbox-provider", () => ({
  createSandboxProvider: mockCreateSandboxProvider,
}));

const mockFindDockerNodeById = mock();

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
  getNeonClient: mock(() => ({})),
}));

mock.module("@/db/repositories/docker-nodes", () => ({
  dockerNodesRepository: {
    findByNodeId: mockFindDockerNodeById,
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

import { MiladySandboxService } from "@/lib/services/milady-sandbox";

describe("MiladySandboxService bridge SSRF guards", () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = mock();
  const service = new MiladySandboxService({} as any);

  beforeEach(() => {
    mockFindRunningSandbox.mockReset();
    mockFindByIdAndOrg.mockReset();
    mockGetLatestBackup.mockReset();
    mockCreateBackup.mockReset();
    mockPruneBackups.mockReset();
    mockUpdateSandbox.mockReset();
    mockFindDockerNodeById.mockReset();
    mockAssertSafeOutboundUrl.mockReset();
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as typeof fetch;

    const runningSandbox = {
      id: "agent-1",
      bridge_url: "https://bridge.example.com",
      status: "running",
    };

    mockFindRunningSandbox.mockResolvedValue(runningSandbox);
    mockFindByIdAndOrg.mockResolvedValue(runningSandbox);
    mockPruneBackups.mockResolvedValue(undefined);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("validates bridge_url before forwarding JSON-RPC bridge calls", async () => {
    mockAssertSafeOutboundUrl.mockResolvedValue(new URL("https://bridge.example.com/bridge"));
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "req-1",
          result: { ok: true },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await service.bridge("agent-1", "org-1", {
      jsonrpc: "2.0",
      id: "req-1",
      method: "status.get",
    });

    expect(mockAssertSafeOutboundUrl).toHaveBeenCalledWith("https://bridge.example.com/bridge");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://bridge.example.com/bridge",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toEqual({
      jsonrpc: "2.0",
      id: "req-1",
      result: { ok: true },
    });
  });

  test("blocks unsafe bridge_url values before fetch", async () => {
    mockAssertSafeOutboundUrl.mockRejectedValue(
      new Error("Private or reserved IP addresses are not allowed"),
    );

    const result = await service.bridge("agent-1", "org-1", {
      jsonrpc: "2.0",
      id: "req-2",
      method: "status.get",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      jsonrpc: "2.0",
      id: "req-2",
      error: {
        code: -32000,
        message: "Sandbox bridge is unreachable",
      },
    });
  });

  test("blocks unsafe bridge_url values for streaming bridge calls", async () => {
    mockAssertSafeOutboundUrl.mockRejectedValue(
      new Error("Endpoint resolves to a private or reserved IP address"),
    );

    const result = await service.bridgeStream("agent-1", "org-1", {
      jsonrpc: "2.0",
      method: "message.send",
      params: { text: "hello" },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  test("allows trusted docker-backed bridge URLs without outbound-url rejection", async () => {
    mockFindRunningSandbox.mockResolvedValue({
      id: "agent-1",
      bridge_url: "http://100.64.0.10:31337",
      node_id: "nyx-node",
      bridge_port: 31337,
      headscale_ip: "100.64.0.10",
      status: "running",
    });
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "req-3",
          result: { ok: true },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await service.bridge("agent-1", "org-1", {
      jsonrpc: "2.0",
      id: "req-3",
      method: "status.get",
    });

    expect(mockAssertSafeOutboundUrl).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://100.64.0.10:31337/bridge",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toEqual({
      jsonrpc: "2.0",
      id: "req-3",
      result: { ok: true },
    });
  });

  test("does not let stale docker metadata override the current bridge_url", async () => {
    mockFindRunningSandbox.mockResolvedValue({
      id: "agent-1",
      bridge_url: "https://vercel-sandbox.example.com",
      node_id: "nyx-node",
      bridge_port: 31337,
      headscale_ip: "100.64.0.10",
      status: "running",
    });
    mockAssertSafeOutboundUrl.mockResolvedValue(
      new URL("https://vercel-sandbox.example.com/bridge"),
    );
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "req-4",
          result: { ok: true },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await service.bridge("agent-1", "org-1", {
      jsonrpc: "2.0",
      id: "req-4",
      method: "status.get",
    });

    expect(mockAssertSafeOutboundUrl).toHaveBeenCalledWith(
      "https://vercel-sandbox.example.com/bridge",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://vercel-sandbox.example.com/bridge",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toEqual({
      jsonrpc: "2.0",
      id: "req-4",
      result: { ok: true },
    });
  });

  test("allows legacy private bridge URLs when node_id and bridge_port corroborate them", async () => {
    mockFindRunningSandbox.mockResolvedValue({
      id: "agent-1",
      bridge_url: "http://100.64.0.10:31337",
      node_id: "nyx-node",
      bridge_port: 31337,
      headscale_ip: null,
      status: "running",
    });
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "req-5",
          result: { ok: true },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await service.bridge("agent-1", "org-1", {
      jsonrpc: "2.0",
      id: "req-5",
      method: "status.get",
    });

    expect(mockAssertSafeOutboundUrl).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://100.64.0.10:31337/bridge",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toEqual({
      jsonrpc: "2.0",
      id: "req-5",
      result: { ok: true },
    });
  });

  test("keeps rejecting private bridge URLs without enough docker-managed evidence", async () => {
    mockFindRunningSandbox.mockResolvedValue({
      id: "agent-1",
      bridge_url: "http://100.64.0.10:31337",
      node_id: null,
      bridge_port: 31337,
      headscale_ip: null,
      status: "running",
    });
    mockAssertSafeOutboundUrl.mockRejectedValue(
      new Error("Private or reserved IP addresses are not allowed"),
    );

    const result = await service.bridge("agent-1", "org-1", {
      jsonrpc: "2.0",
      id: "req-6",
      method: "status.get",
    });

    expect(mockAssertSafeOutboundUrl).toHaveBeenCalledWith("http://100.64.0.10:31337/bridge");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      jsonrpc: "2.0",
      id: "req-6",
      error: {
        code: -32000,
        message: "Sandbox bridge is unreachable",
      },
    });
  });

  test("uses the trusted legacy private bridge path for snapshot restore and heartbeat", async () => {
    const runningSandbox = {
      id: "agent-1",
      bridge_url: "http://100.64.0.10:31337",
      node_id: "nyx-node",
      bridge_port: null,
      headscale_ip: "100.64.0.10",
      status: "running",
    };
    const backup = {
      id: "backup-1",
      sandbox_record_id: "agent-1",
      snapshot_type: "manual",
      state_data: { sessions: ["restored"] },
      size_bytes: 23,
      created_at: new Date(),
      updated_at: new Date(),
    };

    mockFindRunningSandbox.mockResolvedValue(runningSandbox);
    mockFindByIdAndOrg.mockResolvedValue(runningSandbox);
    mockGetLatestBackup.mockResolvedValue(backup);
    mockCreateBackup.mockResolvedValue(backup);
    mockUpdateSandbox.mockResolvedValue(runningSandbox);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ state: "snapshotted" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const snapshotResult = await service.snapshot("agent-1", "org-1");
    const restoreResult = await service.restore("agent-1", "org-1");
    const heartbeatResult = await service.heartbeat("agent-1", "org-1");

    expect(mockAssertSafeOutboundUrl).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://100.64.0.10:31337/api/snapshot",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://100.64.0.10:31337/api/restore",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://100.64.0.10:31337/bridge",
      expect.objectContaining({ method: "POST" }),
    );
    expect(snapshotResult.success).toBe(true);
    expect(restoreResult).toEqual({ success: true, backup });
    expect(heartbeatResult).toBe(true);
  });
});
