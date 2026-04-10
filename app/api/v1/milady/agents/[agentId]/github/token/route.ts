import { NextRequest, NextResponse } from "next/server";
import { errorToResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { managedMiladyGithubService } from "@/lib/services/milady-managed-github";
import { applyCorsHeaders, handleCorsOptions } from "@/lib/services/proxy/cors";

export const dynamic = "force-dynamic";

const CORS_METHODS = "GET, OPTIONS";

export function OPTIONS() {
  return handleCorsOptions(CORS_METHODS);
}

/**
 * Get the GitHub access token for an agent's linked connection.
 *
 * This endpoint is called by the agent runtime to fetch the OAuth token
 * stored in the cloud. The token can then be used for GitHub API calls
 * and as a git credential for push/clone operations.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { agentId } = await params;

    const result = await managedMiladyGithubService.getAgentToken({
      agentId,
      organizationId: user.organization_id,
    });

    if (!result) {
      return applyCorsHeaders(
        NextResponse.json(
          { success: false, error: "No GitHub connection found for this agent" },
          { status: 404 },
        ),
        CORS_METHODS,
      );
    }

    return applyCorsHeaders(
      NextResponse.json({
        success: true,
        data: {
          accessToken: result.accessToken,
          githubUsername: result.githubUsername,
        },
      }),
      CORS_METHODS,
    );
  } catch (error) {
    return applyCorsHeaders(errorToResponse(error), CORS_METHODS);
  }
}
