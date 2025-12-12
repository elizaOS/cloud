import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { mediaCollectionsService } from "@/lib/services/media-collections";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const AddItemsSchema = z.object({
  items: z.array(
    z.object({
      sourceType: z.enum(["generation", "upload"]),
      sourceId: z.string().uuid(),
    })
  ),
});

const RemoveItemsSchema = z.object({
  itemIds: z.array(z.string().uuid()),
});

const ReorderItemsSchema = z.object({
  itemIds: z.array(z.string().uuid()),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/collections/[id]/items
 * Lists items in a collection.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const isOwner = await mediaCollectionsService.validateOwnership(
    id,
    user.organization_id!
  );

  if (!isOwner) {
    return NextResponse.json(
      { error: "Collection not found" },
      { status: 404 }
    );
  }

  const items = await mediaCollectionsService.getItems(id);

  return NextResponse.json({
    items: items.map((item) => ({
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
    count: items.length,
  });
}

/**
 * POST /api/v1/collections/[id]/items
 * Adds items to a collection.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const isOwner = await mediaCollectionsService.validateOwnership(
    id,
    user.organization_id!
  );

  if (!isOwner) {
    return NextResponse.json(
      { error: "Collection not found" },
      { status: 404 }
    );
  }

  const body = await request.json();
  const parsed = AddItemsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const added = await mediaCollectionsService.addItems(id, parsed.data.items);

  logger.info("[Collections API] Added items to collection", {
    collectionId: id,
    itemCount: added,
  });

  return NextResponse.json({ added }, { status: 201 });
}

/**
 * DELETE /api/v1/collections/[id]/items
 * Removes items from a collection.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const isOwner = await mediaCollectionsService.validateOwnership(
    id,
    user.organization_id!
  );

  if (!isOwner) {
    return NextResponse.json(
      { error: "Collection not found" },
      { status: 404 }
    );
  }

  const body = await request.json();
  const parsed = RemoveItemsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await mediaCollectionsService.removeItems(id, parsed.data.itemIds);

  logger.info("[Collections API] Removed items from collection", {
    collectionId: id,
    itemCount: parsed.data.itemIds.length,
  });

  return NextResponse.json({ success: true });
}

/**
 * PATCH /api/v1/collections/[id]/items
 * Reorders items in a collection.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const isOwner = await mediaCollectionsService.validateOwnership(
    id,
    user.organization_id!
  );

  if (!isOwner) {
    return NextResponse.json(
      { error: "Collection not found" },
      { status: 404 }
    );
  }

  const body = await request.json();
  const parsed = ReorderItemsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await mediaCollectionsService.reorderItems(id, parsed.data.itemIds);

  logger.info("[Collections API] Reordered items in collection", {
    collectionId: id,
  });

  return NextResponse.json({ success: true });
}
