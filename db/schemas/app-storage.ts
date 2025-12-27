import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { apps } from "./apps";
import { users } from "./users";

export type JsonSchemaFieldType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "array"
  | "object";

export interface JsonSchemaField {
  type: JsonSchemaFieldType;
  description?: string;
  required?: boolean;
  default?: unknown;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: "email" | "uri" | "date-time" | "uuid" | "date";
  minimum?: number;
  maximum?: number;
  items?: JsonSchemaField;
  minItems?: number;
  maxItems?: number;
  properties?: Record<string, JsonSchemaField>;
  enum?: readonly (string | number | boolean)[];
}

export interface CollectionSchema {
  type: "object";
  properties: Record<string, JsonSchemaField>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface CollectionIndex {
  field: string;
  type: "string" | "number" | "boolean";
  unique?: boolean;
}

export const appCollections = pgTable(
  "app_collections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    app_id: uuid("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    schema: jsonb("schema").$type<CollectionSchema>().notNull(),
    indexes: jsonb("indexes").$type<CollectionIndex[]>().notNull().default([]),
    version: integer("version").default(1).notNull(),
    is_writable: boolean("is_writable").default(true).notNull(),
    document_count: integer("document_count").default(0).notNull(),
    storage_quota_bytes: integer("storage_quota_bytes").default(0).notNull(),
    storage_used_bytes: integer("storage_used_bytes").default(0).notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    app_collection_unique: uniqueIndex("app_collections_app_name_idx").on(
      table.app_id,
      table.name,
    ),
    app_id_idx: index("app_collections_app_id_idx").on(table.app_id),
  }),
);

export const appDocuments = pgTable(
  "app_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    collection_id: uuid("collection_id")
      .notNull()
      .references(() => appCollections.id, { onDelete: "cascade" }),
    app_id: uuid("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    idx_str_1: text("idx_str_1"),
    idx_str_2: text("idx_str_2"),
    idx_str_3: text("idx_str_3"),
    idx_str_4: text("idx_str_4"),
    idx_num_1: numeric("idx_num_1", { precision: 20, scale: 8 }),
    idx_num_2: numeric("idx_num_2", { precision: 20, scale: 8 }),
    idx_bool_1: boolean("idx_bool_1"),
    created_by: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updated_by: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    deleted_at: timestamp("deleted_at"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    app_collection_idx: index("app_documents_app_collection_idx").on(
      table.app_id,
      table.collection_id,
    ),
    idx_str_1_idx: index("app_documents_idx_str_1_idx").on(
      table.app_id,
      table.collection_id,
      table.idx_str_1,
    ),
    idx_str_2_idx: index("app_documents_idx_str_2_idx").on(
      table.app_id,
      table.collection_id,
      table.idx_str_2,
    ),
    idx_str_3_idx: index("app_documents_idx_str_3_idx").on(
      table.app_id,
      table.collection_id,
      table.idx_str_3,
    ),
    idx_str_4_idx: index("app_documents_idx_str_4_idx").on(
      table.app_id,
      table.collection_id,
      table.idx_str_4,
    ),
    idx_num_1_idx: index("app_documents_idx_num_1_idx").on(
      table.app_id,
      table.collection_id,
      table.idx_num_1,
    ),
    idx_num_2_idx: index("app_documents_idx_num_2_idx").on(
      table.app_id,
      table.collection_id,
      table.idx_num_2,
    ),
    idx_bool_1_idx: index("app_documents_idx_bool_1_idx").on(
      table.app_id,
      table.collection_id,
      table.idx_bool_1,
    ),
    created_by_idx: index("app_documents_created_by_idx").on(
      table.app_id,
      table.collection_id,
      table.created_by,
    ),
    deleted_at_idx: index("app_documents_deleted_at_idx").on(table.deleted_at),
  }),
);

export const appDocumentChanges = pgTable(
  "app_document_changes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    document_id: uuid("document_id")
      .notNull()
      .references(() => appDocuments.id, { onDelete: "cascade" }),
    app_id: uuid("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    operation: text("operation")
      .$type<"create" | "update" | "delete">()
      .notNull(),
    previous_data: jsonb("previous_data").$type<Record<string, unknown>>(),
    new_data: jsonb("new_data").$type<Record<string, unknown>>(),
    changed_by: uuid("changed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    changed_at: timestamp("changed_at").notNull().defaultNow(),
  },
  (table) => ({
    document_idx: index("app_document_changes_document_idx").on(
      table.document_id,
    ),
    app_idx: index("app_document_changes_app_idx").on(table.app_id),
    changed_at_idx: index("app_document_changes_changed_at_idx").on(
      table.changed_at,
    ),
  }),
);

export type AppCollection = InferSelectModel<typeof appCollections>;
export type NewAppCollection = InferInsertModel<typeof appCollections>;
export type AppDocument = InferSelectModel<typeof appDocuments>;
export type NewAppDocument = InferInsertModel<typeof appDocuments>;
export type AppDocumentChange = InferSelectModel<typeof appDocumentChanges>;
export type NewAppDocumentChange = InferInsertModel<typeof appDocumentChanges>;
