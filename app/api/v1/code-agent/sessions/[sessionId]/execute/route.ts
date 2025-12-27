import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { codeAgentService } from "@/lib/services/code-agent";
import {
  withRateLimit,
  RateLimitPresets,
} from "@/lib/middleware/rate-limit-redis";

type RouteContext = { params: Promise<{ sessionId: string }> };

const executeSchema = z.object({
  type: z.enum(["code", "command"]),
  language: z
    .enum(["python", "javascript", "typescript", "shell", "rust", "go"])
    .optional(),
  code: z.string().max(100000).optional(),
  command: z.string().max(10000).optional(),
  args: z.array(z.string()).optional(),
  workingDirectory: z.string().optional(),
  timeout: z.number().min(1000).max(300000).default(60000),
  env: z.record(z.string()).optional(),
});

async function handlePOST(request: NextRequest, context: RouteContext) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { sessionId } = await context.params;
  const body = executeSchema.parse(await request.json());

  const session = await codeAgentService.getSession(
    sessionId,
    user.organization_id,
  );
  if (!session)
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (session.status !== "ready" && session.status !== "executing") {
    return NextResponse.json(
      { error: `Session not active: ${session.status}` },
      { status: 400 },
    );
  }

  if (body.type === "code") {
    if (!body.code || !body.language) {
      return NextResponse.json(
        { error: "code and language required for type=code" },
        { status: 400 },
      );
    }
    const result = await codeAgentService.executeCode({
      sessionId,
      language: body.language,
      code: body.code,
      options: {
        workingDirectory: body.workingDirectory,
        timeout: body.timeout,
        env: body.env,
      },
    });
    return NextResponse.json({ result });
  }

  if (!body.command) {
    return NextResponse.json(
      { error: "command required for type=command" },
      { status: 400 },
    );
  }
  const result = await codeAgentService.runCommand({
    sessionId,
    command: body.command,
    args: body.args,
    options: {
      workingDirectory: body.workingDirectory,
      timeout: body.timeout,
      env: body.env,
    },
  });
  return NextResponse.json({ result });
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
