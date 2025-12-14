/**
 * Media Collection Items API
 *
 * GET /api/v1/media/collections/[id]/items - List items in collection
 * POST /api/v1/media/collections/[id]/items - Add items to collection
 * DELETE /api/v1/media/collections/[id]/items - Remove items from collection
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { mediaCollectionsService } from "@/lib/services/media-collections";
import { z } from "zod";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const AddItemsSchema = z.object({
  items: z.array(
    z.object({
      sourceType: z.enum(["generation", "upload"]),
      sourceId: z.string().uuid(),
    })
  ).min(1).max(50),
});

const RemoveItemsSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(50),
});

/**
 * GET /api/v1/media/collections/[id]/items
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  // Verify ownership
  const isOwner = await mediaCollectionsService.validateOwnership(
    id,
    user.organization_id!
  );

  if (!isOwner) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  const items = await mediaCollectionsService.getItems(id);

  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      type: item.type || "image",
      url: item.url,
      thumbnailUrl: item.thumbnailUrl,
      filename: item.filename,
      prompt: item.prompt,
      orderIndex: item.orderIndex,
      addedAt: item.addedAt.toISOString(),
    })),
    count: items.length,
  });
}

/**
 * POST /api/v1/media/collections/[id]/items
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  // Verify ownership
  const isOwner = await mediaCollectionsService.validateOwnership(
    id,
    user.organization_id!
  );

  if (!isOwner) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = AddItemsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const addedCount = await mediaCollectionsService.addItems(id, parsed.data.items);

  return NextResponse.json({
    added: addedCount,
    message: `Added ${addedCount} items to collection`,
  });
}

/**
 * DELETE /api/v1/media/collections/[id]/items
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  // Verify ownership
  const isOwner = await mediaCollectionsService.validateOwnership(
    id,
    user.organization_id!
  );

  if (!isOwner) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
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

  return NextResponse.json({
    removed: parsed.data.itemIds.length,
    message: `Removed ${parsed.data.itemIds.length} items from collection`,
  });
}

