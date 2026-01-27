/**
 * Google OAuth Disconnect Route
 *
 * Revokes Google access and removes stored credentials.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { dbRead, dbWrite } from "@/db/client";
import { platformCredentials } from "@/db/schemas/platform-credentials";
import { secretsService } from "@/lib/services/secrets";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  try {
    // Find Google credentials for this organization
    const credentials = await dbRead
      .select()
      .from(platformCredentials)
      .where(
        and(
          eq(platformCredentials.organization_id, user.organization_id),
          eq(platformCredentials.platform, "google"),
        ),
      )
      .limit(1);

    if (credentials.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No Google connection found",
      });
    }

    const cred = credentials[0];
    const audit = {
      actorType: "user" as const,
      actorId: user.id,
      source: "google-disconnect",
    };

    // Delete access token secret
    if (cred.access_token_secret_id) {
      try {
        await secretsService.delete(
          cred.access_token_secret_id,
          user.organization_id,
          audit,
        );
      } catch (err) {
        logger.warn("[Google Disconnect] Failed to delete access token secret", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Delete refresh token secret
    if (cred.refresh_token_secret_id) {
      try {
        await secretsService.delete(
          cred.refresh_token_secret_id,
          user.organization_id,
          audit,
        );
      } catch (err) {
        logger.warn("[Google Disconnect] Failed to delete refresh token secret", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Update credential status to revoked
    await dbWrite
      .update(platformCredentials)
      .set({
        status: "revoked",
        revoked_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(platformCredentials.id, cred.id));

    logger.info("[Google Disconnect] Successfully disconnected", {
      organizationId: user.organization_id,
      userId: user.id,
      googleEmail: cred.platform_email,
    });

    return NextResponse.json({
      success: true,
      message: "Google account disconnected successfully",
    });
  } catch (error) {
    logger.error("[Google Disconnect] Failed to disconnect", {
      error: error instanceof Error ? error.message : String(error),
      organizationId: user.organization_id,
    });
    return NextResponse.json(
      { error: "Failed to disconnect Google account" },
      { status: 500 },
    );
  }
}
