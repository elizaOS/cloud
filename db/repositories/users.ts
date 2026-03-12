import { eq, sql } from "drizzle-orm";
import { dbRead, dbWrite } from "../helpers";
import { users, type User, type NewUser } from "../schemas/users";
import { userIdentities, type UserIdentity } from "../schemas/user-identities";
import { type Organization } from "../schemas/organizations";

export type { User, NewUser };

/**
 * User with associated organization data.
 */
export interface UserWithOrganization extends User {
  organization: Organization | null;
}

/**
 * Repository for user database operations.
 *
 * Read operations → dbRead (read replica)
 * Write operations → dbWrite (primary)
 */
export class UsersRepository {
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
   * Finds a user by Privy user ID with organization data.
   * Prefer the identity projection, which is the steady-state auth lookup,
   * but fall back to the legacy users column while backfill or projection
   * repair may still be catching up.
   */
  async findByPrivyIdWithOrganization(
    privyUserId: string,
  ): Promise<UserWithOrganization | undefined> {
    return this.findByPrivyIdWithOrganizationUsingDb(dbRead, privyUserId);
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
    const user = await dbWrite.query.users.findFirst({
      where: eq(users.privy_user_id, privyUserId),
      with: {
        organization: true,
      },
    });

    if (user) {
      return user as UserWithOrganization | undefined;
    }

    const identity = await dbWrite.query.userIdentities.findFirst({
      where: eq(userIdentities.privy_user_id, privyUserId),
    });

    if (!identity) {
      return undefined;
    }

    const linkedUser = await dbWrite.query.users.findFirst({
      where: eq(users.id, identity.user_id),
      with: {
        organization: true,
      },
    });

    return linkedUser as UserWithOrganization | undefined;
  }

  /**
   * Finds a user by ID with organization data.
   */
  async findWithOrganization(
    userId: string,
  ): Promise<UserWithOrganization | undefined> {
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
  async findByEmailWithOrganization(
    email: string,
  ): Promise<UserWithOrganization | undefined> {
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
  async findIdentityByUserIdForWrite(
    userId: string,
  ): Promise<UserIdentity | undefined> {
    return await dbWrite.query.userIdentities.findFirst({
      where: eq(userIdentities.user_id, userId),
    });
  }

  /**
   * Finds the identity projection row for a Privy user ID from primary.
   * Use when recovery must verify the projection row ownership directly.
   */
  async findIdentityByPrivyIdForWrite(
    privyUserId: string,
  ): Promise<UserIdentity | undefined> {
    return await dbWrite.query.userIdentities.findFirst({
      where: eq(userIdentities.privy_user_id, privyUserId),
    });
  }

  private async findByPrivyIdWithOrganizationUsingDb(
    database: typeof dbRead,
    privyUserId: string,
  ): Promise<UserWithOrganization | undefined> {
    const identity = await database.query.userIdentities.findFirst({
      where: eq(userIdentities.privy_user_id, privyUserId),
    });

    if (identity) {
      const user = await database.query.users.findFirst({
        where: eq(users.id, identity.user_id),
        with: {
          organization: true,
        },
      });

      return user as UserWithOrganization | undefined;
    }

    const user = await database.query.users.findFirst({
      where: eq(users.privy_user_id, privyUserId),
      with: {
        organization: true,
      },
    });

    return user as UserWithOrganization | undefined;
  }

  /**
   * Upserts the Privy identity projection for a user.
   */
  async upsertPrivyIdentity(
    userId: string,
    privyUserId: string,
  ): Promise<UserIdentity> {
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
        discord_avatar_url,
        whatsapp_id,
        whatsapp_name
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
        u.discord_avatar_url,
        u.whatsapp_id,
        u.whatsapp_name
      FROM ${users} u
      WHERE u.id = ${userId}
      ON CONFLICT (user_id) DO UPDATE
      SET
        -- Only Privy projection state is repaired here; other identity columns
        -- remain as originally projected from the canonical users row.
        privy_user_id = EXCLUDED.privy_user_id,
        updated_at = NOW()
      RETURNING *
    `);

    const [identity] = result.rows;

    if (!identity) {
      throw new Error(
        `User ${userId} not found while upserting Privy identity ${privyUserId}`,
      );
    }

    return identity;
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
