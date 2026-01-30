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
import { revokeGoogleToken } from "@/lib/utils/google-api";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function handleDisconnect(request: NextRequest): Promise<NextResponse> {
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

    // Revoke tokens at Google before deleting locally
    // This ensures leaked tokens cannot be used even during the ~1 hour validity window
    // Revoking the refresh token also revokes all associated access tokens
    // SECURITY: Token revocation MUST succeed before we delete local secrets
    if (cred.refresh_token_secret_id) {
      const refreshToken = await secretsService.getDecryptedValue(
        cred.refresh_token_secret_id,
        user.organization_id,
      );
      if (refreshToken) {
        const revokeResult = await revokeGoogleToken(refreshToken);
        if (revokeResult.success) {
          logger.info("[Google Disconnect] Token revoked at Google", {
            organizationId: user.organization_id,
          });
        } else {
          // SECURITY: Fail the disconnect if revocation fails
          // This prevents orphaned valid tokens at Google while DB shows disconnected
          logger.error("[Google Disconnect] Token revocation failed", {
            organizationId: user.organization_id,
            error: revokeResult.error,
          });
          return NextResponse.json(
            {
              error:
                "Failed to revoke Google token. Please try again or contact support.",
              details: revokeResult.error,
            },
            { status: 500 },
          );
        }
      }
    }

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

// Support both POST and DELETE methods for disconnect
export const POST = handleDisconnect;
export const DELETE = handleDisconnect;
