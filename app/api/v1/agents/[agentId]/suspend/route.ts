import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireServiceKey, ServiceKeyAuthError } from "@/lib/auth/service-key";
import { miladySandboxService } from "@/lib/services/milaidy-sandbox";
import { z } from "zod";

export const dynamic = "force-dynamic";

const suspendSchema = z.object({
  reason: z.string().min(1).default("owner requested suspension"),
});

/**
 * POST /api/v1/agents/[agentId]/suspend
 *
 * Service-to-service: shutdown a running agent (snapshot + stop).
 * Auth: X-Service-Key header.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  let identity;
  try {
    identity = requireServiceKey(request);
  } catch (e) {
    if (e instanceof ServiceKeyAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Service authentication misconfigured" },
      { status: 500 },
    );
  }

  const { agentId } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = suspendSchema.safeParse(body);
  const reason = parsed.success
    ? parsed.data.reason
    : "owner requested suspension";

  logger.info("[service-api] Suspending agent", { agentId, reason });

  const result = await miladySandboxService.shutdown(
    agentId,
    identity.organizationId,
  );
  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      {
        status:
          result.error === "Agent not found"
            ? 404
            : result.error === "Agent provisioning is in progress"
              ? 409
              : 500,
      },
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
