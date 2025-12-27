import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { endpointDiscoveryService } from "@/lib/services/endpoint-discovery";

export async function GET(request: NextRequest) {
  await requireAuthOrApiKeyWithOrg(request);

  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("query") || "";
  const typesParam = searchParams.get("types");
  const categoriesParam = searchParams.get("categories");
  const limitParam = searchParams.get("limit");

  const types = typesParam
    ? (typesParam
        .split(",")
        .filter((t) => ["a2a", "mcp", "rest"].includes(t)) as (
        | "a2a"
        | "mcp"
        | "rest"
      )[])
    : undefined;
  const categories = categoriesParam ? categoriesParam.split(",") : undefined;
  const limit = limitParam ? parseInt(limitParam, 10) : 100;

  const result = await endpointDiscoveryService.searchEndpoints(query, {
    types,
    categories,
    limit: Math.min(limit, 500),
  });

  return NextResponse.json({
    success: true,
    endpoints: result.nodes,
    categories: result.categories,
    total: result.total,
  });
}
