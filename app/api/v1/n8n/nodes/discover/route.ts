/**
 * N8N Node Discovery API
 *
 * GET /api/v1/n8n/nodes/discover - Discover all available endpoints as n8n nodes
 * POST /api/v1/n8n/nodes/discover - Search endpoints
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { endpointDiscoveryService } from "@/lib/services/endpoint-discovery";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const SearchSchema = z.object({
  query: z.string().optional(),
  types: z.array(z.enum(["a2a", "mcp", "rest"])).optional(),
  categories: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(200).optional().default(100),
});

/**
 * GET /api/v1/n8n/nodes/discover
 * Discovers all available endpoints as n8n nodes.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuthOrApiKeyWithOrg(request);

    const query = request.nextUrl.searchParams.get("query") || undefined;
    const typesParam = request.nextUrl.searchParams.get("types");
    const categoriesParam = request.nextUrl.searchParams.get("categories");
    const limit = Number.parseInt(request.nextUrl.searchParams.get("limit") || "100");

    const types = typesParam ? typesParam.split(",") as ("a2a" | "mcp" | "rest")[] : undefined;
    const categories = categoriesParam ? categoriesParam.split(",") : undefined;

    const results = await endpointDiscoveryService.searchEndpoints(query || "", {
      types,
      categories,
      limit,
    });

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (error) {
    logger.error("[N8N Node Discovery] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to discover nodes",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/n8n/nodes/discover
 * Searches endpoints with advanced filters.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuthOrApiKeyWithOrg(request);

    const body = await request.json();
    const validation = SearchSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request",
          details: validation.error.format(),
        },
        { status: 400 }
      );
    }

    const results = await endpointDiscoveryService.searchEndpoints(
      validation.data.query || "",
      {
        types: validation.data.types,
        categories: validation.data.categories,
        limit: validation.data.limit,
      }
    );

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (error) {
    logger.error("[N8N Node Discovery] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to search nodes",
      },
      { status: 500 }
    );
  }
}


