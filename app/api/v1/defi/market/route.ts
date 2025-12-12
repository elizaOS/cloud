/**
 * GET /api/v1/defi/market - Global market overview
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchMarketOverview } from "@/lib/services/defi/operations";

const QuerySchema = z.object({
  source: z.enum(["coingecko", "coinmarketcap"]).default("coingecko"),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({ source: searchParams.get("source") ?? "coingecko" });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid parameters", details: parsed.error.format() }, { status: 400 });
  }

  const result = await fetchMarketOverview(parsed.data.source);
  return NextResponse.json(result);
}
