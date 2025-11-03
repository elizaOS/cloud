import { type NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { invitesService } from "@/lib/services";
import { z } from "zod";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";

const createInviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["admin", "member"]).refine(
    (val) => val === "admin" || val === "member",
    { message: "Role must be 'admin' or 'member'" },
  ),
});

async function handlePOST(request: NextRequest) {
  try {
    const user = await requireAuth();

    if (user.role !== "owner" && user.role !== "admin") {
      return NextResponse.json(
        {
          success: false,
          error: "Only owners and admins can invite members",
        },
        { status: 403 },
      );
    }

    const body = await request.json();
    const validated = createInviteSchema.parse(body);

    const result = await invitesService.createInvite({
      organizationId: user.organization_id,
      inviterUserId: user.id,
      invitedEmail: validated.email,
      invitedRole: validated.role,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: result.invite.id,
        email: result.invite.invited_email,
        role: result.invite.invited_role,
        expires_at: result.invite.expires_at,
        status: result.invite.status,
      },
      message: "Invitation sent successfully",
    });
  } catch (error) {
    console.error("Error creating invite:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation error",
          details: error.issues,
        },
        { status: 400 },
      );
    }

    const errorMessage =
      error instanceof Error ? error.message : "Failed to create invitation";

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      {
        status:
          errorMessage.includes("already a member") ||
          errorMessage.includes("already pending")
            ? 409
            : 500,
      },
    );
  }
}

async function handleGET() {
  try {
    const user = await requireAuth();

    if (user.role !== "owner" && user.role !== "admin") {
      return NextResponse.json(
        {
          success: false,
          error: "Only owners and admins can view invitations",
        },
        { status: 403 },
      );
    }

    const invites = await invitesService.listByOrganization(
      user.organization_id,
    );

    return NextResponse.json({
      success: true,
      data: invites.map((invite: any) => ({
        id: invite.id,
        email: invite.invited_email,
        role: invite.invited_role,
        status: invite.status,
        expires_at: invite.expires_at,
        created_at: invite.created_at,
        inviter: invite.inviter
          ? {
              id: invite.inviter.id,
              name: invite.inviter.name,
              email: invite.inviter.email,
            }
          : null,
        accepted_at: invite.accepted_at,
      })),
    });
  } catch (error) {
    console.error("Error fetching invites:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch invitations",
      },
      { status: 500 },
    );
  }
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STRICT);
export const GET = withRateLimit(handleGET, RateLimitPresets.STANDARD);
