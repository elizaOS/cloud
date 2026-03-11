import { eq } from "drizzle-orm";
import { dbRead, dbWrite } from "../helpers";
import { users, type User, type NewUser } from "../schemas/users";
import {
  userIdentities,
  type UserIdentity,
} from "../schemas/user-identities";
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
   * Finds a user by Privy user ID with organization data (via identity table).
   */
  async findByPrivyIdWithOrganization(
    privyUserId: string,
  ): Promise<UserWithOrganization | undefined> {
    const identity = await dbRead.query.userIdentities.findFirst({
      where: eq(userIdentities.privy_user_id, privyUserId),
    });
    if (!identity) return undefined;

    const user = await dbRead.query.users.findFirst({
      where: eq(users.id, identity.user_id),
      with: {
        organization: true,
      },
    });

    return user as UserWithOrganization | undefined;
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
