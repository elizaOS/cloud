import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockLimit = mock();
const mockWhereRead = mock(() => ({ limit: mockLimit }));
const mockFrom = mock(() => ({ where: mockWhereRead }));
const mockSelect = mock(() => ({ from: mockFrom }));

const mockWhereWrite = mock();
const mockSet = mock(() => ({ where: mockWhereWrite }));
const mockUpdate = mock(() => ({ set: mockSet }));

const mockGetDecryptedValue = mock();
const mockRotate = mock();
const mockGetProvider = mock();
const mockRefreshOAuth2Token = mock();
const mockIncrementOAuthVersion = mock();

mock.module("drizzle-orm", () => ({
  and: (...values: unknown[]) => values,
  eq: (...values: unknown[]) => values,
}));

mock.module("@/db/client", () => ({
  dbRead: {
    select: mockSelect,
  },
  dbWrite: {
    update: mockUpdate,
  },
}));

mock.module("@/db/schemas/platform-credentials", () => ({
  platformCredentials: {
    id: "id",
    organization_id: "organization_id",
    platform: { enumValues: ["linear"] },
  },
}));

mock.module("@/lib/services/secrets", () => ({
  secretsService: {
    getDecryptedValue: mockGetDecryptedValue,
    rotate: mockRotate,
  },
}));

mock.module("@/lib/services/secrets/encryption", () => ({
  DecryptionError: class DecryptionError extends Error {},
}));

mock.module("@/lib/utils/logger", () => ({
  logger: {
    error: () => {},
    info: () => {},
    warn: () => {},
  },
}));

mock.module("@/lib/services/oauth/provider-registry", () => ({
  getProvider: mockGetProvider,
}));

mock.module("@/lib/services/oauth/providers", () => ({
  refreshOAuth2Token: mockRefreshOAuth2Token,
}));

mock.module("@/lib/services/oauth/cache-version", () => ({
  incrementOAuthVersion: mockIncrementOAuthVersion,
}));

describe("generic OAuth adapter refresh rotation failures", () => {
  beforeEach(() => {
    mockLimit.mockReset();
    mockWhereRead.mockClear();
    mockFrom.mockClear();
    mockSelect.mockClear();
    mockWhereWrite.mockReset();
    mockSet.mockReset();
    mockUpdate.mockClear();
    mockGetDecryptedValue.mockReset();
    mockRotate.mockReset();
    mockGetProvider.mockReset();
    mockRefreshOAuth2Token.mockReset();
    mockIncrementOAuthVersion.mockReset();

    mockLimit.mockResolvedValue([
      {
        id: "conn-1",
        organization_id: "org-1",
        platform: "linear",
        status: "active",
        scopes: [],
        token_expires_at: new Date(Date.now() - 60_000),
        access_token_secret_id: "access-secret-1",
        refresh_token_secret_id: "refresh-secret-1",
      },
    ]);
    mockGetProvider.mockReturnValue({ id: "linear" });
    mockGetDecryptedValue.mockResolvedValue("refresh-token");
    mockRefreshOAuth2Token.mockResolvedValue({
      accessToken: "new-access-token",
      newRefreshToken: "new-refresh-token",
      expiresIn: 3600,
    });
    mockRotate
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("kms unavailable"));
    mockWhereWrite.mockResolvedValue(undefined);
    mockIncrementOAuthVersion.mockResolvedValue(2);
  });

  test("marks the connection as errored and aborts when refresh token storage fails", async () => {
    const { createGenericAdapter } = await import(
      `@/lib/services/oauth/connection-adapters/generic-adapter?t=${Date.now()}`
    );

    const adapter = createGenericAdapter("linear");

    await expect(adapter.getToken("org-1", "conn-1")).rejects.toThrow(
      "Failed to refresh linear token",
    );

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
      }),
    );
  });
});
