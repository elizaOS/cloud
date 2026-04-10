import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

const mockRequireAuthWithOrg = mock();
const mockListByOrganization = mock();
const mockCreate = mock();
const mockDeactivateUserKeysByName = mock();

mock.module("@/lib/auth", () => ({
  requireAuthWithOrg: mockRequireAuthWithOrg,
}));

mock.module("@/lib/services/api-keys", () => ({
  apiKeysService: {
    listByOrganization: mockListByOrganization,
    create: mockCreate,
    deactivateUserKeysByName: mockDeactivateUserKeysByName,
  },
}));

mock.module("@/lib/utils/logger", () => ({
  logger: {
    error: () => {},
  },
}));

import { GET as getExplorerApiKey } from "@/app/api/v1/api-keys/explorer/route";

const baseUser = {
  id: "user-1",
  organization_id: "org-1",
};

const baseExplorerKey = {
  id: "key-1",
  name: "API Explorer Key",
  description: "Explorer key",
  organization_id: "org-1",
  user_id: "user-1",
  key: "eliza_existing_secret",
  key_prefix: "eliza_exist",
  key_hash: "hash-1",
  permissions: [],
  rate_limit: 100,
  is_active: true,
  usage_count: 3,
  expires_at: null,
  last_used_at: null,
  created_at: new Date("2026-04-01T00:00:00.000Z"),
  updated_at: new Date("2026-04-01T00:00:00.000Z"),
};

beforeEach(() => {
  mockRequireAuthWithOrg.mockReset();
  mockListByOrganization.mockReset();
  mockCreate.mockReset();
  mockDeactivateUserKeysByName.mockReset();

  mockRequireAuthWithOrg.mockResolvedValue(baseUser);
  mockListByOrganization.mockResolvedValue([baseExplorerKey]);
  mockCreate.mockResolvedValue({
    apiKey: {
      ...baseExplorerKey,
      id: "key-2",
      key_prefix: "eliza_new",
      created_at: new Date("2026-04-09T00:00:00.000Z"),
      usage_count: 0,
      last_used_at: null,
    },
    plainKey: "eliza_new_secret",
  });
  mockDeactivateUserKeysByName.mockResolvedValue(undefined);
});

afterAll(() => {
  mock.restore();
});

describe("GET /api/v1/api-keys/explorer", () => {
  test("returns the existing active explorer key when it is still usable", async () => {
    const response = await getExplorerApiKey();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.apiKey.key).toBe("eliza_existing_secret");
    expect(body.isNew).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockDeactivateUserKeysByName).not.toHaveBeenCalled();
  });

  test("creates a fresh explorer key when the stored one is inactive", async () => {
    mockListByOrganization.mockResolvedValue([
      {
        ...baseExplorerKey,
        is_active: false,
      },
    ]);

    const response = await getExplorerApiKey();
    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body.apiKey.key).toBe("eliza_new_secret");
    expect(body.isNew).toBe(true);
    expect(mockDeactivateUserKeysByName).toHaveBeenCalledWith("user-1", "API Explorer Key");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  test("creates a fresh explorer key when the stored key format is invalid", async () => {
    mockListByOrganization.mockResolvedValue([
      {
        ...baseExplorerKey,
        key: "prefix_only",
      },
    ]);

    const response = await getExplorerApiKey();
    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body.apiKey.key).toBe("eliza_new_secret");
    expect(mockDeactivateUserKeysByName).toHaveBeenCalledWith("user-1", "API Explorer Key");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
