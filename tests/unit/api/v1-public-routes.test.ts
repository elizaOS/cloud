import { beforeEach, describe, expect, mock, test } from "bun:test";

import { NextRequest } from "next/server";

import {
  flushMicrotasks,
  jsonRequest,
  routeParams,
} from "./route-test-helpers";

const mockRequireAuth = mock();
const mockRequireAuthWithOrg = mock();
const mockRequireAuthOrApiKey = mock();
const mockRequireAuthOrApiKeyWithOrg = mock();
const mockUsersUpdate = mock();
const mockApiKeysListByOrganization = mock();
const mockApiKeysCreate = mock();
const mockApiKeysGetById = mock();
const mockApiKeysUpdate = mock();
const mockApiKeysDelete = mock();
const mockApiKeysGenerate = mock();
const mockListByOrganizationAndStatus = mock();
const mockProviderListModels = mock();
const mockGetAnonymousUser = mock();
const mockGetOrCreateAnonymousUser = mock();
const mockGetCachedMergedModelCatalog = mock();

mock.module("@/lib/auth", () => ({
  requireAuth: mockRequireAuth,
  requireAuthWithOrg: mockRequireAuthWithOrg,
  requireAuthOrApiKey: mockRequireAuthOrApiKey,
  requireAuthOrApiKeyWithOrg: mockRequireAuthOrApiKeyWithOrg,
}));

mock.module("@/lib/services/users", () => ({
  usersService: {
    update: mockUsersUpdate,
  },
}));

mock.module("@/lib/services/api-keys", () => ({
  apiKeysService: {
    listByOrganization: mockApiKeysListByOrganization,
    create: mockApiKeysCreate,
    getById: mockApiKeysGetById,
    update: mockApiKeysUpdate,
    delete: mockApiKeysDelete,
    generateApiKey: mockApiKeysGenerate,
  },
}));

mock.module("@/lib/services/generations", () => ({
  generationsService: {
    listByOrganizationAndStatus: mockListByOrganizationAndStatus,
  },
}));

mock.module("@/lib/providers", () => ({
  getProvider: () => ({
    listModels: mockProviderListModels,
  }),
}));

mock.module("@/lib/auth-anonymous", () => ({
  getAnonymousUser: mockGetAnonymousUser,
  getOrCreateAnonymousUser: mockGetOrCreateAnonymousUser,
}));

mock.module("@/lib/services/model-catalog", () => ({
  getCachedMergedModelCatalog: mockGetCachedMergedModelCatalog,
}));

mock.module("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: (...args: unknown[]) => unknown) => handler,
  RateLimitPresets: {
    STANDARD: {},
    CRITICAL: {},
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

import { GET as getUser, PATCH as patchUser } from "@/app/api/v1/user/route";
import {
  GET as getApiKeys,
  POST as postApiKeys,
} from "@/app/api/v1/api-keys/route";
import {
  DELETE as deleteApiKey,
  PATCH as patchApiKey,
} from "@/app/api/v1/api-keys/[id]/route";
import { POST as regenerateApiKey } from "@/app/api/v1/api-keys/[id]/regenerate/route";
import { GET as getGallery } from "@/app/api/v1/gallery/route";
import { GET as getModels } from "@/app/api/v1/models/route";

const baseUser = {
  id: "user-1",
  email: "shaw@example.com",
  name: "Shaw",
  avatar: "https://example.com/avatar.png",
  nickname: "builder",
  work_function: "developer",
  preferences: "fast",
  response_notifications: true,
  email_notifications: false,
  role: "owner",
  email_verified: true,
  wallet_address: "0xabc",
  wallet_chain_type: "evm",
  wallet_verified: true,
  is_active: true,
  organization_id: "org-1",
  organization: {
    id: "org-1",
    name: "Org One",
    slug: "org-one",
    credit_balance: "42.50",
  },
  created_at: new Date("2026-01-01T00:00:00.000Z"),
  updated_at: new Date("2026-01-02T00:00:00.000Z"),
};

const baseApiKey = {
  id: "key-1",
  name: "Primary",
  description: "Main key",
  organization_id: "org-1",
  key_prefix: "eliza_123",
  permissions: ["chat:write"],
  rate_limit: 1000,
  is_active: true,
  expires_at: new Date("2026-06-01T00:00:00.000Z"),
  created_at: new Date("2026-01-01T00:00:00.000Z"),
};

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockRequireAuthWithOrg.mockReset();
  mockRequireAuthOrApiKey.mockReset();
  mockRequireAuthOrApiKeyWithOrg.mockReset();
  mockUsersUpdate.mockReset();
  mockApiKeysListByOrganization.mockReset();
  mockApiKeysCreate.mockReset();
  mockApiKeysGetById.mockReset();
  mockApiKeysUpdate.mockReset();
  mockApiKeysDelete.mockReset();
  mockApiKeysGenerate.mockReset();
  mockListByOrganizationAndStatus.mockReset();
  mockProviderListModels.mockReset();
  mockGetAnonymousUser.mockReset();
  mockGetOrCreateAnonymousUser.mockReset();
  mockGetCachedMergedModelCatalog.mockReset();

  mockRequireAuth.mockResolvedValue(baseUser);
  mockRequireAuthWithOrg.mockResolvedValue(baseUser);
  mockRequireAuthOrApiKey.mockResolvedValue({
    user: baseUser,
    apiKey: { id: "ak-1" },
  });
  mockRequireAuthOrApiKeyWithOrg.mockResolvedValue({
    user: baseUser,
    apiKey: { id: "ak-1" },
  });

  mockUsersUpdate.mockResolvedValue({
    ...baseUser,
    updated_at: new Date("2026-01-03T00:00:00.000Z"),
  });
  mockApiKeysListByOrganization.mockResolvedValue([baseApiKey]);
  mockApiKeysCreate.mockResolvedValue({
    apiKey: baseApiKey,
    plainKey: "eliza_plain",
  });
  mockApiKeysGetById.mockResolvedValue(baseApiKey);
  mockApiKeysUpdate.mockResolvedValue(baseApiKey);
  mockApiKeysDelete.mockResolvedValue(undefined);
  mockApiKeysGenerate.mockReturnValue({
    key: "eliza_new",
    hash: "new_hash",
    prefix: "eliza_new",
  });
  mockProviderListModels.mockResolvedValue(
    Response.json({
      object: "list",
      data: [{ id: "gpt-4o-mini", object: "model" }],
    }),
  );
  mockGetCachedMergedModelCatalog.mockResolvedValue([
    {
      id: "openai/gpt-4o-mini",
      object: "model",
      created: 0,
      owned_by: "openai",
    },
  ]);
  mockGetAnonymousUser.mockResolvedValue({
    user: { id: "anon-1" },
    session: { id: "session-1" },
  });
  mockGetOrCreateAnonymousUser.mockResolvedValue({
    user: { id: "anon-1" },
    session: { id: "session-1" },
  });
});

describe("User API", () => {
  test("GET returns the authenticated user profile", async () => {
    const response = await getUser(
      new NextRequest("http://localhost:3000/api/v1/user"),
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.email).toBe(baseUser.email);
    expect(body.data.organization.slug).toBe(baseUser.organization.slug);
  });

  test("GET maps auth failures to 401", async () => {
    mockRequireAuth.mockRejectedValue(
      new Error("Unauthorized: Authentication required"),
    );

    const response = await getUser(
      new NextRequest("http://localhost:3000/api/v1/user"),
    );
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.error).toContain("Authentication required");
  });

  test("PATCH validates profile updates and normalizes empty avatars", async () => {
    const response = await patchUser(
      jsonRequest("http://localhost:3000/api/v1/user", "PATCH", {
        name: "Updated Shaw",
        avatar: "",
        response_notifications: false,
      }),
    );

    expect(response.status).toBe(200);
    expect(mockUsersUpdate).toHaveBeenCalledWith(baseUser.id, {
      name: "Updated Shaw",
      avatar: null,
      response_notifications: false,
    });
  });

  test("PATCH rejects invalid payloads", async () => {
    const response = await patchUser(
      jsonRequest("http://localhost:3000/api/v1/user", "PATCH", {
        work_function: "astronaut",
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Validation error");
  });
});

describe("API Keys API", () => {
  test("GET lists keys for the organization", async () => {
    const response = await getApiKeys();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.keys).toHaveLength(1);
    expect(mockApiKeysListByOrganization).toHaveBeenCalledWith("org-1");
  });

  test("POST validates create input", async () => {
    const response = await postApiKeys(
      jsonRequest("http://localhost:3000/api/v1/api-keys", "POST", {
        name: "",
        rate_limit: 0,
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Validation error");
  });

  test("POST trims and transforms create input", async () => {
    const response = await postApiKeys(
      jsonRequest("http://localhost:3000/api/v1/api-keys", "POST", {
        name: "  Build Bot  ",
        description: "  deploy key  ",
        permissions: ["chat:write", "images:write"],
        rate_limit: 2500,
        expires_at: "2026-07-01T12:00:00.000Z",
      }),
    );

    expect(response.status).toBe(201);
    expect(mockApiKeysCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Build Bot",
        description: "deploy key",
        permissions: ["chat:write", "images:write"],
        rate_limit: 2500,
        expires_at: new Date("2026-07-01T12:00:00.000Z"),
      }),
    );
  });

  test("PATCH rejects empty updates", async () => {
    const response = await patchApiKey(
      jsonRequest("http://localhost:3000/api/v1/api-keys/key-1", "PATCH", {}),
      routeParams({ id: "key-1" }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Validation error");
  });

  test("PATCH blocks cross-organization updates", async () => {
    mockApiKeysGetById.mockResolvedValue({
      ...baseApiKey,
      organization_id: "org-2",
    });

    const response = await patchApiKey(
      jsonRequest("http://localhost:3000/api/v1/api-keys/key-1", "PATCH", {
        name: "Renamed",
      }),
      routeParams({ id: "key-1" }),
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Forbidden");
  });

  test("PATCH updates validated key fields", async () => {
    const response = await patchApiKey(
      jsonRequest("http://localhost:3000/api/v1/api-keys/key-1", "PATCH", {
        description: "",
        rate_limit: 500,
        is_active: false,
      }),
      routeParams({ id: "key-1" }),
    );

    expect(response.status).toBe(200);
    expect(mockApiKeysUpdate).toHaveBeenCalledWith("key-1", {
      description: null,
      rate_limit: 500,
      is_active: false,
    });
  });

  test("DELETE returns 404 when the key does not exist", async () => {
    mockApiKeysGetById.mockResolvedValue(undefined);

    const response = await deleteApiKey(
      jsonRequest("http://localhost:3000/api/v1/api-keys/missing", "DELETE"),
      routeParams({ id: "missing" }),
    );

    expect(response.status).toBe(404);
  });

  test("DELETE deletes owned keys", async () => {
    const response = await deleteApiKey(
      jsonRequest("http://localhost:3000/api/v1/api-keys/key-1", "DELETE"),
      routeParams({ id: "key-1" }),
    );

    expect(response.status).toBe(200);
    expect(mockApiKeysDelete).toHaveBeenCalledWith("key-1");
  });

  test("POST regenerate returns the new plain key", async () => {
    mockApiKeysUpdate.mockResolvedValue({
      ...baseApiKey,
      key_prefix: "eliza_new",
    });

    const response = await regenerateApiKey(
      jsonRequest(
        "http://localhost:3000/api/v1/api-keys/key-1/regenerate",
        "POST",
      ),
      routeParams({ id: "key-1" }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.plainKey).toBe("eliza_new");
    expect(mockApiKeysUpdate).toHaveBeenCalledWith(
      "key-1",
      expect.objectContaining({
        key: "eliza_new",
        key_hash: "new_hash",
        key_prefix: "eliza_new",
      }),
    );
  });
});

describe("Gallery API", () => {
  test("GET validates query parameters", async () => {
    const response = await getGallery(
      new NextRequest("http://localhost:3000/api/v1/gallery?type=audio"),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Validation error");
  });

  test("GET filters missing storage URLs and computes hasMore using the extra row", async () => {
    mockListByOrganizationAndStatus.mockResolvedValue([
      {
        id: "gen-1",
        type: "image",
        storage_url: "https://blob/1.png",
        thumbnail_url: null,
        prompt: "one",
        negative_prompt: null,
        model: "model-a",
        provider: "provider-a",
        status: "completed",
        created_at: new Date("2026-01-01T00:00:00.000Z"),
        completed_at: new Date("2026-01-01T00:01:00.000Z"),
        dimensions: { width: 512, height: 512 },
        mime_type: "image/png",
        file_size: BigInt(10),
        metadata: null,
      },
      {
        id: "gen-2",
        type: "image",
        storage_url: null,
        thumbnail_url: null,
        prompt: "two",
        negative_prompt: null,
        model: "model-a",
        provider: "provider-a",
        status: "completed",
        created_at: new Date("2026-01-01T00:00:00.000Z"),
        completed_at: null,
        dimensions: null,
        mime_type: "image/png",
        file_size: null,
        metadata: null,
      },
      {
        id: "gen-3",
        type: "image",
        storage_url: "https://blob/3.png",
        thumbnail_url: null,
        prompt: "three",
        negative_prompt: null,
        model: "model-a",
        provider: "provider-a",
        status: "completed",
        created_at: new Date("2026-01-01T00:00:00.000Z"),
        completed_at: null,
        dimensions: null,
        mime_type: "image/png",
        file_size: null,
        metadata: null,
      },
    ]);

    const response = await getGallery(
      new NextRequest("http://localhost:3000/api/v1/gallery?type=image&limit=1"),
    );

    expect(response.status).toBe(200);
    expect(mockListByOrganizationAndStatus).toHaveBeenCalledWith(
      "org-1",
      "completed",
      expect.objectContaining({
        userId: "user-1",
        type: "image",
        limit: 2,
        offset: 0,
      }),
    );

    const body = await response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].url).toBe("https://blob/1.png");
    expect(body.hasMore).toBe(true);
  });
});

describe("Models API", () => {
  test("GET returns provider models with cache headers", async () => {
    const response = await getModels(
      new NextRequest("http://localhost:3000/api/v1/models"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=3600");

    const body = await response.json();
    expect(body.data[0].id).toBe("openai/gpt-4o-mini");
  });

  test("GET creates an anonymous session when auth is missing", async () => {
    mockRequireAuthOrApiKey.mockRejectedValue(
      new Error("Unauthorized: Authentication required"),
    );
    mockGetAnonymousUser.mockResolvedValue(null);

    const response = await getModels(
      new NextRequest("http://localhost:3000/api/v1/models"),
    );

    expect(response.status).toBe(200);
    expect(mockGetOrCreateAnonymousUser).toHaveBeenCalled();

    await flushMicrotasks();
  });
});
