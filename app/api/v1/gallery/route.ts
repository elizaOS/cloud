import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { generationsService } from "@/lib/services/generations";
import { mediaUploadsService } from "@/lib/services/media-uploads";

export const dynamic = "force-dynamic";

interface GalleryItem {
  id: string;
  type: string;
  source: "generation" | "upload";
  url: string;
  thumbnailUrl?: string;
  prompt?: string;
  filename?: string;
  model?: string;
  provider?: string;
  status: string;
  createdAt: string;
  completedAt?: string;
  dimensions?: Record<string, number>;
  mimeType?: string;
  fileSize?: string;
  metadata?: Record<string, unknown>;
}

/**
 * GET /api/v1/gallery
 * Lists all media (images, videos, audio) for the authenticated user's organization.
 * Includes both AI-generated media and user uploads.
 * Supports filtering by type, source, and pagination.
 *
 * @param request - Request with optional type, source, limit, and offset query parameters.
 * @returns Paginated list of gallery items with metadata.
 */
export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get("type") as "image" | "video" | "audio" | null;
  const source = searchParams.get("source") as "generation" | "upload" | null;
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 1000);
  const offset = parseInt(searchParams.get("offset") || "0");

  const items: GalleryItem[] = [];
  const halfLimit = Math.ceil(limit / 2);

  // Fetch generations if not filtering to uploads only
  if (!source || source === "generation") {
    const generations = await generationsService.listByOrganizationAndStatus(
      user.organization_id!,
      "completed",
      {
        userId: user.id,
        type: type === "audio" ? undefined : (type ?? undefined),
        limit: source === "generation" ? limit : halfLimit,
        offset: source === "generation" ? offset : undefined,
      }
    );

    for (const gen of generations) {
      if (!gen.storage_url) continue;
      items.push({
        id: gen.id,
        type: gen.type,
        source: "generation",
        url: gen.storage_url,
        thumbnailUrl: gen.thumbnail_url ?? undefined,
        prompt: gen.prompt,
        model: gen.model,
        provider: gen.provider,
        status: gen.status,
        createdAt: gen.created_at.toISOString(),
        completedAt: gen.completed_at?.toISOString(),
        dimensions: gen.dimensions ?? undefined,
        mimeType: gen.mime_type ?? undefined,
        fileSize: gen.file_size?.toString(),
        metadata: gen.metadata as Record<string, unknown>,
      });
    }
  }

  // Fetch uploads if not filtering to generations only
  if (!source || source === "upload") {
    const uploads = await mediaUploadsService.listByOrganization(
      user.organization_id!,
      {
        userId: user.id,
        type: type ?? undefined,
        limit: source === "upload" ? limit : halfLimit,
        offset: source === "upload" ? offset : undefined,
      }
    );

    for (const upload of uploads) {
      items.push({
        id: upload.id,
        type: upload.type,
        source: "upload",
        url: upload.storage_url,
        thumbnailUrl: upload.thumbnail_url ?? undefined,
        filename: upload.original_filename,
        status: "completed",
        createdAt: upload.created_at.toISOString(),
        dimensions: upload.dimensions ?? undefined,
        mimeType: upload.mime_type ?? undefined,
        fileSize: upload.file_size?.toString(),
        metadata: upload.metadata as Record<string, unknown>,
      });
    }
  }

  // Sort by creation date (newest first)
  items.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Apply limit after sorting
  const paginatedItems = items.slice(0, limit);

  return NextResponse.json({
    items: paginatedItems,
    count: paginatedItems.length,
    offset,
    limit,
    hasMore: items.length > limit,
  });
}
