/**
 * GET /api/v1/defi/price - Token price from multiple sources
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchTokenPrice } from "@/lib/services/defi/operations";

const QuerySchema = z.object({
  source: z
    .enum(["birdeye", "jupiter", "coingecko", "coinmarketcap"])
    .default("coingecko"),
  identifier: z.string().min(1),
  chain: z
    .enum(["solana", "ethereum", "base", "polygon", "arbitrum", "bsc"])
    .optional(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    source: searchParams.get("source") ?? "coingecko",
    identifier: searchParams.get("identifier"),
    chain: searchParams.get("chain") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid parameters", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const { source, identifier, chain } = parsed.data;
  const result = await fetchTokenPrice(source, identifier, chain);
  return NextResponse.json(result);
}
