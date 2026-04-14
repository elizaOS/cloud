import { eq } from "drizzle-orm";
import { dbRead, dbWrite } from "../helpers";
import {
  type OrgRateLimitOverride,
  type NewOrgRateLimitOverride,
  orgRateLimitOverrides,
} from "../schemas/org-rate-limit-overrides";

export type { OrgRateLimitOverride, NewOrgRateLimitOverride };

/**
 * Repository for per-organization rate limit overrides.
 *
 * Read operations → dbRead (read replica)
 * Write operations → dbWrite (primary)
 */
export class OrgRateLimitOverridesRepository {
  async findByOrganizationId(
    organizationId: string,
  ): Promise<OrgRateLimitOverride | undefined> {
    return await dbRead.query.orgRateLimitOverrides.findFirst({
      where: eq(orgRateLimitOverrides.organization_id, organizationId),
    });
  }

  async upsert(
    data: Pick<NewOrgRateLimitOverride, "organization_id"> &
      Partial<
        Pick<
          NewOrgRateLimitOverride,
          | "completions_rpm"
          | "embeddings_rpm"
          | "standard_rpm"
          | "strict_rpm"
          | "note"
        >
      >,
  ): Promise<OrgRateLimitOverride> {
    const [result] = await dbWrite
      .insert(orgRateLimitOverrides)
      .values(data)
      .onConflictDoUpdate({
        target: orgRateLimitOverrides.organization_id,
        set: {
          completions_rpm: data.completions_rpm,
          embeddings_rpm: data.embeddings_rpm,
          standard_rpm: data.standard_rpm,
          strict_rpm: data.strict_rpm,
          note: data.note,
          updated_at: new Date(),
        },
      })
      .returning();
    return result;
  }

  async deleteByOrganizationId(organizationId: string): Promise<void> {
    await dbWrite
      .delete(orgRateLimitOverrides)
      .where(eq(orgRateLimitOverrides.organization_id, organizationId));
  }
}

export const orgRateLimitOverridesRepository =
  new OrgRateLimitOverridesRepository();
