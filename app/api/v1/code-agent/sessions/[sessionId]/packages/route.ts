import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { codeAgentService } from "@/lib/services/code-agent";
import {
  withRateLimit,
  RateLimitPresets,
} from "@/lib/middleware/rate-limit-redis";

type RouteContext = { params: Promise<{ sessionId: string }> };

const installSchema = z.object({
  packages: z.array(z.string()).min(1).max(50),
  manager: z.enum(["npm", "pip", "bun", "cargo"]).default("npm"),
  dev: z.boolean().default(false),
});

async function handlePOST(request: NextRequest, context: RouteContext) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { sessionId } = await context.params;
  const body = installSchema.parse(await request.json());

  const session = await codeAgentService.getSession(
    sessionId,
    user.organization_id,
  );
  if (!session)
    return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const result = await codeAgentService.installPackages({ sessionId, ...body });
  if (!result.success)
    return NextResponse.json(
      { error: result.error, output: result.output },
      { status: 400 },
    );
  return NextResponse.json(result);
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
