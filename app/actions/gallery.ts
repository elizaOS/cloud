"use server";

import { requireAuth } from "@/lib/auth";
import {
  listGenerationsByUser,
  getUserGenerationStats as dbGetUserGenerationStats,
} from "@/lib/queries/generations";
import { deleteBlob } from "@/lib/blob";
import { updateGeneration } from "@/lib/queries/generations";
import { revalidatePath } from "next/cache";

export interface GalleryItem {
  id: string;
  type: "image" | "video";
  url: string;
  thumbnailUrl?: string;
  prompt: string;
  model: string;
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
 * List all media for the current user
 */
export async function listUserMedia(options?: {
  type?: "image" | "video";
  limit?: number;
  offset?: number;
}): Promise<GalleryItem[]> {
  const user = await requireAuth();

  const generations = await listGenerationsByUser(user.id, {
    limit: options?.limit || 100,
    offset: options?.offset || 0,
    type: options?.type,
    status: "completed",
  });

  return generations
    .filter((gen) => gen.storage_url)
    .map((gen) => ({
      id: gen.id,
      type: gen.type as "image" | "video",
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
    }));
}

/**
 * Delete a media item from the gallery
 */
export async function deleteMedia(generationId: string): Promise<boolean> {
  const user = await requireAuth();

  // Get the generation to verify ownership and get the blob URL
  const generations = await listGenerationsByUser(user.id, {
    limit: 1,
  });
  const generation = generations.find((g) => g.id === generationId);

  if (!generation) {
    throw new Error("Media not found or access denied");
  }

  // Delete from Vercel Blob if it's a blob URL
  if (
    generation.storage_url &&
    generation.storage_url.includes("blob.vercel-storage.com")
  ) {
    try {
      await deleteBlob(generation.storage_url);
    } catch (error) {
      console.error("Failed to delete from Vercel Blob:", error);
      // Continue anyway to mark as deleted in DB
    }
  }

  // Update the generation record to mark as deleted
  await updateGeneration(generationId, {
    status: "deleted",
    updated_at: new Date(),
  });

  revalidatePath("/dashboard/gallery");
  return true;
}

/**
 * Get media statistics for the current user
 */
export async function getUserMediaStats(): Promise<{
  totalImages: number;
  totalVideos: number;
  totalSize: number;
}> {
  const user = await requireAuth();

  // Use optimized database query instead of fetching all records
  return await dbGetUserGenerationStats(user.id);
}

