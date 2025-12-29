/**
 * User actions.
 *
 * This module re-exports client API functions for user operations.
 * Previously used "use server" directives, now uses client API routes.
 */

import { userApi } from "@/lib/api/client";

/**
 * Updates the authenticated user's profile (name and avatar).
 */
export async function updateProfile(formData: FormData) {
  const data = {
    name: formData.get("name") as string,
    avatar: formData.get("avatar") as string,
  };

  const response = await userApi.updateProfile({
    name: data.name,
    avatar: data.avatar ?? undefined,
  });

  return {
    success: response.success,
    message: response.message ?? "Profile updated successfully",
    error: response.success ? undefined : "Failed to update profile",
  };
}

/**
 * Updates the authenticated user's email address.
 */
export async function updateEmail(formData: FormData) {
  const email = formData.get("email") as string;

  const response = await userApi.updateEmail(email);

  return {
    success: response.success,
    message: response.message ?? "Email updated successfully",
    error: response.success ? undefined : "Failed to update email",
  };
}

/**
 * Uploads a user avatar image.
 */
export async function uploadAvatar(formData: FormData) {
  const file = formData.get("file") as File;

  if (!file) {
    return { success: false, error: "No file provided" };
  }

  const response = await userApi.uploadAvatar(file);

  return {
    success: response.success,
    avatarUrl: response.data?.avatarUrl,
    message: response.message ?? "Avatar uploaded successfully",
    error: response.success ? undefined : "Failed to upload avatar",
  };
}
