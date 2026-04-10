import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

const mockRequireAuthWithOrg = mock();
const mockFindOrganizationById = mock();
const mockGetWithSWR = mock();
const mockGetGenerationStats = mock();
const mockListCharactersByUser = mock();
const mockListContainers = mock();
const mockListApiKeysByOrganization = mock();
const mockGetRoomsForEntity = mock();
const mockListAppsByOrganization = mock();
const mockGetStatsByOrganization = mock();
const mockGetCharacterStatisticsBatch = mock();
const mockLoggerError = mock();
const realContainersModule = await import("@/lib/services/containers");

mock.module("@/lib/auth", () => ({
  requireAuthWithOrg: mockRequireAuthWithOrg,
}));

mock.module("@/db/repositories/organizations", () => ({
  organizationsRepository: {
    findById: mockFindOrganizationById,
  },
}));

mock.module("@/lib/cache/client", () => ({
  cache: {
    getWithSWR: mockGetWithSWR,
  },
}));

mock.module("@/lib/services/generations", () => ({
  generationsService: {
    getStats: mockGetGenerationStats,
  },
}));

mock.module("@/lib/services/characters/characters", () => ({
  charactersService: {
    listByUser: mockListCharactersByUser,
  },
}));

mock.module("@/lib/services/containers", () => ({
  ...realContainersModule,
  listContainers: mockListContainers,
}));

mock.module("@/lib/services/api-keys", () => ({
  apiKeysService: {
    listByOrganization: mockListApiKeysByOrganization,
  },
}));

mock.module("@/lib/services/agents/rooms", () => ({
  roomsService: {
    getRoomsForEntity: mockGetRoomsForEntity,
  },
}));

mock.module("@/lib/services/apps", () => ({
  appsService: {
    listByOrganization: mockListAppsByOrganization,
  },
}));

mock.module("@/lib/services/usage", () => ({
  usageService: {
    getStatsByOrganization: mockGetStatsByOrganization,
  },
}));

mock.module("@/lib/services/deployments", () => ({
  characterDeploymentDiscoveryService: {
    getCharacterStatisticsBatch: mockGetCharacterStatisticsBatch,
  },
}));

mock.module("@/lib/utils/logger", () => ({
  logger: {
    error: mockLoggerError,
  },
}));

describe("getDashboardData", () => {
  beforeEach(() => {
    mockRequireAuthWithOrg.mockReset();
    mockFindOrganizationById.mockReset();
    mockGetWithSWR.mockReset();
    mockGetGenerationStats.mockReset();
    mockListCharactersByUser.mockReset();
    mockListContainers.mockReset();
    mockListApiKeysByOrganization.mockReset();
    mockGetRoomsForEntity.mockReset();
    mockListAppsByOrganization.mockReset();
    mockGetStatsByOrganization.mockReset();
    mockGetCharacterStatisticsBatch.mockReset();
    mockLoggerError.mockReset();

    mockRequireAuthWithOrg.mockResolvedValue({
      id: "user-1",
      name: "Test User",
      organization_id: "org-1",
    });
    mockFindOrganizationById.mockResolvedValue({
      id: "org-1",
      credit_balance: "42.5",
    });
    mockGetWithSWR.mockImplementation(
      async (_key: string, _ttl: number, fetcher: () => unknown) => {
        return await fetcher();
      },
    );
    mockGetGenerationStats.mockResolvedValue({
      totalGenerations: 7,
      byType: [
        { type: "image", count: 3 },
        { type: "video", count: 2 },
      ],
    });
    mockListCharactersByUser.mockResolvedValue([
      {
        id: "agent-1",
        name: "Agent One",
        bio: "First agent",
        avatar_url: null,
        category: "general",
        is_public: false,
      },
    ]);
    mockListApiKeysByOrganization.mockResolvedValue([
      {
        name: "Default API Key",
        usage_count: 0,
      },
    ]);
    mockGetRoomsForEntity.mockResolvedValue([]);
    mockListAppsByOrganization.mockResolvedValue([]);
    mockGetStatsByOrganization.mockResolvedValue({
      totalRequests: 11,
    });
    mockGetCharacterStatisticsBatch.mockResolvedValue(
      new Map([
        [
          "agent-1",
          {
            roomCount: 2,
            messageCount: 9,
            status: "running",
            lastActiveAt: null,
          },
        ],
      ]),
    );
  });

  test("does not fetch containers for the dashboard home payload", async () => {
    const moduleUrl = new URL(`../../lib/actions/dashboard.ts?t=${Date.now()}`, import.meta.url)
      .href;
    const { getDashboardData } = await import(moduleUrl);

    const data = await getDashboardData();

    expect(mockListContainers).not.toHaveBeenCalled();
    expect(data.user.name).toBe("Test User");
    expect(data.stats.creditBalance).toBe(42.5);
    expect(data.stats.totalGenerations).toBe(7);
    expect(data.agents).toHaveLength(1);
    expect(data.containers).toEqual([]);
  });
});

afterAll(() => {
  mock.restore();
});
