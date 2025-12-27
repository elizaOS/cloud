import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { codeAgentService } from "@/lib/services/code-agent";
import {
  withRateLimit,
  RateLimitPresets,
} from "@/lib/middleware/rate-limit-redis";

type RouteContext = {
  params: Promise<{ sessionId: string; snapshotId: string }>;
};

async function handlePOST(request: NextRequest, context: RouteContext) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { sessionId, snapshotId } = await context.params;

  const session = await codeAgentService.getSession(
    sessionId,
    user.organization_id,
  );
  if (!session)
    return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const result = await codeAgentService.restoreSnapshot({
    sessionId,
    snapshotId,
  });
  if (!result.success)
    return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json(result);
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
