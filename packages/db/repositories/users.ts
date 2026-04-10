import { and, asc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { dbRead, dbWrite } from "../helpers";
import { type Organization } from "../schemas/organizations";
import { type UserIdentity, userIdentities } from "../schemas/user-identities";
import { type NewUser, type User, users } from "../schemas/users";

export type { NewUser, User };

/**
 * User with associated organization data.
 */
export interface UserWithOrganization extends User {
  organization: Organization | null;
}

type CompatibleUserWithoutWhatsApp = Omit<User, "whatsapp_id" | "whatsapp_name">;
type CompatibleUserRow = CompatibleUserWithoutWhatsApp & {
  whatsapp_id?: User["whatsapp_id"];
  whatsapp_name?: User["whatsapp_name"];
};

// NOTE: keep this in sync with db/schemas/users.ts. Auth-path compatibility
// reads intentionally avoid selecting users.whatsapp_* when older deployments
// have not run that migration yet.
const COMPATIBLE_USER_SELECT = {
  id: users.id,
  email: users.email,
  email_verified: users.email_verified,
  wallet_address: users.wallet_address,
  wallet_chain_type: users.wallet_chain_type,
  wallet_verified: users.wallet_verified,
  name: users.name,
  avatar: users.avatar,
  organization_id: users.organization_id,
  role: users.role,
  steward_user_id: users.steward_user_id,
  privy_user_id: users.privy_user_id,
  telegram_id: users.telegram_id,
  telegram_username: users.telegram_username,
  telegram_first_name: users.telegram_first_name,
  telegram_photo_url: users.telegram_photo_url,
  discord_id: users.discord_id,
  discord_username: users.discord_username,
  discord_global_name: users.discord_global_name,
  discord_avatar_url: users.discord_avatar_url,
  phone_number: users.phone_number,
  phone_verified: users.phone_verified,
  is_anonymous: users.is_anonymous,
  anonymous_session_id: users.anonymous_session_id,
  expires_at: users.expires_at,
  nickname: users.nickname,
  work_function: users.work_function,
  preferences: users.preferences,
  email_notifications: users.email_notifications,
  response_notifications: users.response_notifications,
  is_active: users.is_active,
  created_at: users.created_at,
  updated_at: users.updated_at,
};

const COMPATIBLE_USER_SELECT_WITH_WHATSAPP = {
  ...COMPATIBLE_USER_SELECT,
  whatsapp_id: users.whatsapp_id,
  whatsapp_name: users.whatsapp_name,
};

type WhatsAppColumnSupport = {
  users: boolean;
  userIdentities: boolean;
};

/**
 * Repository for user database operations.
 *
 * Read operations → dbRead (read replica)
 * Write operations → dbWrite (primary)
 */
export class UsersRepository {
  private static readWhatsAppColumnSupportPromise: Promise<WhatsAppColumnSupport> | undefined;
  private static writeWhatsAppColumnSupportPromise: Promise<WhatsAppColumnSupport> | undefined;

  static resetWhatsAppColumnSupportCacheForTests(): void {
    UsersRepository.readWhatsAppColumnSupportPromise = undefined;
    UsersRepository.writeWhatsAppColumnSupportPromise = undefined;
  }
  // ============================================================================
  // READ OPERATIONS (use read replica)
  // ============================================================================

  /**
   * Finds a user by ID.
   */
  async findById(id: string): Promise<User | undefined> {
    return await dbRead.query.users.findFirst({
      where: eq(users.id, id),
    });
  }

  /**
   * Finds a user by email address.
   */
  async findByEmail(email: string): Promise<User | undefined> {
    return await dbRead.query.users.findFirst({
      where: eq(users.email, email),
    });
  }

  /**
   * Finds a user by Steward user ID with organization data.
   * Prefer the identity projection, but fall back to the legacy users column
   * while backfill is still converging.
   */
  async findByStewardIdWithOrganization(
    stewardUserId: string,
  ): Promise<UserWithOrganization | undefined> {
    return this.findByStewardIdWithOrganizationUsingDb(dbRead, "read", stewardUserId);
  }

  /**
   * Finds a user by Privy user ID with organization data.
   * Prefer the identity projection, which is the steady-state auth lookup,
   * but fall back to the legacy users column while backfill or projection
   * repair may still be catching up.
   */
  async findByPrivyIdWithOrganization(
    privyUserId: string,
  ): Promise<UserWithOrganization | undefined> {
    return this.findByPrivyIdWithOrganizationUsingDb(dbRead, "read", privyUserId);
  }

  /**
   * Finds a user by Privy user ID with organization data from primary.
   * Use after writes when replica lag could hide the just-written identity row.
   * On primary, prefer the canonical users column first so stale projection rows
   * do not shadow the just-written auth state during create or link flows.
   * This is safe because those flows write users.privy_user_id immediately and
   * only treat projection conflicts as recovered after separately verifying the
   * primary projection row ownership.
   */
  async findByPrivyIdWithOrganizationForWrite(
    privyUserId: string,
  ): Promise<UserWithOrganization | undefined> {
    // Try canonical users.privy_user_id first (just-written auth state)
    const user = await this.findCompatibleUserWithOrganizationByPrivyId(
      dbWrite,
      "write",
      privyUserId,
    );

    if (user) {
      return user;
    }

    // Fallback: look up via identity projection (two-query approach for safety)
    const identityUserId = await this.findIdentityUserIdByPrivyId(dbWrite, privyUserId);

    if (!identityUserId) {
      return undefined;
    }

    return await this.findCompatibleUserWithOrganizationById(dbWrite, "write", identityUserId);
  }

  /**
   * Finds a user by Steward user ID with organization data from primary.
   * Use after writes when replica lag could hide the just-written identity row.
   */
  async findByStewardIdWithOrganizationForWrite(
    stewardUserId: string,
  ): Promise<UserWithOrganization | undefined> {
    const user = await this.findCompatibleUserWithOrganizationByStewardId(
      dbWrite,
      "write",
      stewardUserId,
    );

    if (user) {
      return user;
    }

    const identityUserId = await this.findIdentityUserIdByStewardId(dbWrite, stewardUserId);

    if (!identityUserId) {
      return undefined;
    }

    return await this.findCompatibleUserWithOrganizationById(dbWrite, "write", identityUserId);
  }

  /**
   * Finds a user by ID with organization data.
   */
  async findWithOrganization(userId: string): Promise<UserWithOrganization | undefined> {
    const user = await dbRead.query.users.findFirst({
      where: eq(users.id, userId),
      with: {
        organization: true,
      },
    });

    return user as UserWithOrganization | undefined;
  }

  /**
   * Finds a user by email with organization data.
   */
  async findByEmailWithOrganization(email: string): Promise<UserWithOrganization | undefined> {
    const user = await dbRead.query.users.findFirst({
      where: eq(users.email, email),
      with: {
        organization: true,
      },
    });

    return user as UserWithOrganization | undefined;
  }

  /**
   * Finds a user by wallet address (case-insensitive).
   */
  async findByWalletAddress(walletAddress: string): Promise<User | undefined> {
    return await dbRead.query.users.findFirst({
      where: eq(users.wallet_address, walletAddress.toLowerCase()),
    });
  }

  /**
   * Finds a user by Telegram ID (via identity table).
   */
  async findByTelegramId(telegramId: string): Promise<User | undefined> {
    const identity = await dbRead.query.userIdentities.findFirst({
      where: eq(userIdentities.telegram_id, telegramId),
    });
    if (!identity) return undefined;
    return this.findById(identity.user_id);
  }

  /**
   * Finds a user by Telegram ID with organization data (via identity table).
   */
  async findByTelegramIdWithOrganization(
    telegramId: string,
  ): Promise<UserWithOrganization | undefined> {
    const identity = await dbRead.query.userIdentities.findFirst({
      where: eq(userIdentities.telegram_id, telegramId),
    });
    if (!identity) return undefined;
    return this.findWithOrganization(identity.user_id);
  }

  /**
   * Finds a user by phone number (E.164 format, via identity table).
   */
  async findByPhoneNumber(phoneNumber: string): Promise<User | undefined> {
    const identity = await dbRead.query.userIdentities.findFirst({
      where: eq(userIdentities.phone_number, phoneNumber),
    });
    if (!identity) return undefined;
    return this.findById(identity.user_id);
  }

  /**
   * Finds a user by phone number with organization data (via identity table).
   */
  async findByPhoneNumberWithOrganization(
    phoneNumber: string,
  ): Promise<UserWithOrganization | undefined> {
    const identity = await dbRead.query.userIdentities.findFirst({
      where: eq(userIdentities.phone_number, phoneNumber),
    });
    if (!identity) return undefined;
    return this.findWithOrganization(identity.user_id);
  }

  /**
   * Finds a user by Discord ID (via identity table).
   */
  async findByDiscordId(discordId: string): Promise<User | undefined> {
    const identity = await dbRead.query.userIdentities.findFirst({
      where: eq(userIdentities.discord_id, discordId),
    });
    if (!identity) return undefined;
    return this.findById(identity.user_id);
  }

  /**
   * Finds a user by Discord ID with organization data (via identity table).
   */
  async findByDiscordIdWithOrganization(
    discordId: string,
  ): Promise<UserWithOrganization | undefined> {
    const identity = await dbRead.query.userIdentities.findFirst({
      where: eq(userIdentities.discord_id, discordId),
    });
    if (!identity) return undefined;
    return this.findWithOrganization(identity.user_id);
  }

  /**
   * Finds a user by WhatsApp ID (via identity table).
   */
  async findByWhatsAppId(whatsappId: string): Promise<User | undefined> {
    const identity = await dbRead.query.userIdentities.findFirst({
      where: eq(userIdentities.whatsapp_id, whatsappId),
    });
    if (!identity) return undefined;
    return this.findById(identity.user_id);
  }

  /**
   * Finds a user by WhatsApp ID with organization data (via identity table).
   */
  async findByWhatsAppIdWithOrganization(
    whatsappId: string,
  ): Promise<UserWithOrganization | undefined> {
    const identity = await dbRead.query.userIdentities.findFirst({
      where: eq(userIdentities.whatsapp_id, whatsappId),
    });
    if (!identity) return undefined;
    return this.findWithOrganization(identity.user_id);
  }

  /**
   * Finds a user by wallet address with organization data.
   */
  async findByWalletAddressWithOrganization(
    walletAddress: string,
  ): Promise<UserWithOrganization | undefined> {
    const user = await dbRead.query.users.findFirst({
      where: eq(users.wallet_address, walletAddress.toLowerCase()),
      with: {
        organization: true,
      },
    });

    return user as UserWithOrganization | undefined;
  }

  /**
   * Lists all users in an organization.
   */
  async listByOrganization(organizationId: string): Promise<User[]> {
    return await dbRead.query.users.findMany({
      where: eq(users.organization_id, organizationId),
    });
  }

  // ============================================================================
  // WRITE OPERATIONS (use primary)
  // ============================================================================

  /**
   * Creates a new user.
   */
  async create(data: NewUser): Promise<User> {
    const [user] = await dbWrite.insert(users).values(data).returning();
    return user;
  }

  /**
   * Updates an existing user.
   */
  async update(id: string, data: Partial<NewUser>): Promise<User | undefined> {
    const [updated] = await dbWrite
      .update(users)
      .set({
        ...data,
        updated_at: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  /**
   * Finds the identity projection row for a user from primary.
   * Use after writes when replica lag could return a stale identity row.
   */
  async findIdentityByUserIdForWrite(userId: string): Promise<UserIdentity | undefined> {
    return await dbWrite.query.userIdentities.findFirst({
      where: eq(userIdentities.user_id, userId),
    });
  }

  /**
   * Refreshes WhatsApp projection fields from the canonical users row.
   * This is used on the same-Privy-ID fast path so WhatsApp relinks do not
   * require a full projection rewrite on every authenticated request.
   */
  async refreshWhatsAppProjectionForWrite(userId: string): Promise<void> {
    const support = await this.getWhatsAppColumnSupport(dbWrite, "write");

    if (!support.users || !support.userIdentities) {
      return;
    }

    const [canonicalIdentity] = await dbWrite
      .select({
        whatsapp_id: users.whatsapp_id,
        whatsapp_name: users.whatsapp_name,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!canonicalIdentity) {
      return;
    }

    if (canonicalIdentity.whatsapp_id) {
      const conflictingProjection = await dbWrite.query.userIdentities.findFirst({
        where: and(
          eq(userIdentities.whatsapp_id, canonicalIdentity.whatsapp_id),
          ne(userIdentities.user_id, userId),
        ),
      });

      if (conflictingProjection) {
        return;
      }
    }

    await dbWrite
      .update(userIdentities)
      .set({
        whatsapp_id: canonicalIdentity.whatsapp_id ?? null,
        whatsapp_name: canonicalIdentity.whatsapp_id
          ? (canonicalIdentity.whatsapp_name ?? null)
          : null,
        updated_at: new Date(),
      })
      .where(eq(userIdentities.user_id, userId));
  }

  /**
   * Finds the identity projection row for a Privy user ID from primary.
   * Use when recovery must verify the projection row ownership directly.
   */
  async findIdentityByPrivyIdForWrite(privyUserId: string): Promise<UserIdentity | undefined> {
    return await dbWrite.query.userIdentities.findFirst({
      where: eq(userIdentities.privy_user_id, privyUserId),
    });
  }

  /**
   * Finds the identity projection row for a Steward user ID from primary.
   * Use when recovery or auth linking must verify projection row ownership directly.
   */
  async findIdentityByStewardIdForWrite(stewardUserId: string): Promise<UserIdentity | undefined> {
    return await dbWrite.query.userIdentities.findFirst({
      where: eq(userIdentities.steward_user_id, stewardUserId),
    });
  }

  private async findByPrivyIdWithOrganizationUsingDb(
    database: typeof dbRead,
    databaseRole: "read" | "write",
    privyUserId: string,
  ): Promise<UserWithOrganization | undefined> {
    // Intentionally avoid Drizzle's full-table relation hydration here.
    // Some deployed environments still lag older identity columns on users,
    // so auth lookups only select the columns they actually need and fill any
    // missing legacy fields from schema detection.
    const identityUserId = await this.findIdentityUserIdByPrivyId(database, privyUserId);

    if (identityUserId) {
      return await this.findCompatibleUserWithOrganizationById(
        database,
        databaseRole,
        identityUserId,
      );
    }

    return await this.findCompatibleUserWithOrganizationByPrivyId(
      database,
      databaseRole,
      privyUserId,
    );
  }

  private async findByStewardIdWithOrganizationUsingDb(
    database: typeof dbRead,
    databaseRole: "read" | "write",
    stewardUserId: string,
  ): Promise<UserWithOrganization | undefined> {
    const identityUserId = await this.findIdentityUserIdByStewardId(database, stewardUserId);

    if (identityUserId) {
      return await this.findCompatibleUserWithOrganizationById(
        database,
        databaseRole,
        identityUserId,
      );
    }

    return await this.findCompatibleUserWithOrganizationByStewardId(
      database,
      databaseRole,
      stewardUserId,
    );
  }

  private async getWhatsAppColumnSupport(
    database: typeof dbRead,
    databaseRole: "read" | "write",
  ): Promise<WhatsAppColumnSupport> {
    const cachedPromise =
      databaseRole === "read"
        ? UsersRepository.readWhatsAppColumnSupportPromise
        : UsersRepository.writeWhatsAppColumnSupportPromise;

    if (cachedPromise) {
      return await cachedPromise;
    }

    const supportPromise = (async (): Promise<WhatsAppColumnSupport> => {
      const result = await database.execute<{
        table_name: string;
        column_name: string;
      }>(sql`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('users', 'user_identities')
          AND column_name IN ('whatsapp_id', 'whatsapp_name')
      `);

      const usersColumns = new Set<string>();
      const userIdentityColumns = new Set<string>();

      for (const row of result.rows) {
        if (row.table_name === "users") {
          usersColumns.add(row.column_name);
        }

        if (row.table_name === "user_identities") {
          userIdentityColumns.add(row.column_name);
        }
      }

      return {
        users: usersColumns.has("whatsapp_id") && usersColumns.has("whatsapp_name"),
        userIdentities:
          userIdentityColumns.has("whatsapp_id") && userIdentityColumns.has("whatsapp_name"),
      };
    })();

    const cachedSupportPromise = supportPromise.catch((error) => {
      if (databaseRole === "read") {
        UsersRepository.readWhatsAppColumnSupportPromise = undefined;
      } else {
        UsersRepository.writeWhatsAppColumnSupportPromise = undefined;
      }

      throw error;
    });

    if (databaseRole === "read") {
      UsersRepository.readWhatsAppColumnSupportPromise = cachedSupportPromise;
    } else {
      UsersRepository.writeWhatsAppColumnSupportPromise = cachedSupportPromise;
    }

    return await cachedSupportPromise;
  }

  private async findIdentityUserIdByPrivyId(
    database: typeof dbRead,
    privyUserId: string,
  ): Promise<string | undefined> {
    const [identity] = await database
      .select({ user_id: userIdentities.user_id })
      .from(userIdentities)
      .where(eq(userIdentities.privy_user_id, privyUserId))
      .limit(1);

    return identity?.user_id;
  }

  private async findIdentityUserIdByStewardId(
    database: typeof dbRead,
    stewardUserId: string,
  ): Promise<string | undefined> {
    const [identity] = await database
      .select({ user_id: userIdentities.user_id })
      .from(userIdentities)
      .where(eq(userIdentities.steward_user_id, stewardUserId))
      .limit(1);

    return identity?.user_id;
  }

  private normalizeCompatibleUser(user: CompatibleUserRow, hasUsersWhatsAppColumns: boolean): User {
    return {
      ...user,
      whatsapp_id: hasUsersWhatsAppColumns ? (user.whatsapp_id ?? null) : null,
      whatsapp_name: hasUsersWhatsAppColumns ? (user.whatsapp_name ?? null) : null,
    };
  }

  private async findCompatibleUserWithOrganizationById(
    database: typeof dbRead,
    databaseRole: "read" | "write",
    userId: string,
  ): Promise<UserWithOrganization | undefined> {
    const support = await this.getWhatsAppColumnSupport(database, databaseRole);
    const [user] = support.users
      ? await database
          .select(COMPATIBLE_USER_SELECT_WITH_WHATSAPP)
          .from(users)
          .where(eq(users.id, userId))
          .limit(1)
      : await database
          .select(COMPATIBLE_USER_SELECT)
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

    if (!user) {
      return undefined;
    }

    return await this.attachOrganization(
      database,
      this.normalizeCompatibleUser(user as CompatibleUserRow, support.users),
    );
  }

  private async findCompatibleUserWithOrganizationByPrivyId(
    database: typeof dbRead,
    databaseRole: "read" | "write",
    privyUserId: string,
  ): Promise<UserWithOrganization | undefined> {
    const support = await this.getWhatsAppColumnSupport(database, databaseRole);
    const [user] = support.users
      ? await database
          .select(COMPATIBLE_USER_SELECT_WITH_WHATSAPP)
          .from(users)
          .where(eq(users.privy_user_id, privyUserId))
          .limit(1)
      : await database
          .select(COMPATIBLE_USER_SELECT)
          .from(users)
          .where(eq(users.privy_user_id, privyUserId))
          .limit(1);

    if (!user) {
      return undefined;
    }

    return await this.attachOrganization(
      database,
      this.normalizeCompatibleUser(user as CompatibleUserRow, support.users),
    );
  }

  private async findCompatibleUserWithOrganizationByStewardId(
    database: typeof dbRead,
    databaseRole: "read" | "write",
    stewardUserId: string,
  ): Promise<UserWithOrganization | undefined> {
    const support = await this.getWhatsAppColumnSupport(database, databaseRole);
    const [user] = support.users
      ? await database
          .select(COMPATIBLE_USER_SELECT_WITH_WHATSAPP)
          .from(users)
          .where(eq(users.steward_user_id, stewardUserId))
          .limit(1)
      : await database
          .select(COMPATIBLE_USER_SELECT)
          .from(users)
          .where(eq(users.steward_user_id, stewardUserId))
          .limit(1);

    if (!user) {
      return undefined;
    }

    return await this.attachOrganization(
      database,
      this.normalizeCompatibleUser(user as CompatibleUserRow, support.users),
    );
  }

  private async attachOrganization(
    database: typeof dbRead,
    user: User,
  ): Promise<UserWithOrganization> {
    const organizationId = user.organization_id;

    if (!organizationId) {
      return {
        ...user,
        organization: null,
      };
    }

    // Keep organization hydration on the same relational query path used by the
    // pre-regression auth lookup. Direct table selects changed numeric formatting
    // for credit_balance in the failing regression case.
    const relationalUser = (await database.query.users.findFirst({
      columns: {
        id: true,
      },
      where: eq(users.id, user.id),
      with: {
        organization: true,
      },
    })) as { organization: Organization | null } | undefined;

    return {
      ...user,
      organization: relationalUser?.organization ?? null,
    };
  }

  /**
   * Upserts the Privy identity projection for a user.
   */
  async upsertPrivyIdentity(userId: string, privyUserId: string): Promise<UserIdentity> {
    const support = await this.getWhatsAppColumnSupport(dbWrite, "write");
    const whatsappInsertColumns = support.userIdentities
      ? sql`,
        whatsapp_id,
        whatsapp_name`
      : sql``;
    const whatsappSelectColumns = support.userIdentities
      ? support.users
        ? sql`,
        u.whatsapp_id,
        u.whatsapp_name`
        : sql`,
        NULL::text,
        NULL::text`
      : sql``;

    // UserIdentity uses the table's snake_case column names, so the raw RETURNING
    // payload shape matches the inferred Drizzle select type here.
    const result = await dbWrite.execute<UserIdentity>(sql`
      INSERT INTO ${userIdentities} (
        user_id,
        privy_user_id,
        is_anonymous,
        anonymous_session_id,
        expires_at,
        telegram_id,
        telegram_username,
        telegram_first_name,
        telegram_photo_url,
        phone_number,
        phone_verified,
        discord_id,
        discord_username,
        discord_global_name,
        discord_avatar_url
        ${whatsappInsertColumns}
      )
      SELECT
        ${userId},
        ${privyUserId},
        u.is_anonymous,
        u.anonymous_session_id,
        u.expires_at,
        u.telegram_id,
        u.telegram_username,
        u.telegram_first_name,
        u.telegram_photo_url,
        u.phone_number,
        u.phone_verified,
        u.discord_id,
        u.discord_username,
        u.discord_global_name,
        u.discord_avatar_url
        ${whatsappSelectColumns}
      FROM ${users} u
      WHERE u.id = ${userId}
      ON CONFLICT (user_id) DO UPDATE
      SET
        -- The conflict target is the per-user projection row, not the global
        -- privy_user_id unique constraint. If a different user already owns this
        -- privy_user_id, Postgres still raises user_identities_privy_user_id_unique
        -- and the caller decides whether recovery is safe.
        -- Keep unique cross-account identities on their existing rows here.
        -- WhatsApp refresh happens separately on a guarded primary-only path so
        -- projection repair does not introduce new unique-key failure modes.
        privy_user_id = EXCLUDED.privy_user_id,
        updated_at = NOW()
      RETURNING *
    `);

    const [identity] = result.rows;

    if (!identity) {
      throw new Error(`User ${userId} not found while upserting Privy identity ${privyUserId}`);
    }

    return identity;
  }

  /**
   * Upserts the Steward identity projection for a user.
   */
  async upsertStewardIdentity(userId: string, stewardUserId: string): Promise<UserIdentity> {
    const support = await this.getWhatsAppColumnSupport(dbWrite, "write");
    const whatsappInsertColumns = support.userIdentities
      ? sql`,
        whatsapp_id,
        whatsapp_name`
      : sql``;
    const whatsappSelectColumns = support.userIdentities
      ? support.users
        ? sql`,
        u.whatsapp_id,
        u.whatsapp_name`
        : sql`,
        NULL::text,
        NULL::text`
      : sql``;

    const result = await dbWrite.execute<UserIdentity>(sql`
      INSERT INTO ${userIdentities} (
        user_id,
        steward_user_id,
        is_anonymous,
        anonymous_session_id,
        expires_at,
        telegram_id,
        telegram_username,
        telegram_first_name,
        telegram_photo_url,
        phone_number,
        phone_verified,
        discord_id,
        discord_username,
        discord_global_name,
        discord_avatar_url
        ${whatsappInsertColumns}
      )
      SELECT
        ${userId},
        ${stewardUserId},
        u.is_anonymous,
        u.anonymous_session_id,
        u.expires_at,
        u.telegram_id,
        u.telegram_username,
        u.telegram_first_name,
        u.telegram_photo_url,
        u.phone_number,
        u.phone_verified,
        u.discord_id,
        u.discord_username,
        u.discord_global_name,
        u.discord_avatar_url
        ${whatsappSelectColumns}
      FROM ${users} u
      WHERE u.id = ${userId}
      ON CONFLICT (user_id) DO UPDATE
      SET
        steward_user_id = EXCLUDED.steward_user_id,
        updated_at = NOW()
      RETURNING *
    `);

    const [identity] = result.rows;

    if (!identity) {
      throw new Error(`User ${userId} not found while upserting Steward identity ${stewardUserId}`);
    }

    return identity;
  }

  /**
   * Lists active, non-anonymous users with email addresses that still need a
   * Steward user mapping.
   */
  async listPendingStewardProvisioning(
    limit: number,
  ): Promise<Array<Pick<User, "id" | "email" | "email_verified" | "name" | "steward_user_id">>> {
    return await dbWrite
      .select({
        id: users.id,
        email: users.email,
        email_verified: users.email_verified,
        name: users.name,
        steward_user_id: users.steward_user_id,
      })
      .from(users)
      .where(
        and(
          eq(users.is_active, true),
          eq(users.is_anonymous, false),
          isNull(users.steward_user_id),
          isNotNull(users.email),
        ),
      )
      .orderBy(asc(users.created_at), asc(users.id))
      .limit(limit);
  }

  /**
   * Deletes a user by ID.
   */
  async delete(id: string): Promise<void> {
    await dbWrite.delete(users).where(eq(users.id, id));
  }
}

/**
 * Singleton instance of UsersRepository.
 */
export const usersRepository = new UsersRepository();
