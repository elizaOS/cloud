import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockGetOrCreateRoom = mock();
const mockSendMessage = mock();

mock.module("@ai-sdk/gateway", () => ({
  gateway: {
    languageModel: () => "mock-model",
  },
}));

mock.module("ai", () => ({
  streamText: mock(),
}));

mock.module("@/lib/pricing", () => ({
  calculateCost: mock(),
  estimateRequestCost: mock(),
  getProviderFromModel: mock(),
  IMAGE_GENERATION_COST: 0.01,
}));

mock.module("@/lib/providers/anthropic-thinking", () => ({
  mergeAnthropicCotProviderOptions: () => ({}),
  mergeGoogleImageModalitiesWithAnthropicCot: () => ({}),
  resolveAnthropicThinkingBudgetTokens: () => undefined,
}));

mock.module("@/lib/services/agents/agents", () => ({
  agentService: {
    getOrCreateRoom: mockGetOrCreateRoom,
    sendMessage: mockSendMessage,
  },
}));

mock.module("@/lib/services/characters/characters", () => ({
  charactersService: {},
}));

mock.module("@/lib/services/containers", () => ({
  containersService: {},
}));

mock.module("@/lib/services/conversations", () => ({
  conversationsService: {},
}));

mock.module("@/lib/services/credits", () => ({
  creditsService: {},
  InsufficientCreditsError: class InsufficientCreditsError extends Error {},
}));

mock.module("@/lib/services/generations", () => ({
  generationsService: {},
}));

mock.module("@/lib/services/memory", () => ({
  memoryService: {},
}));

mock.module("@/lib/services/organizations", () => ({
  organizationsService: {},
}));

mock.module("@/lib/services/usage", () => ({
  usageService: {},
}));

describe("A2A chat with agent skill", () => {
  beforeEach(() => {
    mockGetOrCreateRoom.mockReset();
    mockSendMessage.mockReset();
    mockGetOrCreateRoom.mockResolvedValue("room-actual");
    mockSendMessage.mockResolvedValue({
      content: "reply",
      messageId: "msg-1",
    });
  });

  test("uses the authenticated user id instead of any client-supplied entityId", async () => {
    const { executeSkillChatWithAgent } = await import(`@/lib/api/a2a/skills?t=${Date.now()}`);

    const ctx = {
      user: {
        id: "user-123",
        organization_id: "org-123",
      },
    } as never;

    await executeSkillChatWithAgent(
      "hello",
      {
        agentId: "agent-1",
        entityId: "attacker-user",
      },
      ctx,
    );

    expect(mockGetOrCreateRoom).toHaveBeenCalledWith("user-123", "agent-1");
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: "user-123",
        organizationId: "org-123",
        roomId: "room-actual",
      }),
    );
  });
});
