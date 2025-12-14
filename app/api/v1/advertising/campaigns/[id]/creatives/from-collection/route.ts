/**
 * Create Creatives from Media Collection API
 *
 * POST /api/v1/advertising/campaigns/[id]/creatives/from-collection
 * Creates ad creatives from items in a media collection
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { advertisingService } from "@/lib/services/advertising";
import { mediaCollectionsService } from "@/lib/services/media-collections";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const CreateFromCollectionSchema = z.object({
  collectionId: z.string().uuid(),
  itemIds: z.array(z.string().uuid()).optional(), // If not provided, use all items
  headline: z.string().max(30).optional(),
  primaryText: z.string().max(500).optional(),
  description: z.string().max(90).optional(),
  callToAction: z.enum([
    "LEARN_MORE",
    "SHOP_NOW",
    "SIGN_UP",
    "SUBSCRIBE",
    "CONTACT_US",
    "GET_OFFER",
    "BOOK_NOW",
    "DOWNLOAD",
  ]).optional(),
  destinationUrl: z.string().url(),
  namePrefix: z.string().max(50).optional(),
});

/**
 * POST /api/v1/advertising/campaigns/[id]/creatives/from-collection
 * Creates creatives from media collection items
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id: campaignId } = await params;

  const body = await request.json();
  const parsed = CreateFromCollectionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Verify collection ownership
  const isOwner = await mediaCollectionsService.validateOwnership(
    parsed.data.collectionId,
    user.organization_id!
  );

  if (!isOwner) {
    return NextResponse.json(
      { error: "Collection not found" },
      { status: 404 }
    );
  }

  // Get collection items
  const allItems = await mediaCollectionsService.getItems(parsed.data.collectionId);
  const items = parsed.data.itemIds
    ? allItems.filter((item) => parsed.data.itemIds!.includes(item.id))
    : allItems;

  if (items.length === 0) {
    return NextResponse.json(
      { error: "No items found in collection" },
      { status: 400 }
    );
  }

  const createdCreatives: Array<{
    id: string;
    name: string;
    mediaItemId: string;
  }> = [];

  // Create a creative for each item
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const creativeName = parsed.data.namePrefix
      ? `${parsed.data.namePrefix} - ${i + 1}`
      : `Creative ${i + 1} from Collection`;

    const creative = await advertisingService.createCreative(
      user.organization_id!,
      {
        campaignId,
        name: creativeName,
        type: item.type === "video" ? "video" : "image",
        headline: parsed.data.headline,
        primaryText: parsed.data.primaryText,
        description: parsed.data.description,
        callToAction: parsed.data.callToAction,
        destinationUrl: parsed.data.destinationUrl,
        media: [
          {
            id: item.sourceId,
            source: item.sourceType,
            url: item.url || "",
            thumbnailUrl: item.thumbnailUrl || undefined,
            type: item.type as "image" | "video",
            order: 0,
          },
        ],
      }
    );

    createdCreatives.push({
      id: creative.id,
      name: creative.name,
      mediaItemId: item.id,
    });
  }

  logger.info("[Advertising API] Creatives created from collection", {
    campaignId,
    collectionId: parsed.data.collectionId,
    count: createdCreatives.length,
  });

  return NextResponse.json({
    creatives: createdCreatives,
    count: createdCreatives.length,
  }, { status: 201 });
}

