import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { myAgentsService } from "@/lib/services";
import { logger } from "@/lib/utils/logger";
import type { CategoryId, SortBy, SortOrder } from "@/lib/types/my-agents";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthWithOrg();
    const { searchParams } = new URL(request.url);

    // Parse search filters
    const search = searchParams.get("search") || undefined;
    const category = searchParams.get("category") as CategoryId | undefined;

    // Boolean filters - only set if explicitly "true"
    const hasVoice = searchParams.get("hasVoice") === "true" ? true : undefined;
    const deployed = searchParams.get("deployed") === "true" ? true : undefined;

    // Sort options
    const sortBy = (searchParams.get("sortBy") || "newest") as SortBy;
    const order = (searchParams.get("order") || "desc") as SortOrder;

    // Pagination
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get("limit") || "20", 10)),
    );

    const includeStats = searchParams.get("includeStats") === "true";

    logger.debug("[My Agents API] Search request:", {
      userId: user.id,
      organizationId: user.organization_id,
      search,
      category,
      hasVoice,
      deployed,
      sortBy,
      page,
      limit,
    });

    const result = await myAgentsService.searchCharacters({
      userId: user.id,
      organizationId: user.organization_id!,
      filters: {
        search,
        category,
        hasVoice,
        deployed,
      },
      sortOptions: {
        sortBy,
        order,
      },
      pagination: {
        page,
        limit,
      },
      includeStats,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error("[My Agents API] Error searching characters:", error);

    const status =
      error instanceof Error && error.message.includes("auth") ? 401 : 500;

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to search characters",
      },
      { status },
    );
  }
}
