import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { knowledgeProcessingService } from "@/lib/services/knowledge-processing";

/**
 * GET /api/v1/knowledge/jobs/[characterId]
 * Gets the status of knowledge processing jobs for a character.
 *
 * @param characterId - The character ID to check jobs for.
 * @returns Job status information including pending, processing, completed counts.
 */
async function handleGET(
  req: NextRequest,
  context?: { params: Promise<{ characterId: string }> },
) {
  if (!context) {
    return NextResponse.json(
      { error: "Invalid request context" },
      { status: 400 },
    );
  }

  const authResult = await requireAuthOrApiKey(req);
  const { user } = authResult;
  const { characterId } = await context.params;

  if (!user.organization_id) {
    return NextResponse.json(
      { error: "Organization ID not found" },
      { status: 400 },
    );
  }

  const status = await knowledgeProcessingService.getStatus(
    characterId,
    user.organization_id,
  );

  return NextResponse.json(status);
}

export const GET = withRateLimit(handleGET, RateLimitPresets.STANDARD);
