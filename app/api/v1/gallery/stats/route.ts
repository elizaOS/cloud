import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { generationsService } from "@/lib/services/generations";
import { mediaUploadsService } from "@/lib/services/media-uploads";
import { cache as cacheClient } from "@/lib/cache/client";
import { CacheKeys, CacheStaleTTL } from "@/lib/cache/keys";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

interface GalleryStats {
  totalImages: number;
  totalVideos: number;
  totalUploads: number;
  totalSize: number;
}

async function fetchGalleryStatsInternal(
  organizationId: string,
  userId: string,
): Promise<GalleryStats> {
  const [genStats, uploadStats] = await Promise.all([
    generationsService.getGalleryStats(organizationId, userId),
    mediaUploadsService.getStats(organizationId, userId),
  ]);

  return {
    totalImages: genStats.totalImages + uploadStats.totalImages,
    totalVideos: genStats.totalVideos + uploadStats.totalVideos,
    totalUploads: uploadStats.totalUploads,
    totalSize: Number(genStats.totalSize) + Number(uploadStats.totalSize),
  };
}

/**
 * GET /api/v1/gallery/stats
 * Gets media statistics for the authenticated user.
 * Includes both generations and uploads.
 */
export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const organizationId = user.organization_id!;
  const userId = user.id;
  const cacheKey = CacheKeys.gallery.stats(organizationId, userId);

  const stats = await cacheClient.getWithSWR(
    cacheKey,
    CacheStaleTTL.gallery.stats,
    () => fetchGalleryStatsInternal(organizationId, userId),
  );

  return NextResponse.json({
    success: true,
    data: stats ?? { totalImages: 0, totalVideos: 0, totalUploads: 0, totalSize: 0 },
  });
}

