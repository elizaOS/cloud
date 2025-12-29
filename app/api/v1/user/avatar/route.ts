import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { usersService } from "@/lib/services/users";
import { uploadToBlob } from "@/lib/blob";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VALID_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * POST /api/v1/user/avatar
 * Uploads a user avatar image.
 * Validates file type (JPEG, PNG, WebP) and size (max 5MB).
 */
export async function POST(request: NextRequest) {
  const user = await requireAuth();

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
      { success: false, error: "Invalid file type. Only JPEG, PNG, and WebP are allowed." },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { success: false, error: "File too large. Maximum size is 5MB." },
      { status: 400 },
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const ext = file.type.split("/")[1] ?? "jpg";
  const filename = `avatar.${ext}`;

  const result = await uploadToBlob(buffer, {
    filename,
    contentType: file.type,
    folder: "avatars",
    userId: user.id,
  });

  const avatarUrl = result.url;

  await usersService.update(user.id, {
    avatar: avatarUrl,
  });

  logger.info("[User Avatar API] Avatar uploaded", {
    userId: user.id,
    avatarUrl,
  });

  revalidatePath("/dashboard/account");
  revalidatePath("/dashboard/settings");

  return NextResponse.json({
    success: true,
    data: { avatarUrl },
    message: "Avatar uploaded successfully",
  });
}

