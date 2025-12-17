/**
 * Webhook Executions API
 *
 * GET /api/v1/webhooks/[id]/executions - List webhook executions
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { webhookService } from "@/lib/services/webhooks/webhook-service";

/**
 * GET /api/v1/webhooks/[id]/executions
 * List webhook executions
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await ctx.params;

  if (!user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Organization required" },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  const executions = await webhookService.listExecutions(
    id,
    user.organization_id,
    {
      status: status as any,
      limit,
      offset,
    },
  );

  return NextResponse.json({
    success: true,
    data: executions,
    count: executions.length,
  });
}

