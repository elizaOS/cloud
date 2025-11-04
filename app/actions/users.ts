"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { usersService } from "@/lib/services";
import { z } from "zod";

const updateProfileSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  avatar: z.string().url("Invalid avatar URL").optional().or(z.literal("")),
});

const updateEmailSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export async function updateProfile(formData: FormData) {
  try {
    const user = await requireAuth();

    const data = {
      name: formData.get("name") as string,
      avatar: formData.get("avatar") as string,
    };

    // Validate input
    const validated = updateProfileSchema.parse(data);

    // Update user
    await usersService.update(user.id, {
      name: validated.name,
      avatar: validated.avatar || null,
    });

    // Revalidate cache
    revalidatePath("/dashboard/account");

    return {
      success: true,
      message: "Profile updated successfully",
    };
  } catch (error) {
    console.error("Error updating profile:", error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues[0].message,
      };
    }

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update profile. Please try again.",
    };
  }
}

export async function updateEmail(formData: FormData) {
  try {
    const user = await requireAuth();

    // Only allow updating email if user doesn't have one
    if (user.email) {
      return {
        success: false,
        error: "Email already set. Please contact support to change your email.",
      };
    }

    const data = {
      email: formData.get("email") as string,
    };

    // Validate input
    const validated = updateEmailSchema.parse(data);

    // Check if email is already in use by another user
    const existingUser = await usersService.getByEmail(validated.email);
    if (existingUser && existingUser.id !== user.id) {
      return {
        success: false,
        error: "This email is already in use by another account.",
      };
    }

    // Update user email
    await usersService.update(user.id, {
      email: validated.email.toLowerCase().trim(),
      email_verified: false, // Will need to verify the new email
    });

    // Revalidate cache
    revalidatePath("/dashboard/account");

    return {
      success: true,
      message: "Email added successfully! Please check your inbox to verify.",
    };
  } catch (error) {
    console.error("Error updating email:", error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues[0].message,
      };
    }

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update email. Please try again.",
    };
  }
}

export async function uploadAvatar(formData: FormData) {
  try {
    const user = await requireAuth();
    const file = formData.get("file") as File;

    if (!file) {
      return {
        success: false,
        error: "No file provided",
      };
    }

    // Validate file type
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      return {
        success: false,
        error: "Invalid file type. Only JPEG, PNG, and WebP are allowed.",
      };
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return {
        success: false,
        error: "File too large. Maximum size is 5MB.",
      };
    }

    // TODO: Implement actual file upload to your storage service
    // For now, we'll just return a placeholder URL
    // In production, you'd upload to S3, Cloudflare R2, etc.
    const seed =
      user.name ||
      user.email ||
      (user.wallet_address
        ? `${user.wallet_address.substring(0, 6)}...${user.wallet_address.substring(user.wallet_address.length - 4)}`
        : "User");
    const avatarUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed)}`;

    await usersService.update(user.id, {
      avatar: avatarUrl,
    });

    revalidatePath("/dashboard/account");

    return {
      success: true,
      avatarUrl,
      message: "Avatar uploaded successfully",
    };
  } catch (error) {
    console.error("Error uploading avatar:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to upload avatar. Please try again.",
    };
  }
}
