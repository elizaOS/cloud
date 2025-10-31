import { eq } from "drizzle-orm";
import { db } from "../client";
import { users, type User, type NewUser } from "../schemas/users";
import { type Organization } from "../schemas/organizations";

export type { User, NewUser };

export interface UserWithOrganization extends User {
  organization: Organization;
}

export class UsersRepository {
  async findById(id: string): Promise<User | undefined> {
    return await db.query.users.findFirst({
      where: eq(users.id, id),
    });
  }

  async findByEmail(email: string): Promise<User | undefined> {
    return await db.query.users.findFirst({
      where: eq(users.email, email),
    });
  }

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
          errorCause:
            error instanceof Error
              ? (error as Error & { cause?: unknown }).cause
              : undefined,
        },
      );
      throw error;
    }
  }

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

  async findByWalletAddress(walletAddress: string): Promise<User | undefined> {
    return await db.query.users.findFirst({
      where: eq(users.wallet_address, walletAddress.toLowerCase()),
    });
  }

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

  async listByOrganization(organizationId: string): Promise<User[]> {
    return await db.query.users.findMany({
      where: eq(users.organization_id, organizationId),
    });
  }

  async create(data: NewUser): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

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

  async delete(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }
}

// Export singleton instance
export const usersRepository = new UsersRepository();
