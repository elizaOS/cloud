/**
 * Media Uploads API
 *
 * GET /api/v1/media/uploads - List uploaded media
 * POST /api/v1/media/uploads - Upload new media (from URL or form data)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { mediaUploadsRepository } from "@/db/repositories";
import { mediaUploadsService } from "@/lib/services/media-uploads";
import { z } from "zod";

export const dynamic = "force-dynamic";

const UploadFromUrlSchema = z.object({
  url: z.string().url(),
  filename: z.string().optional(),
  metadata: z.object({
    source: z.string().optional(),
    altText: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }).optional(),
});

/**
 * GET /api/v1/media/uploads
 * List uploaded media for the organization
 */
export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const url = new URL(request.url);
  const type = url.searchParams.get("type") as "image" | "video" | "audio" | null;
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const uploads = await mediaUploadsRepository.listByOrganization(
    user.organization_id!,
    {
      type: type || undefined,
      limit,
      offset,
    }
  );

  return NextResponse.json({
    uploads: uploads.map((u) => ({
      id: u.id,
      type: u.type,
      url: u.storage_url,
      storage_url: u.storage_url,
      filename: u.filename,
      mimeType: u.mime_type,
      mime_type: u.mime_type,
      size: u.file_size,
      file_size: u.file_size,
      width: u.width,
      height: u.height,
      metadata: u.metadata,
      createdAt: u.created_at.toISOString(),
      created_at: u.created_at.toISOString(),
    })),
    count: uploads.length,
  });
}

/**
 * POST /api/v1/media/uploads
 * Upload media from a URL
 */
export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const contentType = request.headers.get("content-type") || "";

  // Handle JSON body (URL upload)
  if (contentType.includes("application/json")) {
    const body = await request.json();
    const parsed = UploadFromUrlSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const upload = await mediaUploadsService.uploadFromUrl({
      organizationId: user.organization_id!,
      userId: user.id,
      url: parsed.data.url,
      filename: parsed.data.filename,
      metadata: parsed.data.metadata,
    });

    return NextResponse.json({
      id: upload.id,
      type: upload.type,
      url: upload.storage_url,
      filename: upload.filename,
      mimeType: upload.mime_type,
      createdAt: upload.created_at.toISOString(),
    }, { status: 201 });
  }

  // Handle form data (file upload)
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();

    const upload = await mediaUploadsService.upload({
      organizationId: user.organization_id!,
      userId: user.id,
      file: {
        data: arrayBuffer,
        filename: file.name,
        mimeType: file.type,
      },
    });

    return NextResponse.json({
      id: upload.id,
      type: upload.type,
      url: upload.storage_url,
      filename: upload.filename,
      mimeType: upload.mime_type,
      createdAt: upload.created_at.toISOString(),
    }, { status: 201 });
  }

  return NextResponse.json(
    { error: "Unsupported content type" },
    { status: 415 }
  );
}

