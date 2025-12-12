/**
 * Code Agent Execute API
 *
 * POST /api/v1/code-agent/sessions/:sessionId/execute
 * Execute code or commands in a session
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { codeAgentService } from "@/lib/services/code-agent";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit-redis";
import { logger } from "@/lib/utils/logger";

type RouteContext = { params: Promise<{ sessionId: string }> };

// =============================================================================
// SCHEMAS
// =============================================================================

const executeCodeSchema = z.object({
  type: z.enum(["code", "command"]),
  language: z
    .enum(["python", "javascript", "typescript", "shell", "rust", "go"])
    .optional(),
  code: z.string().max(100000).optional(),
  command: z.string().max(10000).optional(),
  args: z.array(z.string()).optional(),
  workingDirectory: z.string().optional(),
  timeout: z.number().min(1000).max(300000).default(60000), // 1s to 5min
  env: z.record(z.string()).optional(),
});

// =============================================================================
// HANDLER
// =============================================================================

async function handlePOST(request: NextRequest, context: RouteContext) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { sessionId } = await context.params;

  const body = await request.json();
  const validated = executeCodeSchema.parse(body);

  logger.info("[Code Agent API] Execute request", {
    sessionId,
    type: validated.type,
    language: validated.language,
  });

  // Verify session exists and belongs to org
  const session = await codeAgentService.getSession(sessionId, user.organization_id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.status !== "ready" && session.status !== "executing") {
    return NextResponse.json(
      { error: `Session is not active: ${session.status}` },
      { status: 400 }
    );
  }

  let result;

  if (validated.type === "code") {
    if (!validated.code) {
      return NextResponse.json({ error: "code is required for type=code" }, { status: 400 });
    }
    if (!validated.language) {
      return NextResponse.json(
        { error: "language is required for type=code" },
        { status: 400 }
      );
    }

    result = await codeAgentService.executeCode({
      sessionId,
      language: validated.language,
      code: validated.code,
      options: {
        workingDirectory: validated.workingDirectory,
        timeout: validated.timeout,
        env: validated.env,
      },
    });
  } else {
    if (!validated.command) {
      return NextResponse.json(
        { error: "command is required for type=command" },
        { status: 400 }
      );
    }

    result = await codeAgentService.runCommand({
      sessionId,
      command: validated.command,
      args: validated.args,
      options: {
        workingDirectory: validated.workingDirectory,
        timeout: validated.timeout,
        env: validated.env,
      },
    });
  }

  return NextResponse.json({ result });
}

// =============================================================================
// EXPORT
// =============================================================================

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);

