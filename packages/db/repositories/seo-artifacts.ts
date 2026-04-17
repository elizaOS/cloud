import { and, desc, eq } from "drizzle-orm";
import { db } from "../client";
import {
  type NewSeoArtifact,
  type SeoArtifact,
  seoArtifacts,
  seoArtifactTypeEnum,
} from "../schemas/seo";

export type { NewSeoArtifact, SeoArtifact };

export class SeoArtifactsRepository {
  async listByRequest(
    requestId: string,
    options?: { type?: (typeof seoArtifactTypeEnum.enumValues)[number] },
  ): Promise<SeoArtifact[]> {
    return await db.query.seoArtifacts.findMany({
      where: options?.type
        ? and(
            eq(seoArtifacts.request_id, requestId),
            eq(seoArtifacts.type, options.type),
          )
        : eq(seoArtifacts.request_id, requestId),
      orderBy: desc(seoArtifacts.created_at),
    });
  }

  async create(data: NewSeoArtifact): Promise<SeoArtifact> {
    const [artifact] = await db.insert(seoArtifacts).values(data).returning();
    return artifact;
  }
}

export const seoArtifactsRepository = new SeoArtifactsRepository();
