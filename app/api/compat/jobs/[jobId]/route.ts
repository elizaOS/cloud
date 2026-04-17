/**
 * GET /api/compat/jobs/[jobId] — synthesized job status
 *
 * cloud has no async job system — jobId IS the agent ID.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  envelope,
  errorEnvelope,
  toCompatJob,
} from "@/lib/api/compat-envelope";
import { miladySandboxService } from "@/lib/services/milady-sandbox";
import { requireCompatAuth } from "../../_lib/auth";
import { handleCompatCorsOptions, withCompatCors } from "../../_lib/cors";
import { handleCompatError } from "../../_lib/error-handler";

export const dynamic = "force-dynamic";
const CORS_METHODS = "GET, OPTIONS";

type RouteParams = { params: Promise<{ jobId: string }> };

export function OPTIONS() {
  return handleCompatCorsOptions(CORS_METHODS);
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireCompatAuth(request);
    const { jobId } = await params;

    const agent = await miladySandboxService.getAgent(
      jobId,
      user.organization_id,
    );
    if (!agent) {
      return withCompatCors(
        NextResponse.json(errorEnvelope("Job not found"), { status: 404 }),
        CORS_METHODS,
      );
    }

    return withCompatCors(
      NextResponse.json(envelope(toCompatJob(agent))),
      CORS_METHODS,
    );
  } catch (err) {
    return handleCompatError(err, CORS_METHODS);
  }
}
