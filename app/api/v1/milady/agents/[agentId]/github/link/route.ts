import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorToResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { managedMiladyGithubService } from "@/lib/services/milady-managed-github";
import { oauthService } from "@/lib/services/oauth";
import { applyCorsHeaders, handleCorsOptions } from "@/lib/services/proxy/cors";

export const dynamic = "force-dynamic";

const CORS_METHODS = "POST, OPTIONS";

const linkSchema = z.object({
  connectionId: z.string().trim().min(1),
});

export function OPTIONS() {
  return handleCorsOptions(CORS_METHODS);
}

/**
 * Link a GitHub OAuth connection to an agent.
 *
 * Called after the generic OAuth callback completes. The frontend reads the
 * `connection_id` from the redirect URL params and calls this endpoint to
 * bind the credential to the agent, storing the binding in agent_config and
 * restarting the agent if it's running.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { agentId } = await params;

    const body = await request.json().catch(() => ({}));
    const parsed = linkSchema.safeParse(body);
    if (!parsed.success) {
      return applyCorsHeaders(
        NextResponse.json({ success: false, error: "connectionId is required" }, { status: 400 }),
        CORS_METHODS,
      );
    }

    const { connectionId } = parsed.data;

    // Verify the connection exists and belongs to this org
    const connection = await oauthService.getConnection({
      organizationId: user.organization_id,
      connectionId,
    });

    if (!connection) {
      return applyCorsHeaders(
        NextResponse.json({ success: false, error: "OAuth connection not found" }, { status: 404 }),
        CORS_METHODS,
      );
    }

    if (connection.platform !== "github") {
      return applyCorsHeaders(
        NextResponse.json(
          { success: false, error: "Connection is not a GitHub connection" },
          { status: 400 },
        ),
        CORS_METHODS,
      );
    }

    const result = await managedMiladyGithubService.connectAgent({
      agentId,
      organizationId: user.organization_id,
      binding: {
        mode: connection.connectionRole === "owner" ? "shared-owner" : "cloud-managed",
        connectionId,
        connectionRole: connection.connectionRole,
        source: connection.source,
        githubUserId: connection.platformUserId || "",
        githubUsername: connection.username || "",
        githubDisplayName: connection.displayName || undefined,
        githubAvatarUrl: connection.avatarUrl || undefined,
        githubEmail: connection.email || undefined,
        scopes: connection.scopes || [],
        adminElizaUserId: user.id,
        connectedAt: new Date().toISOString(),
      },
    });

    return applyCorsHeaders(
      NextResponse.json({
        success: true,
        data: {
          ...result.status,
          restarted: result.restarted,
        },
      }),
      CORS_METHODS,
    );
  } catch (error) {
    return applyCorsHeaders(errorToResponse(error), CORS_METHODS);
  }
}
