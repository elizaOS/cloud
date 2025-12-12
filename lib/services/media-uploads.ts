/**
 * Service for managing user-uploaded media files.
 *
 * Handles file uploads, storage, and metadata management for
 * media files that were not AI-generated.
 */

import { logger } from "@/lib/utils/logger";
import { storageProviderDiscoveryService } from "@/lib/services/storage-provider-discovery";
import {
  mediaUploadsRepository,
  type MediaUpload,
  type NewMediaUpload,
} from "@/db/repositories";
import { v4 as uuidv4 } from "uuid";

export interface UploadMediaInput {
  organizationId: string;
  userId: string;
  file: {
    data: Buffer | ArrayBuffer;
    filename: string;
    mimeType: string;
  };
  metadata?: {
    source?: string;
    altText?: string;
    tags?: string[];
  };
}

export interface UploadMediaFromUrlInput {
  organizationId: string;
  userId: string;
  url: string;
  filename?: string;
  metadata?: {
    source?: string;
    altText?: string;
    tags?: string[];
  };
}

export interface UploadStats {
  totalUploads: number;
  totalImages: number;
  totalVideos: number;
  totalAudio: number;
  totalSize: bigint;
}

function getMediaType(mimeType: string): "image" | "video" | "audio" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  throw new Error(`Unsupported media type: ${mimeType}`);
}

async function getImageDimensions(
  data: Buffer,
  mimeType: string
): Promise<{ width: number; height: number } | undefined> {
  // Basic image dimension detection for common formats
  if (mimeType === "image/png" && data.length > 24) {
    const width = data.readUInt32BE(16);
    const height = data.readUInt32BE(20);
    return { width, height };
  }

  if (
    (mimeType === "image/jpeg" || mimeType === "image/jpg") &&
    data.length > 2
  ) {
    // JPEG dimension detection is complex, return undefined for now
    // A proper implementation would parse JPEG markers
    return undefined;
  }

  return undefined;
}

class MediaUploadsService {
  async getById(id: string): Promise<MediaUpload | undefined> {
    return await mediaUploadsRepository.findById(id);
  }

  async listByOrganization(
    organizationId: string,
    options?: {
      userId?: string;
      type?: "image" | "video" | "audio";
      limit?: number;
      offset?: number;
    }
  ): Promise<MediaUpload[]> {
    return await mediaUploadsRepository.listByOrganization(
      organizationId,
      options
    );
  }

  async upload(input: UploadMediaInput): Promise<MediaUpload> {
    const { organizationId, userId, file, metadata } = input;

    logger.info("[MediaUploads] Uploading file", {
      organizationId,
      filename: file.filename,
      mimeType: file.mimeType,
    });

    const mediaType = getMediaType(file.mimeType);
    const data = Buffer.isBuffer(file.data)
      ? file.data
      : Buffer.from(file.data);

    // Generate unique filename
    const ext = file.filename.split(".").pop() || "";
    const uniqueFilename = `${uuidv4()}${ext ? `.${ext}` : ""}`;
    const storagePath = `uploads/${organizationId}/${uniqueFilename}`;

    // Upload to storage
    const storage = storageProviderDiscoveryService.getProvider();
    const storageUrl = await storage.upload({
      key: storagePath,
      data,
      contentType: file.mimeType,
    });

    // Generate thumbnail for images
    let thumbnailUrl: string | undefined;
    if (mediaType === "image") {
      // For now, use the same URL - in production, generate actual thumbnail
      thumbnailUrl = storageUrl;
    }

    // Get dimensions for images
    let dimensions: { width?: number; height?: number } | undefined;
    if (mediaType === "image") {
      dimensions = await getImageDimensions(data, file.mimeType);
    }

    const uploadData: NewMediaUpload = {
      organization_id: organizationId,
      user_id: userId,
      filename: uniqueFilename,
      original_filename: file.filename,
      storage_url: storageUrl,
      thumbnail_url: thumbnailUrl,
      mime_type: file.mimeType,
      file_size: BigInt(data.length),
      type: mediaType,
      dimensions,
      metadata: metadata || {},
    };

    const upload = await mediaUploadsRepository.create(uploadData);

    logger.info("[MediaUploads] File uploaded successfully", {
      id: upload.id,
      storageUrl,
    });

    return upload;
  }

  async uploadFromUrl(input: UploadMediaFromUrlInput): Promise<MediaUpload> {
    const { organizationId, userId, url, filename, metadata } = input;

    logger.info("[MediaUploads] Uploading from URL", {
      organizationId,
      url,
    });

    // Fetch the file
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch file from URL: ${response.status}`);
    }

    const contentType =
      response.headers.get("content-type") || "application/octet-stream";
    const data = Buffer.from(await response.arrayBuffer());

    // Derive filename from URL if not provided
    const derivedFilename =
      filename || url.split("/").pop()?.split("?")[0] || "uploaded-file";

    return this.upload({
      organizationId,
      userId,
      file: {
        data,
        filename: derivedFilename,
        mimeType: contentType,
      },
      metadata: {
        ...metadata,
        source: metadata?.source || url,
      },
    });
  }

  async update(
    id: string,
    metadata: { altText?: string; tags?: string[] }
  ): Promise<MediaUpload | undefined> {
    logger.info("[MediaUploads] Updating upload metadata", { id });

    const existing = await this.getById(id);
    if (!existing) return undefined;

    return await mediaUploadsRepository.update(id, {
      metadata: {
        ...(existing.metadata as Record<string, unknown>),
        ...metadata,
      },
    });
  }

  async delete(id: string): Promise<void> {
    logger.info("[MediaUploads] Deleting upload", { id });

    const upload = await this.getById(id);
    if (!upload) return;

    // Delete from storage
    const storage = storageProviderDiscoveryService.getProvider();
    const key = upload.storage_url.split("/").slice(-2).join("/");
    await storage.delete(key).catch((err) => {
      logger.error("[MediaUploads] Failed to delete from storage", {
        id,
        error: err,
      });
    });

    await mediaUploadsRepository.delete(id);
  }

  async getStats(organizationId: string, userId?: string): Promise<UploadStats> {
    return await mediaUploadsRepository.getStats(organizationId, userId);
  }

  /**
   * Validates that an upload belongs to the given organization.
   */
  async validateOwnership(
    uploadId: string,
    organizationId: string
  ): Promise<boolean> {
    const upload = await this.getById(uploadId);
    return upload?.organization_id === organizationId;
  }
}

export const mediaUploadsService = new MediaUploadsService();
