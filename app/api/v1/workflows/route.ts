/**
 * Workflows API
 *
 * GET /api/v1/workflows - List workflows for the organization
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";
import { generatedWorkflowsRepository } from "@/db/repositories";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as
      | "draft"
      | "testing"
      | "live"
      | "shared"
      | null;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const workflows = await generatedWorkflowsRepository.listByOrganization(
      user.organization_id,
      {
        status: status || undefined,
        limit,
        offset,
      },
    );

    return NextResponse.json({
      workflows: workflows.map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        userIntent: w.user_intent,
        serviceDependencies: w.service_dependencies,
        status: w.status,
        usageCount: w.usage_count,
        successRate: w.success_rate,
        isPublic: w.is_public,
        createdAt: w.created_at,
        updatedAt: w.updated_at,
        lastUsedAt: w.last_used_at,
      })),
      total: workflows.length,
      limit,
      offset,
    });
  } catch (error) {
    logger.error("[Workflows] Failed to list workflows", {
      error: error instanceof Error ? error.message : String(error),
      organizationId: user.organization_id,
    });

    return NextResponse.json(
      { error: "Failed to list workflows" },
      { status: 500 },
    );
  }
}
