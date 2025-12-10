/**
 * App Storage Repository
 */

import { and, eq, isNull, desc, asc, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  appCollections,
  appDocuments,
  appDocumentChanges,
  type AppCollection,
  type NewAppCollection,
  type AppDocument,
  type NewAppDocument,
} from "@/db/schemas/app-storage";

export const appCollectionsRepository = {
  async create(data: NewAppCollection): Promise<AppCollection> {
    const [collection] = await db.insert(appCollections).values(data).returning();
    return collection;
  },

  async getById(id: string): Promise<AppCollection | null> {
    const [collection] = await db.select().from(appCollections).where(eq(appCollections.id, id)).limit(1);
    return collection ?? null;
  },

  async getByAppAndName(appId: string, name: string): Promise<AppCollection | null> {
    const [collection] = await db.select().from(appCollections)
      .where(and(eq(appCollections.app_id, appId), eq(appCollections.name, name))).limit(1);
    return collection ?? null;
  },

  async listByApp(appId: string): Promise<AppCollection[]> {
    return db.select().from(appCollections).where(eq(appCollections.app_id, appId)).orderBy(asc(appCollections.name));
  },

  async update(id: string, data: Partial<NewAppCollection>): Promise<AppCollection | null> {
    const [collection] = await db.update(appCollections).set({ ...data, updated_at: new Date() }).where(eq(appCollections.id, id)).returning();
    return collection ?? null;
  },

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(appCollections).where(eq(appCollections.id, id));
    return (result.rowCount ?? 0) > 0;
  },

  async incrementDocumentCount(id: string, amount: number = 1): Promise<void> {
    await db.update(appCollections).set({
      document_count: sql`${appCollections.document_count} + ${amount}`,
      updated_at: new Date(),
    }).where(eq(appCollections.id, id));
  },

  async updateStorageUsed(id: string, bytesUsed: number): Promise<void> {
    await db.update(appCollections).set({ storage_used_bytes: bytesUsed, updated_at: new Date() }).where(eq(appCollections.id, id));
  },
};

export const appDocumentsRepository = {
  async create(data: NewAppDocument): Promise<AppDocument> {
    const [document] = await db.insert(appDocuments).values(data).returning();
    return document;
  },

  async createMany(data: NewAppDocument[]): Promise<AppDocument[]> {
    if (data.length === 0) return [];
    return db.insert(appDocuments).values(data).returning();
  },

  async getById(id: string): Promise<AppDocument | null> {
    const [document] = await db.select().from(appDocuments)
      .where(and(eq(appDocuments.id, id), isNull(appDocuments.deleted_at))).limit(1);
    return document ?? null;
  },

  async listByCollection(collectionId: string, options: { limit?: number; offset?: number; orderBy?: "created_at" | "updated_at"; orderDir?: "asc" | "desc" } = {}): Promise<AppDocument[]> {
    const { limit = 100, offset = 0, orderBy = "created_at", orderDir = "desc" } = options;
    const orderFn = orderDir === "asc" ? asc : desc;
    const orderColumn = orderBy === "updated_at" ? appDocuments.updated_at : appDocuments.created_at;
    return db.select().from(appDocuments)
      .where(and(eq(appDocuments.collection_id, collectionId), isNull(appDocuments.deleted_at)))
      .orderBy(orderFn(orderColumn)).limit(limit).offset(offset);
  },

  async queryByIndex(
    collectionId: string,
    indexSlot: "idx_str_1" | "idx_str_2" | "idx_str_3" | "idx_str_4" | "idx_num_1" | "idx_num_2" | "idx_bool_1",
    value: string | number | boolean,
    options: { limit?: number; offset?: number } = {}
  ): Promise<AppDocument[]> {
    const { limit = 100, offset = 0 } = options;
    return db.select().from(appDocuments)
      .where(and(eq(appDocuments.collection_id, collectionId), eq(appDocuments[indexSlot], value as never), isNull(appDocuments.deleted_at)))
      .orderBy(desc(appDocuments.created_at)).limit(limit).offset(offset);
  },

  async update(id: string, data: Partial<Pick<NewAppDocument, "data" | "idx_str_1" | "idx_str_2" | "idx_str_3" | "idx_str_4" | "idx_num_1" | "idx_num_2" | "idx_bool_1" | "updated_by">>): Promise<AppDocument | null> {
    const [document] = await db.update(appDocuments).set({ ...data, updated_at: new Date() })
      .where(and(eq(appDocuments.id, id), isNull(appDocuments.deleted_at))).returning();
    return document ?? null;
  },

  async softDelete(id: string): Promise<boolean> {
    const result = await db.update(appDocuments).set({ deleted_at: new Date() })
      .where(and(eq(appDocuments.id, id), isNull(appDocuments.deleted_at)));
    return (result.rowCount ?? 0) > 0;
  },

  async hardDelete(id: string): Promise<boolean> {
    const result = await db.delete(appDocuments).where(eq(appDocuments.id, id));
    return (result.rowCount ?? 0) > 0;
  },

  async countByCollection(collectionId: string): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(appDocuments)
      .where(and(eq(appDocuments.collection_id, collectionId), isNull(appDocuments.deleted_at)));
    return result?.count ?? 0;
  },

  async deleteByCollection(collectionId: string): Promise<number> {
    const result = await db.delete(appDocuments).where(eq(appDocuments.collection_id, collectionId));
    return result.rowCount ?? 0;
  },
};

export const appDocumentChangesRepository = {
  async log(data: { document_id: string; app_id: string; operation: "create" | "update" | "delete"; previous_data?: Record<string, unknown>; new_data?: Record<string, unknown>; changed_by?: string }): Promise<void> {
    await db.insert(appDocumentChanges).values(data);
  },

  async getByDocument(documentId: string, limit: number = 50): Promise<Array<typeof appDocumentChanges.$inferSelect>> {
    return db.select().from(appDocumentChanges).where(eq(appDocumentChanges.document_id, documentId)).orderBy(desc(appDocumentChanges.changed_at)).limit(limit);
  },

  async getRecentByApp(appId: string, limit: number = 100): Promise<Array<typeof appDocumentChanges.$inferSelect>> {
    return db.select().from(appDocumentChanges).where(eq(appDocumentChanges.app_id, appId)).orderBy(desc(appDocumentChanges.changed_at)).limit(limit);
  },
};

