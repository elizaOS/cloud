/**
 * Code Interpreter Execute API
 *
 * POST /api/v1/code-interpreter/execute
 * Quick stateless code execution for fast evaluations
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { interpreterService } from "@/lib/services/code-agent";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit-redis";
import { logger } from "@/lib/utils/logger";

// =============================================================================
// SCHEMAS
// =============================================================================

const executeSchema = z.object({
  language: z.enum(["python", "javascript", "typescript", "shell"]),
  code: z.string().min(1).max(50000), // 50KB max
  packages: z.array(z.string()).max(20).default([]),
  timeout: z.number().min(1000).max(60000).default(30000), // 1s to 60s
});

// =============================================================================
// HANDLER
// =============================================================================

async function handlePOST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const body = await request.json();
  const validated = executeSchema.parse(body);

  logger.info("[Code Interpreter API] Execute request", {
    userId: user.id,
    organizationId: user.organization_id,
    language: validated.language,
    codeLength: validated.code.length,
    packages: validated.packages,
  });

  const result = await interpreterService.execute({
    organizationId: user.organization_id,
    userId: user.id,
    language: validated.language,
    code: validated.code,
    packages: validated.packages,
    timeout: validated.timeout,
  });

  return NextResponse.json(result);
}

// =============================================================================
// EXPORT
// =============================================================================

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);


