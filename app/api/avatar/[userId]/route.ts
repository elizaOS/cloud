import { type NextRequest, NextResponse } from "next/server";
import { usersService } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/avatar/[userId]
 * Serves user avatar image from database
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { userId } = await params;

    if (!userId) {
      return new NextResponse("User ID required", { status: 400 });
    }

    // Fetch user from database
    const user = await usersService.getById(userId);

    if (!user) {
      return new NextResponse("User not found", { status: 404 });
    }

    // Check if user has avatar data
    if (!user.avatar_data || !user.avatar_mime_type) {
      return new NextResponse("No avatar found", { status: 404 });
    }

    // Decode base64 data
    const base64Data = user.avatar_data.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");

    // Return image with appropriate headers
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        "Content-Type": user.avatar_mime_type,
        "Content-Length": imageBuffer.length.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
        "ETag": `"${userId}-${user.updated_at?.getTime() || Date.now()}"`,
      },
    });
  } catch (error) {
    console.error("Error serving avatar:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
