import { NextRequest, NextResponse } from "next/server";
import { userCharactersRepository } from "@/db/repositories/characters";
import { errorToResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/agents/[agentId]
 *
 * Return an authenticated user's agent details.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { agentId } = await params;

    const agent = await userCharactersRepository.findByIdInOrganization(
      agentId,
      user.organization_id,
    );

    if (!agent) {
      return NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: agent });
  } catch (error) {
    return errorToResponse(error);
  }
}
