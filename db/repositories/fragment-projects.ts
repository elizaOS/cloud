/**
 * Fragment Projects Repository
 *
 * Database operations for fragment projects
 */

import { db } from "@/db/client";
import {
  fragmentProjects,
  type FragmentProject,
  type NewFragmentProject,
} from "@/db/schemas/fragment-projects";
import { eq, and, desc } from "drizzle-orm";

export class FragmentProjectsRepository {
  async findById(id: string): Promise<FragmentProject | undefined> {
    const [project] = await db
      .select()
      .from(fragmentProjects)
      .where(eq(fragmentProjects.id, id))
      .limit(1);

    return project;
  }

  async listByOrganization(
    organizationId: string,
    filters?: { status?: string; userId?: string },
  ): Promise<FragmentProject[]> {
    const conditions = [eq(fragmentProjects.organization_id, organizationId)];

    if (filters?.status) {
      conditions.push(eq(fragmentProjects.status, filters.status));
    }

    if (filters?.userId) {
      conditions.push(eq(fragmentProjects.user_id, filters.userId));
    }

    return await db
      .select()
      .from(fragmentProjects)
      .where(and(...conditions))
      .orderBy(desc(fragmentProjects.updated_at));
  }

  async create(data: NewFragmentProject): Promise<FragmentProject> {
    const [project] = await db
      .insert(fragmentProjects)
      .values(data)
      .returning();

    return project;
  }

  async update(
    id: string,
    data: Partial<NewFragmentProject>,
  ): Promise<FragmentProject | undefined> {
    const [project] = await db
      .update(fragmentProjects)
      .set({ ...data, updated_at: new Date() })
      .where(eq(fragmentProjects.id, id))
      .returning();

    return project;
  }

  async delete(id: string): Promise<void> {
    await db.delete(fragmentProjects).where(eq(fragmentProjects.id, id));
  }

  async findByDeployedApp(appId: string): Promise<FragmentProject | undefined> {
    const [project] = await db
      .select()
      .from(fragmentProjects)
      .where(eq(fragmentProjects.deployed_app_id, appId))
      .limit(1);

    return project;
  }
}

export const fragmentProjectsRepository = new FragmentProjectsRepository();
