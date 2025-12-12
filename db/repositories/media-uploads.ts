import { eq, desc, and, sql, count, sum } from "drizzle-orm";
import { db } from "../client";
import {
  mediaUploads,
  type MediaUpload,
  type NewMediaUpload,
} from "../schemas/media-uploads";

export type { MediaUpload, NewMediaUpload };

/**
 * Repository for media upload database operations.
 */
export class MediaUploadsRepository {
  async findById(id: string): Promise<MediaUpload | undefined> {
    return await db.query.mediaUploads.findFirst({
      where: eq(mediaUploads.id, id),
    });
  }

  async listByOrganization(
    organizationId: string,
    options?: {
      userId?: string;
      type?: "image" | "video" | "audio";
      limit?: number;
      offset?: number;
    }
  ): Promise<MediaUpload[]> {
    const conditions = [eq(mediaUploads.organization_id, organizationId)];

    if (options?.userId) {
      conditions.push(eq(mediaUploads.user_id, options.userId));
    }

    if (options?.type) {
      conditions.push(eq(mediaUploads.type, options.type));
    }

    return await db.query.mediaUploads.findMany({
      where: and(...conditions),
      orderBy: desc(mediaUploads.created_at),
      limit: options?.limit,
      offset: options?.offset,
    });
  }

  async create(data: NewMediaUpload): Promise<MediaUpload> {
    const [upload] = await db.insert(mediaUploads).values(data).returning();
    return upload;
  }

  async update(
    id: string,
    data: Partial<Omit<NewMediaUpload, "id" | "organization_id" | "user_id">>
  ): Promise<MediaUpload | undefined> {
    const [updated] = await db
      .update(mediaUploads)
      .set(data)
      .where(eq(mediaUploads.id, id))
      .returning();
    return updated;
  }

  async delete(id: string): Promise<void> {
    await db.delete(mediaUploads).where(eq(mediaUploads.id, id));
  }

  async getStats(
    organizationId: string,
    userId?: string
  ): Promise<{
    totalUploads: number;
    totalImages: number;
    totalVideos: number;
    totalAudio: number;
    totalSize: bigint;
  }> {
    const conditions = [eq(mediaUploads.organization_id, organizationId)];
    if (userId) {
      conditions.push(eq(mediaUploads.user_id, userId));
    }

    const [result] = await db
      .select({
        total: count(),
        images: sql<number>`count(*) filter (where ${mediaUploads.type} = 'image')::int`,
        videos: sql<number>`count(*) filter (where ${mediaUploads.type} = 'video')::int`,
        audio: sql<number>`count(*) filter (where ${mediaUploads.type} = 'audio')::int`,
        totalSize: sql<bigint>`COALESCE(sum(${mediaUploads.file_size}), 0)::bigint`,
      })
      .from(mediaUploads)
      .where(and(...conditions));

    return {
      totalUploads: result?.total ?? 0,
      totalImages: result?.images ?? 0,
      totalVideos: result?.videos ?? 0,
      totalAudio: result?.audio ?? 0,
      totalSize: result?.totalSize ?? BigInt(0),
    };
  }
}

export const mediaUploadsRepository = new MediaUploadsRepository();
