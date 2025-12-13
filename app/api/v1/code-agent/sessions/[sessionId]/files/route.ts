import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { codeAgentService } from "@/lib/services/code-agent";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit-redis";

type RouteContext = { params: Promise<{ sessionId: string }> };

const writeFileSchema = z.object({
  path: z.string().min(1).max(500),
  content: z.string().max(10 * 1024 * 1024),
  createDirectories: z.boolean().default(true),
});

async function handleGET(request: NextRequest, context: RouteContext) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { sessionId } = await context.params;
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });

  const session = await codeAgentService.getSession(sessionId, user.organization_id);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  if (searchParams.get("list") === "true") {
    return NextResponse.json(await codeAgentService.listFiles({
      sessionId, path,
      recursive: searchParams.get("recursive") !== "false",
      maxDepth: parseInt(searchParams.get("maxDepth") || "3", 10),
    }));
  }

  const result = await codeAgentService.readFile({ sessionId, path });
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json(result);
}

async function handlePOST(request: NextRequest, context: RouteContext) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { sessionId } = await context.params;
  const body = writeFileSchema.parse(await request.json());

  const session = await codeAgentService.getSession(sessionId, user.organization_id);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const result = await codeAgentService.writeFile({ sessionId, ...body });
  return NextResponse.json(result, { status: 201 });
}

async function handleDELETE(request: NextRequest, context: RouteContext) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { sessionId } = await context.params;
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });

  const session = await codeAgentService.getSession(sessionId, user.organization_id);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const result = await codeAgentService.deleteFile({ sessionId, path, recursive: searchParams.get("recursive") === "true" });
  return NextResponse.json(result);
}

export const GET = withRateLimit(handleGET, RateLimitPresets.RELAXED);
export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
export const DELETE = withRateLimit(handleDELETE, RateLimitPresets.STANDARD);
