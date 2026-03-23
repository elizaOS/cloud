import { NextRequest, NextResponse } from "next/server";
import { miladySandboxesRepository } from "@/db/repositories/milady-sandboxes";
import { errorToResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { getMiladyAgentPublicWebUiUrl } from "@/lib/milady-web-ui";
import { getPairingTokenService } from "@/lib/services/pairing-token";
import { applyCorsHeaders, handleCorsOptions } from "@/lib/services/proxy/cors";

export const dynamic = "force-dynamic";

const CORS_METHODS = "POST, OPTIONS";

export function OPTIONS() {
  return handleCorsOptions(CORS_METHODS);
}

/**
 * POST /api/v1/milady/agents/[agentId]/pairing-token
 *
 * Generates a one-time pairing token for the agent web UI.
 * The caller must be authenticated and own the agent.
 * Returns { token, redirectUrl, expiresIn }.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { agentId } = await params;

    const sandbox = await miladySandboxesRepository.findByIdAndOrg(agentId, user.organization_id);

    if (!sandbox) {
      return applyCorsHeaders(
        NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 }),
        CORS_METHODS,
      );
    }

    if (sandbox.status !== "running") {
      return applyCorsHeaders(
        NextResponse.json(
          { success: false, error: "Agent must be running to generate pairing token" },
          { status: 400 },
        ),
        CORS_METHODS,
      );
    }

    const webUiUrl = getMiladyAgentPublicWebUiUrl(sandbox);
    if (!webUiUrl) {
      return applyCorsHeaders(
        NextResponse.json(
          { success: false, error: "Agent Web UI URL is not configured" },
          { status: 500 },
        ),
        CORS_METHODS,
      );
    }

    const tokenService = getPairingTokenService();
    const pairingToken = await tokenService.generateToken(
      user.id,
      user.organization_id,
      agentId,
      webUiUrl,
    );

    const response = applyCorsHeaders(
      NextResponse.json({
        success: true,
        data: {
          token: pairingToken,
          redirectUrl: `${webUiUrl}/pair?token=${pairingToken}`,
          expiresIn: 60,
        },
      }),
      CORS_METHODS,
    );

    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");

    return response;
  } catch (error) {
    return applyCorsHeaders(errorToResponse(error), CORS_METHODS);
  }
}
