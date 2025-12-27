/**
 * GET /api/v1/defi/swap/quote - 0x swap quote for EVM chains
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchZeroExQuote } from "@/lib/services/defi/operations";
import type { ZeroExChain } from "@/lib/services/defi/zeroex";

const QuerySchema = z.object({
  sellToken: z.string().min(1),
  buyToken: z.string().min(1),
  sellAmount: z.string().min(1),
  chain: z
    .enum([
      "ethereum",
      "polygon",
      "bsc",
      "arbitrum",
      "optimism",
      "base",
      "avalanche",
    ])
    .default("ethereum"),
  slippagePercentage: z.coerce.number().min(0).max(1).default(0.01),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    sellToken: searchParams.get("sellToken"),
    buyToken: searchParams.get("buyToken"),
    sellAmount: searchParams.get("sellAmount"),
    chain: searchParams.get("chain") ?? "ethereum",
    slippagePercentage: searchParams.get("slippagePercentage") ?? 0.01,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid parameters", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const result = await fetchZeroExQuote({
    ...parsed.data,
    chain: parsed.data.chain as ZeroExChain,
  });
  return NextResponse.json(result);
}
