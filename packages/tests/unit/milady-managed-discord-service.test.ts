import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

afterAll(() => {
  mock.restore();
});

const mockListByOrganization = mock();
const mockCreate = mock();

mock.module("@/db/repositories/milady-sandboxes", () => ({
  miladySandboxesRepository: {
    listByOrganization: mockListByOrganization,
    create: mockCreate,
  },
}));

mock.module("@/lib/services/milady-sandbox", () => ({
  miladySandboxService: {
    shutdown: mock(),
    provision: mock(),
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

import {
  MANAGED_DISCORD_GATEWAY_AGENT_NAME,
  ManagedMiladyDiscordService,
} from "@/lib/services/milady-managed-discord";

const service = new ManagedMiladyDiscordService();

describe("ManagedMiladyDiscordService.ensureGatewayAgent", () => {
  beforeEach(() => {
    mockListByOrganization.mockReset();
    mockCreate.mockReset();
  });

  test("reuses an existing shared Discord gateway agent", async () => {
    const existingGateway = {
      id: "agent-gateway",
      agent_name: MANAGED_DISCORD_GATEWAY_AGENT_NAME,
      agent_config: {
        __miladyManagedDiscordGateway: {
          mode: "shared-gateway",
          createdAt: "2026-04-09T00:00:00.000Z",
        },
      },
    };
    mockListByOrganization.mockResolvedValue([existingGateway] as any);

    const result = await service.ensureGatewayAgent({
      organizationId: "org-1",
      userId: "user-1",
    });

    expect(result.created).toBe(false);
    expect(result.sandbox).toBe(existingGateway as any);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("creates a shared Discord gateway agent when one does not exist", async () => {
    mockListByOrganization.mockResolvedValue([]);
    mockCreate.mockResolvedValue({
      id: "agent-gateway",
      organization_id: "org-1",
      user_id: "user-1",
      agent_name: MANAGED_DISCORD_GATEWAY_AGENT_NAME,
      agent_config: {
        __miladyManagedDiscordGateway: {
          mode: "shared-gateway",
          createdAt: "2026-04-09T00:00:00.000Z",
        },
      },
      status: "pending",
      database_status: "none",
    } as any);

    const result = await service.ensureGatewayAgent({
      organizationId: "org-1",
      userId: "user-1",
    });

    expect(result.created).toBe(true);
    expect(result.sandbox.agent_name).toBe(MANAGED_DISCORD_GATEWAY_AGENT_NAME);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org-1",
        user_id: "user-1",
        agent_name: MANAGED_DISCORD_GATEWAY_AGENT_NAME,
        status: "pending",
        database_status: "none",
        agent_config: expect.objectContaining({
          __miladyManagedDiscordGateway: expect.objectContaining({
            mode: "shared-gateway",
          }),
        }),
      }),
    );
  });
});
