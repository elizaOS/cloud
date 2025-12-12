import { eq, desc, and, sql, count } from "drizzle-orm";
import { db } from "../client";
import {
  mediaCollections,
  type MediaCollection,
  type NewMediaCollection,
} from "../schemas/media-collections";
import {
  mediaCollectionItems,
  type MediaCollectionItem,
  type NewMediaCollectionItem,
} from "../schemas/media-collection-items";
import { generations } from "../schemas/generations";
import { mediaUploads } from "../schemas/media-uploads";

export type { MediaCollection, NewMediaCollection };
export type { MediaCollectionItem, NewMediaCollectionItem };

/**
 * Media item with source information.
 */
export interface MediaItemWithSource {
  id: string;
  sourceType: "generation" | "upload";
  sourceId: string;
  url: string;
  thumbnailUrl: string | null;
  type: string;
  prompt?: string | null;
  filename?: string | null;
  mimeType: string | null;
  dimensions: { width?: number; height?: number; duration?: number } | null;
  orderIndex: number;
  addedAt: Date;
}

/**
 * Repository for media collection database operations.
 */
export class MediaCollectionsRepository {
  async findById(id: string): Promise<MediaCollection | undefined> {
    return await db.query.mediaCollections.findFirst({
      where: eq(mediaCollections.id, id),
    });
  }

  async findByIdWithItems(
    id: string
  ): Promise<{ collection: MediaCollection; items: MediaItemWithSource[] } | undefined> {
    const collection = await this.findById(id);
    if (!collection) return undefined;

    const items = await this.listItems(id);
    return { collection, items };
  }

  async listByOrganization(
    organizationId: string,
    options?: { userId?: string; limit?: number; offset?: number }
  ): Promise<MediaCollection[]> {
    const conditions = [eq(mediaCollections.organization_id, organizationId)];

    if (options?.userId) {
      conditions.push(eq(mediaCollections.user_id, options.userId));
    }

    return await db.query.mediaCollections.findMany({
      where: and(...conditions),
      orderBy: desc(mediaCollections.created_at),
      limit: options?.limit,
      offset: options?.offset,
    });
  }

  async create(data: NewMediaCollection): Promise<MediaCollection> {
    const [collection] = await db
      .insert(mediaCollections)
      .values(data)
      .returning();
    return collection;
  }

  async update(
    id: string,
    data: Partial<NewMediaCollection>
  ): Promise<MediaCollection | undefined> {
    const [updated] = await db
      .update(mediaCollections)
      .set({ ...data, updated_at: new Date() })
      .where(eq(mediaCollections.id, id))
      .returning();
    return updated;
  }

  async delete(id: string): Promise<void> {
    await db.delete(mediaCollections).where(eq(mediaCollections.id, id));
  }

  async listItems(collectionId: string): Promise<MediaItemWithSource[]> {
    const items = await db.query.mediaCollectionItems.findMany({
      where: eq(mediaCollectionItems.collection_id, collectionId),
      orderBy: mediaCollectionItems.order_index,
    });

    if (items.length === 0) return [];

    // Batch fetch all generations and uploads to avoid N+1 queries
    const genIds = items
      .filter((i) => i.source_type === "generation" && i.generation_id)
      .map((i) => i.generation_id!);
    const uploadIds = items
      .filter((i) => i.source_type === "upload" && i.upload_id)
      .map((i) => i.upload_id!);

    const [gens, uploads] = await Promise.all([
      genIds.length > 0
        ? db.query.generations.findMany({
            where: sql`${generations.id} = ANY(${genIds})`,
          })
        : [],
      uploadIds.length > 0
        ? db.query.mediaUploads.findMany({
            where: sql`${mediaUploads.id} = ANY(${uploadIds})`,
          })
        : [],
    ]);

    const genMap = new Map(gens.map((g) => [g.id, g]));
    const uploadMap = new Map(uploads.map((u) => [u.id, u]));

    const results: MediaItemWithSource[] = [];

    for (const item of items) {
      if (item.source_type === "generation" && item.generation_id) {
        const gen = genMap.get(item.generation_id);
        if (gen?.storage_url) {
          results.push({
            id: item.id,
            sourceType: "generation",
            sourceId: gen.id,
            url: gen.storage_url,
            thumbnailUrl: gen.thumbnail_url,
            type: gen.type,
            prompt: gen.prompt,
            mimeType: gen.mime_type,
            dimensions: gen.dimensions,
            orderIndex: item.order_index,
            addedAt: item.added_at,
          });
        }
      } else if (item.source_type === "upload" && item.upload_id) {
        const upload = uploadMap.get(item.upload_id);
        if (upload) {
          results.push({
            id: item.id,
            sourceType: "upload",
            sourceId: upload.id,
            url: upload.storage_url,
            thumbnailUrl: upload.thumbnail_url,
            type: upload.type,
            filename: upload.original_filename,
            mimeType: upload.mime_type,
            dimensions: upload.dimensions,
            orderIndex: item.order_index,
            addedAt: item.added_at,
          });
        }
      }
    }

    return results;
  }

  async addItem(
    collectionId: string,
    sourceType: "generation" | "upload",
    sourceId: string
  ): Promise<MediaCollectionItem> {
    const [maxOrder] = await db
      .select({ maxIndex: sql<number>`COALESCE(MAX(${mediaCollectionItems.order_index}), -1)` })
      .from(mediaCollectionItems)
      .where(eq(mediaCollectionItems.collection_id, collectionId));

    const data: NewMediaCollectionItem = {
      collection_id: collectionId,
      source_type: sourceType,
      order_index: (maxOrder?.maxIndex ?? -1) + 1,
      ...(sourceType === "generation"
        ? { generation_id: sourceId }
        : { upload_id: sourceId }),
    };

    const [item] = await db
      .insert(mediaCollectionItems)
      .values(data)
      .returning();

    await this.updateItemCount(collectionId);
    return item;
  }

  async addItems(
    collectionId: string,
    items: Array<{ sourceType: "generation" | "upload"; sourceId: string }>
  ): Promise<MediaCollectionItem[]> {
    if (items.length === 0) return [];

    const [maxOrder] = await db
      .select({ maxIndex: sql<number>`COALESCE(MAX(${mediaCollectionItems.order_index}), -1)` })
      .from(mediaCollectionItems)
      .where(eq(mediaCollectionItems.collection_id, collectionId));

    let orderIndex = (maxOrder?.maxIndex ?? -1) + 1;

    const values: NewMediaCollectionItem[] = items.map((item) => ({
      collection_id: collectionId,
      source_type: item.sourceType,
      order_index: orderIndex++,
      ...(item.sourceType === "generation"
        ? { generation_id: item.sourceId }
        : { upload_id: item.sourceId }),
    }));

    const inserted = await db
      .insert(mediaCollectionItems)
      .values(values)
      .onConflictDoNothing()
      .returning();

    await this.updateItemCount(collectionId);
    return inserted;
  }

  async removeItem(itemId: string): Promise<void> {
    const [item] = await db
      .delete(mediaCollectionItems)
      .where(eq(mediaCollectionItems.id, itemId))
      .returning();

    if (item) {
      await this.updateItemCount(item.collection_id);
    }
  }

  async removeItems(collectionId: string, itemIds: string[]): Promise<void> {
    if (itemIds.length === 0) return;

    await db
      .delete(mediaCollectionItems)
      .where(
        and(
          eq(mediaCollectionItems.collection_id, collectionId),
          sql`${mediaCollectionItems.id} = ANY(${itemIds})`
        )
      );

    await this.updateItemCount(collectionId);
  }

  async reorderItems(
    collectionId: string,
    itemIds: string[]
  ): Promise<void> {
    await db.transaction(async (tx) => {
      for (let i = 0; i < itemIds.length; i++) {
        await tx
          .update(mediaCollectionItems)
          .set({ order_index: i })
          .where(
            and(
              eq(mediaCollectionItems.id, itemIds[i]),
              eq(mediaCollectionItems.collection_id, collectionId)
            )
          );
      }
    });
  }

  private async updateItemCount(collectionId: string): Promise<void> {
    const [result] = await db
      .select({ count: count() })
      .from(mediaCollectionItems)
      .where(eq(mediaCollectionItems.collection_id, collectionId));

    await db
      .update(mediaCollections)
      .set({ item_count: result?.count ?? 0, updated_at: new Date() })
      .where(eq(mediaCollections.id, collectionId));
  }
}

export const mediaCollectionsRepository = new MediaCollectionsRepository();
