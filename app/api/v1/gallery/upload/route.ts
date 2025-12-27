import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { mediaUploadsService } from "@/lib/services/media-uploads";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

// Allow larger files for media uploads (50MB)
export const maxDuration = 60;

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * POST /api/v1/gallery/upload
 * Uploads a media file to the gallery.
 */
export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      {
        error: "Unsupported file type",
        allowedTypes: ALLOWED_TYPES,
      },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      {
        error: "File too large",
        maxSize: MAX_FILE_SIZE,
        maxSizeMB: MAX_FILE_SIZE / 1024 / 1024,
      },
      { status: 400 },
    );
  }

  const altText = formData.get("altText") as string | null;
  const tags = formData.get("tags") as string | null;
  const source = formData.get("source") as string | null;

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
      source: source || "api_upload",
      altText: altText || undefined,
      tags: tags ? tags.split(",").map((t) => t.trim()) : undefined,
    },
  });

  logger.info("[Gallery API] Uploaded file", {
    uploadId: upload.id,
    organizationId: user.organization_id,
    fileSize: file.size,
  });

  return NextResponse.json(
    {
      id: upload.id,
      type: upload.type,
      url: upload.storage_url,
      thumbnailUrl: upload.thumbnail_url,
      filename: upload.original_filename,
      mimeType: upload.mime_type,
      fileSize: upload.file_size.toString(),
      dimensions: upload.dimensions,
      createdAt: upload.created_at.toISOString(),
    },
    { status: 201 },
  );
}
