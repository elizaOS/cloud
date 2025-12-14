/**
 * Media Collections API
 *
 * GET /api/v1/media/collections - List collections
 * POST /api/v1/media/collections - Create collection
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { mediaCollectionsService } from "@/lib/services/media-collections";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CreateCollectionSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  purpose: z.enum(["advertising", "app_assets", "general"]).optional(),
  tags: z.array(z.string()).max(10).optional(),
});

/**
 * GET /api/v1/media/collections
 */
export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const collections = await mediaCollectionsService.listByOrganization(
    user.organization_id!,
    { limit, offset }
  );

  return NextResponse.json({
    collections: collections.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      itemCount: c.item_count,
      coverImageUrl: c.cover_image_id, // Would need to resolve to actual URL
      metadata: c.metadata,
      createdAt: c.created_at.toISOString(),
    })),
    count: collections.length,
  });
}

/**
 * POST /api/v1/media/collections
 */
export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const body = await request.json();
  const parsed = CreateCollectionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
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

  return NextResponse.json(
    {
      id: collection.id,
      name: collection.name,
      description: collection.description,
      createdAt: collection.created_at.toISOString(),
    },
    { status: 201 }
  );
}

