import { NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthWithOrg } from "@/lib/auth";
import { apiKeysService } from "@/lib/services/api-keys";

const EXPLORER_KEY_NAME = "API Explorer Key";
const EXPLORER_KEY_STORAGE_KEY = "elizacloud_explorer_key";

/**
 * GET /api/v1/api-keys/explorer
 *
 * Gets or creates an API key specifically for the API Explorer page.
 * This key bills to the user's organization account and is used for
 * testing API endpoints in the explorer.
 *
 * SECURITY: The plaintext key is returned ONLY when first created.
 * For existing keys, the client must use localStorage or regenerate.
 */
export async function GET() {
  const user = await requireAuthWithOrg();

  // Check if user already has an explorer key
  const existingKeys = await apiKeysService.listByOrganization(
    user.organization_id,
  );

  const explorerKey = existingKeys.find(
    (key) => key.name === EXPLORER_KEY_NAME && key.user_id === user.id,
  );

  if (explorerKey) {
    // SECURITY: For existing keys, return metadata only (no plaintext)
    // Client should retrieve the key from localStorage or regenerate
    return NextResponse.json({
      apiKey: {
        id: explorerKey.id,
        name: explorerKey.name,
        description: explorerKey.description,
        key_prefix: explorerKey.key_prefix,
        created_at: explorerKey.created_at,
        is_active: explorerKey.is_active,
        usage_count: explorerKey.usage_count,
        last_used_at: explorerKey.last_used_at,
      },
      isNew: false,
      storageKey: EXPLORER_KEY_STORAGE_KEY,
    });
  }

  // Create a new explorer key for this user
  const { apiKey, plainKey } = await apiKeysService.create({
    name: EXPLORER_KEY_NAME,
    description:
      "Auto-generated key for testing APIs in the API Explorer. Usage is billed to your account.",
    organization_id: user.organization_id,
    user_id: user.id,
    permissions: [],
    rate_limit: 100,
    expires_at: null,
    is_active: true,
  });

  return NextResponse.json(
    {
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
        description: apiKey.description,
        key_prefix: apiKey.key_prefix,
        key: plainKey, // Return plaintext ONLY for newly created keys
        created_at: apiKey.created_at,
        is_active: apiKey.is_active,
        usage_count: 0,
        last_used_at: null,
      },
      isNew: true,
      storageKey: EXPLORER_KEY_STORAGE_KEY,
    },
    { status: 201 },
  );
}

/**
 * POST /api/v1/api-keys/explorer
 *
 * Regenerates the explorer API key. Deletes existing key and creates new one.
 * Returns the new plaintext key (one time only).
 */
export async function POST() {
  const user = await requireAuthWithOrg();

  // Find and delete existing explorer key
  const existingKeys = await apiKeysService.listByOrganization(
    user.organization_id,
  );

  const existingKey = existingKeys.find(
    (key) => key.name === EXPLORER_KEY_NAME && key.user_id === user.id,
  );

  if (existingKey) {
    await apiKeysService.delete(existingKey.id);
    logger.info("[ApiKeys] Deleted existing explorer key for regeneration", {
      userId: user.id,
      keyId: existingKey.id,
    });
  }

  // Create new explorer key
  const { apiKey, plainKey } = await apiKeysService.create({
    name: EXPLORER_KEY_NAME,
    description:
      "Auto-generated key for testing APIs in the API Explorer. Usage is billed to your account.",
    organization_id: user.organization_id,
    user_id: user.id,
    permissions: [],
    rate_limit: 100,
    expires_at: null,
    is_active: true,
  });

  logger.info("[ApiKeys] Regenerated explorer API key", {
    userId: user.id,
    keyId: apiKey.id,
  });

  return NextResponse.json({
    apiKey: {
      id: apiKey.id,
      name: apiKey.name,
      description: apiKey.description,
      key_prefix: apiKey.key_prefix,
      key: plainKey,
      created_at: apiKey.created_at,
      is_active: apiKey.is_active,
      usage_count: 0,
      last_used_at: null,
    },
    isNew: true,
    storageKey: EXPLORER_KEY_STORAGE_KEY,
  });
}
