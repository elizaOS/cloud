/**
 * Helper to get user's ElizaOS Cloud API key for agent runtime
 */

import { apiKeysService } from "@/lib/services";
import { getElizaCloudApiUrl } from "./config";

/**
 * Get user's first active API key for ElizaOS Cloud usage
 * This key is auto-generated when users register
 *
 * @param userId - The user's ID
 * @param organizationId - The user's organization ID
 * @returns The plain API key (hashed in DB, so we need to retrieve from key field)
 */
export async function getUserElizaCloudApiKey(
  userId: string,
  organizationId: string,
): Promise<string | null> {
  try {
    const apiKeys = await apiKeysService.listByOrganization(organizationId);
    
    // Find user's first active API key
    const userKey = apiKeys.find(
      (key) => key.user_id === userId && key.is_active,
    );

    if (!userKey) {
      console.warn(`[UserAPIKey] No API key found for user ${userId}`);
      return null;
    }

    // Return the full key from the database
    // Note: This is the actual key value, not the hash
    console.log(`[UserAPIKey] Retrieved key for user ${userId}: ${userKey.key_prefix}***`);
    return userKey.key;
  } catch (error) {
    console.error(
      `[UserAPIKey] Error getting API key for user ${userId}:`,
      error,
    );
    return null;
  }
}

/**
 * Build ElizaOS Cloud settings for a user's agent runtime
 * Includes the user's API key and environment-aware configuration
 *
 * @param userId - The user's ID
 * @param organizationId - The user's organization ID
 * @param modelPreferences - Optional model preferences from user settings
 * @returns Settings object for ElizaOS runtime
 */
export async function buildElizaCloudSettings(
  userId: string,
  organizationId: string,
  modelPreferences?: {
    smallModel?: string;
    largeModel?: string;
  },
): Promise<Record<string, string>> {
  const apiKey = await getUserElizaCloudApiKey(userId, organizationId);

  if (!apiKey) {
    console.warn(
      `[UserAPIKey] No API key available for user ${userId}, agent may not work`,
    );
  }

  return {
    ELIZAOS_CLOUD_API_KEY: apiKey || "",
    ELIZAOS_CLOUD_BASE_URL: getElizaCloudApiUrl(),
    ELIZAOS_CLOUD_SMALL_MODEL:
      modelPreferences?.smallModel ||
      process.env.ELIZAOS_CLOUD_SMALL_MODEL ||
      "gpt-4o-mini",
    ELIZAOS_CLOUD_LARGE_MODEL:
      modelPreferences?.largeModel ||
      process.env.ELIZAOS_CLOUD_LARGE_MODEL ||
      "gpt-4o",
  };
}

