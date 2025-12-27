import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { mediaCollectionsService } from "@/lib/services/media-collections";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const UpdateCollectionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  coverImageId: z.string().uuid().optional(),
  metadata: z
    .object({
      purpose: z.enum(["advertising", "app_assets", "general"]).optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/collections/[id]
 * Gets a collection with its items.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const isOwner = await mediaCollectionsService.validateOwnership(
    id,
    user.organization_id!,
  );

  if (!isOwner) {
    return NextResponse.json(
      { error: "Collection not found" },
      { status: 404 },
    );
  }

  const collection = await mediaCollectionsService.getByIdWithItems(id);

  if (!collection) {
    return NextResponse.json(
      { error: "Collection not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    id: collection.id,
    name: collection.name,
    description: collection.description,
    itemCount: collection.item_count,
    isDefault: collection.is_default,
    metadata: collection.metadata,
    createdAt: collection.created_at.toISOString(),
    updatedAt: collection.updated_at.toISOString(),
    items: collection.items.map((item) => ({
      id: item.id,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      url: item.url,
      thumbnailUrl: item.thumbnailUrl,
      type: item.type,
      prompt: item.prompt,
      filename: item.filename,
      mimeType: item.mimeType,
      dimensions: item.dimensions,
      orderIndex: item.orderIndex,
      addedAt: item.addedAt.toISOString(),
    })),
  });
}

/**
 * PATCH /api/v1/collections/[id]
 * Updates a collection.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const isOwner = await mediaCollectionsService.validateOwnership(
    id,
    user.organization_id!,
  );

  if (!isOwner) {
    return NextResponse.json(
      { error: "Collection not found" },
      { status: 404 },
    );
  }

  const body = await request.json();
  const parsed = UpdateCollectionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updated = await mediaCollectionsService.update(id, parsed.data);

  if (!updated) {
    return NextResponse.json(
      { error: "Collection not found" },
      { status: 404 },
    );
  }

  logger.info("[Collections API] Updated collection", { collectionId: id });

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    description: updated.description,
    itemCount: updated.item_count,
    metadata: updated.metadata,
    updatedAt: updated.updated_at.toISOString(),
  });
}

/**
 * DELETE /api/v1/collections/[id]
 * Deletes a collection.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const isOwner = await mediaCollectionsService.validateOwnership(
    id,
    user.organization_id!,
  );

  if (!isOwner) {
    return NextResponse.json(
      { error: "Collection not found" },
      { status: 404 },
    );
  }

  await mediaCollectionsService.delete(id);

  logger.info("[Collections API] Deleted collection", { collectionId: id });

  return NextResponse.json({ success: true });
}
