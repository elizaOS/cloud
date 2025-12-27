import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { appStorageService } from "@/lib/services/app-storage";
import { appsService } from "@/lib/services/apps";
import { logger } from "@/lib/utils/logger";

const QueryParamsSchema = z.object({
  filter: z.record(z.unknown()).optional(),
  sort: z
    .object({
      field: z.string(),
      order: z.enum(["asc", "desc"]),
    })
    .optional(),
  limit: z.coerce.number().min(1).max(1000).optional(),
  offset: z.coerce.number().min(0).optional(),
  includeDeleted: z.coerce.boolean().optional(),
});

const InsertManySchema = z.object({
  documents: z.array(z.record(z.unknown())).min(1).max(1000),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-App-Token, X-Api-Key",
};

async function getAppForUser(organizationId: string) {
  const apps = await appsService.listByOrganization(organizationId);
  if (apps.length === 0) {
    return null;
  }
  return apps[0];
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ collection: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { collection: collectionName } = await params;

  const app = await getAppForUser(user.organization_id);
  if (!app) {
    return NextResponse.json(
      { success: false, error: "No app found for this organization" },
      { status: 404, headers: corsHeaders },
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const queryParams: Record<string, unknown> = {};

  const filterStr = searchParams.get("filter");
  if (filterStr) {
    queryParams.filter = JSON.parse(filterStr);
  }

  const sortStr = searchParams.get("sort");
  if (sortStr) {
    queryParams.sort = JSON.parse(sortStr);
  }

  const limitStr = searchParams.get("limit");
  if (limitStr) queryParams.limit = parseInt(limitStr, 10);

  const offsetStr = searchParams.get("offset");
  if (offsetStr) queryParams.offset = parseInt(offsetStr, 10);

  const includeDeletedStr = searchParams.get("includeDeleted");
  if (includeDeletedStr)
    queryParams.includeDeleted = includeDeletedStr === "true";

  const validation = QueryParamsSchema.safeParse(queryParams);
  if (!validation.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid query parameters",
        details: validation.error.format(),
      },
      { status: 400, headers: corsHeaders },
    );
  }

  const { documents, total } = await appStorageService.queryDocuments(
    app.id,
    collectionName,
    validation.data,
  );

  return NextResponse.json(
    {
      success: true,
      documents: documents.map((d) => ({
        id: d.id,
        ...(d.data as Record<string, unknown>),
        _meta: {
          createdAt: d.created_at,
          updatedAt: d.updated_at,
          createdBy: d.created_by,
          deletedAt: d.deleted_at,
        },
      })),
      pagination: {
        total,
        limit: validation.data.limit ?? 100,
        offset: validation.data.offset ?? 0,
        hasMore: (validation.data.offset ?? 0) + documents.length < total,
      },
    },
    { headers: corsHeaders },
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ collection: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { collection: collectionName } = await params;

  const app = await getAppForUser(user.organization_id);
  if (!app) {
    return NextResponse.json(
      { success: false, error: "No app found for this organization" },
      { status: 404, headers: corsHeaders },
    );
  }

  const body = await request.json();

  if ("documents" in body && Array.isArray(body.documents)) {
    const validation = InsertManySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request",
          details: validation.error.format(),
        },
        { status: 400, headers: corsHeaders },
      );
    }

    const documents = await appStorageService.insertMany(
      app.id,
      collectionName,
      validation.data.documents,
      user.id,
    );

    logger.info(`[App Storage API] Inserted ${documents.length} documents`, {
      appId: app.id,
      collection: collectionName,
      userId: user.id,
    });

    return NextResponse.json(
      {
        success: true,
        documents: documents.map((d) => ({
          id: d.id,
          ...(d.data as Record<string, unknown>),
          _meta: {
            createdAt: d.created_at,
            updatedAt: d.updated_at,
            createdBy: d.created_by,
          },
        })),
        count: documents.length,
      },
      { status: 201, headers: corsHeaders },
    );
  } else {
    const docData = body.data ?? body;
    delete docData._meta;
    delete docData.id;

    const document = await appStorageService.insertDocument(
      app.id,
      collectionName,
      docData,
      user.id,
    );

    logger.info(`[App Storage API] Inserted document`, {
      appId: app.id,
      collection: collectionName,
      documentId: document.id,
      userId: user.id,
    });

    return NextResponse.json(
      {
        success: true,
        document: {
          id: document.id,
          ...(document.data as Record<string, unknown>),
          _meta: {
            createdAt: document.created_at,
            updatedAt: document.updated_at,
            createdBy: document.created_by,
          },
        },
      },
      { status: 201, headers: corsHeaders },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ collection: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { collection: collectionName } = await params;

  const app = await getAppForUser(user.organization_id);
  if (!app) {
    return NextResponse.json(
      { success: false, error: "No app found for this organization" },
      { status: 404, headers: corsHeaders },
    );
  }

  const collection = await appStorageService.getCollection(
    app.id,
    collectionName,
  );
  if (!collection) {
    return NextResponse.json(
      { success: false, error: `Collection '${collectionName}' not found` },
      { status: 404, headers: corsHeaders },
    );
  }

  await appStorageService.deleteCollection(app.id, collectionName);

  logger.info(`[App Storage API] Deleted collection: ${collectionName}`, {
    appId: app.id,
    collectionId: collection.id,
    userId: user.id,
    documentCount: collection.document_count,
  });

  return NextResponse.json(
    {
      success: true,
      message: `Collection '${collectionName}' deleted`,
      documentsDeleted: collection.document_count,
    },
    { headers: corsHeaders },
  );
}
