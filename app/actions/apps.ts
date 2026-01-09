"use server";

/**
 * Server actions for app-related operations.
 * Includes promotional asset upload and deletion.
 */

import { requireAuthWithOrg } from "@/lib/auth";
import { appsService } from "@/lib/services/apps";
import { uploadToBlob, deleteBlob, isValidBlobUrl } from "@/lib/blob";
import { logger } from "@/lib/utils/logger";

interface PromotionalAsset {
  type: "social_card" | "banner" | "custom";
  url: string;
  size: { width: number; height: number };
  generatedAt: string;
}

/**
 * Uploads a promotional asset image for an app.
 *
 * @param appId - The app ID to add the asset to.
 * @param formData - Form data containing the image file.
 * @returns Success status with the uploaded asset info, or error details.
 */
export async function uploadPromotionalAsset(appId: string, formData: FormData) {
  try {
    const user = await requireAuthWithOrg();
    const file = formData.get("file") as File;

    if (!file) {
      return { success: false, error: "No file provided" };
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return { success: false, error: "Invalid file type. Please upload an image." };
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return { success: false, error: "File too large. Maximum size is 10MB." };
    }

    // Verify app ownership
    const app = await appsService.getById(appId);
    if (!app || app.organization_id !== user.organization_id) {
      return { success: false, error: "App not found" };
    }

    // Upload to blob storage
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { url } = await uploadToBlob(buffer, {
      filename: file.name,
      contentType: file.type,
      folder: "promotional-assets",
      userId: user.id,
    });

    // Get image dimensions (we'll use default dimensions, or you could use a library to detect)
    // For simplicity, we'll use common social media dimensions
    const newAsset: PromotionalAsset = {
      type: "custom",
      url,
      size: { width: 1200, height: 630 }, // Default social card dimensions
      generatedAt: new Date().toISOString(),
    };

    // Append to existing assets
    const existingAssets = (app.promotional_assets as PromotionalAsset[] | null) || [];
    const updatedAssets = [...existingAssets, newAsset];

    await appsService.update(appId, {
      promotional_assets: updatedAssets,
    });

    logger.info("[Apps Action] Uploaded promotional asset", {
      appId,
      url,
      userId: user.id,
    });

    return { success: true, asset: newAsset };
  } catch (error) {
    logger.error("[Apps Action] Error uploading promotional asset:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to upload asset",
    };
  }
}

/**
 * Deletes a promotional asset from an app.
 *
 * @param appId - The app ID to remove the asset from.
 * @param assetUrl - The URL of the asset to delete.
 * @returns Success status or error details.
 */
export async function deletePromotionalAsset(appId: string, assetUrl: string) {
  try {
    const user = await requireAuthWithOrg();

    // Verify app ownership
    const app = await appsService.getById(appId);
    if (!app || app.organization_id !== user.organization_id) {
      return { success: false, error: "App not found" };
    }

    const existingAssets = (app.promotional_assets as PromotionalAsset[] | null) || [];

    // Find and remove the asset
    const assetIndex = existingAssets.findIndex((a) => a.url === assetUrl);
    if (assetIndex === -1) {
      return { success: false, error: "Asset not found" };
    }

    const removedAsset = existingAssets[assetIndex];
    const updatedAssets = existingAssets.filter((_, i) => i !== assetIndex);

    // Update app with removed asset
    await appsService.update(appId, {
      promotional_assets: updatedAssets.length > 0 ? updatedAssets : null,
    });

    // Try to delete from blob storage if it's our blob URL
    if (isValidBlobUrl(removedAsset.url)) {
      try {
        await deleteBlob(removedAsset.url);
        logger.info("[Apps Action] Deleted blob for promotional asset", {
          appId,
          url: removedAsset.url,
        });
      } catch (blobError) {
        // Log but don't fail - the database is already updated
        logger.warn("[Apps Action] Failed to delete blob, continuing:", blobError);
      }
    }

    logger.info("[Apps Action] Deleted promotional asset", {
      appId,
      assetUrl,
      userId: user.id,
    });

    return { success: true };
  } catch (error) {
    logger.error("[Apps Action] Error deleting promotional asset:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete asset",
    };
  }
}
