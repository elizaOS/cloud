/**
 * GET /api/v1/defi/trending - Trending tokens
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchTrendingTokens } from "@/lib/services/defi/operations";

const QuerySchema = z.object({
  source: z.enum(["birdeye", "coingecko", "coinmarketcap"]).default("coingecko"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    source: searchParams.get("source") ?? "coingecko",
    limit: searchParams.get("limit") ?? 20,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid parameters", details: parsed.error.format() }, { status: 400 });
  }

  const result = await fetchTrendingTokens(parsed.data.source, parsed.data.limit);
  return NextResponse.json(result);
}
