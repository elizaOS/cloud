import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { updateUser } from "@/lib/queries/users";
import { z } from "zod";
import { revalidateTag } from "next/cache";

const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatar: z.string().url().optional().or(z.literal("")),
});

/**
 * GET /api/v1/user
 * Get current user profile
 */
export async function GET() {
  try {
    const user = await requireAuth();

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        role: user.role,
        email_verified: user.email_verified,
        is_active: user.is_active,
        created_at: user.created_at,
        updated_at: user.updated_at,
        organization: {
          id: user.organization.id,
          name: user.organization.name,
          slug: user.organization.slug,
          credit_balance: user.organization.credit_balance,
          subscription_tier: user.organization.subscription_tier,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching user:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch user data",
      },
      { status: error instanceof Error && error.message.includes("Forbidden") ? 403 : 500 },
    );
  }
}

/**
 * PATCH /api/v1/user
 * Update current user profile
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();

    // Validate input
    const validated = updateUserSchema.parse(body);

    // Update user
    const updated = await updateUser(user.id, {
      ...(validated.name && { name: validated.name }),
      ...(validated.avatar !== undefined && {
        avatar: validated.avatar || null,
      }),
    });

    if (!updated) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to update user",
        },
        { status: 500 },
      );
    }

    // Revalidate cache
    revalidateTag("user-auth");

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        avatar: updated.avatar,
        role: updated.role,
        updated_at: updated.updated_at,
      },
      message: "Profile updated successfully",
    });
  } catch (error) {
    console.error("Error updating user:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation error",
          details: error.errors,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to update profile",
      },
      { status: error instanceof Error && error.message.includes("Forbidden") ? 403 : 500 },
    );
  }
}

