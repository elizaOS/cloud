import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const mockProvisionStewardPlatformUser = mock();
const mockIsStewardPlatformConfigured = mock();
const mockUpdateUser = mock();
const mockUpsertStewardIdentity = mock();
const mockListPendingStewardProvisioning = mock();

mock.module("@/lib/services/steward-platform-users", () => ({
  provisionStewardPlatformUser: mockProvisionStewardPlatformUser,
  isStewardPlatformConfigured: mockIsStewardPlatformConfigured,
}));

mock.module("@/lib/services/users", () => ({
  usersService: {
    update: mockUpdateUser,
    upsertStewardIdentity: mockUpsertStewardIdentity,
  },
}));

mock.module("@/db/repositories/users", () => ({
  usersRepository: {
    listPendingStewardProvisioning: mockListPendingStewardProvisioning,
  },
}));

mock.module("@/lib/utils/logger", () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
  },
}));

const { backfillStewardUserMappings, ensureStewardUserMappingForUser } = await import(
  "@/lib/services/steward-user-migration"
);

afterAll(() => {
  mock.restore();
});

describe("steward-user-migration", () => {
  beforeEach(() => {
    mockProvisionStewardPlatformUser.mockReset();
    mockIsStewardPlatformConfigured.mockReset().mockReturnValue(true);
    mockUpdateUser.mockReset().mockResolvedValue(undefined);
    mockUpsertStewardIdentity.mockReset().mockResolvedValue(undefined);
    mockListPendingStewardProvisioning.mockReset();
  });

  it("skips provisioning when the user already has a Steward mapping", async () => {
    const result = await ensureStewardUserMappingForUser({
      id: "user-1",
      email: "user@example.com",
      email_verified: true,
      name: "User",
      steward_user_id: "stwd-user-1",
      is_anonymous: false,
    });

    expect(result).toBe("stwd-user-1");
    expect(mockProvisionStewardPlatformUser).not.toHaveBeenCalled();
  });

  it("provisions a Steward user and stores the local mapping", async () => {
    mockProvisionStewardPlatformUser.mockResolvedValue({
      userId: "stwd-user-1",
      isNew: true,
    });

    const result = await ensureStewardUserMappingForUser({
      id: "user-1",
      email: "user@example.com",
      email_verified: true,
      name: "User",
      steward_user_id: null,
      is_anonymous: false,
    });

    expect(result).toBe("stwd-user-1");
    expect(mockProvisionStewardPlatformUser).toHaveBeenCalledWith({
      email: "user@example.com",
      emailVerified: true,
      name: "User",
    });
    expect(mockUpdateUser).toHaveBeenCalledWith("user-1", {
      steward_user_id: "stwd-user-1",
      updated_at: expect.any(Date),
    });
    expect(mockUpsertStewardIdentity).toHaveBeenCalledWith("user-1", "stwd-user-1");
  });

  it("throws when Steward platform auth is required but not configured", async () => {
    mockIsStewardPlatformConfigured.mockReturnValue(false);

    await expect(
      ensureStewardUserMappingForUser(
        {
          id: "user-1",
          email: "user@example.com",
          email_verified: true,
          name: "User",
          steward_user_id: null,
          is_anonymous: false,
        },
        { required: true },
      ),
    ).rejects.toThrow("STEWARD_PLATFORM_KEYS is not configured");
  });

  it("backfills pending users in batches", async () => {
    mockListPendingStewardProvisioning
      .mockResolvedValueOnce([
        {
          id: "user-1",
          email: "user1@example.com",
          email_verified: true,
          name: "User One",
          steward_user_id: null,
        },
        {
          id: "user-2",
          email: "user2@example.com",
          email_verified: false,
          name: "User Two",
          steward_user_id: null,
        },
      ])
      .mockResolvedValueOnce([]);
    mockProvisionStewardPlatformUser
      .mockResolvedValueOnce({ userId: "stwd-user-1", isNew: true })
      .mockResolvedValueOnce({ userId: "stwd-user-2", isNew: false });

    const summary = await backfillStewardUserMappings({ batchSize: 2, maxUsers: 2 });

    expect(summary).toEqual({
      scanned: 2,
      provisioned: 2,
      failed: 0,
      dryRun: false,
    });
    expect(mockListPendingStewardProvisioning).toHaveBeenCalledTimes(1);
  });
});
