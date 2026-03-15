import { NextRequest, NextResponse } from "next/server";
import { miladySandboxesRepository } from "@/db/repositories/milady-sandboxes";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { getMiladyAgentPublicWebUiUrl } from "@/lib/milady-web-ui";
import { getPairingTokenService } from "@/lib/services/pairing-token";

export const dynamic = "force-dynamic";

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
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { agentId } = await params;

  const sandbox = await miladySandboxesRepository.findByIdAndOrg(agentId, user.organization_id);

  if (!sandbox) {
    return NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 });
  }

  if (sandbox.status !== "running") {
    return NextResponse.json(
      { success: false, error: "Agent must be running to generate pairing token" },
      { status: 400 },
    );
  }

  const webUiUrl = getMiladyAgentPublicWebUiUrl(sandbox);
  if (!webUiUrl) {
    return NextResponse.json(
      { success: false, error: "Agent Web UI URL is not configured" },
      { status: 500 },
    );
  }

  const tokenService = getPairingTokenService();
  const pairingToken = await tokenService.generateToken(
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

  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");

  return response;
}
