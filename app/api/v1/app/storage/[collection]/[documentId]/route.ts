import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { appStorageService } from "@/lib/services/app-storage";
import { appsService } from "@/lib/services/apps";
import { logger } from "@/lib/utils/logger";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-App-Token, X-Api-Key",
};

async function getAppForUser(organizationId: string) {
  const apps = await appsService.listByOrganization(organizationId);
  if (apps.length === 0) {
    return null;
  }
  return apps[0];
}

interface RouteParams {
  collection: string;
  documentId: string;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { collection: collectionName, documentId } = await params;

  const app = await getAppForUser(user.organization_id);
  if (!app) {
    return NextResponse.json(
      { success: false, error: "No app found for this organization" },
      { status: 404, headers: corsHeaders }
    );
  }

  const document = await appStorageService.getDocument(app.id, documentId);

  if (!document) {
    return NextResponse.json(
      { success: false, error: "Document not found" },
      { status: 404, headers: corsHeaders }
    );
  }

  return NextResponse.json(
    {
      success: true,
      document: {
        id: document.id,
        ...document.data as Record<string, unknown>,
        _meta: {
          collection: collectionName,
          createdAt: document.created_at,
          updatedAt: document.updated_at,
          createdBy: document.created_by,
          deletedAt: document.deleted_at,
        },
      },
    },
    { headers: corsHeaders }
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { collection: collectionName, documentId } = await params;

  const app = await getAppForUser(user.organization_id);
  if (!app) {
    return NextResponse.json(
      { success: false, error: "No app found for this organization" },
      { status: 404, headers: corsHeaders }
    );
  }

  const body = await request.json();
  const updateData = { ...body };
  delete updateData._meta;
  delete updateData.id;

  const document = await appStorageService.updateDocument(
    app.id,
    documentId,
    updateData,
    user.id
  );

  logger.info(`[App Storage API] Updated document`, {
    appId: app.id,
    collection: collectionName,
    documentId,
    userId: user.id,
  });

  return NextResponse.json(
    {
      success: true,
      document: {
        id: document.id,
        ...document.data as Record<string, unknown>,
        _meta: {
          collection: collectionName,
          createdAt: document.created_at,
          updatedAt: document.updated_at,
          createdBy: document.created_by,
          updatedBy: document.updated_by,
        },
      },
    },
    { headers: corsHeaders }
  );
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { collection: collectionName, documentId } = await params;

  const app = await getAppForUser(user.organization_id);
  if (!app) {
    return NextResponse.json(
      { success: false, error: "No app found for this organization" },
      { status: 404, headers: corsHeaders }
    );
  }

  const body = await request.json();
  const newData = { ...body };
  delete newData._meta;
  delete newData.id;

  const document = await appStorageService.replaceDocument(
    app.id,
    documentId,
    newData,
    user.id
  );

  logger.info(`[App Storage API] Replaced document`, {
    appId: app.id,
    collection: collectionName,
    documentId,
    userId: user.id,
  });

  return NextResponse.json(
    {
      success: true,
      document: {
        id: document.id,
        ...document.data as Record<string, unknown>,
        _meta: {
          collection: collectionName,
          createdAt: document.created_at,
          updatedAt: document.updated_at,
          createdBy: document.created_by,
          updatedBy: document.updated_by,
        },
      },
    },
    { headers: corsHeaders }
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { collection: collectionName, documentId } = await params;

  const app = await getAppForUser(user.organization_id);
  if (!app) {
    return NextResponse.json(
      { success: false, error: "No app found for this organization" },
      { status: 404, headers: corsHeaders }
    );
  }

  const hardDelete = request.nextUrl.searchParams.get("hard") === "true";

  if (hardDelete) {
    await appStorageService.purgeDocument(app.id, documentId);
    logger.info(`[App Storage API] Hard deleted document`, {
      appId: app.id,
      collection: collectionName,
      documentId,
      userId: user.id,
    });
  } else {
    await appStorageService.deleteDocument(app.id, documentId, user.id);
    logger.info(`[App Storage API] Soft deleted document`, {
      appId: app.id,
      collection: collectionName,
      documentId,
      userId: user.id,
    });
  }

  return NextResponse.json(
    {
      success: true,
      message: hardDelete ? "Document permanently deleted" : "Document deleted",
      documentId,
    },
    { headers: corsHeaders }
  );
}
