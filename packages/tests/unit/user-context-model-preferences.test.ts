import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Errors, internalErrorResponse, OAuthError } from "@/lib/services/oauth/errors";

const mockListByOrganization = mock();
const mockListConnections = mock();
const mockResolveModelPreferences = mock();

mock.module("@/lib/services/api-keys", () => ({
  apiKeysService: {
    listByOrganization: mockListByOrganization,
  },
}));

mock.module("@/lib/services/oauth", () => ({
  Errors,
  internalErrorResponse,
  OAuthError,
  oauthService: {
    listConnections: mockListConnections,
  },
}));

mock.module("@/lib/services/vertex-model-registry", () => ({
  vertexModelRegistryService: {
    resolveModelPreferences: mockResolveModelPreferences,
  },
}));

mock.module("@/lib/utils/logger", () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

describe("UserContextService model preferences", () => {
  beforeEach(() => {
    mockListByOrganization.mockReset();
    mockListConnections.mockReset();
    mockResolveModelPreferences.mockReset();

    mockListByOrganization.mockResolvedValue([
      {
        user_id: "00000000-0000-0000-0000-000000000222",
        is_active: true,
        key_prefix: "eliza_test",
        key: "eliza_test_key",
      },
    ]);
    mockListConnections.mockResolvedValue([{ platform: "github", status: "active" }]);
    mockResolveModelPreferences.mockResolvedValue({
      modelPreferences: {
        responseHandlerModel: "projects/demo/locations/us-central1/endpoints/handler",
        actionPlannerModel: "projects/demo/locations/us-central1/endpoints/planner",
      },
      assignments: [],
      sources: {},
    });
  });

  test("hydrates authenticated contexts with resolved tuned-model preferences", async () => {
    const { userContextService } = await import("@/lib/eliza/user-context");
    const { AgentMode } = await import("@/lib/eliza/agent-mode-types");

    const context = await userContextService.buildContext({
      user: {
        id: "00000000-0000-0000-0000-000000000222",
        organization_id: "00000000-0000-0000-0000-000000000111",
        privy_user_id: null,
        name: "Test User",
        email: "test@example.com",
      } as never,
      agentMode: AgentMode.ASSISTANT,
    });

    expect(mockResolveModelPreferences).toHaveBeenCalledWith({
      organizationId: "00000000-0000-0000-0000-000000000111",
      userId: "00000000-0000-0000-0000-000000000222",
    });
    expect(mockListConnections).toHaveBeenCalledWith({
      organizationId: "00000000-0000-0000-0000-000000000111",
      userId: "00000000-0000-0000-0000-000000000222",
    });
    expect(context.modelPreferences).toEqual({
      responseHandlerModel: "projects/demo/locations/us-central1/endpoints/handler",
      actionPlannerModel: "projects/demo/locations/us-central1/endpoints/planner",
    });
    expect(context.oauthConnections).toEqual([{ platform: "github" }]);
    expect(context.apiKey).toBe("eliza_test_key");
  });
});
