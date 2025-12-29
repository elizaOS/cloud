/**
 * Gallery actions.
 *
 * This module re-exports client API functions for gallery operations.
 * Previously used "use server" directives, now uses client API routes.
 */

import {
  galleryApi,
  collectionsApi,
  type GalleryItem,
  type GalleryStats,
  type CollectionSummary,
} from "@/lib/api/client";

export type { GalleryItem, CollectionSummary };

/**
 * Lists all completed media items for the authenticated user's organization.
 */
export async function listUserMedia(options?: {
  type?: "image" | "video" | "audio";
  source?: "generation" | "upload" | "all";
  limit?: number;
  offset?: number;
}): Promise<GalleryItem[]> {
  const source = options?.source === "all" ? undefined : options?.source;
  const response = await galleryApi.listItems({
    type: options?.type,
    source,
    limit: options?.limit,
    offset: options?.offset,
  });

  return response.items.map((item) => ({
    ...item,
    createdAt: new Date(item.createdAt),
    completedAt: item.completedAt ? new Date(item.completedAt) : undefined,
  })) as GalleryItem[];
}

/**
 * Deletes a media item from the gallery and storage.
 */
export async function deleteMedia(
  id: string,
  source: "generation" | "upload" = "generation",
): Promise<boolean> {
  const response = await galleryApi.delete(id, source);
  return response.success;
}

/**
 * Uploads a media file to the gallery.
 */
export async function uploadMedia(formData: FormData): Promise<GalleryItem> {
  const file = formData.get("file") as File;
  if (!file) {
    throw new Error("No file provided");
  }

  const altText = formData.get("altText") as string | null;
  const tags = formData.get("tags") as string | null;

  return galleryApi.upload(file, {
    altText: altText ?? undefined,
    tags: tags ?? undefined,
  });
}

/**
 * Gets media statistics for the authenticated user.
 */
export async function getUserMediaStats(): Promise<GalleryStats> {
  const response = await galleryApi.getStats();
  return response.data;
}

// ============================================
// Collection Actions
// ============================================

/**
 * Lists all collections for the authenticated user.
 */
export async function listCollections(): Promise<CollectionSummary[]> {
  const response = await collectionsApi.list();
  return response.collections;
}

/**
 * Creates a new collection.
 */
export async function createCollection(input: {
  name: string;
  description?: string;
  purpose?: "advertising" | "app_assets" | "general";
}): Promise<CollectionSummary> {
  return collectionsApi.create(input);
}

/**
 * Adds items to a collection.
 */
export async function addToCollection(
  collectionId: string,
  items: Array<{ id: string; source: "generation" | "upload" }>,
): Promise<number> {
  const response = await collectionsApi.addItems(
    collectionId,
    items.map((i) => ({ sourceType: i.source, sourceId: i.id })),
  );
  return response.added;
}

/**
 * Removes items from a collection.
 */
export async function removeFromCollection(
  collectionId: string,
  itemIds: string[],
): Promise<void> {
  await collectionsApi.removeItems(collectionId, itemIds);
}

/**
 * Deletes a collection.
 */
export async function deleteCollection(collectionId: string): Promise<void> {
  await collectionsApi.delete(collectionId);
}
