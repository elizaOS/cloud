"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { usersService } from "@/lib/services";
import { z } from "zod";

const updateProfileSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
});

const updateEmailSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export async function updateProfile(formData: FormData) {
  try {
    const user = await requireAuth();

    const data = {
      name: formData.get("name") as string,
    };

    // Validate input
    const validated = updateProfileSchema.parse(data);

    // Update user
    await usersService.update(user.id, {
      name: validated.name,
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
        error:
          "Email already set. Please contact support to change your email.",
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
    const imageData = formData.get("imageData") as string;

    if (!imageData) {
      return {
        success: false,
        error: "No image data provided",
      };
    }

    // Validate it's a base64 data URL
    if (!imageData.startsWith("data:image/")) {
      return {
        success: false,
        error: "Invalid image data format",
      };
    }

    // Extract MIME type
    const mimeMatch = imageData.match(/^data:([^;]+);base64,/);
    if (!mimeMatch) {
      return {
        success: false,
        error: "Invalid image data format",
      };
    }

    const mimeType = mimeMatch[1];

    // Validate MIME type
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!validTypes.includes(mimeType)) {
      return {
        success: false,
        error: "Invalid image type. Only JPEG, PNG, and WebP are allowed.",
      };
    }

    // Validate base64 data size (limit to ~500KB after optimization)
    const base64Length = imageData.length;
    const sizeInBytes = (base64Length * 3) / 4;
    if (sizeInBytes > 500 * 1024) {
      return {
        success: false,
        error: "Optimized image is too large. Please try a smaller image.",
      };
    }

    // Generate avatar URL (API endpoint)
    const avatarUrl = `/api/avatar/${user.id}`;

    // Update user in database with base64 data
    await usersService.update(user.id, {
      avatar: avatarUrl,
      avatar_data: imageData,
      avatar_mime_type: mimeType,
    });

    // Revalidate pages that display the avatar
    revalidatePath("/dashboard/account");
    revalidatePath("/dashboard/settings");
    revalidatePath("/");

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
