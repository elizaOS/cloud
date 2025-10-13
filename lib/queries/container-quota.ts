import { db, containers, organizations } from "@/db/drizzle";
import { eq, and, notInArray, sql } from "drizzle-orm";
import { getMaxContainersForOrg } from "@/lib/constants/pricing";
import type { NewContainer } from "./containers";

export interface QuotaCheckResult {
  allowed: boolean;
  current: number;
  max: number;
  error?: string;
}

/**
 * Atomically check quota and create container in a transaction
 * This prevents race conditions where multiple concurrent requests
 * could bypass quota limits.
 *
 * @param data - Container data to create
 * @param externalTx - Optional external transaction (for nesting in credit deduction)
 * @returns The created container or throws an error
 */
export async function createContainerWithQuotaCheck(
  data: NewContainer,
  externalTx?: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<typeof containers.$inferSelect> {
  const executeInTransaction = async (tx: NonNullable<typeof externalTx>) => {
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
          notInArray(containers.status, ["deleting", "deleted"]),
        ),
      );

    // 3. Get max allowed containers for this org
    const maxContainers = getMaxContainersForOrg(
      org.credit_balance,
      org.settings as Record<string, unknown> | undefined,
    );

    // 4. Check quota
    if (count >= maxContainers) {
      throw new QuotaExceededError(
        `Container quota exceeded. Current: ${count}, Max: ${maxContainers}`,
        count,
        maxContainers,
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
  if (externalTx) {
    return await executeInTransaction(externalTx);
  } else {
    return await db.transaction(executeInTransaction);
  }
}

/**
 * Check quota without creating a container (read-only check)
 * Note: This has a small race condition window but is useful for pre-flight checks
 *
 * @param organizationId - Organization to check
 * @returns Quota information
 */
export async function checkContainerQuota(
  organizationId: string,
): Promise<QuotaCheckResult> {
  // Get organization details
  const [org] = await db
    .select({
      credit_balance: organizations.credit_balance,
      settings: organizations.settings,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!org) {
    return {
      allowed: false,
      current: 0,
      max: 0,
      error: "Organization not found",
    };
  }

  // Count active containers
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(containers)
    .where(
      and(
        eq(containers.organization_id, organizationId),
        notInArray(containers.status, ["deleting", "deleted"]),
      ),
    );

  const maxContainers = getMaxContainersForOrg(
    org.credit_balance,
    org.settings as Record<string, unknown> | undefined,
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
 * Custom error class for quota exceeded errors
 */
export class QuotaExceededError extends Error {
  constructor(
    message: string,
    public current: number,
    public max: number,
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
    public containerName: string,
  ) {
    super(message);
    this.name = "DuplicateContainerNameError";
  }
}

