import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { mediaCollectionsService } from "@/lib/services/media-collections";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const CreateCollectionSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  purpose: z.enum(["advertising", "app_assets", "general"]).optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * GET /api/v1/collections
 * Lists all collections for the authenticated user's organization.
 */
export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");

  const collections = await mediaCollectionsService.listByOrganization(
    user.organization_id!,
    { userId: user.id, limit, offset },
  );

  return NextResponse.json({
    collections: collections.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      itemCount: c.item_count,
      isDefault: c.is_default,
      metadata: c.metadata,
      createdAt: c.created_at.toISOString(),
      updatedAt: c.updated_at.toISOString(),
    })),
    count: collections.length,
    offset,
    limit,
  });
}

/**
 * POST /api/v1/collections
 * Creates a new collection.
 */
export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const body = await request.json();
  const parsed = CreateCollectionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const collection = await mediaCollectionsService.create({
    organizationId: user.organization_id!,
    userId: user.id,
    name: parsed.data.name,
    description: parsed.data.description,
    purpose: parsed.data.purpose,
    tags: parsed.data.tags,
  });

  logger.info("[Collections API] Created collection", {
    collectionId: collection.id,
    organizationId: user.organization_id,
  });

  return NextResponse.json(
    {
      id: collection.id,
      name: collection.name,
      description: collection.description,
      itemCount: collection.item_count,
      metadata: collection.metadata,
      createdAt: collection.created_at.toISOString(),
    },
    { status: 201 },
  );
}
