import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { usersService } from "@/lib/services/users";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const UpdateEmailSchema = z.object({
  email: z.string().email("Invalid email address"),
});

/**
 * PATCH /api/v1/user/email
 * Updates the authenticated user's email address.
 * Only allows updates if the user doesn't already have an email set.
 */
export async function PATCH(request: NextRequest) {
  const user = await requireAuth();

  // Only allow updating email if user doesn't have one
  if (user.email) {
    return NextResponse.json(
      {
        success: false,
        error: "Email already set. Please contact support to change your email.",
      },
      { status: 400 },
    );
  }

  const body = await request.json();
  const parsed = UpdateEmailSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  // Check if email is already in use by another user
  const existingUser = await usersService.getByEmail(parsed.data.email);
  if (existingUser && existingUser.id !== user.id) {
    return NextResponse.json(
      { success: false, error: "This email is already in use by another account." },
      { status: 409 },
    );
  }

  await usersService.update(user.id, {
    email: parsed.data.email.toLowerCase().trim(),
    email_verified: false,
  });

  logger.info("[User Email API] Email updated", {
    userId: user.id,
    email: parsed.data.email,
  });

  revalidatePath("/dashboard/account");
  revalidatePath("/dashboard/settings");

  return NextResponse.json({
    success: true,
    message: "Email added successfully. Please check your inbox to verify.",
  });
}

