import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";

async function handlePOST(req: NextRequest) {
  try {
    const cookieStore = await cookies();

    cookieStore.delete("privy-token");
    cookieStore.delete("privy-refresh-token");
    cookieStore.delete("privy-id-token");
    cookieStore.delete("eliza-anon-session");

    return NextResponse.json(
      {
        success: true,
        message: "Logged out successfully",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error during logout:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to logout",
      },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
