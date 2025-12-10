/**
 * ERC-8004 Marketplace Item API
 *
 * Get details for a specific marketplace item (agent, MCP, or app).
 *
 * GET /api/v1/erc8004/item/[id] - Get item details
 * 
 * Query Parameters:
 * - type: Optional type hint (agent, mcp, app)
 */

import { NextRequest, NextResponse } from "next/server";
import { erc8004MarketplaceService } from "@/lib/services/erc8004-marketplace";
import type { ERC8004ServiceType } from "@/lib/types/erc8004-marketplace";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") as ERC8004ServiceType | null;

  const item = await erc8004MarketplaceService.getItem(id, type || undefined);

  if (!item) {
    return NextResponse.json(
      { error: "Item not found" },
      { 
        status: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  return NextResponse.json(item, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
    },
  });
}

