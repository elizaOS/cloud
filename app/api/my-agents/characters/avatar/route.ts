import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { uploadToBlob } from "@/lib/blob";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VALID_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * POST /api/my-agents/characters/avatar
 * Uploads a character avatar image to blob storage.
 */
export async function POST(request: NextRequest) {
  const user = await requireAuthWithOrg();

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json(
      { success: false, error: "No file provided" },
      { status: 400 },
    );
  }

  if (!VALID_TYPES.includes(file.type)) {
    return NextResponse.json(
      { success: false, error: "Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed." },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { success: false, error: "File too large. Maximum size is 10MB." },
      { status: 400 },
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { url } = await uploadToBlob(buffer, {
    filename: file.name,
    contentType: file.type,
    folder: "character-avatars",
    userId: user.id,
  });

  logger.info("[Character Avatar API] Avatar uploaded", {
    userId: user.id,
    url,
  });

  return NextResponse.json({ success: true, url });
}

