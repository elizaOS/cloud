import { db } from "@/db/client";
import {
  appCollections,
  appDocuments,
  appDocumentChanges,
  type AppCollection,
  type AppDocument,
  type CollectionSchema,
  type CollectionIndex,
  type JsonSchemaField,
} from "@/db/schemas/app-storage";
import { eq, and, isNull, sql, desc, asc } from "drizzle-orm";
import { logger } from "@/lib/utils/logger";

interface CreateCollectionParams {
  appId: string;
  name: string;
  description?: string;
  schema: CollectionSchema;
  indexes?: CollectionIndex[];
}

interface QueryParams {
  filter?: Record<string, unknown>;
  sort?: { field: string; order: "asc" | "desc" };
  limit?: number;
  offset?: number;
  includeDeleted?: boolean;
}

const MAX_STRING_INDEXES = 4;
const MAX_NUMERIC_INDEXES = 2;
const MAX_BOOLEAN_INDEXES = 1;

function validateDocument(
  data: Record<string, unknown>,
  schema: CollectionSchema
): string[] {
  const errors: string[] = [];

  for (const field of schema.required ?? []) {
    if (!(field in data) || data[field] === undefined || data[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  for (const [field, fieldSchema] of Object.entries(schema.properties)) {
    const value = data[field];
    if (value === undefined || value === null) {
      continue;
    }
    const fieldErrors = validateField(field, value, fieldSchema);
    errors.push(...fieldErrors);
  }

  if (schema.additionalProperties === false) {
    const allowedFields = new Set(Object.keys(schema.properties));
    for (const field of Object.keys(data)) {
      if (!allowedFields.has(field) && field !== "id") {
        errors.push(`Unexpected field: ${field}`);
      }
    }
  }

  return errors;
}

function validateField(
  fieldName: string,
  value: unknown,
  schema: JsonSchemaField
): string[] {
  const errors: string[] = [];
  const actualType = getJsonType(value);

  if (actualType !== schema.type) {
    if (!(schema.type === "number" && actualType === "integer")) {
      errors.push(
        `Field '${fieldName}' expected ${schema.type}, got ${actualType}`
      );
      return errors;
    }
  }

  if (schema.type === "string" && typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(
        `Field '${fieldName}' must be at least ${schema.minLength} characters`
      );
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(
        `Field '${fieldName}' must be at most ${schema.maxLength} characters`
      );
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      errors.push(`Field '${fieldName}' does not match pattern ${schema.pattern}`);
    }
  }

  if (
    (schema.type === "number" || schema.type === "integer") &&
    typeof value === "number"
  ) {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`Field '${fieldName}' must be >= ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`Field '${fieldName}' must be <= ${schema.maximum}`);
    }
  }

  if (schema.enum !== undefined) {
    if (!schema.enum.includes(value as string | number | boolean)) {
      errors.push(
        `Field '${fieldName}' must be one of: ${schema.enum.join(", ")}`
      );
    }
  }

  if (schema.type === "array" && Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(
        `Field '${fieldName}' must have at least ${schema.minItems} items`
      );
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(
        `Field '${fieldName}' must have at most ${schema.maxItems} items`
      );
    }
    if (schema.items) {
      for (let i = 0; i < value.length; i++) {
        const itemErrors = validateField(`${fieldName}[${i}]`, value[i], schema.items);
        errors.push(...itemErrors);
      }
    }
  }

  return errors;
}

function getJsonType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "number";
  }
  return typeof value;
}

function getIndexSlot(
  field: string,
  indexes: CollectionIndex[]
): string | null {
  let strIdx = 0;
  let numIdx = 0;
  let boolIdx = 0;

  for (const idx of indexes) {
    if (idx.field === field) {
      if (idx.type === "string" && strIdx < MAX_STRING_INDEXES) {
        return `idx_str_${strIdx + 1}`;
      }
      if (idx.type === "number" && numIdx < MAX_NUMERIC_INDEXES) {
        return `idx_num_${numIdx + 1}`;
      }
      if (idx.type === "boolean" && boolIdx < MAX_BOOLEAN_INDEXES) {
        return `idx_bool_${boolIdx + 1}`;
      }
    }
    if (idx.type === "string") strIdx++;
    else if (idx.type === "number") numIdx++;
    else if (idx.type === "boolean") boolIdx++;
  }

  return null;
}

function getValueAtPath(data: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = data;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function populateIndexSlots(
  data: Record<string, unknown>,
  indexes: CollectionIndex[]
): Record<string, string | number | boolean | null> {
  const slots: Record<string, string | number | boolean | null> = {
    idx_str_1: null,
    idx_str_2: null,
    idx_str_3: null,
    idx_str_4: null,
    idx_num_1: null,
    idx_num_2: null,
    idx_bool_1: null,
  };

  let strIdx = 0;
  let numIdx = 0;
  let boolIdx = 0;

  for (const idx of indexes) {
    const value = getValueAtPath(data, idx.field);

    if (value === undefined || value === null) {
      continue;
    }

    if (idx.type === "string" && strIdx < MAX_STRING_INDEXES) {
      slots[`idx_str_${strIdx + 1}`] = String(value);
      strIdx++;
    } else if (idx.type === "number" && numIdx < MAX_NUMERIC_INDEXES) {
      slots[`idx_num_${numIdx + 1}`] = Number(value);
      numIdx++;
    } else if (idx.type === "boolean" && boolIdx < MAX_BOOLEAN_INDEXES) {
      slots[`idx_bool_${boolIdx + 1}`] = Boolean(value);
      boolIdx++;
    }
  }

  return slots;
}

class AppStorageService {
  async createCollection(params: CreateCollectionParams): Promise<AppCollection> {
    const { appId, name, description, schema, indexes = [] } = params;

    const strIndexes = indexes.filter((i) => i.type === "string").length;
    const numIndexes = indexes.filter((i) => i.type === "number").length;
    const boolIndexes = indexes.filter((i) => i.type === "boolean").length;

    if (strIndexes > MAX_STRING_INDEXES) {
      throw new Error(`Maximum ${MAX_STRING_INDEXES} string indexes allowed`);
    }
    if (numIndexes > MAX_NUMERIC_INDEXES) {
      throw new Error(`Maximum ${MAX_NUMERIC_INDEXES} numeric indexes allowed`);
    }
    if (boolIndexes > MAX_BOOLEAN_INDEXES) {
      throw new Error(`Maximum ${MAX_BOOLEAN_INDEXES} boolean indexes allowed`);
    }

    for (const idx of indexes) {
      const rootField = idx.field.split(".")[0];
      if (!schema.properties[rootField]) {
        throw new Error(
          `Index field '${idx.field}' not found in schema properties`
        );
      }
    }

    const [collection] = await db
      .insert(appCollections)
      .values({
        app_id: appId,
        name,
        description,
        schema,
        indexes,
      })
      .returning();

    logger.info(`[AppStorage] Created collection: ${name}`, {
      appId,
      collectionId: collection.id,
      indexCount: indexes.length,
    });

    return collection;
  }

  async getCollection(
    appId: string,
    name: string
  ): Promise<AppCollection | null> {
    const [collection] = await db
      .select()
      .from(appCollections)
      .where(
        and(
          eq(appCollections.app_id, appId),
          eq(appCollections.name, name)
        )
      )
      .limit(1);

    return collection ?? null;
  }

  async listCollections(appId: string): Promise<AppCollection[]> {
    return db
      .select()
      .from(appCollections)
      .where(eq(appCollections.app_id, appId))
      .orderBy(asc(appCollections.name));
  }

  async updateCollectionSchema(
    appId: string,
    name: string,
    schema: CollectionSchema,
    indexes?: CollectionIndex[]
  ): Promise<AppCollection> {
    const collection = await this.getCollection(appId, name);
    if (!collection) {
      throw new Error(`Collection '${name}' not found`);
    }

    const updateData: Partial<AppCollection> = {
      schema,
      version: collection.version + 1,
      updated_at: new Date(),
    };

    if (indexes) {
      updateData.indexes = indexes;
    }

    const [updated] = await db
      .update(appCollections)
      .set(updateData)
      .where(eq(appCollections.id, collection.id))
      .returning();

    logger.info(`[AppStorage] Updated collection schema: ${name}`, {
      appId,
      collectionId: collection.id,
      newVersion: updated.version,
    });

    return updated;
  }

  async deleteCollection(appId: string, name: string): Promise<void> {
    const collection = await this.getCollection(appId, name);
    if (!collection) {
      return; // Idempotent
    }

    await db
      .delete(appCollections)
      .where(eq(appCollections.id, collection.id));

    logger.info(`[AppStorage] Deleted collection: ${name}`, {
      appId,
      collectionId: collection.id,
    });
  }

  async insertDocument(
    appId: string,
    collectionName: string,
    data: Record<string, unknown>,
    userId?: string
  ): Promise<AppDocument> {
    const collection = await this.getCollection(appId, collectionName);
    if (!collection) {
      throw new Error(`Collection '${collectionName}' not found`);
    }

    if (!collection.is_writable) {
      throw new Error(`Collection '${collectionName}' is not writable`);
    }

    const errors = validateDocument(data, collection.schema as CollectionSchema);
    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.join("; ")}`);
    }

    const indexSlots = populateIndexSlots(
      data,
      collection.indexes as CollectionIndex[]
    );

    const [document] = await db
      .insert(appDocuments)
      .values({
        collection_id: collection.id,
        app_id: appId,
        data,
        created_by: userId,
        updated_by: userId,
        ...indexSlots,
      })
      .returning();

    await db
      .update(appCollections)
      .set({
        document_count: sql`${appCollections.document_count} + 1`,
        updated_at: new Date(),
      })
      .where(eq(appCollections.id, collection.id));

    await this.logChange(document.id, appId, "create", null, data, userId);

    return document;
  }

  async getDocument(
    appId: string,
    documentId: string
  ): Promise<AppDocument | null> {
    const [document] = await db
      .select()
      .from(appDocuments)
      .where(
        and(
          eq(appDocuments.app_id, appId),
          eq(appDocuments.id, documentId),
          isNull(appDocuments.deleted_at)
        )
      )
      .limit(1);

    return document ?? null;
  }

  async queryDocuments(
    appId: string,
    collectionName: string,
    params: QueryParams = {}
  ): Promise<{ documents: AppDocument[]; total: number }> {
    const collection = await this.getCollection(appId, collectionName);
    if (!collection) {
      throw new Error(`Collection '${collectionName}' not found`);
    }

    const { filter = {}, sort, limit = 100, offset = 0, includeDeleted = false } = params;
    const indexes = collection.indexes as CollectionIndex[];

    const conditions = [
      eq(appDocuments.app_id, appId),
      eq(appDocuments.collection_id, collection.id),
    ];

    if (!includeDeleted) {
      conditions.push(isNull(appDocuments.deleted_at));
    }

    for (const [field, value] of Object.entries(filter)) {
      const indexSlot = getIndexSlot(field, indexes);

      if (indexSlot) {
        if (indexSlot.startsWith("idx_str_")) {
          const col = appDocuments[indexSlot as keyof typeof appDocuments] as typeof appDocuments.idx_str_1;
          conditions.push(eq(col, String(value)));
        } else if (indexSlot.startsWith("idx_num_")) {
          const col = appDocuments[indexSlot as keyof typeof appDocuments] as typeof appDocuments.idx_num_1;
          conditions.push(eq(col, String(value)));
        } else if (indexSlot.startsWith("idx_bool_")) {
          const col = appDocuments[indexSlot as keyof typeof appDocuments] as typeof appDocuments.idx_bool_1;
          conditions.push(eq(col, Boolean(value)));
        }
      } else {
        conditions.push(
          sql`${appDocuments.data}->>${field} = ${String(value)}`
        );
      }
    }

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(appDocuments)
      .where(and(...conditions));

    let query = db
      .select()
      .from(appDocuments)
      .where(and(...conditions))
      .limit(limit)
      .offset(offset);

    if (sort) {
      const indexSlot = getIndexSlot(sort.field, indexes);

      if (indexSlot) {
        const col = appDocuments[indexSlot as keyof typeof appDocuments];
        query = query.orderBy(sort.order === "desc" ? desc(col) : asc(col)) as typeof query;
      } else if (sort.field === "created_at") {
        query = query.orderBy(
          sort.order === "desc"
            ? desc(appDocuments.created_at)
            : asc(appDocuments.created_at)
        ) as typeof query;
      } else if (sort.field === "updated_at") {
        query = query.orderBy(
          sort.order === "desc"
            ? desc(appDocuments.updated_at)
            : asc(appDocuments.updated_at)
        ) as typeof query;
      } else {
        query = query.orderBy(
          sort.order === "desc"
            ? desc(sql`${appDocuments.data}->>${sort.field}`)
            : asc(sql`${appDocuments.data}->>${sort.field}`)
        ) as typeof query;
      }
    } else {
      query = query.orderBy(desc(appDocuments.created_at)) as typeof query;
    }

    const documents = await query;

    return { documents, total: count };
  }

  async updateDocument(
    appId: string,
    documentId: string,
    data: Partial<Record<string, unknown>>,
    userId?: string
  ): Promise<AppDocument> {
    const existing = await this.getDocument(appId, documentId);
    if (!existing) {
      throw new Error(`Document '${documentId}' not found`);
    }

    const collection = await this.getCollectionById(existing.collection_id);
    if (!collection) {
      throw new Error("Collection not found");
    }

    if (!collection.is_writable) {
      throw new Error(`Collection '${collection.name}' is not writable`);
    }

    const mergedData = { ...existing.data as Record<string, unknown>, ...data };

    const errors = validateDocument(mergedData, collection.schema as CollectionSchema);
    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.join("; ")}`);
    }

    const indexSlots = populateIndexSlots(
      mergedData,
      collection.indexes as CollectionIndex[]
    );

    const [updated] = await db
      .update(appDocuments)
      .set({
        data: mergedData,
        updated_by: userId,
        updated_at: new Date(),
        ...indexSlots,
      })
      .where(eq(appDocuments.id, documentId))
      .returning();

    await this.logChange(
      documentId,
      appId,
      "update",
      existing.data as Record<string, unknown>,
      mergedData,
      userId
    );

    return updated;
  }

  async replaceDocument(
    appId: string,
    documentId: string,
    data: Record<string, unknown>,
    userId?: string
  ): Promise<AppDocument> {
    const existing = await this.getDocument(appId, documentId);
    if (!existing) {
      throw new Error(`Document '${documentId}' not found`);
    }

    const collection = await this.getCollectionById(existing.collection_id);
    if (!collection) {
      throw new Error("Collection not found");
    }

    if (!collection.is_writable) {
      throw new Error(`Collection '${collection.name}' is not writable`);
    }

    const errors = validateDocument(data, collection.schema as CollectionSchema);
    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.join("; ")}`);
    }

    const indexSlots = populateIndexSlots(
      data,
      collection.indexes as CollectionIndex[]
    );

    const [updated] = await db
      .update(appDocuments)
      .set({
        data,
        updated_by: userId,
        updated_at: new Date(),
        ...indexSlots,
      })
      .where(eq(appDocuments.id, documentId))
      .returning();

    await this.logChange(
      documentId,
      appId,
      "update",
      existing.data as Record<string, unknown>,
      data,
      userId
    );

    return updated;
  }

  async deleteDocument(
    appId: string,
    documentId: string,
    userId?: string
  ): Promise<void> {
    const existing = await this.getDocument(appId, documentId);
    if (!existing) {
      return; // Idempotent
    }

    await db
      .update(appDocuments)
      .set({
        deleted_at: new Date(),
        updated_by: userId,
        updated_at: new Date(),
      })
      .where(eq(appDocuments.id, documentId));

    await db
      .update(appCollections)
      .set({
        document_count: sql`GREATEST(${appCollections.document_count} - 1, 0)`,
        updated_at: new Date(),
      })
      .where(eq(appCollections.id, existing.collection_id));

    await this.logChange(
      documentId,
      appId,
      "delete",
      existing.data as Record<string, unknown>,
      null,
      userId
    );
  }

  async purgeDocument(appId: string, documentId: string): Promise<void> {
    await db
      .delete(appDocuments)
      .where(
        and(
          eq(appDocuments.app_id, appId),
          eq(appDocuments.id, documentId)
        )
      );
  }

  async insertMany(
    appId: string,
    collectionName: string,
    documents: Record<string, unknown>[],
    userId?: string
  ): Promise<AppDocument[]> {
    const collection = await this.getCollection(appId, collectionName);
    if (!collection) {
      throw new Error(`Collection '${collectionName}' not found`);
    }

    if (!collection.is_writable) {
      throw new Error(`Collection '${collectionName}' is not writable`);
    }

    const indexes = collection.indexes as CollectionIndex[];
    const schema = collection.schema as CollectionSchema;

    for (let i = 0; i < documents.length; i++) {
      const errors = validateDocument(documents[i], schema);
      if (errors.length > 0) {
        throw new Error(`Document ${i}: ${errors.join("; ")}`);
      }
    }

    const values = documents.map((data) => ({
      collection_id: collection.id,
      app_id: appId,
      data,
      created_by: userId,
      updated_by: userId,
      ...populateIndexSlots(data, indexes),
    }));

    const inserted = await db
      .insert(appDocuments)
      .values(values)
      .returning();

    await db
      .update(appCollections)
      .set({
        document_count: sql`${appCollections.document_count} + ${documents.length}`,
        updated_at: new Date(),
      })
      .where(eq(appCollections.id, collection.id));

    return inserted;
  }

  async deleteMany(
    appId: string,
    collectionName: string,
    filter: Record<string, unknown>,
    userId?: string
  ): Promise<number> {
    const { documents } = await this.queryDocuments(appId, collectionName, {
      filter,
      limit: 10000,
    });

    for (const doc of documents) {
      await this.deleteDocument(appId, doc.id, userId);
    }

    return documents.length;
  }

  private async getCollectionById(id: string): Promise<AppCollection | null> {
    const [collection] = await db
      .select()
      .from(appCollections)
      .where(eq(appCollections.id, id))
      .limit(1);

    return collection ?? null;
  }

  private async logChange(
    documentId: string,
    appId: string,
    operation: "create" | "update" | "delete",
    previousData: Record<string, unknown> | null,
    newData: Record<string, unknown> | null,
    userId?: string
  ): Promise<void> {
    await db.insert(appDocumentChanges).values({
      document_id: documentId,
      app_id: appId,
      operation,
      previous_data: previousData,
      new_data: newData,
      changed_by: userId,
    });
  }

  async getStorageStats(appId: string): Promise<{
    collections: number;
    documents: number;
    storageBytes: number;
  }> {
    const collections = await this.listCollections(appId);

    let totalDocuments = 0;
    let totalStorage = 0;

    for (const collection of collections) {
      totalDocuments += collection.document_count;
      totalStorage += collection.storage_used_bytes;
    }

    return {
      collections: collections.length,
      documents: totalDocuments,
      storageBytes: totalStorage,
    };
  }
}

export const appStorageService = new AppStorageService();
