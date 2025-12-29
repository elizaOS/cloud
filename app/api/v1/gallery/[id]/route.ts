import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { generationsService } from "@/lib/services/generations";
import { mediaUploadsService } from "@/lib/services/media-uploads";
import { deleteBlob } from "@/lib/blob";
import { cache as cacheClient } from "@/lib/cache/client";
import { CacheKeys } from "@/lib/cache/keys";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

async function invalidateGalleryCache(
  organizationId: string,
  userId: string,
): Promise<void> {
  const pattern = CacheKeys.gallery.userPattern(organizationId, userId);
  await cacheClient.delPattern(pattern).catch((error: Error) => {
    logger.error("[Gallery API] Failed to invalidate cache:", error);
  });
}

/**
 * DELETE /api/v1/gallery/[id]
 * Deletes a media item from the gallery and storage.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;
  const organizationId = user.organization_id!;

  const searchParams = request.nextUrl.searchParams;
  const source = searchParams.get("source") as "generation" | "upload" | null;

  // Try to find and delete as generation first, then as upload
  if (!source || source === "generation") {
    const generation = await generationsService.getById(id);
    if (generation && generation.user_id === user.id) {
      if (
        generation.storage_url &&
        generation.storage_url.includes("blob.vercel-storage.com")
      ) {
        await deleteBlob(generation.storage_url).catch((error: Error) => {
          logger.error("[Gallery API] Failed to delete from Vercel Blob:", error);
        });
      }

      await generationsService.updateStatus(id, "deleted");

      logger.info("[Gallery API] Deleted generation", {
        id,
        organizationId,
      });

      await invalidateGalleryCache(organizationId, user.id);
      revalidatePath("/dashboard/gallery");

      return NextResponse.json({ success: true });
    }

    if (source === "generation") {
      return NextResponse.json(
        { success: false, error: "Media not found or access denied" },
        { status: 404 },
      );
    }
  }

  // Try upload
  const upload = await mediaUploadsService.getById(id);
  if (!upload || upload.user_id !== user.id) {
    return NextResponse.json(
      { success: false, error: "Media not found or access denied" },
      { status: 404 },
    );
  }

  await mediaUploadsService.delete(id);

  logger.info("[Gallery API] Deleted upload", {
    id,
    organizationId,
  });

  await invalidateGalleryCache(organizationId, user.id);
  revalidatePath("/dashboard/gallery");

  return NextResponse.json({ success: true });
}

