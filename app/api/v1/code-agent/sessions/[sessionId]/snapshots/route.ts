import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { codeAgentService } from "@/lib/services/code-agent";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit-redis";

type RouteContext = { params: Promise<{ sessionId: string }> };

const createSnapshotSchema = z.object({
  name: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
});

async function handleGET(request: NextRequest, context: RouteContext) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { sessionId } = await context.params;

  const session = await codeAgentService.getSession(sessionId, user.organization_id);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  return NextResponse.json({ snapshots: await codeAgentService.listSnapshots(sessionId) });
}

async function handlePOST(request: NextRequest, context: RouteContext) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { sessionId } = await context.params;
  const body = createSnapshotSchema.parse(await request.json());

  const session = await codeAgentService.getSession(sessionId, user.organization_id);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const result = await codeAgentService.createSnapshot({ sessionId, ...body });
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json(result, { status: 201 });
}

export const GET = withRateLimit(handleGET, RateLimitPresets.RELAXED);
export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
