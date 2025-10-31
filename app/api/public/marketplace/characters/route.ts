import { NextRequest, NextResponse } from "next/server";
import { marketplaceService } from "@/lib/services/marketplace";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";
import type { CategoryId, SortBy, SortOrder } from "@/lib/types/marketplace";

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 100;
const RATE_LIMIT_WINDOW = 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT) {
    return false;
  }

  record.count++;
  return true;
}

const PublicMarketplaceQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  category: z
    .enum([
      "assistant",
      "anime",
      "creative",
      "gaming",
      "learning",
      "entertainment",
      "history",
      "lifestyle",
    ])
    .optional(),
  hasVoice: z.coerce.boolean().optional(),
  template: z.coerce.boolean().optional(),
  featured: z.coerce.boolean().optional(),
  sortBy: z
    .enum(["popularity", "newest", "name", "updated"])
    .default("popularity"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).max(100).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  includeStats: z.coerce.boolean().default(false),
});

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 },
      );
    }

    const { searchParams } = new URL(request.url);
    const parsed = PublicMarketplaceQuerySchema.safeParse(
      Object.fromEntries(searchParams.entries()),
    );

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid parameters",
          details: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    const params = parsed.data;

    logger.info("[Public Marketplace API] Request:", {
      ip,
      search: params.search,
      category: params.category,
      page: params.page,
    });

    const result = await marketplaceService.searchCharactersPublic({
      filters: {
        search: params.search,
        category: params.category,
        hasVoice: params.hasVoice,
        template: params.template,
        featured: params.featured,
        public: true,
      },
      sortOptions: {
        sortBy: params.sortBy,
        order: params.order,
      },
      pagination: {
        page: params.page,
        limit: params.limit,
      },
      includeStats: params.includeStats,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error("[Public Marketplace API] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch characters",
      },
      { status: 500 },
    );
  }
}
