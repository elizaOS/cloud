import { eq } from "drizzle-orm";
import { db } from "../client";
import { users, type User, type NewUser } from "../schemas/users";
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
 */
export class UsersRepository {
  /**
   * Finds a user by ID.
   */
  async findById(id: string): Promise<User | undefined> {
    return await db.query.users.findFirst({
      where: eq(users.id, id),
    });
  }

  /**
   * Finds a user by email address.
   */
  async findByEmail(email: string): Promise<User | undefined> {
    return await db.query.users.findFirst({
      where: eq(users.email, email),
    });
  }

  /**
   * Finds a user by Privy user ID with organization data.
   */
  async findByPrivyIdWithOrganization(
    privyUserId: string,
  ): Promise<UserWithOrganization | undefined> {
    try {
      const user = await db.query.users.findFirst({
        where: eq(users.privy_user_id, privyUserId),
        with: {
          organization: true,
        },
      });

      return user as UserWithOrganization | undefined;
    } catch (error) {
      console.error(
        "[UsersRepository] Error in findByPrivyIdWithOrganization:",
        {
          privyUserId,
          error,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          errorCause: error instanceof Error ? (error as Error & { cause?: unknown }).cause : undefined,
        },
      );
      throw error;
    }
  }

  /**
   * Finds a user by ID with organization data.
   */
  async findWithOrganization(
    userId: string,
  ): Promise<UserWithOrganization | undefined> {
    const user = await db.query.users.findFirst({
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
    const user = await db.query.users.findFirst({
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
    return await db.query.users.findFirst({
      where: eq(users.wallet_address, walletAddress.toLowerCase()),
    });
  }

  /**
   * Finds a user by wallet address with organization data.
   */
  async findByWalletAddressWithOrganization(
    walletAddress: string,
  ): Promise<UserWithOrganization | undefined> {
    const user = await db.query.users.findFirst({
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
    return await db.query.users.findMany({
      where: eq(users.organization_id, organizationId),
    });
  }

  /**
   * Creates a new user.
   */
  async create(data: NewUser): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

<<<<<<< HEAD
  /**
   * Updates an existing user.
   */
=======
>>>>>>> 2379ae49c4454bd91c14c080b9a37ac33464cf74
  async update(id: string, data: Partial<NewUser>): Promise<User | undefined> {
    const [updated] = await db
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
    await db.delete(users).where(eq(users.id, id));
  }
}

/**
 * Singleton instance of UsersRepository.
 */
export const usersRepository = new UsersRepository();
