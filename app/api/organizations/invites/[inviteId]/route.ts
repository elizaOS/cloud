import { type NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { invitesService } from "@/lib/services";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";

async function handleDELETE(
  request: NextRequest,
  context?: { params: Promise<{ inviteId: string }> },
) {
  try {
    const user = await requireAuthWithOrg();

    if (user.role !== "owner" && user.role !== "admin") {
      return NextResponse.json(
        {
          success: false,
          error: "Only owners and admins can revoke invitations",
        },
        { status: 403 },
      );
    }

    if (!context?.params) {
      return NextResponse.json(
        { success: false, error: "Invalid request" },
        { status: 400 },
      );
    }

    const { inviteId } = await context.params;

    await invitesService.revokeInvite(inviteId, user.organization_id!);

    return NextResponse.json({
      success: true,
      message: "Invitation revoked successfully",
    });
  } catch (error) {
    console.error("Error revoking invite:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Failed to revoke invitation";

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      {
        status: errorMessage.includes("not found")
          ? 404
          : errorMessage.includes("does not belong")
            ? 403
            : 500,
      },
    );
  }
}

export const DELETE = withRateLimit(handleDELETE, RateLimitPresets.STANDARD);
