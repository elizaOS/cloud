import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

const mockListByOrganization = mock();
const mockCreateApiKey = mock();
const mockResolveStewardContainerUrl = mock();
const mockCacheIsAvailable = mock();
const mockCacheSet = mock();
const mockLoggerDebug = mock();
const mockLoggerError = mock();
const mockLoggerInfo = mock();
const mockLoggerWarn = mock();

mock.module("@/lib/services/api-keys", () => ({
  apiKeysService: {
    listByOrganization: mockListByOrganization,
    create: mockCreateApiKey,
  },
}));

mock.module("@/lib/services/docker-sandbox-utils", () => ({
  resolveStewardContainerUrl: mockResolveStewardContainerUrl,
}));

mock.module("@/lib/cache/client", () => ({
  cache: {
    isAvailable: mockCacheIsAvailable,
    set: mockCacheSet,
  },
}));

mock.module("@/lib/utils/logger", () => ({
  logger: {
    debug: mockLoggerDebug,
    error: mockLoggerError,
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
  },
}));

mock.module("@/db/repositories/milady-sandboxes", () => ({
  miladySandboxesRepository: {
    update: mock(),
  },
}));

mock.module("@/lib/services/milady-sandbox", () => ({
  miladySandboxService: {
    getAgent: mock(),
    provision: mock(),
    shutdown: mock(),
  },
}));

import {
  prepareManagedMiladyBaseEnvironment,
  prepareManagedMiladySharedEnvironment,
  resolveManagedAllowedOrigins,
} from "../../lib/services/managed-milady-config";
import { prepareManagedMiladyEnvironment as prepareDockerManagedMiladyEnvironment } from "../../lib/services/managed-milady-env";

const ORIGINAL_ENV = { ...process.env };
const mutableEnv = process.env as Record<string, string | undefined>;

describe("managed Milady environment configuration", () => {
  beforeEach(() => {
    mockListByOrganization.mockReset();
    mockCreateApiKey.mockReset();
    mockResolveStewardContainerUrl.mockReset();
    mockCacheIsAvailable.mockReset();
    mockCacheSet.mockReset();
    mockLoggerDebug.mockReset();
    mockLoggerError.mockReset();
    mockLoggerInfo.mockReset();
    mockLoggerWarn.mockReset();

    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, ORIGINAL_ENV);
    mutableEnv.NODE_ENV = "production";
    mutableEnv.NEXT_PUBLIC_APP_URL = "https://cloud.example.com/";
    mutableEnv.NEXT_PUBLIC_MILADY_APP_URL = "https://app.example.com/";
    mutableEnv.MILADY_MANAGED_ALLOWED_ORIGINS =
      "https://extra.example.com/path, not-a-url, https://extra-two.example.com";

    mockListByOrganization.mockResolvedValue([
      {
        user_id: "user-1",
        is_active: true,
        expires_at: null,
        key: "ek_live_existing",
      },
    ]);
    mockCreateApiKey.mockResolvedValue({ plainKey: "ek_live_created" });
    mockResolveStewardContainerUrl.mockReturnValue("http://host.docker.internal:3200");
    mockCacheIsAvailable.mockReturnValue(false);
  });

  test("builds a normalized shared managed environment with /api/v1 base url", async () => {
    const result = await prepareManagedMiladyBaseEnvironment({
      existingEnv: {
        MILADY_ALLOWED_ORIGINS: "https://existing.example.com/path",
      },
      organizationId: "org-1",
      userId: "user-1",
    });

    expect(result.userApiKey).toBe("ek_live_existing");
    expect(result.environmentVars.ELIZAOS_CLOUD_BASE_URL).toBe("https://cloud.example.com/api/v1");
    expect(result.environmentVars.MILADY_API_TOKEN).toMatch(/^milady_[a-f0-9]{32}$/);
    expect(result.environmentVars.MILADY_ALLOWED_ORIGINS.split(",").sort()).toEqual(
      [
        "https://app.example.com",
        "https://cloud.example.com",
        "https://existing.example.com",
        "https://extra.example.com",
        "https://extra-two.example.com",
      ].sort(),
    );
    expect(mockCreateApiKey).not.toHaveBeenCalled();
  });

  test("docker-backed managed env layers steward vars on top of the shared base env", async () => {
    const result = await prepareDockerManagedMiladyEnvironment({
      existingEnv: {
        MILADY_API_TOKEN: "milady_existing_token",
      },
      organizationId: "org-1",
      userId: "user-1",
      sandboxId: "sandbox-123",
    });

    expect(result.apiToken).toBe("milady_existing_token");
    expect(result.changed).toBe(true);
    expect(result.environmentVars.ELIZAOS_CLOUD_BASE_URL).toBe("https://cloud.example.com/api/v1");
    expect(result.environmentVars.STEWARD_API_URL).toBe("http://host.docker.internal:3200");
    expect(result.environmentVars.STEWARD_AGENT_ID).toBe("sandbox-123");
  });

  test("shared managed env helper reuses the shared base env contract", async () => {
    const result = await prepareManagedMiladySharedEnvironment({
      existingEnv: {
        MILADY_API_TOKEN: "milady_launch_token",
        MILADY_ALLOWED_ORIGINS: "https://existing.example.com",
      },
      organizationId: "org-1",
      userId: "user-1",
    });

    expect(result.apiToken).toBe("milady_launch_token");
    expect(result.environmentVars.ELIZAOS_CLOUD_BASE_URL).toBe("https://cloud.example.com/api/v1");
    expect(result.environmentVars.MILADY_ALLOWED_ORIGINS.split(",").sort()).toEqual(
      resolveManagedAllowedOrigins().concat("https://existing.example.com").sort(),
    );
  });
});

afterAll(() => {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
  mock.restore();
});
