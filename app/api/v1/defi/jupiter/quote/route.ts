/**
 * GET /api/v1/defi/jupiter/quote - Jupiter swap quote
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchJupiterQuote } from "@/lib/services/defi/operations";

const QuerySchema = z.object({
  inputMint: z.string().min(1),
  outputMint: z.string().min(1),
  amount: z.string().min(1),
  slippageBps: z.coerce.number().int().min(0).max(10000).default(50),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    inputMint: searchParams.get("inputMint"),
    outputMint: searchParams.get("outputMint"),
    amount: searchParams.get("amount"),
    slippageBps: searchParams.get("slippageBps") ?? 50,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid parameters", details: parsed.error.format() }, { status: 400 });
  }

  const result = await fetchJupiterQuote(parsed.data);
  return NextResponse.json(result);
}
