import { getAuthToken } from "./use-auth";

const API_BASE = "/api/proxy/storage";

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

export interface Collection {
  id: string;
  name: string;
  description?: string;
  schema: CollectionSchema;
  indexes: CollectionIndex[];
  version: number;
  documentCount: number;
  isWritable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentMeta {
  collection?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  deletedAt?: string;
}

export interface Document<T = Record<string, unknown>> extends Partial<T> {
  id: string;
  _meta: DocumentMeta;
}

export interface QueryParams {
  filter?: Record<string, unknown>;
  sort?: { field: string; order: "asc" | "desc" };
  limit?: number;
  offset?: number;
  includeDeleted?: boolean;
}

export interface QueryResult<T = Record<string, unknown>> {
  documents: Document<T>[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

function getAuthHeaders(): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  const token = getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
}

async function fetchApi<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `API error: ${response.status}`);
  }

  return data;
}

export async function listCollections(): Promise<Collection[]> {
  const response = await fetchApi<{ success: boolean; collections: Collection[] }>("");
  return response.collections;
}

export async function createCollection(params: {
  name: string;
  description?: string;
  schema: CollectionSchema;
  indexes?: CollectionIndex[];
}): Promise<Collection> {
  const response = await fetchApi<{ success: boolean; collection: Collection }>("", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return response.collection;
}

export async function deleteCollection(name: string): Promise<void> {
  await fetchApi<{ success: boolean }>(`/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

export async function queryDocuments<T = Record<string, unknown>>(
  collection: string,
  params: QueryParams = {}
): Promise<QueryResult<T>> {
  const searchParams = new URLSearchParams();

  if (params.filter) {
    searchParams.set("filter", JSON.stringify(params.filter));
  }
  if (params.sort) {
    searchParams.set("sort", JSON.stringify(params.sort));
  }
  if (params.limit !== undefined) {
    searchParams.set("limit", String(params.limit));
  }
  if (params.offset !== undefined) {
    searchParams.set("offset", String(params.offset));
  }
  if (params.includeDeleted) {
    searchParams.set("includeDeleted", "true");
  }

  const query = searchParams.toString();
  const path = `/${encodeURIComponent(collection)}${query ? `?${query}` : ""}`;

  return fetchApi<QueryResult<T>>(path);
}

export async function getDocument<T = Record<string, unknown>>(
  collection: string,
  documentId: string
): Promise<Document<T>> {
  const response = await fetchApi<{ success: boolean; document: Document<T> }>(
    `/${encodeURIComponent(collection)}/${encodeURIComponent(documentId)}`
  );
  return response.document;
}

export async function insertDocument<T = Record<string, unknown>>(
  collection: string,
  data: T
): Promise<Document<T>> {
  const response = await fetchApi<{ success: boolean; document: Document<T> }>(
    `/${encodeURIComponent(collection)}`,
    {
      method: "POST",
      body: JSON.stringify(data),
    }
  );
  return response.document;
}

export async function insertManyDocuments<T = Record<string, unknown>>(
  collection: string,
  documents: T[]
): Promise<Document<T>[]> {
  const response = await fetchApi<{
    success: boolean;
    documents: Document<T>[];
    count: number;
  }>(`/${encodeURIComponent(collection)}`, {
    method: "POST",
    body: JSON.stringify({ documents }),
  });
  return response.documents;
}

export async function updateDocument<T = Record<string, unknown>>(
  collection: string,
  documentId: string,
  data: Partial<T>
): Promise<Document<T>> {
  const response = await fetchApi<{ success: boolean; document: Document<T> }>(
    `/${encodeURIComponent(collection)}/${encodeURIComponent(documentId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(data),
    }
  );
  return response.document;
}

export async function replaceDocument<T = Record<string, unknown>>(
  collection: string,
  documentId: string,
  data: T
): Promise<Document<T>> {
  const response = await fetchApi<{ success: boolean; document: Document<T> }>(
    `/${encodeURIComponent(collection)}/${encodeURIComponent(documentId)}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    }
  );
  return response.document;
}

export async function deleteDocument(
  collection: string,
  documentId: string,
  hard: boolean = false
): Promise<void> {
  const params = hard ? "?hard=true" : "";
  await fetchApi<{ success: boolean }>(
    `/${encodeURIComponent(collection)}/${encodeURIComponent(documentId)}${params}`,
    { method: "DELETE" }
  );
}

export function collection<T extends Record<string, unknown>>(name: string) {
  return {
    name,

    async query(params: QueryParams = {}): Promise<QueryResult<T>> {
      return queryDocuments<T>(name, params);
    },

    async get(documentId: string): Promise<Document<T>> {
      return getDocument<T>(name, documentId);
    },

    async insert(data: T): Promise<Document<T>> {
      return insertDocument<T>(name, data);
    },

    async insertMany(documents: T[]): Promise<Document<T>[]> {
      return insertManyDocuments<T>(name, documents);
    },

    async update(documentId: string, data: Partial<T>): Promise<Document<T>> {
      return updateDocument<T>(name, documentId, data);
    },

    async replace(documentId: string, data: T): Promise<Document<T>> {
      return replaceDocument<T>(name, documentId, data);
    },

    async delete(documentId: string, hard: boolean = false): Promise<void> {
      return deleteDocument(name, documentId, hard);
    },

    async findOne(filter: Partial<T>): Promise<Document<T> | null> {
      const { documents } = await queryDocuments<T>(name, { filter, limit: 1 });
      return documents[0] ?? null;
    },

    async findById(id: string): Promise<Document<T> | null> {
      const doc = await getDocument<T>(name, id);
      return doc ?? null;
    },

    async count(filter?: Partial<T>): Promise<number> {
      const { pagination } = await queryDocuments<T>(name, { filter, limit: 0 });
      return pagination.total;
    },
  };
}

