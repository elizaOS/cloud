import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { marketplaceService } from "@/lib/services/marketplace";
import { logger } from "@/lib/utils/logger";
import type { CategoryId, SortBy, SortOrder } from "@/lib/types/marketplace";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthWithOrg();
    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search") || undefined;
    const category = searchParams.get("category") as CategoryId | undefined;
    const hasVoice = searchParams.has("hasVoice")
      ? searchParams.get("hasVoice") === "true"
      : undefined;
    const deployed = searchParams.has("deployed")
      ? searchParams.get("deployed") === "true"
      : undefined;
    const template = searchParams.has("template")
      ? searchParams.get("template") === "true"
      : undefined;
    const myCharacters = searchParams.has("myCharacters")
      ? searchParams.get("myCharacters") === "true"
      : undefined;
    const publicChars = searchParams.has("public")
      ? searchParams.get("public") === "true"
      : undefined;
    const featured = searchParams.has("featured")
      ? searchParams.get("featured") === "true"
      : undefined;

    const sortBy = (searchParams.get("sortBy") || "popularity") as SortBy;
    const order = (searchParams.get("order") || "desc") as SortOrder;

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get("limit") || "20")),
    );

    const includeStats = searchParams.get("includeStats") === "true";

    logger.info("[Marketplace API] Search request:", {
      userId: user.id,
      search,
      category,
      page,
      limit,
    });

    const result = await marketplaceService.searchCharacters({
      userId: user.id,
      organizationId: user.organization_id!!,
      filters: {
        search,
        category,
        hasVoice,
        deployed,
        template,
        myCharacters,
        public: publicChars,
        featured,
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
    logger.error("[Marketplace API] Error searching characters:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to search characters",
      },
      { status: 500 },
    );
  }
}
