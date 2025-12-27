import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { generationsService } from "@/lib/services/generations";
import { mediaUploadsService } from "@/lib/services/media-uploads";
import { cache as cacheClient } from "@/lib/cache/client";
import { CacheKeys, CacheStaleTTL } from "@/lib/cache/keys";
import { createHash } from "crypto";

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
 * Creates a hash of the filter options for cache key generation.
 */
function getFilterHash(params: {
  type?: string | null;
  source?: string | null;
  limit: number;
  offset: number;
}): string {
  const str = JSON.stringify({
    type: params.type || "all",
    source: params.source || "all",
    limit: params.limit,
    offset: params.offset,
  });
  return createHash("md5").update(str).digest("hex").slice(0, 8);
}

/**
 * Internal function to fetch gallery items from database with parallel queries.
 */
async function fetchGalleryItemsInternal(
  organizationId: string,
  userId: string,
  options: {
    type?: "image" | "video" | "audio" | null;
    source?: "generation" | "upload" | null;
    limit: number;
    offset: number;
  },
): Promise<GalleryItem[]> {
  const items: GalleryItem[] = [];
  const { type, source, limit, offset } = options;
  const halfLimit = Math.ceil(limit / 2);

  // Build parallel fetch promises
  const fetchPromises: Promise<void>[] = [];

  // Fetch generations if not filtering to uploads only
  if (!source || source === "generation") {
    fetchPromises.push(
      generationsService
        .listByOrganizationAndStatus(organizationId, "completed", {
          userId,
          type: type === "audio" ? undefined : (type ?? undefined),
          limit: source === "generation" ? limit : halfLimit,
          offset: source === "generation" ? offset : undefined,
        })
        .then((generations) => {
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
        }),
    );
  }

  // Fetch uploads if not filtering to generations only
  if (!source || source === "upload") {
    fetchPromises.push(
      mediaUploadsService
        .listByOrganization(organizationId, {
          userId,
          type: type ?? undefined,
          limit: source === "upload" ? limit : halfLimit,
          offset: source === "upload" ? offset : undefined,
        })
        .then((uploads) => {
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
        }),
    );
  }

  // Execute queries in parallel
  await Promise.all(fetchPromises);

  // Sort by creation date (newest first)
  items.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  // Apply limit after sorting
  return items.slice(0, limit);
}

/**
 * GET /api/v1/gallery
 * Lists all media (images, videos, audio) for the authenticated user's organization.
 * Includes both AI-generated media and user uploads.
 * Supports filtering by type, source, and pagination.
 * Uses Redis caching with stale-while-revalidate for performance.
 *
 * @param request - Request with optional type, source, limit, and offset query parameters.
 * @returns Paginated list of gallery items with metadata.
 */
export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const organizationId = user.organization_id!;
  const userId = user.id;

  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get("type") as "image" | "video" | "audio" | null;
  const source = searchParams.get("source") as "generation" | "upload" | null;
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 1000);
  const offset = parseInt(searchParams.get("offset") || "0");

  const filterHash = getFilterHash({ type, source, limit, offset });
  const cacheKey = CacheKeys.gallery.items(organizationId, userId, filterHash);

  // Use stale-while-revalidate caching
  const items = await cacheClient.getWithSWR(
    cacheKey,
    CacheStaleTTL.gallery.items,
    () => fetchGalleryItemsInternal(organizationId, userId, { type, source, limit, offset }),
  );

  const paginatedItems = items ?? [];

  return NextResponse.json({
    items: paginatedItems,
    count: paginatedItems.length,
    offset,
    limit,
    hasMore: paginatedItems.length === limit,
  });
}
