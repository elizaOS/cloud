import { beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Client } from "pg";

const mockGetByPrivyId = mock();
const mockGetByPrivyIdForWrite = mock();
const mockGetPrivyIdentityForWrite = mock();
const mockUpdateUser = mock();
const mockCreateUser = mock();
const mockGetByEmailWithOrganization = mock();
const mockUpsertPrivyIdentity = mock();
const mockGetBySlug = mock();
const mockCreateOrganization = mock();
const mockUpdateOrganization = mock();
const mockDeleteOrganization = mock();
const mockAddCredits = mock();
const mockFindPendingInviteByEmail = mock();
const mockMarkInviteAccepted = mock();
const mockDeleteUserRecord = mock();
const mockSendWelcomeEmail = mock();
const mockLogUserSignup = mock();
const mockListApiKeys = mock();
const mockCreateApiKey = mock();
const mockCheckSignupAbuse = mock();
const mockRecordSignupMetadata = mock();
const mockListCharactersByOrg = mock();
const mockCreateCharacter = mock();

function makeUniqueViolationError(
  message: string,
  constraint: string,
): Error & { code: string; constraint: string } {
  return Object.assign(new Error(message), {
    code: "23505",
    constraint,
  });
}

function readMigrationFixture(relativePath: string): string {
  try {
    return readFileSync(new URL(relativePath, import.meta.url), "utf8");
  } catch (error) {
    throw new Error(
      `Failed to load migration fixture ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

mock.module("@/lib/services/users", () => ({
  usersService: {
    getByPrivyId: mockGetByPrivyId,
    getByPrivyIdForWrite: mockGetByPrivyIdForWrite,
    getPrivyIdentityForWrite: mockGetPrivyIdentityForWrite,
    update: mockUpdateUser,
    create: mockCreateUser,
    getByEmailWithOrganization: mockGetByEmailWithOrganization,
    upsertPrivyIdentity: mockUpsertPrivyIdentity,
  },
}));

mock.module("@/lib/services/organizations", () => ({
  organizationsService: {
    getBySlug: mockGetBySlug,
    create: mockCreateOrganization,
    update: mockUpdateOrganization,
    delete: mockDeleteOrganization,
  },
}));

mock.module("@/lib/services/email", () => ({
  emailService: {
    sendWelcomeEmail: mockSendWelcomeEmail,
  },
}));

mock.module("@/lib/services/invites", () => ({
  invitesService: {
    findPendingInviteByEmail: mockFindPendingInviteByEmail,
  },
}));

mock.module("@/lib/services/discord", () => ({
  discordService: {
    logUserSignup: mockLogUserSignup,
  },
}));

mock.module("@/lib/services/api-keys", () => ({
  apiKeysService: {
    listByOrganization: mockListApiKeys,
    create: mockCreateApiKey,
  },
}));

mock.module("@/lib/services/credits", () => ({
  creditsService: {
    addCredits: mockAddCredits,
  },
}));

mock.module("@/db/repositories", () => ({
  organizationInvitesRepository: {
    markAsAccepted: mockMarkInviteAccepted,
  },
  usersRepository: {
    delete: mockDeleteUserRecord,
  },
}));

mock.module("@/lib/services/abuse-detection", () => ({
  abuseDetectionService: {
    checkSignupAbuse: mockCheckSignupAbuse,
    recordSignupMetadata: mockRecordSignupMetadata,
  },
}));

mock.module("@/lib/utils/default-user-avatar", () => ({
  getRandomUserAvatar: () => "avatar.png",
}));

mock.module("@/lib/services/characters/characters", () => ({
  charactersService: {
    listByOrganization: mockListCharactersByOrg,
    create: mockCreateCharacter,
  },
}));

mock.module("@/lib/utils/default-eliza-character", () => ({
  getDefaultElizaCharacterData: () => ({
    name: "Eliza",
    bio: ["test bio"],
    system: "test system",
    avatar_url: "https://example.com/eliza.png",
    character_data: {},
    settings: {},
    is_template: false,
    is_public: false,
    source: "cloud",
  }),
}));

describe("syncUserFromPrivy", () => {
  beforeEach(() => {
    mockGetByPrivyId.mockReset();
    mockGetByPrivyIdForWrite.mockReset();
    mockGetPrivyIdentityForWrite.mockReset();
    mockUpdateUser.mockReset();
    mockCreateUser.mockReset();
    mockGetByEmailWithOrganization.mockReset();
    mockUpsertPrivyIdentity.mockReset();
    mockGetBySlug.mockReset();
    mockCreateOrganization.mockReset();
    mockUpdateOrganization.mockReset();
    mockDeleteOrganization.mockReset();
    mockAddCredits.mockReset();
    mockFindPendingInviteByEmail.mockReset();
    mockMarkInviteAccepted.mockReset();
    mockDeleteUserRecord.mockReset();
    mockSendWelcomeEmail.mockReset();
    mockLogUserSignup.mockReset();
    mockListApiKeys.mockReset();
    mockCreateApiKey.mockReset();
    mockCheckSignupAbuse.mockReset();
    mockRecordSignupMetadata.mockReset();
    mockListCharactersByOrg.mockReset();
    mockCreateCharacter.mockReset();

    mockGetByEmailWithOrganization.mockResolvedValue(undefined);
    mockGetByPrivyIdForWrite.mockResolvedValue(undefined);
    mockGetPrivyIdentityForWrite.mockResolvedValue(undefined);
    mockFindPendingInviteByEmail.mockResolvedValue(undefined);
    mockDeleteUserRecord.mockResolvedValue(undefined);
    mockGetBySlug.mockResolvedValue(undefined);
    mockCreateOrganization.mockResolvedValue({
      id: "org-new",
      name: "New Org",
    });
    mockAddCredits.mockResolvedValue(undefined);
    mockListApiKeys.mockResolvedValue([]);
    mockCreateApiKey.mockResolvedValue(undefined);
    mockSendWelcomeEmail.mockResolvedValue(undefined);
    mockLogUserSignup.mockResolvedValue(undefined);
    mockCheckSignupAbuse.mockResolvedValue({ allowed: true });
    mockRecordSignupMetadata.mockResolvedValue(undefined);
    mockListCharactersByOrg.mockResolvedValue([]);
    mockCreateCharacter.mockResolvedValue({ id: "char-default", name: "Eliza" });
    process.env.INITIAL_FREE_CREDITS = "5";
  });

  test("upserts user identity after creating a new Privy user", async () => {
    const createdUser = {
      id: "user-new",
      privy_user_id: "did:privy:new-user",
      organization_id: "org-new",
    };
    const hydratedUser = {
      ...createdUser,
      email: "new@example.com",
      name: "new",
      wallet_address: null,
      role: "owner",
      organization: {
        id: "org-new",
        name: "new's Organization",
        billing_email: null,
      },
    };

    mockGetByPrivyId.mockResolvedValueOnce(undefined);
    mockGetByPrivyIdForWrite.mockResolvedValue(hydratedUser);
    mockCreateUser.mockResolvedValue(createdUser);

    const { syncUserFromPrivy } = await import("@/lib/privy-sync");

    const result = await syncUserFromPrivy({
      id: "did:privy:new-user",
      email: { address: "new@example.com" },
      linkedAccounts: [],
    } as never);

    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        privy_user_id: "did:privy:new-user",
        email: "new@example.com",
        organization_id: "org-new",
      }),
    );
    expect(mockUpsertPrivyIdentity).toHaveBeenCalledWith("user-new", "did:privy:new-user");
    expect(result).toMatchObject(hydratedUser);
  });

  test("upserts user identity before reading linked accounts by new Privy id", async () => {
    const existingUser = {
      id: "user-existing",
      privy_user_id: "did:privy:old-user",
      email: "link@example.com",
      organization_id: "org-existing",
      organization: {
        id: "org-existing",
        name: "Existing Org",
      },
    };
    const linkedUser = {
      ...existingUser,
      privy_user_id: "did:privy:new-user",
    };

    mockGetByPrivyId.mockResolvedValueOnce(undefined);
    mockGetByPrivyIdForWrite.mockResolvedValue(linkedUser);
    mockGetByEmailWithOrganization.mockResolvedValue(existingUser);
    mockUpdateUser.mockResolvedValue({
      ...existingUser,
      privy_user_id: "did:privy:new-user",
    });

    const { syncUserFromPrivy } = await import("@/lib/privy-sync");

    const result = await syncUserFromPrivy({
      id: "did:privy:new-user",
      email: { address: "link@example.com" },
      linkedAccounts: [],
    } as never);

    expect(mockUpdateUser).toHaveBeenCalledWith(
      "user-existing",
      expect.objectContaining({
        privy_user_id: "did:privy:new-user",
      }),
    );
    expect(mockUpsertPrivyIdentity).toHaveBeenCalledWith("user-existing", "did:privy:new-user");
    expect(result).toMatchObject(linkedUser);
  });

  test("restores the previous Privy ID when account linking upsert fails", async () => {
    const existingUser = {
      id: "user-existing",
      privy_user_id: "did:privy:old-user",
      email: "link@example.com",
      organization_id: "org-existing",
      organization: {
        id: "org-existing",
        name: "Existing Org",
      },
    };

    mockGetByPrivyId.mockResolvedValueOnce(undefined);
    mockGetByEmailWithOrganization.mockResolvedValue(existingUser);
    mockUpdateUser
      .mockResolvedValueOnce({
        ...existingUser,
        privy_user_id: "did:privy:new-user",
      })
      .mockResolvedValueOnce(existingUser);
    mockUpsertPrivyIdentity.mockRejectedValue(
      makeUniqueViolationError(
        'duplicate key value violates unique constraint "user_identities_privy_user_id_unique"',
        "user_identities_privy_user_id_unique",
      ),
    );

    const { syncUserFromPrivy } = await import("@/lib/privy-sync");

    await expect(
      syncUserFromPrivy({
        id: "did:privy:new-user",
        email: { address: "link@example.com" },
        linkedAccounts: [],
      } as never),
    ).rejects.toThrow("user_identities_privy_user_id_unique");

    expect(mockUpdateUser).toHaveBeenNthCalledWith(
      1,
      "user-existing",
      expect.objectContaining({
        privy_user_id: "did:privy:new-user",
      }),
    );
    expect(mockUpdateUser).toHaveBeenNthCalledWith(
      2,
      "user-existing",
      expect.objectContaining({
        privy_user_id: "did:privy:old-user",
      }),
    );
    expect(mockGetByPrivyIdForWrite).not.toHaveBeenCalled();
  });

  test("preserves the original account-link error when rollback update fails", async () => {
    const existingUser = {
      id: "user-existing",
      privy_user_id: "did:privy:old-user",
      email: "link@example.com",
      organization_id: "org-existing",
      organization: {
        id: "org-existing",
        name: "Existing Org",
      },
    };

    mockGetByPrivyId.mockResolvedValueOnce(undefined);
    mockGetByEmailWithOrganization.mockResolvedValue(existingUser);
    mockUpdateUser
      .mockResolvedValueOnce({
        ...existingUser,
        privy_user_id: "did:privy:new-user",
      })
      .mockRejectedValueOnce(new Error("rollback update failed"));
    mockUpsertPrivyIdentity.mockRejectedValue(
      makeUniqueViolationError(
        'duplicate key value violates unique constraint "user_identities_privy_user_id_unique"',
        "user_identities_privy_user_id_unique",
      ),
    );

    const { syncUserFromPrivy } = await import("@/lib/privy-sync");

    await expect(
      syncUserFromPrivy({
        id: "did:privy:new-user",
        email: { address: "link@example.com" },
        linkedAccounts: [],
      } as never),
    ).rejects.toThrow("user_identities_privy_user_id_unique");

    expect(mockUpdateUser).toHaveBeenNthCalledWith(
      1,
      "user-existing",
      expect.objectContaining({
        privy_user_id: "did:privy:new-user",
      }),
    );
    expect(mockUpdateUser).toHaveBeenNthCalledWith(
      2,
      "user-existing",
      expect.objectContaining({
        privy_user_id: "did:privy:old-user",
      }),
    );
  });

  test("rolls back invited user creation when identity upsert fails", async () => {
    mockFindPendingInviteByEmail.mockResolvedValue({
      id: "invite-1",
      organization_id: "org-existing",
      invited_role: "member",
    });
    mockGetByPrivyId.mockResolvedValue(undefined);
    mockCreateUser.mockResolvedValue({
      id: "user-invite",
      privy_user_id: "did:privy:invite-user",
      organization_id: "org-existing",
    });
    mockUpsertPrivyIdentity.mockRejectedValue(
      makeUniqueViolationError(
        'duplicate key value violates unique constraint "user_identities_phone_number_unique"',
        "user_identities_phone_number_unique",
      ),
    );

    const { syncUserFromPrivy } = await import("@/lib/privy-sync");

    await expect(
      syncUserFromPrivy({
        id: "did:privy:invite-user",
        email: { address: "invite@example.com" },
        linkedAccounts: [],
      } as never),
    ).rejects.toThrow("user_identities_phone_number_unique");

    expect(mockDeleteUserRecord).toHaveBeenCalledWith("user-invite");
    expect(mockMarkInviteAccepted).not.toHaveBeenCalled();
  });

  test("preserves the original invite error when rollback delete fails", async () => {
    mockFindPendingInviteByEmail.mockResolvedValue({
      id: "invite-1",
      organization_id: "org-existing",
      invited_role: "member",
    });
    mockGetByPrivyId.mockResolvedValue(undefined);
    mockCreateUser.mockResolvedValue({
      id: "user-invite",
      privy_user_id: "did:privy:invite-user",
      organization_id: "org-existing",
    });
    mockUpsertPrivyIdentity.mockRejectedValue(
      makeUniqueViolationError(
        'duplicate key value violates unique constraint "user_identities_phone_number_unique"',
        "user_identities_phone_number_unique",
      ),
    );
    mockDeleteUserRecord.mockRejectedValueOnce(new Error("delete failed"));

    const { syncUserFromPrivy } = await import("@/lib/privy-sync");

    await expect(
      syncUserFromPrivy({
        id: "did:privy:invite-user",
        email: { address: "invite@example.com" },
        linkedAccounts: [],
      } as never),
    ).rejects.toThrow("user_identities_phone_number_unique");

    expect(mockDeleteUserRecord).toHaveBeenCalledWith("user-invite");
    expect(mockMarkInviteAccepted).not.toHaveBeenCalled();
  });

  test("keeps invited user when Privy projection conflict is recoverable from primary", async () => {
    const recoveredUser = {
      id: "user-invite",
      privy_user_id: "did:privy:invite-user",
      email: "invite@example.com",
      name: "invite",
      wallet_address: null,
      role: "member",
      organization_id: "org-existing",
      organization: {
        id: "org-existing",
        name: "Existing Org",
        billing_email: null,
      },
    };

    mockFindPendingInviteByEmail.mockResolvedValue({
      id: "invite-1",
      organization_id: "org-existing",
      invited_role: "member",
    });
    mockGetByPrivyId.mockResolvedValue(undefined);
    mockCreateUser.mockResolvedValue({
      id: "user-invite",
      privy_user_id: "did:privy:invite-user",
      organization_id: "org-existing",
    });
    mockUpsertPrivyIdentity.mockRejectedValue(
      makeUniqueViolationError(
        'duplicate key value violates unique constraint "user_identities_privy_user_id_unique"',
        "user_identities_privy_user_id_unique",
      ),
    );
    mockGetPrivyIdentityForWrite.mockResolvedValue({
      user_id: "user-invite",
      privy_user_id: "did:privy:invite-user",
    });
    mockGetByPrivyIdForWrite.mockResolvedValue(recoveredUser);

    const { syncUserFromPrivy } = await import("@/lib/privy-sync");

    const result = await syncUserFromPrivy({
      id: "did:privy:invite-user",
      email: { address: "invite@example.com" },
      linkedAccounts: [],
    } as never);

    expect(result).toMatchObject(recoveredUser);
    expect(mockDeleteUserRecord).not.toHaveBeenCalled();
    expect(mockMarkInviteAccepted).toHaveBeenCalledWith("invite-1", "user-invite");
  });

  test("rolls back invited user when Privy projection conflict lacks verified projection ownership", async () => {
    mockFindPendingInviteByEmail.mockResolvedValue({
      id: "invite-1",
      organization_id: "org-existing",
      invited_role: "member",
    });
    mockGetByPrivyId.mockResolvedValue(undefined);
    mockCreateUser.mockResolvedValue({
      id: "user-invite",
      privy_user_id: "did:privy:invite-user",
      organization_id: "org-existing",
    });
    mockUpsertPrivyIdentity.mockRejectedValue(
      makeUniqueViolationError(
        'duplicate key value violates unique constraint "user_identities_privy_user_id_unique"',
        "user_identities_privy_user_id_unique",
      ),
    );
    mockGetPrivyIdentityForWrite.mockResolvedValue({
      user_id: "user-other",
      privy_user_id: "did:privy:invite-user",
    });

    const { syncUserFromPrivy } = await import("@/lib/privy-sync");

    await expect(
      syncUserFromPrivy({
        id: "did:privy:invite-user",
        email: { address: "invite@example.com" },
        linkedAccounts: [],
      } as never),
    ).rejects.toThrow("user_identities_privy_user_id_unique");

    expect(mockDeleteUserRecord).toHaveBeenCalledWith("user-invite");
    expect(mockMarkInviteAccepted).not.toHaveBeenCalled();
  });

  test("keeps newly created signup when Privy projection conflict is recoverable from primary", async () => {
    const recoveredUser = {
      id: "user-new",
      privy_user_id: "did:privy:new-user",
      email: "new@example.com",
      name: "new",
      wallet_address: null,
      role: "owner",
      organization_id: "org-new",
      organization: {
        id: "org-new",
        name: "new's Organization",
        billing_email: null,
      },
    };

    mockGetByPrivyId.mockResolvedValue(undefined);
    mockCreateUser.mockResolvedValue({
      id: "user-new",
      privy_user_id: "did:privy:new-user",
      organization_id: "org-new",
    });
    mockUpsertPrivyIdentity.mockRejectedValue(
      makeUniqueViolationError(
        'duplicate key value violates unique constraint "user_identities_privy_user_id_unique"',
        "user_identities_privy_user_id_unique",
      ),
    );
    mockGetPrivyIdentityForWrite.mockResolvedValue({
      user_id: "user-new",
      privy_user_id: "did:privy:new-user",
    });
    mockGetByPrivyIdForWrite.mockResolvedValue(recoveredUser);

    const { syncUserFromPrivy } = await import("@/lib/privy-sync");

    const result = await syncUserFromPrivy({
      id: "did:privy:new-user",
      email: { address: "new@example.com" },
      linkedAccounts: [],
    } as never);

    expect(result).toMatchObject(recoveredUser);
    expect(mockDeleteUserRecord).not.toHaveBeenCalled();
    expect(mockDeleteOrganization).not.toHaveBeenCalled();
  });

  test("rolls back newly created signup when Privy projection conflict lacks verified projection ownership", async () => {
    mockGetByPrivyId.mockResolvedValue(undefined);
    mockCreateUser.mockResolvedValue({
      id: "user-new",
      privy_user_id: "did:privy:new-user",
      organization_id: "org-new",
    });
    mockUpsertPrivyIdentity.mockRejectedValue(
      makeUniqueViolationError(
        'duplicate key value violates unique constraint "user_identities_privy_user_id_unique"',
        "user_identities_privy_user_id_unique",
      ),
    );
    mockGetPrivyIdentityForWrite.mockResolvedValue({
      user_id: "user-other",
      privy_user_id: "did:privy:new-user",
    });

    const { syncUserFromPrivy } = await import("@/lib/privy-sync");

    await expect(
      syncUserFromPrivy({
        id: "did:privy:new-user",
        email: { address: "new@example.com" },
        linkedAccounts: [],
      } as never),
    ).rejects.toThrow("user_identities_privy_user_id_unique");

    expect(mockDeleteUserRecord).toHaveBeenCalledWith("user-new");
    expect(mockDeleteOrganization).toHaveBeenCalledWith("org-new");
  });

  test("preserves the original signup error when rollback delete fails", async () => {
    mockGetByPrivyId.mockResolvedValue(undefined);
    mockCreateUser.mockResolvedValue({
      id: "user-new",
      privy_user_id: "did:privy:new-user",
      organization_id: "org-new",
    });
    mockUpsertPrivyIdentity.mockRejectedValue(
      makeUniqueViolationError(
        'duplicate key value violates unique constraint "user_identities_privy_user_id_unique"',
        "user_identities_privy_user_id_unique",
      ),
    );
    mockGetPrivyIdentityForWrite.mockResolvedValue({
      user_id: "user-other",
      privy_user_id: "did:privy:new-user",
    });
    mockDeleteUserRecord.mockRejectedValueOnce(new Error("delete failed"));

    const { syncUserFromPrivy } = await import("@/lib/privy-sync");

    await expect(
      syncUserFromPrivy({
        id: "did:privy:new-user",
        email: { address: "new@example.com" },
        linkedAccounts: [],
      } as never),
    ).rejects.toThrow("user_identities_privy_user_id_unique");

    expect(mockDeleteUserRecord).toHaveBeenCalledWith("user-new");
    expect(mockDeleteOrganization).toHaveBeenCalledWith("org-new");
  });

  test("does not treat non-unique privy_user_id errors as recoverable", async () => {
    mockGetByPrivyId.mockResolvedValue(undefined);
    mockCreateUser.mockResolvedValue({
      id: "user-new",
      privy_user_id: "did:privy:new-user",
      organization_id: "org-new",
    });
    mockUpsertPrivyIdentity.mockRejectedValue(new Error("Column privy_user_id cannot be null"));

    const { syncUserFromPrivy } = await import("@/lib/privy-sync");

    await expect(
      syncUserFromPrivy({
        id: "did:privy:new-user",
        email: { address: "new@example.com" },
        linkedAccounts: [],
      } as never),
    ).rejects.toThrow("Column privy_user_id cannot be null");

    expect(mockDeleteUserRecord).toHaveBeenCalledWith("user-new");
    expect(mockDeleteOrganization).toHaveBeenCalledWith("org-new");
    expect(mockGetPrivyIdentityForWrite).not.toHaveBeenCalled();
  });
});

describe.skipIf(!process.env.DATABASE_URL || process.env.SKIP_DB_DEPENDENT === "1")(
  "0049/0050 user identity backfill migrations",
  () => {
    test("repairs chained stale Privy claims without changing unrelated identity fields", async () => {
      const repairExistingClaimsSql = readMigrationFixture(
        "../../db/migrations/0049_repair_existing_user_identity_privy_claims.sql",
      );
      const backfillMissingIdentitiesSql = readMigrationFixture(
        "../../db/migrations/0050_backfill_user_identities_from_users.sql",
      );
      const client = new Client({
        connectionString: process.env.DATABASE_URL,
      });

      await client.connect();

      try {
        // These temp tables intentionally shadow the real table names for this
        // session only. This test must never point DATABASE_URL at production.
        await client.query(`
          CREATE TEMP TABLE "users" (
            "id" uuid PRIMARY KEY,
            "privy_user_id" text,
            "is_anonymous" boolean DEFAULT false NOT NULL,
            "anonymous_session_id" text,
            "expires_at" timestamp,
            "telegram_id" text,
            "telegram_username" text,
            "telegram_first_name" text,
            "telegram_photo_url" text,
            "phone_number" text,
            "phone_verified" boolean,
            "discord_id" text,
            "discord_username" text,
            "discord_global_name" text,
            "discord_avatar_url" text,
            "whatsapp_id" text,
            "whatsapp_name" text,
            "created_at" timestamp DEFAULT now() NOT NULL,
            "updated_at" timestamp DEFAULT now() NOT NULL
          );
        `);
        await client.query(`
          CREATE TEMP TABLE "user_identities" (
            "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            "user_id" uuid UNIQUE NOT NULL,
            "privy_user_id" text UNIQUE,
            "is_anonymous" boolean DEFAULT false NOT NULL,
            "anonymous_session_id" text UNIQUE,
            "expires_at" timestamp,
            "telegram_id" text UNIQUE,
            "telegram_username" text,
            "telegram_first_name" text,
            "telegram_photo_url" text,
            "phone_number" text UNIQUE,
            "phone_verified" boolean DEFAULT false,
            "discord_id" text UNIQUE,
            "discord_username" text,
            "discord_global_name" text,
            "discord_avatar_url" text,
            "whatsapp_id" text UNIQUE,
            "whatsapp_name" text,
            "created_at" timestamp DEFAULT now() NOT NULL,
            "updated_at" timestamp DEFAULT now() NOT NULL
          );
        `);

        await client.query(
          `
            INSERT INTO "users" ("id", "privy_user_id")
            VALUES
              ($1, NULL),
              ($2, $4),
              ($3, $5);
          `,
          [
            "00000000-0000-0000-0000-000000000001",
            "00000000-0000-0000-0000-000000000002",
            "00000000-0000-0000-0000-000000000003",
            "did:privy:z",
            "did:privy:y",
          ],
        );
        await client.query(
          `
            INSERT INTO "user_identities" (
              "id",
              "user_id",
              "privy_user_id",
              "telegram_id",
              "telegram_username"
            )
            VALUES
              ($1, $3, $5, NULL, NULL),
              ($2, $4, $6, 'tg-keep', 'kept-name');
          `,
          [
            "10000000-0000-0000-0000-000000000001",
            "10000000-0000-0000-0000-000000000002",
            "00000000-0000-0000-0000-000000000001",
            "00000000-0000-0000-0000-000000000002",
            "did:privy:z",
            "did:privy:y",
          ],
        );

        await client.query(repairExistingClaimsSql);
        await client.query(backfillMissingIdentitiesSql);

        const identityRows = await client.query<{
          user_id: string;
          privy_user_id: string | null;
          telegram_id: string | null;
          telegram_username: string | null;
        }>(`
          SELECT "user_id", "privy_user_id", "telegram_id", "telegram_username"
          FROM "user_identities"
          ORDER BY "user_id"
        `);

        expect(identityRows.rows).toEqual([
          {
            user_id: "00000000-0000-0000-0000-000000000001",
            privy_user_id: null,
            telegram_id: null,
            telegram_username: null,
          },
          {
            user_id: "00000000-0000-0000-0000-000000000002",
            privy_user_id: "did:privy:z",
            telegram_id: "tg-keep",
            telegram_username: "kept-name",
          },
          {
            user_id: "00000000-0000-0000-0000-000000000003",
            privy_user_id: "did:privy:y",
            telegram_id: null,
            telegram_username: null,
          },
        ]);
      } finally {
        await client.end();
      }
    });
  },
);
