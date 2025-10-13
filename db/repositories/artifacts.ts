import { eq, and, desc, type InferSelectModel, type InferInsertModel } from "drizzle-orm";
import { db } from "../client";
import { artifacts } from "../schemas/artifacts";

export type Artifact = InferSelectModel<typeof artifacts>;
export type NewArtifact = InferInsertModel<typeof artifacts>;

export class ArtifactsRepository {
  async findById(id: string): Promise<Artifact | undefined> {
    const results = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, id))
      .limit(1);
    return results[0];
  }

  async listByProject(
    organizationId: string,
    projectId: string,
  ): Promise<Artifact[]> {
    return await db
      .select()
      .from(artifacts)
      .where(
        and(
          eq(artifacts.organization_id, organizationId),
          eq(artifacts.project_id, projectId),
        ),
      )
      .orderBy(desc(artifacts.created_at));
  }

  async create(data: NewArtifact): Promise<Artifact> {
    const [artifact] = await db.insert(artifacts).values(data).returning();
    return artifact;
  }

  async delete(id: string): Promise<void> {
    await db.delete(artifacts).where(eq(artifacts.id, id));
  }

  async deleteOldVersions(
    organizationId: string,
    projectId: string,
    keepCount: number,
  ): Promise<number> {
    const toDelete = await db
      .select()
      .from(artifacts)
      .where(
        and(
          eq(artifacts.organization_id, organizationId),
          eq(artifacts.project_id, projectId),
        ),
      )
      .orderBy(desc(artifacts.created_at))
      .offset(keepCount);

    if (toDelete.length === 0) return 0;

    const idsToDelete = toDelete.map((a) => a.id);
    await db.delete(artifacts).where(
      and(
        eq(artifacts.organization_id, organizationId),
        eq(artifacts.project_id, projectId),
      ),
    );

    return toDelete.length;
  }

  async getDistinctOrganizationProjects(): Promise<Array<{
    organizationId: string;
    projectId: string;
  }>> {
    const results = await db
      .selectDistinct({
        organizationId: artifacts.organization_id,
        projectId: artifacts.project_id,
      })
      .from(artifacts);

    return results;
  }

  async listByOrganization(organizationId: string): Promise<Artifact[]> {
    return await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.organization_id, organizationId))
      .orderBy(desc(artifacts.created_at));
  }
}

// Export singleton instance
export const artifactsRepository = new ArtifactsRepository();
