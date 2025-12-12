/**
 * Code Agent Git API
 *
 * POST /api/v1/code-agent/sessions/:sessionId/git
 * Git operations: clone, commit, push, pull
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

const gitOperationSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("clone"),
    url: z.string().url(),
    branch: z.string().optional(),
    depth: z.number().min(1).optional(),
    directory: z.string().optional(),
  }),
  z.object({
    operation: z.literal("commit"),
    message: z.string().min(1).max(1000),
    author: z
      .object({
        name: z.string(),
        email: z.string().email(),
      })
      .optional(),
  }),
  z.object({
    operation: z.literal("push"),
    remote: z.string().default("origin"),
    branch: z.string().optional(),
    force: z.boolean().default(false),
  }),
  z.object({
    operation: z.literal("pull"),
    remote: z.string().default("origin"),
    branch: z.string().optional(),
  }),
  z.object({
    operation: z.literal("status"),
  }),
]);

// =============================================================================
// HANDLER
// =============================================================================

async function handlePOST(request: NextRequest, context: RouteContext) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { sessionId } = await context.params;

  const body = await request.json();
  const validated = gitOperationSchema.parse(body);

  logger.info("[Code Agent API] Git operation", {
    sessionId,
    operation: validated.operation,
  });

  // Verify session
  const session = await codeAgentService.getSession(sessionId, user.organization_id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (!session.capabilities.hasGit) {
    return NextResponse.json(
      { error: "Git is not enabled for this session" },
      { status: 400 }
    );
  }

  let result;

  switch (validated.operation) {
    case "clone":
      result = await codeAgentService.gitClone({
        sessionId,
        url: validated.url,
        branch: validated.branch,
        depth: validated.depth,
        directory: validated.directory,
      });
      break;

    case "commit":
      result = await codeAgentService.gitCommit({
        sessionId,
        message: validated.message,
        author: validated.author,
      });
      break;

    case "push":
      result = await codeAgentService.gitPush({
        sessionId,
        remote: validated.remote,
        branch: validated.branch,
        force: validated.force,
      });
      break;

    case "pull":
      result = await codeAgentService.gitPull({
        sessionId,
        remote: validated.remote,
        branch: validated.branch,
      });
      break;

    case "status":
      // Just return the git state from the session
      result = {
        success: true,
        message: "Git status retrieved",
        gitState: session.gitState,
      };
      break;
  }

  if (!result.success) {
    return NextResponse.json(
      { error: result.error, message: result.message },
      { status: 400 }
    );
  }

  return NextResponse.json(result);
}

// =============================================================================
// EXPORT
// =============================================================================

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);

