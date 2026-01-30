/**
 * Google OAuth Status Route
 *
 * Returns the current Google connection status for the organization.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { dbRead } from "@/db/client";
import { platformCredentials } from "@/db/schemas/platform-credentials";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  try {
    // Find Google credentials for this organization
    const credentials = await dbRead
      .select({
        id: platformCredentials.id,
        platform_user_id: platformCredentials.platform_user_id,
        platform_username: platformCredentials.platform_username,
        platform_display_name: platformCredentials.platform_display_name,
        platform_avatar_url: platformCredentials.platform_avatar_url,
        platform_email: platformCredentials.platform_email,
        status: platformCredentials.status,
        scopes: platformCredentials.scopes,
        token_expires_at: platformCredentials.token_expires_at,
        linked_at: platformCredentials.linked_at,
        last_used_at: platformCredentials.last_used_at,
      })
      .from(platformCredentials)
      .where(
        and(
          eq(platformCredentials.organization_id, user.organization_id),
          eq(platformCredentials.platform, "google"),
          eq(platformCredentials.status, "active"),
        ),
      )
      .limit(1);

    if (credentials.length === 0) {
      return NextResponse.json({
        connected: false,
        configured: false,
      });
    }

    const cred = credentials[0];

    // Check if token is expired
    const isExpired = cred.token_expires_at
      ? new Date(cred.token_expires_at) < new Date()
      : false;

    return NextResponse.json({
      connected: true,
      configured: true,
      email: cred.platform_email,
      name: cred.platform_display_name,
      avatarUrl: cred.platform_avatar_url,
      scopes: cred.scopes,
      linkedAt: cred.linked_at,
      lastUsedAt: cred.last_used_at,
      tokenExpired: isExpired,
      credentialId: cred.id,
    });
  } catch (error) {
    logger.error("[Google Status] Failed to get status", {
      error: error instanceof Error ? error.message : String(error),
      organizationId: user.organization_id,
    });
    return NextResponse.json(
      { error: "Failed to get Google connection status" },
      { status: 500 },
    );
  }
}
