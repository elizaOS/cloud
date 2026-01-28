/**
 * Templates API
 *
 * GET /api/v1/templates - List workflow templates for browsing
 *
 * Returns public templates, system templates, and user's organization templates.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";
import { workflowTemplatesRepository } from "@/db/repositories";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") || undefined;
    const search = searchParams.get("search") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // Get templates for this organization plus public/system templates
    const templates = await workflowTemplatesRepository.listByOrganization(
      user.organization_id,
      {
        category,
        includePublic: true,
        includeSystem: true,
        limit,
        offset,
      },
    );

    return NextResponse.json({
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        userIntent: t.user_intent,
        serviceDependencies: t.service_dependencies || [],
        category: t.category,
        usageCount: t.usage_count,
        successRate: t.success_rate,
        isSystem: t.is_system,
        isPublic: t.is_public,
        createdAt: t.created_at,
      })),
      total: templates.length,
      limit,
      offset,
    });
  } catch (error) {
    logger.error("[Templates] Failed to list templates", {
      error: error instanceof Error ? error.message : String(error),
      organizationId: user.organization_id,
    });

    return NextResponse.json(
      { error: "Failed to list templates" },
      { status: 500 },
    );
  }
}
