import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { codeAgentService } from "@/lib/services/code-agent";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit-redis";

type RouteContext = { params: Promise<{ sessionId: string }> };

const gitSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("clone"), url: z.string().url(), branch: z.string().optional(), depth: z.number().min(1).optional(), directory: z.string().optional() }),
  z.object({ operation: z.literal("commit"), message: z.string().min(1).max(1000), author: z.object({ name: z.string(), email: z.string().email() }).optional() }),
  z.object({ operation: z.literal("push"), remote: z.string().default("origin"), branch: z.string().optional(), force: z.boolean().default(false) }),
  z.object({ operation: z.literal("pull"), remote: z.string().default("origin"), branch: z.string().optional() }),
  z.object({ operation: z.literal("status") }),
]);

async function handlePOST(request: NextRequest, context: RouteContext) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { sessionId } = await context.params;
  const body = gitSchema.parse(await request.json());

  const session = await codeAgentService.getSession(sessionId, user.organization_id);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (!session.capabilities.hasGit) return NextResponse.json({ error: "Git not enabled" }, { status: 400 });

  const ops = {
    clone: () => codeAgentService.gitClone({ sessionId, ...body as { url: string; branch?: string; depth?: number; directory?: string } }),
    commit: () => codeAgentService.gitCommit({ sessionId, ...body as { message: string; author?: { name: string; email: string } } }),
    push: () => codeAgentService.gitPush({ sessionId, ...body as { remote: string; branch?: string; force: boolean } }),
    pull: () => codeAgentService.gitPull({ sessionId, ...body as { remote: string; branch?: string } }),
    status: () => Promise.resolve({ success: true, message: "Status", gitState: session.gitState }),
  };

  const result = await ops[body.operation]();
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
