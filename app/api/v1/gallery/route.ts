import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getErrorStatusCode, getSafeErrorMessage } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { generationsService } from "@/lib/services/generations";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const galleryQuerySchema = z.object({
  type: z.enum(["image", "video"]).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * GET /api/v1/gallery
 * Lists all media (images and videos) for the authenticated user's organization.
 * Supports filtering by type and pagination.
 *
 * @param request - Request with optional type, limit, and offset query parameters.
 * @returns Paginated list of gallery items with metadata.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    const parsedQuery = galleryQuerySchema.safeParse({
      type: request.nextUrl.searchParams.get("type") || undefined,
      limit: request.nextUrl.searchParams.get("limit") || undefined,
      offset: request.nextUrl.searchParams.get("offset") || undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsedQuery.error.issues },
        { status: 400 },
      );
    }

    const { type, limit, offset } = parsedQuery.data;

    // Fetch with database-level filtering for performance
    const fetchLimit = Math.min(limit + 1, 1001);
    const allGenerations = await generationsService.listByOrganizationAndStatus(
      user.organization_id!,
      "completed",
      {
        userId: user.id,
        type,
        limit: fetchLimit,
        offset,
      },
    );

    // Filter out generations without storage_url
    const generations = allGenerations.filter((gen) => gen.storage_url);
    const visibleGenerations = generations.slice(0, limit);

    const items = visibleGenerations.map((gen) => ({
      id: gen.id,
      type: gen.type,
      url: gen.storage_url,
      thumbnailUrl: gen.thumbnail_url,
      prompt: gen.prompt,
      negativePrompt: gen.negative_prompt,
      model: gen.model,
      provider: gen.provider,
      status: gen.status,
      createdAt: gen.created_at.toISOString(),
      completedAt: gen.completed_at?.toISOString(),
      dimensions: gen.dimensions,
      mimeType: gen.mime_type,
      fileSize: gen.file_size?.toString(),
      metadata: gen.metadata,
    }));

    return NextResponse.json(
      {
        items,
        count: items.length,
        offset,
        limit,
        hasMore: generations.length > limit,
      },
      { status: 200 },
    );
  } catch (error) {
    logger.error("[GALLERY API] Error:", error);
    const status = getErrorStatusCode(error);
    const errorMessage =
      status === 500
        ? "Failed to fetch gallery items"
        : getSafeErrorMessage(error);

    return NextResponse.json({ error: errorMessage }, { status });
  }
}
