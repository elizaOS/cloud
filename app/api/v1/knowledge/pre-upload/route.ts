import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";
import { uploadToBlob, deleteBlob } from "@/lib/blob";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import type { PreUploadedFile } from "@/lib/types/knowledge";
import {
  KNOWLEDGE_CONSTANTS,
  ALLOWED_EXTENSIONS,
  ALLOWED_CONTENT_TYPES,
  TEXT_EXTENSIONS_FOR_OCTET_STREAM,
} from "@/lib/constants/knowledge";

const TRUSTED_BLOB_HOSTS = [
  "blob.vercel-storage.com",
  "public.blob.vercel-storage.com",
];

function isValidBlobUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    // Use exact hostname matching to prevent subdomain bypass attacks
    return TRUSTED_BLOB_HOSTS.includes(parsedUrl.hostname);
  } catch {
    return false;
  }
}

/**
 * Extracts the user ID from a pre-upload blob URL path.
 * Blob paths follow the format: knowledge-pre-upload/{userId}/{timestamp}-{filename}
 * Returns null if the path doesn't match the expected format.
 */
function extractUserIdFromBlobPath(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
    // Expected format: knowledge-pre-upload/{userId}/{timestamp}-{filename}
    if (pathParts.length >= 3 && pathParts[0] === "knowledge-pre-upload") {
      return pathParts[1];
    }
    return null;
  } catch {
    return null;
  }
}

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  return lastDot !== -1 ? filename.slice(lastDot).toLowerCase() : "";
}

/**
 * POST /api/v1/knowledge/pre-upload
 * Pre-uploads files to Vercel Blob storage without processing through knowledge service.
 * Used for uploading files before character creation.
 * Files are stored temporarily and will be processed when the character is saved.
 *
 * @param req - Form data with files array.
 * @returns Pre-uploaded file metadata including blob URLs.
 */
async function handlePOST(req: NextRequest) {
  const authResult = await requireAuthOrApiKey(req);
  const { user } = authResult;

  const formData = await req.formData();
  const files = formData.getAll("files") as File[];

  if (!files || files.length === 0) {
    return NextResponse.json(
      {
        error: "No files provided",
        details: "Please upload at least one file",
      },
      { status: 400 },
    );
  }

  if (files.length > KNOWLEDGE_CONSTANTS.MAX_FILES_PER_REQUEST) {
    return NextResponse.json(
      {
        error: "Too many files",
        details: `Maximum ${KNOWLEDGE_CONSTANTS.MAX_FILES_PER_REQUEST} files per request`,
      },
      { status: 400 },
    );
  }

  // Validate files before upload
  for (const file of files) {
    if (file.size > KNOWLEDGE_CONSTANTS.MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: "File too large",
          details: `${file.name} exceeds ${KNOWLEDGE_CONSTANTS.MAX_FILE_SIZE / 1024 / 1024}MB limit`,
        },
        { status: 400 },
      );
    }

    const ext = getFileExtension(file.name);
    if (!ALLOWED_EXTENSIONS.includes(ext as typeof ALLOWED_EXTENSIONS[number])) {
      return NextResponse.json(
        {
          error: "Invalid file type",
          details: `${file.name} has unsupported extension. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const contentType = file.type || "application/octet-stream";
    if (!ALLOWED_CONTENT_TYPES.includes(contentType as typeof ALLOWED_CONTENT_TYPES[number])) {
      return NextResponse.json(
        {
          error: "Invalid content type",
          details: `${file.name} has unsupported content type: ${contentType}`,
        },
        { status: 400 },
      );
    }

    // Stricter validation for application/octet-stream
    // Only allow octet-stream for text-based file formats that browsers may misidentify
    if (contentType === "application/octet-stream") {
      if (!TEXT_EXTENSIONS_FOR_OCTET_STREAM.includes(ext as typeof TEXT_EXTENSIONS_FOR_OCTET_STREAM[number])) {
        return NextResponse.json(
          {
            error: "Invalid content type",
            details: `${file.name}: Binary files (${ext}) must have explicit content type, not application/octet-stream`,
          },
          { status: 400 },
        );
      }
    }
  }

  const results: PreUploadedFile[] = [];
  const errors: Array<{ filename: string; error: string }> = [];

  for (const file of files) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Upload to Vercel Blob
      const blobResult = await uploadToBlob(buffer, {
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        folder: "knowledge-pre-upload",
        userId: user.id,
      });

      results.push({
        id: crypto.randomUUID(),
        filename: file.name,
        blobUrl: blobResult.url,
        contentType: blobResult.contentType,
        size: blobResult.size,
        uploadedAt: Date.now(),
      });

      logger.info("[PreUpload] File uploaded to blob", {
        filename: file.name,
        blobUrl: blobResult.url,
        size: blobResult.size,
      });
    } catch (error) {
      logger.error(`[PreUpload] Error uploading file ${file.name}:`, error);
      errors.push({
        filename: file.name,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  if (results.length === 0) {
    return NextResponse.json(
      {
        error: "All file uploads failed",
        details: errors,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    files: results,
    successCount: results.length,
    failureCount: errors.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}

/**
 * DELETE /api/v1/knowledge/pre-upload
 * Deletes a pre-uploaded file from Vercel Blob storage.
 * Used when users remove files from the pre-upload list before saving a character.
 * Verifies that the blob belongs to the authenticated user before deletion.
 *
 * @param req - JSON body with blobUrl to delete.
 * @returns Success or error response.
 */
async function handleDELETE(req: NextRequest) {
  const authResult = await requireAuthOrApiKey(req);
  const { user } = authResult;

  const body = await req.json();
  const { blobUrl } = body as { blobUrl: string };

  if (!blobUrl) {
    return NextResponse.json(
      { error: "blobUrl is required" },
      { status: 400 },
    );
  }

  if (!isValidBlobUrl(blobUrl)) {
    return NextResponse.json(
      { error: "Invalid or untrusted blob URL" },
      { status: 400 },
    );
  }

  // Verify blob ownership - user can only delete their own pre-uploaded files
  const blobOwnerId = extractUserIdFromBlobPath(blobUrl);
  if (!blobOwnerId || blobOwnerId !== user.id) {
    return NextResponse.json(
      { error: "Unauthorized to delete this file" },
      { status: 403 },
    );
  }

  try {
    await deleteBlob(blobUrl);

    logger.info("[PreUpload] File deleted from blob", { blobUrl, userId: user.id });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[PreUpload] Error deleting blob:", error);
    return NextResponse.json(
      { error: "Failed to delete file" },
      { status: 500 },
    );
  }
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
export const DELETE = withRateLimit(handleDELETE, RateLimitPresets.STANDARD);
