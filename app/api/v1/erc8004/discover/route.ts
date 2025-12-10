/**
 * ERC-8004 Marketplace Discovery API
 *
 * Enables agents to discover other agents, MCPs, and services in the marketplace.
 * Supports search, filtering by tags, protocols, and capabilities.
 *
 * GET /api/v1/erc8004/discover - Search and discover marketplace items
 * 
 * Query Parameters:
 * - query: Free text search
 * - types: Comma-separated service types (agent, mcp, app)
 * - tags: Comma-separated required tags
 * - anyTags: Comma-separated tags (OR logic)
 * - protocols: Comma-separated protocols (a2a, mcp, openapi, x402)
 * - category: Filter by category
 * - x402Only: Only x402-enabled services
 * - activeOnly: Only active/online services
 * - registeredOnly: Only ERC-8004 registered
 * - ecosystem: jeju or base
 * - sortBy: relevance, popularity, recent, name
 * - order: asc, desc
 * - page: Page number
 * - limit: Items per page (max 50)
 */

import { NextRequest, NextResponse } from "next/server";
import { erc8004MarketplaceService } from "@/lib/services/erc8004-marketplace";
import type {
  ERC8004DiscoveryFilters,
  ERC8004SortOptions,
  ERC8004PaginationOptions,
  ERC8004ServiceType,
  ERC8004Protocol,
  ERC8004PaymentMethod,
} from "@/lib/types/erc8004-marketplace";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Parse filters
  const filters: ERC8004DiscoveryFilters = {};

  const query = searchParams.get("query");
  if (query) filters.query = query;

  const types = searchParams.get("types");
  if (types) {
    filters.types = types.split(",") as ERC8004ServiceType[];
  }

  const tags = searchParams.get("tags");
  if (tags) {
    filters.tags = tags.split(",");
  }

  const anyTags = searchParams.get("anyTags");
  if (anyTags) {
    filters.anyTags = anyTags.split(",");
  }

  const protocols = searchParams.get("protocols");
  if (protocols) {
    filters.protocols = protocols.split(",") as ERC8004Protocol[];
  }

  const paymentMethods = searchParams.get("paymentMethods");
  if (paymentMethods) {
    filters.paymentMethods = paymentMethods.split(",") as ERC8004PaymentMethod[];
  }

  const category = searchParams.get("category");
  if (category) filters.category = category;

  const x402Only = searchParams.get("x402Only");
  if (x402Only === "true") filters.x402Only = true;

  const activeOnly = searchParams.get("activeOnly");
  if (activeOnly === "true") filters.activeOnly = true;

  const registeredOnly = searchParams.get("registeredOnly");
  if (registeredOnly === "true") filters.registeredOnly = true;
  if (registeredOnly === "false") filters.registeredOnly = false;

  const ecosystem = searchParams.get("ecosystem");
  if (ecosystem === "jeju" || ecosystem === "base") {
    filters.ecosystem = ecosystem;
  }

  const mcpTools = searchParams.get("mcpTools");
  if (mcpTools) {
    filters.mcpTools = mcpTools.split(",");
  }

  const a2aSkills = searchParams.get("a2aSkills");
  if (a2aSkills) {
    filters.a2aSkills = a2aSkills.split(",");
  }

  // Parse sort options
  const sort: ERC8004SortOptions = {
    sortBy:
      (searchParams.get("sortBy") as ERC8004SortOptions["sortBy"]) ||
      "relevance",
    order: (searchParams.get("order") as "asc" | "desc") || "desc",
  };

  // Parse pagination
  const pagination: ERC8004PaginationOptions = {
    page: Math.max(1, parseInt(searchParams.get("page") || "1", 10)),
    limit: Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10))),
  };

  const result = await erc8004MarketplaceService.discover(
    filters,
    sort,
    pagination
  );

  return NextResponse.json(result, {
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

