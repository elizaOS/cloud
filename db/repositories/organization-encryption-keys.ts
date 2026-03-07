import { dbRead, dbWrite } from "../helpers";
import {
  organizationEncryptionKeys,
  type OrganizationEncryptionKey,
  type NewOrganizationEncryptionKey,
} from "../schemas";
import { eq } from "drizzle-orm";

export type { OrganizationEncryptionKey, NewOrganizationEncryptionKey };

/**
 * Repository for organization encryption key database operations.
 *
 * Read operations → dbRead (read replica)
 * Write operations → dbWrite (NA primary)
 */
export class OrganizationEncryptionKeysRepository {
  // ============================================================================
  // READ OPERATIONS (use read replica)
  // ============================================================================

  /**
   * Finds an encryption key by organization ID.
   */
  async findByOrgId(
    organizationId: string,
  ): Promise<OrganizationEncryptionKey | undefined> {
    return await dbRead.query.organizationEncryptionKeys.findFirst({
      where: eq(organizationEncryptionKeys.organization_id, organizationId),
    });
  }

  /**
   * Finds an encryption key by its ID.
   */
  async findById(id: string): Promise<OrganizationEncryptionKey | undefined> {
    return await dbRead.query.organizationEncryptionKeys.findFirst({
      where: eq(organizationEncryptionKeys.id, id),
    });
  }

  // ============================================================================
  // WRITE OPERATIONS (use NA primary)
  // ============================================================================

  /**
   * Creates a new encryption key for an organization.
   * Uses onConflictDoNothing to handle race conditions safely.
   */
  async create(
    data: NewOrganizationEncryptionKey,
  ): Promise<OrganizationEncryptionKey | null> {
    const [created] = await dbWrite
      .insert(organizationEncryptionKeys)
      .values(data)
      .onConflictDoNothing()
      .returning();
    return created || null;
  }

  /**
   * Updates an encryption key.
   */
  async update(
    id: string,
    data: Partial<Omit<NewOrganizationEncryptionKey, "id" | "organization_id">>,
  ): Promise<OrganizationEncryptionKey | undefined> {
    const [updated] = await dbWrite
      .update(organizationEncryptionKeys)
      .set(data)
      .where(eq(organizationEncryptionKeys.id, id))
      .returning();
    return updated;
  }
}

// Singleton export
export const organizationEncryptionKeysRepository =
  new OrganizationEncryptionKeysRepository();
