/**
 * GET /api/v1/defi/solana/wallet - Solana wallet portfolio
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchSolanaWalletPortfolio } from "@/lib/services/defi/operations";

const QuerySchema = z.object({ address: z.string().min(1) });

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    address: searchParams.get("address"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid parameters", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const result = await fetchSolanaWalletPortfolio(parsed.data.address);
  return NextResponse.json(result);
}
