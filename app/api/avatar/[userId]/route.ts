import { type NextRequest, NextResponse } from "next/server";
import { usersService } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// UUID validation regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/avatar/[userId]
 * Serves user avatar image from database
 * Public endpoint - avatars are public by design
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { userId } = await params;

    // Validate UUID format
    if (!userId || !UUID_REGEX.test(userId)) {
      return new NextResponse("Invalid user ID format", { status: 400 });
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

    // Generate ETag for cache validation
    const etag = `"${userId}-${user.updated_at?.getTime() || Date.now()}"`;

    // Check if client has cached version
    const ifNoneMatch = request.headers.get("if-none-match");
    if (ifNoneMatch === etag) {
      return new NextResponse(null, { status: 304 });
    }

    // Return image with appropriate caching headers
    // Use must-revalidate since avatars can be updated
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        "Content-Type": user.avatar_mime_type,
        "Content-Length": imageBuffer.length.toString(),
        "Cache-Control": "public, max-age=86400, must-revalidate",
        ETag: etag,
      },
    });
  } catch (error) {
    console.error("Error serving avatar:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
