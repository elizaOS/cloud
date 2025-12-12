/**
 * Code Agent Packages API
 *
 * POST /api/v1/code-agent/sessions/:sessionId/packages
 * Install packages using npm, pip, bun, or cargo
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

const installPackagesSchema = z.object({
  packages: z.array(z.string()).min(1).max(50),
  manager: z.enum(["npm", "pip", "bun", "cargo"]).default("npm"),
  dev: z.boolean().default(false),
});

// =============================================================================
// HANDLER
// =============================================================================

async function handlePOST(request: NextRequest, context: RouteContext) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { sessionId } = await context.params;

  const body = await request.json();
  const validated = installPackagesSchema.parse(body);

  logger.info("[Code Agent API] Installing packages", {
    sessionId,
    packages: validated.packages,
    manager: validated.manager,
  });

  // Verify session
  const session = await codeAgentService.getSession(sessionId, user.organization_id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const result = await codeAgentService.installPackages({
    sessionId,
    packages: validated.packages,
    manager: validated.manager,
    dev: validated.dev,
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error, output: result.output },
      { status: 400 }
    );
  }

  return NextResponse.json(result);
}

// =============================================================================
// EXPORT
// =============================================================================

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);

