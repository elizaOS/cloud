import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { miladySandboxesRepository } from "@/db/repositories/milady-sandboxes";
import { getPairingTokenService } from "@/lib/services/pairing-token";
import { getMiladyAgentPublicWebUiUrl } from "@/lib/milady-web-ui";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/milaidy/agents/[agentId]/pairing-token
 *
 * Generates a one-time pairing token for the agent web UI.
 * The caller must be authenticated and own the agent.
 * Returns { token, redirectUrl, expiresIn }.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { agentId } = await params;

  const sandbox = await miladySandboxesRepository.findByIdAndOrg(
    agentId,
    user.organization_id,
  );

  if (!sandbox) {
    // Check if it exists at all (for 403 vs 404 distinction)
    const global = await miladySandboxesRepository.findById(agentId);
    if (!global) {
      return NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { success: false, error: "Access denied — you do not own this agent" },
      { status: 403 },
    );
  }

  if (sandbox.status !== "running") {
    return NextResponse.json(
      { success: false, error: "Agent must be running to generate pairing token" },
      { status: 400 },
    );
  }

  // Build the web UI base URL from the agent ID + configured domain.
  // getMiladyAgentPublicWebUiUrl defaults to waifu.fun via DEFAULT_AGENT_BASE_DOMAIN.
  const webUiUrl = getMiladyAgentPublicWebUiUrl({ id: agentId, headscale_ip: null })!;

  const tokenService = getPairingTokenService();
  const pairingToken = tokenService.generateToken(
    user.id,
    user.organization_id,
    agentId,
    webUiUrl,
  );

  const response = NextResponse.json({
    success: true,
    data: {
      token: pairingToken,
      redirectUrl: `${webUiUrl}/pair?token=${pairingToken}`,
      expiresIn: 60,
    },
  });

  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");

  return response;
}
