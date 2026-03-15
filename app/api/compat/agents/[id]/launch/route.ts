/**
 * POST /api/compat/agents/[id]/launch
 *
 * Provision the selected managed Milady agent if needed, ensure its backend
 * is preconfigured for cloud usage, and return a one-time launch URL for the
 * Milady web app together with direct connection details.
 */

import { NextRequest, NextResponse } from "next/server";
import { envelope, errorEnvelope } from "@/lib/api/compat-envelope";
import {
  ManagedMiladyLaunchError,
  launchManagedMiladyAgent,
} from "@/lib/services/milady-managed-launch";
import { requireCompatAuth } from "../../../_lib/auth";
import { handleCompatError } from "../../../_lib/error-handler";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireCompatAuth(request);
    const { id: agentId } = await params;

    const result = await launchManagedMiladyAgent({
      agentId,
      organizationId: user.organization_id,
      userId: user.id,
    });

    return NextResponse.json(
      envelope({
        agentId: result.agentId,
        agentName: result.agentName,
        appUrl: result.appUrl,
        launchSessionId: result.launchSessionId,
        issuedAt: result.issuedAt,
        connection: result.connection,
      }),
    );
  } catch (error) {
    if (error instanceof ManagedMiladyLaunchError) {
      return NextResponse.json(errorEnvelope(error.message), {
        status: error.status,
      });
    }

    return handleCompatError(error);
  }
}
