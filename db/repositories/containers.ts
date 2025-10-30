import {
  eq,
  and,
  desc,
  notInArray,
  inArray,
  sql,
  type InferSelectModel,
  type InferInsertModel,
} from "drizzle-orm";
import { db, type Database } from "../client";
import { containers } from "../schemas/containers";
import { organizations } from "../schemas/organizations";
import { creditTransactions } from "../schemas/credit-transactions";
import { getMaxContainersForOrg } from "../../lib/constants/pricing";

export type Container = InferSelectModel<typeof containers>;
export type NewContainer = InferInsertModel<typeof containers>;

export type ContainerStatus =
  | "pending"
  | "building"
  | "deploying"
  | "running"
  | "stopped"
  | "failed"
  | "deleting"
  | "deleted";

export interface QuotaCheckResult {
  allowed: boolean;
  current: number;
  max: number;
  error?: string;
}

/**
 * Custom error class for quota exceeded errors
 */
export class QuotaExceededError extends Error {
  constructor(
    message: string,
    public current: number,
    public max: number
  ) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

/**
 * Custom error class for duplicate container name errors
 */
export class DuplicateContainerNameError extends Error {
  constructor(
    message: string,
    public containerName: string
  ) {
    super(message);
    this.name = "DuplicateContainerNameError";
  }
}

export class ContainersRepository {
  async listByOrganization(organizationId: string): Promise<Container[]> {
    return await db
      .select()
      .from(containers)
      .where(eq(containers.organization_id, organizationId))
      .orderBy(desc(containers.created_at));
  }

  async findById(
    id: string,
    organizationId: string
  ): Promise<Container | null> {
    const results = await db
      .select()
      .from(containers)
      .where(
        and(
          eq(containers.id, id),
          eq(containers.organization_id, organizationId)
        )
      )
      .limit(1);

    return results[0] || null;
  }

  async findByCharacterId(characterId: string): Promise<Container | null> {
    const results = await db
      .select()
      .from(containers)
      .where(eq(containers.character_id, characterId))
      .orderBy(desc(containers.created_at))
      .limit(1);

    return results[0] || null;
  }

  async findByCharacterIds(characterIds: string[]): Promise<Container[]> {
    if (characterIds.length === 0) {
      return [];
    }

    return await db
      .select()
      .from(containers)
      .where(inArray(containers.character_id, characterIds))
      .orderBy(desc(containers.created_at));
  }

  async create(data: NewContainer): Promise<Container> {
    const [container] = await db
      .insert(containers)
      .values({
        ...data,
        updated_at: new Date(),
      })
      .returning();

    return container;
  }

  async update(
    id: string,
    organizationId: string,
    data: Partial<NewContainer>
  ): Promise<Container | null> {
    const [updated] = await db
      .update(containers)
      .set({
        ...data,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(containers.id, id),
          eq(containers.organization_id, organizationId)
        )
      )
      .returning();

    return updated || null;
  }

  async delete(id: string, organizationId: string): Promise<boolean> {
    const results = await db
      .delete(containers)
      .where(
        and(
          eq(containers.id, id),
          eq(containers.organization_id, organizationId)
        )
      )
      .returning();

    return results.length > 0;
  }

  async updateStatus(
    id: string,
    status: ContainerStatus,
    errorMessage?: string
  ): Promise<Container | null> {
    const [updated] = await db
      .update(containers)
      .set({
        status,
        error_message: errorMessage || null,
        updated_at: new Date(),
      })
      .where(eq(containers.id, id))
      .returning();

    return updated || null;
  }

  async updateHealthCheck(id: string): Promise<Container | null> {
    const [updated] = await db
      .update(containers)
      .set({
        last_health_check: new Date(),
        updated_at: new Date(),
      })
      .where(eq(containers.id, id))
      .returning();

    return updated || null;
  }

  /**
   * Check quota without creating a container (read-only check)
   * Note: This has a small race condition window but is useful for pre-flight checks
   */
  async checkQuota(organizationId: string): Promise<QuotaCheckResult> {
    // Get organization details
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, organizationId),
      columns: { credit_balance: true, settings: true },
    });

    if (!org) {
      return {
        allowed: false,
        current: 0,
        max: 0,
        error: "Organization not found",
      };
    }

    // Count active containers (excluding deleting/deleted status)
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(containers)
      .where(
        and(
          eq(containers.organization_id, organizationId),
          notInArray(containers.status, ["deleting", "deleted"])
        )
      );

    const maxContainers = getMaxContainersForOrg(
      Number(org.credit_balance),
      org.settings as Record<string, unknown> | undefined
    );

    const allowed = count < maxContainers;

    return {
      allowed,
      current: count,
      max: maxContainers,
      error: allowed
        ? undefined
        : `Container quota exceeded (${count}/${maxContainers})`,
    };
  }

  /**
   * Atomically check quota and create container in a transaction
   * This prevents race conditions where multiple concurrent requests
   * could bypass quota limits.
   */
  async createWithQuotaCheck(
    data: NewContainer,
    transaction?: Database
  ): Promise<Container> {
    const executeInTransaction = async (tx: Database) => {
      // 1. Lock the organization row to prevent concurrent quota checks
      const [org] = await tx
        .select({
          id: organizations.id,
          credit_balance: organizations.credit_balance,
          settings: organizations.settings,
        })
        .from(organizations)
        .where(eq(organizations.id, data.organization_id))
        .for("update"); // FOR UPDATE locks the row

      if (!org) {
        throw new Error("Organization not found");
      }

      // 2. Count active containers (excluding deleting/deleted status)
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(containers)
        .where(
          and(
            eq(containers.organization_id, data.organization_id),
            notInArray(containers.status, ["deleting", "deleted"])
          )
        );

      // 3. Get max allowed containers for this org
      const maxContainers = getMaxContainersForOrg(
        Number(org.credit_balance),
        org.settings as Record<string, unknown> | undefined
      );

      // 4. Check quota
      if (count >= maxContainers) {
        throw new QuotaExceededError(
          `Container quota exceeded. Current: ${count}, Max: ${maxContainers}`,
          count,
          maxContainers
        );
      }

      // 5. Create the container (unique constraint will prevent duplicate names)
      const [container] = await tx
        .insert(containers)
        .values({
          ...data,
          status: "pending",
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning();

      return container;
    };

    // Use external transaction if provided, otherwise create new one
    if (transaction) {
      return await executeInTransaction(transaction);
    } else {
      return await db.transaction(executeInTransaction);
    }
  }

  async createContainerWithCreditDeduction(
    containerData: NewContainer,
    userId: string,
    deploymentCost: number
  ): Promise<{ container: Container; newBalance: number }> {
    return await db.transaction(async (tx) => {
      // Create container with quota check
      const container = await this.createWithQuotaCheck(
        containerData,
        tx as typeof db
      );

      // Check and deduct credits
      const org = await tx.query.organizations.findFirst({
        where: eq(organizations.id, containerData.organization_id),
      });

      if (!org) {
        throw new Error("Organization not found");
      }

      const currentBalance = Number(org.credit_balance);

      if (currentBalance < deploymentCost) {
        throw new Error(
          `Insufficient balance. Required: $${deploymentCost.toFixed(2)}, Available: $${currentBalance.toFixed(2)}`
        );
      }

      const newBalance = currentBalance - deploymentCost;

      await tx
        .update(organizations)
        .set({
          credit_balance: String(newBalance),
          updated_at: new Date(),
        })
        .where(eq(organizations.id, containerData.organization_id));

      await tx.insert(creditTransactions).values({
        organization_id: containerData.organization_id,
        user_id: userId,
        amount: String(-deploymentCost),
        type: "debit",
        description: `Container deployment: ${containerData.name}`,
        created_at: new Date(),
      });

      return { container, newBalance };
    });
  }
}

// Export singleton instance
export const containersRepository = new ContainersRepository();
