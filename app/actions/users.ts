"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { updateUser } from "@/lib/queries/users";
import { z } from "zod";

const updateProfileSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  avatar: z.string().url("Invalid avatar URL").optional().or(z.literal("")),
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
    await updateUser(user.id, {
      name: validated.name,
      avatar: validated.avatar || null,
    });

    // Revalidate cache
    revalidateTag("user-auth");
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
    const avatarUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name || user.email)}`;

    await updateUser(user.id, {
      avatar: avatarUrl,
    });

    revalidateTag("user-auth");
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

