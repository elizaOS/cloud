/**
 * Miniapp Storage Repository
 */

import { and, eq, isNull, desc, asc, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  miniappCollections,
  miniappDocuments,
  miniappDocumentChanges,
  type MiniappCollection,
  type NewMiniappCollection,
  type MiniappDocument,
  type NewMiniappDocument,
} from "@/db/schemas/miniapp-storage";

export const miniappCollectionsRepository = {
  async create(data: NewMiniappCollection): Promise<MiniappCollection> {
    const [collection] = await db.insert(miniappCollections).values(data).returning();
    return collection;
  },

  async getById(id: string): Promise<MiniappCollection | null> {
    const [collection] = await db.select().from(miniappCollections).where(eq(miniappCollections.id, id)).limit(1);
    return collection ?? null;
  },

  async getByAppAndName(appId: string, name: string): Promise<MiniappCollection | null> {
    const [collection] = await db.select().from(miniappCollections)
      .where(and(eq(miniappCollections.app_id, appId), eq(miniappCollections.name, name))).limit(1);
    return collection ?? null;
  },

  async listByApp(appId: string): Promise<MiniappCollection[]> {
    return db.select().from(miniappCollections).where(eq(miniappCollections.app_id, appId)).orderBy(asc(miniappCollections.name));
  },

  async update(id: string, data: Partial<NewMiniappCollection>): Promise<MiniappCollection | null> {
    const [collection] = await db.update(miniappCollections).set({ ...data, updated_at: new Date() }).where(eq(miniappCollections.id, id)).returning();
    return collection ?? null;
  },

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(miniappCollections).where(eq(miniappCollections.id, id));
    return (result.rowCount ?? 0) > 0;
  },

  async incrementDocumentCount(id: string, amount: number = 1): Promise<void> {
    await db.update(miniappCollections).set({
      document_count: sql`${miniappCollections.document_count} + ${amount}`,
      updated_at: new Date(),
    }).where(eq(miniappCollections.id, id));
  },

  async updateStorageUsed(id: string, bytesUsed: number): Promise<void> {
    await db.update(miniappCollections).set({ storage_used_bytes: bytesUsed, updated_at: new Date() }).where(eq(miniappCollections.id, id));
  },
};

export const miniappDocumentsRepository = {
  async create(data: NewMiniappDocument): Promise<MiniappDocument> {
    const [document] = await db.insert(miniappDocuments).values(data).returning();
    return document;
  },

  async createMany(data: NewMiniappDocument[]): Promise<MiniappDocument[]> {
    if (data.length === 0) return [];
    return db.insert(miniappDocuments).values(data).returning();
  },

  async getById(id: string): Promise<MiniappDocument | null> {
    const [document] = await db.select().from(miniappDocuments)
      .where(and(eq(miniappDocuments.id, id), isNull(miniappDocuments.deleted_at))).limit(1);
    return document ?? null;
  },

  async listByCollection(collectionId: string, options: { limit?: number; offset?: number; orderBy?: "created_at" | "updated_at"; orderDir?: "asc" | "desc" } = {}): Promise<MiniappDocument[]> {
    const { limit = 100, offset = 0, orderBy = "created_at", orderDir = "desc" } = options;
    const orderFn = orderDir === "asc" ? asc : desc;
    const orderColumn = orderBy === "updated_at" ? miniappDocuments.updated_at : miniappDocuments.created_at;
    return db.select().from(miniappDocuments)
      .where(and(eq(miniappDocuments.collection_id, collectionId), isNull(miniappDocuments.deleted_at)))
      .orderBy(orderFn(orderColumn)).limit(limit).offset(offset);
  },

  async queryByIndex(
    collectionId: string,
    indexSlot: "idx_str_1" | "idx_str_2" | "idx_str_3" | "idx_str_4" | "idx_num_1" | "idx_num_2" | "idx_bool_1",
    value: string | number | boolean,
    options: { limit?: number; offset?: number } = {}
  ): Promise<MiniappDocument[]> {
    const { limit = 100, offset = 0 } = options;
    return db.select().from(miniappDocuments)
      .where(and(eq(miniappDocuments.collection_id, collectionId), eq(miniappDocuments[indexSlot], value as never), isNull(miniappDocuments.deleted_at)))
      .orderBy(desc(miniappDocuments.created_at)).limit(limit).offset(offset);
  },

  async update(id: string, data: Partial<Pick<NewMiniappDocument, "data" | "idx_str_1" | "idx_str_2" | "idx_str_3" | "idx_str_4" | "idx_num_1" | "idx_num_2" | "idx_bool_1" | "updated_by">>): Promise<MiniappDocument | null> {
    const [document] = await db.update(miniappDocuments).set({ ...data, updated_at: new Date() })
      .where(and(eq(miniappDocuments.id, id), isNull(miniappDocuments.deleted_at))).returning();
    return document ?? null;
  },

  async softDelete(id: string): Promise<boolean> {
    const result = await db.update(miniappDocuments).set({ deleted_at: new Date() })
      .where(and(eq(miniappDocuments.id, id), isNull(miniappDocuments.deleted_at)));
    return (result.rowCount ?? 0) > 0;
  },

  async hardDelete(id: string): Promise<boolean> {
    const result = await db.delete(miniappDocuments).where(eq(miniappDocuments.id, id));
    return (result.rowCount ?? 0) > 0;
  },

  async countByCollection(collectionId: string): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(miniappDocuments)
      .where(and(eq(miniappDocuments.collection_id, collectionId), isNull(miniappDocuments.deleted_at)));
    return result?.count ?? 0;
  },

  async deleteByCollection(collectionId: string): Promise<number> {
    const result = await db.delete(miniappDocuments).where(eq(miniappDocuments.collection_id, collectionId));
    return result.rowCount ?? 0;
  },
};

export const miniappDocumentChangesRepository = {
  async log(data: { document_id: string; app_id: string; operation: "create" | "update" | "delete"; previous_data?: Record<string, unknown>; new_data?: Record<string, unknown>; changed_by?: string }): Promise<void> {
    await db.insert(miniappDocumentChanges).values(data);
  },

  async getByDocument(documentId: string, limit: number = 50): Promise<Array<typeof miniappDocumentChanges.$inferSelect>> {
    return db.select().from(miniappDocumentChanges).where(eq(miniappDocumentChanges.document_id, documentId)).orderBy(desc(miniappDocumentChanges.changed_at)).limit(limit);
  },

  async getRecentByApp(appId: string, limit: number = 100): Promise<Array<typeof miniappDocumentChanges.$inferSelect>> {
    return db.select().from(miniappDocumentChanges).where(eq(miniappDocumentChanges.app_id, appId)).orderBy(desc(miniappDocumentChanges.changed_at)).limit(limit);
  },
};

