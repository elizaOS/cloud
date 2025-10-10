import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { generationsService } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/gallery
 * List all media (images and videos) for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKey(request);

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get("type") as "image" | "video" | null;
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = parseInt(searchParams.get("offset") || "0");

    // Get all generations for the user, then filter by type and status
    const allGenerations = await generationsService.listByOrganizationAndStatus(
      user.organization_id,
      "completed",
    );

    let filtered = allGenerations.filter(
      (gen) => gen.storage_url && gen.user_id === user.id,
    );

    if (type) {
      filtered = filtered.filter((gen) => gen.type === type);
    }

    // Apply offset and limit
    const generations = filtered.slice(offset, offset + Math.min(limit, 1000));

    const items = generations.map((gen) => ({
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
        hasMore: filtered.length > offset + limit,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[GALLERY API] Error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to fetch gallery items";

    return NextResponse.json(
      { error: errorMessage },
      {
        status:
          error instanceof Error &&
          (error.message.includes("API key") ||
            error.message.includes("Forbidden"))
            ? 401
            : 500,
      },
    );
  }
}
