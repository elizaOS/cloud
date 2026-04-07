import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getErrorStatusCode, getSafeErrorMessage } from "@/lib/api/errors";
import { requireAuthWithOrg } from "@/lib/auth";
import { apiKeysService } from "@/lib/services/api-keys";
import { logger } from "@/lib/utils/logger";
import { createApiKeySchema } from "./schemas";

/**
 * GET /api/v1/api-keys
 * Lists all API keys for the authenticated user's organization.
 *
 * @returns Array of API key objects.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthWithOrg(request);

    const keys = await apiKeysService.listByOrganization(user.organization_id!);

    return NextResponse.json({ keys });
  } catch (error) {
    logger.error("Error fetching API keys:", error);
    const status = getErrorStatusCode(error);
    return NextResponse.json(
      { error: status === 500 ? "Failed to fetch API keys" : getSafeErrorMessage(error) },
      { status },
    );
  }
}

/**
 * POST /api/v1/api-keys
 * Creates a new API key for the authenticated user's organization.
 *
 * @param request - Request body with name, optional description, permissions, rate_limit, and expires_at.
 * @returns Created API key details including the plain key (only shown once).
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthWithOrg(request);

    const body = await request.json();
    const { name, description, permissions, rate_limit, expires_at } =
      createApiKeySchema.parse(body);

    const { apiKey, plainKey } = await apiKeysService.create({
      name,
      description,
      organization_id: user.organization_id!,
      user_id: user.id,
      permissions,
      rate_limit,
      expires_at: expires_at ?? null,
      is_active: true,
    });

    return NextResponse.json(
      {
        apiKey: {
          id: apiKey.id,
          name: apiKey.name,
          description: apiKey.description,
          key_prefix: apiKey.key_prefix,
          created_at: apiKey.created_at,
          permissions: apiKey.permissions,
          rate_limit: apiKey.rate_limit,
          expires_at: apiKey.expires_at,
        },
        plainKey,
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error("Error creating API key:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 },
      );
    }

    const status = getErrorStatusCode(error);
    return NextResponse.json(
      { error: status === 500 ? "Failed to create API key" : getSafeErrorMessage(error) },
      { status },
    );
  }
}
