import { eq } from "drizzle-orm";
import { db } from "../client";
import { users, type User, type NewUser } from "../schemas/users";
import { organizations, type Organization } from "../schemas/organizations";

export type { User, NewUser };

/**
 * User with associated organization data.
 */
export interface UserWithOrganization extends User {
  organization: Organization | null;
}

/**
 * Helper to log database errors with full context
 */
function logDbError(operation: string, error: unknown): void {
  const dbError = error as Error & {
    cause?: unknown;
    code?: string;
    detail?: string;
    constraint?: string;
  };
  console.error(`[UsersRepository] ${operation} failed:`, {
    message: dbError.message,
    code: dbError.code,
    detail: dbError.detail,
    cause: dbError.cause,
  });
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
   * Uses a fallback query approach if the relational query fails.
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
      // Log the error for debugging but don't throw - allows JIT sync to proceed
      logDbError("findByPrivyIdWithOrganization (relational)", error);

      // Fallback: try a simpler two-query approach if relational query fails
      try {
        const user = await db.query.users.findFirst({
          where: eq(users.privy_user_id, privyUserId),
        });

        if (!user) {
          return undefined;
        }

        // Fetch organization separately if user exists and has org_id
        let org: Organization | null = null;
        if (user.organization_id) {
          const orgResult = await db.query.organizations.findFirst({
            where: eq(organizations.id, user.organization_id),
          });
          org = orgResult ?? null;
        }

        return { ...user, organization: org };
      } catch (fallbackError) {
        logDbError("findByPrivyIdWithOrganization (fallback)", fallbackError);
        // Return undefined to allow JIT sync to create the user
        return undefined;
      }
    }
  }

  /**
   * Finds a user by ID with organization data.
   * Uses a fallback query approach if the relational query fails.
   */
  async findWithOrganization(
    userId: string,
  ): Promise<UserWithOrganization | undefined> {
    try {
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
        with: {
          organization: true,
        },
      });

      return user as UserWithOrganization | undefined;
    } catch (error) {
      logDbError("findWithOrganization (relational)", error);

      // Fallback: try a simpler two-query approach
      try {
        const user = await db.query.users.findFirst({
          where: eq(users.id, userId),
        });

        if (!user) {
          return undefined;
        }

        let org: Organization | null = null;
        if (user.organization_id) {
          const orgResult = await db.query.organizations.findFirst({
            where: eq(organizations.id, user.organization_id),
          });
          org = orgResult ?? null;
        }

        return { ...user, organization: org };
      } catch (fallbackError) {
        logDbError("findWithOrganization (fallback)", fallbackError);
        return undefined;
      }
    }
  }

  /**
   * Finds a user by email with organization data.
   * Uses a fallback query approach if the relational query fails.
   */
  async findByEmailWithOrganization(
    email: string,
  ): Promise<UserWithOrganization | undefined> {
    try {
      const user = await db.query.users.findFirst({
        where: eq(users.email, email),
        with: {
          organization: true,
        },
      });

      return user as UserWithOrganization | undefined;
    } catch (error) {
      logDbError("findByEmailWithOrganization (relational)", error);

      // Fallback: try a simpler two-query approach
      try {
        const user = await db.query.users.findFirst({
          where: eq(users.email, email),
        });

        if (!user) {
          return undefined;
        }

        let org: Organization | null = null;
        if (user.organization_id) {
          const orgResult = await db.query.organizations.findFirst({
            where: eq(organizations.id, user.organization_id),
          });
          org = orgResult ?? null;
        }

        return { ...user, organization: org };
      } catch (fallbackError) {
        logDbError("findByEmailWithOrganization (fallback)", fallbackError);
        return undefined;
      }
    }
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
   * Uses a fallback query approach if the relational query fails.
   */
  async findByWalletAddressWithOrganization(
    walletAddress: string,
  ): Promise<UserWithOrganization | undefined> {
    try {
      const user = await db.query.users.findFirst({
        where: eq(users.wallet_address, walletAddress.toLowerCase()),
        with: {
          organization: true,
        },
      });

      return user as UserWithOrganization | undefined;
    } catch (error) {
      logDbError("findByWalletAddressWithOrganization (relational)", error);

      // Fallback: try a simpler two-query approach
      try {
        const user = await db.query.users.findFirst({
          where: eq(users.wallet_address, walletAddress.toLowerCase()),
        });

        if (!user) {
          return undefined;
        }

        let org: Organization | null = null;
        if (user.organization_id) {
          const orgResult = await db.query.organizations.findFirst({
            where: eq(organizations.id, user.organization_id),
          });
          org = orgResult ?? null;
        }

        return { ...user, organization: org };
      } catch (fallbackError) {
        logDbError("findByWalletAddressWithOrganization (fallback)", fallbackError);
        return undefined;
      }
    }
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

  /**
   * Updates an existing user.
   */
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
