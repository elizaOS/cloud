"use server";

import { requireAuthWithOrg } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";
import { generationsService } from "@/lib/services/generations";
import { mediaUploadsService } from "@/lib/services/media-uploads";
import { mediaCollectionsService } from "@/lib/services/media-collections";
import { deleteBlob } from "@/lib/blob";
import { revalidatePath } from "next/cache";

export interface GalleryItem {
  id: string;
  type: "image" | "video" | "audio";
  source: "generation" | "upload";
  url: string;
  thumbnailUrl?: string;
  prompt?: string;
  filename?: string;
  model?: string;
  status: string;
  createdAt: Date;
  completedAt?: Date;
  dimensions?: {
    width?: number;
    height?: number;
    duration?: number;
  };
  mimeType?: string;
  fileSize?: bigint;
}

/**
 * Lists all completed media items for the authenticated user's organization.
 * Includes both AI-generated media and user uploads.
 *
 * @param options - Optional filters for type, source, limit, and pagination offset.
 * @returns Array of gallery items with metadata.
 */
export async function listUserMedia(options?: {
  type?: "image" | "video" | "audio";
  source?: "generation" | "upload" | "all";
  limit?: number;
  offset?: number;
}): Promise<GalleryItem[]> {
  const user = await requireAuthWithOrg();
  const items: GalleryItem[] = [];
  const source = options?.source || "all";
  const halfLimit = options?.limit ? Math.ceil(options.limit / 2) : undefined;

  // Fetch generations if not filtering to uploads only
  if (source === "all" || source === "generation") {
    const generations = await generationsService.listByOrganizationAndStatus(
      user.organization_id!,
      "completed",
      {
        userId: user.id,
        type: options?.type === "audio" ? undefined : options?.type,
        limit: source === "generation" ? options?.limit : halfLimit,
        offset: source === "generation" ? options?.offset : undefined,
      }
    );

    const filtered = generations.filter((gen) => gen.storage_url);

    items.push(
      ...filtered.map((gen) => ({
        id: gen.id,
        type: gen.type as "image" | "video",
        source: "generation" as const,
        url: gen.storage_url!,
        thumbnailUrl: gen.thumbnail_url || undefined,
        prompt: gen.prompt,
        model: gen.model,
        status: gen.status,
        createdAt: gen.created_at,
        completedAt: gen.completed_at || undefined,
        dimensions: gen.dimensions || undefined,
        mimeType: gen.mime_type || undefined,
        fileSize: gen.file_size || undefined,
      }))
    );
  }

  // Fetch uploads if not filtering to generations only
  if (source === "all" || source === "upload") {
    const uploads = await mediaUploadsService.listByOrganization(
      user.organization_id!,
      {
        userId: user.id,
        type: options?.type,
        limit: source === "upload" ? options?.limit : halfLimit,
        offset: source === "upload" ? options?.offset : undefined,
      }
    );

    items.push(
      ...uploads.map((upload) => ({
        id: upload.id,
        type: upload.type as "image" | "video" | "audio",
        source: "upload" as const,
        url: upload.storage_url,
        thumbnailUrl: upload.thumbnail_url || undefined,
        filename: upload.original_filename,
        status: "completed",
        createdAt: upload.created_at,
        dimensions: upload.dimensions || undefined,
        mimeType: upload.mime_type || undefined,
        fileSize: upload.file_size || undefined,
      }))
    );
  }

  // Sort by creation date (newest first)
  items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  // Apply limit after sorting
  if (options?.limit && items.length > options.limit) {
    return items.slice(0, options.limit);
  }

  return items;
}

/**
 * Deletes a media item from the gallery and storage.
 *
 * @param id - The ID of the media item to delete.
 * @param source - Whether this is a "generation" or "upload".
 * @returns True if deletion was successful.
 * @throws If the media is not found or access is denied.
 */
export async function deleteMedia(
  id: string,
  source: "generation" | "upload" = "generation"
): Promise<boolean> {
  const user = await requireAuthWithOrg();

  if (source === "generation") {
    const generation = await generationsService.getById(id);

    if (!generation || generation.user_id !== user.id) {
      throw new Error("Media not found or access denied");
    }

    if (
      generation.storage_url &&
      generation.storage_url.includes("blob.vercel-storage.com")
    ) {
      await deleteBlob(generation.storage_url).catch((error) => {
        logger.error("Failed to delete from Vercel Blob:", error);
      });
    }

    await generationsService.updateStatus(id, "deleted");
  } else {
    const upload = await mediaUploadsService.getById(id);

    if (!upload || upload.user_id !== user.id) {
      throw new Error("Media not found or access denied");
    }

    await mediaUploadsService.delete(id);
  }

  revalidatePath("/dashboard/gallery");
  return true;
}

/**
 * Uploads a media file to the gallery.
 *
 * @param formData - Form data containing the file to upload.
 * @returns The created gallery item.
 */
export async function uploadMedia(formData: FormData): Promise<GalleryItem> {
  const user = await requireAuthWithOrg();

  const file = formData.get("file") as File;
  if (!file) {
    throw new Error("No file provided");
  }

  const altText = formData.get("altText") as string | null;
  const tags = formData.get("tags") as string | null;

  const arrayBuffer = await file.arrayBuffer();

  const upload = await mediaUploadsService.upload({
    organizationId: user.organization_id!,
    userId: user.id,
    file: {
      data: Buffer.from(arrayBuffer),
      filename: file.name,
      mimeType: file.type,
    },
    metadata: {
      source: "gallery_upload",
      altText: altText || undefined,
      tags: tags ? tags.split(",").map((t) => t.trim()) : undefined,
    },
  });

  revalidatePath("/dashboard/gallery");

  return {
    id: upload.id,
    type: upload.type as "image" | "video" | "audio",
    source: "upload",
    url: upload.storage_url,
    thumbnailUrl: upload.thumbnail_url || undefined,
    filename: upload.original_filename,
    status: "completed",
    createdAt: upload.created_at,
    dimensions: upload.dimensions || undefined,
    mimeType: upload.mime_type || undefined,
    fileSize: upload.file_size || undefined,
  };
}

/**
 * Gets media statistics for the authenticated user.
 * Includes both generations and uploads.
 *
 * @returns Statistics including total images, videos, and total file size.
 */
export async function getUserMediaStats(): Promise<{
  totalImages: number;
  totalVideos: number;
  totalUploads: number;
  totalSize: number;
}> {
  const user = await requireAuthWithOrg();

  // Get completed generations
  const generations = await generationsService.listByOrganizationAndStatus(
    user.organization_id!,
    "completed",
    { userId: user.id }
  );

  const userGenerations = generations.filter((gen) => gen.storage_url);

  // Get uploads
  const uploadStats = await mediaUploadsService.getStats(
    user.organization_id!,
    user.id
  );

  const genImages = userGenerations.filter((gen) => gen.type === "image").length;
  const genVideos = userGenerations.filter((gen) => gen.type === "video").length;
  const genSize = userGenerations.reduce(
    (acc, gen) => acc + Number(gen.file_size || 0),
    0
  );

  return {
    totalImages: genImages + uploadStats.totalImages,
    totalVideos: genVideos + uploadStats.totalVideos,
    totalUploads: uploadStats.totalUploads,
    totalSize: genSize + Number(uploadStats.totalSize),
  };
}

// ============================================
// Collection Actions
// ============================================

export interface CollectionSummary {
  id: string;
  name: string;
  description?: string;
  itemCount: number;
  coverImageUrl?: string;
  createdAt: Date;
}

/**
 * Lists all collections for the authenticated user.
 */
export async function listCollections(): Promise<CollectionSummary[]> {
  const user = await requireAuthWithOrg();

  const collections = await mediaCollectionsService.listByOrganization(
    user.organization_id!,
    { userId: user.id }
  );

  return collections.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description || undefined,
    itemCount: c.item_count,
    createdAt: c.created_at,
  }));
}

/**
 * Creates a new collection.
 */
export async function createCollection(input: {
  name: string;
  description?: string;
  purpose?: "advertising" | "app_assets" | "general";
}): Promise<CollectionSummary> {
  const user = await requireAuthWithOrg();

  const collection = await mediaCollectionsService.create({
    organizationId: user.organization_id!,
    userId: user.id,
    name: input.name,
    description: input.description,
    purpose: input.purpose,
  });

  revalidatePath("/dashboard/gallery");

  return {
    id: collection.id,
    name: collection.name,
    description: collection.description || undefined,
    itemCount: collection.item_count,
    createdAt: collection.created_at,
  };
}

/**
 * Adds items to a collection.
 */
export async function addToCollection(
  collectionId: string,
  items: Array<{ id: string; source: "generation" | "upload" }>
): Promise<number> {
  const user = await requireAuthWithOrg();

  const isOwner = await mediaCollectionsService.validateOwnership(
    collectionId,
    user.organization_id!
  );

  if (!isOwner) {
    throw new Error("Collection not found or access denied");
  }

  const added = await mediaCollectionsService.addItems(
    collectionId,
    items.map((i) => ({ sourceType: i.source, sourceId: i.id }))
  );

  revalidatePath("/dashboard/gallery");
  return added;
}

/**
 * Removes items from a collection.
 */
export async function removeFromCollection(
  collectionId: string,
  itemIds: string[]
): Promise<void> {
  const user = await requireAuthWithOrg();

  const isOwner = await mediaCollectionsService.validateOwnership(
    collectionId,
    user.organization_id!
  );

  if (!isOwner) {
    throw new Error("Collection not found or access denied");
  }

  await mediaCollectionsService.removeItems(collectionId, itemIds);
  revalidatePath("/dashboard/gallery");
}

/**
 * Deletes a collection.
 */
export async function deleteCollection(collectionId: string): Promise<void> {
  const user = await requireAuthWithOrg();

  const isOwner = await mediaCollectionsService.validateOwnership(
    collectionId,
    user.organization_id!
  );

  if (!isOwner) {
    throw new Error("Collection not found or access denied");
  }

  await mediaCollectionsService.delete(collectionId);
  revalidatePath("/dashboard/gallery");
}
