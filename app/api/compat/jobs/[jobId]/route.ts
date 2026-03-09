/**
 * GET /api/compat/jobs/[jobId] — synthesized job status
 *
 * eliza-cloud-v2 has no async job system — jobId IS the agent ID.
 */

import { NextRequest, NextResponse } from "next/server";
import { miladySandboxService } from "@/lib/services/milaidy-sandbox";
import { requireCompatAuth } from "../../_lib/auth";
import { toCompatJob, envelope, errorEnvelope } from "@/lib/api/compat-envelope";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ jobId: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireCompatAuth(request);
    const { jobId } = await params;

    const agent = await miladySandboxService.getAgent(jobId, user.organization_id);
    if (!agent) {
      return NextResponse.json(errorEnvelope("Job not found"), { status: 404 });
    }

    return NextResponse.json(envelope(toCompatJob(agent)));
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json(
        errorEnvelope(err.message),
        { status: err.message.includes("Unauthorized") ? 401 : 500 },
      );
    }
    return NextResponse.json(errorEnvelope("Internal server error"), { status: 500 });
  }
}
