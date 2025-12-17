import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";
import { uploadToBlob } from "@/lib/blob";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";

const MAX_FILES_PER_REQUEST = 10;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_EXTENSIONS = [".pdf", ".txt", ".md", ".doc", ".docx", ".json", ".xml", ".yaml", ".yml", ".csv"];
const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/json",
  "application/xml",
  "text/xml",
  "application/x-yaml",
  "text/yaml",
  "text/csv",
  "application/octet-stream",
];

interface PreUploadedFile {
  id: string;
  filename: string;
  blobUrl: string;
  contentType: string;
  size: number;
  uploadedAt: number;
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

  if (files.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json(
      {
        error: "Too many files",
        details: `Maximum ${MAX_FILES_PER_REQUEST} files per request`,
      },
      { status: 400 },
    );
  }

  // Validate files before upload
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: "File too large",
          details: `${file.name} exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
        },
        { status: 400 },
      );
    }

    const ext = getFileExtension(file.name);
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        {
          error: "Invalid file type",
          details: `${file.name} has unsupported extension. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const contentType = file.type || "application/octet-stream";
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return NextResponse.json(
        {
          error: "Invalid content type",
          details: `${file.name} has unsupported content type: ${contentType}`,
        },
        { status: 400 },
      );
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

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
