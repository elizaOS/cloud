import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMiniappAuth } from "@/lib/middleware/miniapp-auth";
import { miniappStorageService } from "@/lib/services/miniapp-storage";
import { appsService } from "@/lib/services/apps";
import { logger } from "@/lib/utils/logger";
import type { CollectionSchema, CollectionIndex } from "@/db/schemas/miniapp-storage";

const JsonSchemaFieldSchema: z.ZodType<Record<string, unknown>> = z.lazy(() =>
  z.object({
    type: z.enum(["string", "number", "integer", "boolean", "array", "object"]),
    description: z.string().optional(),
    required: z.boolean().optional(),
    default: z.unknown().optional(),
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
    pattern: z.string().optional(),
    format: z.enum(["email", "uri", "date-time", "uuid", "date"]).optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
    items: z.lazy(() => JsonSchemaFieldSchema).optional(),
    minItems: z.number().optional(),
    maxItems: z.number().optional(),
    properties: z.record(z.lazy(() => JsonSchemaFieldSchema)).optional(),
    enum: z.array(z.union([z.string(), z.number(), z.boolean()])).optional(),
  })
);

const CollectionSchemaSchema = z.object({
  type: z.literal("object"),
  properties: z.record(JsonSchemaFieldSchema),
  required: z.array(z.string()).optional(),
  additionalProperties: z.boolean().optional(),
});

const IndexSchema = z.object({
  field: z.string().min(1),
  type: z.enum(["string", "number", "boolean"]),
  unique: z.boolean().optional(),
});

const CreateCollectionSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/, "Name must be lowercase alphanumeric with underscores"),
  description: z.string().max(500).optional(),
  schema: CollectionSchemaSchema,
  indexes: z.array(IndexSchema).max(7).optional(),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Miniapp-Token, X-Api-Key",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  const user = await requireMiniappAuth(request);
  const apps = await appsService.listByOrganization(user.organization_id);
  if (apps.length === 0) {
    return NextResponse.json(
      { success: false, error: "No app found for this organization" },
      { status: 404, headers: corsHeaders }
    );
  }
  const app = apps[0];

  const collections = await miniappStorageService.listCollections(app.id);

  return NextResponse.json(
    {
      success: true,
      collections: collections.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        schema: c.schema,
        indexes: c.indexes,
        version: c.version,
        documentCount: c.document_count,
        isWritable: c.is_writable,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      })),
    },
    { headers: corsHeaders }
  );
}

export async function POST(request: NextRequest) {
  const user = await requireMiniappAuth(request);
  const apps = await appsService.listByOrganization(user.organization_id);
  if (apps.length === 0) {
    return NextResponse.json(
      { success: false, error: "No app found for this organization" },
      { status: 404, headers: corsHeaders }
    );
  }
  const app = apps[0];

  const body = await request.json();
  const validation = CreateCollectionSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid request",
        details: validation.error.format(),
      },
      { status: 400, headers: corsHeaders }
    );
  }

  const { name, description, schema, indexes = [] } = validation.data;
  const existing = await miniappStorageService.getCollection(app.id, name);
  if (existing) {
    return NextResponse.json(
      { success: false, error: `Collection '${name}' already exists` },
      { status: 409, headers: corsHeaders }
    );
  }

  const collection = await miniappStorageService.createCollection({
    appId: app.id,
    name,
    description,
    schema: schema as CollectionSchema,
    indexes: indexes as CollectionIndex[],
  });

  logger.info(`[Miniapp Storage API] Created collection: ${name}`, {
    appId: app.id,
    userId: user.id,
    collectionId: collection.id,
  });

  return NextResponse.json(
    {
      success: true,
      collection: {
        id: collection.id,
        name: collection.name,
        description: collection.description,
        schema: collection.schema,
        indexes: collection.indexes,
        version: collection.version,
        documentCount: collection.document_count,
        isWritable: collection.is_writable,
        createdAt: collection.created_at,
        updatedAt: collection.updated_at,
      },
    },
    { status: 201, headers: corsHeaders }
  );
}
