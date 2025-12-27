/**
 * GET /api/v1/defi/helius/transactions - Solana transaction history
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchHeliusTransactions } from "@/lib/services/defi/operations";

const QuerySchema = z.object({
  address: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    address: searchParams.get("address"),
    limit: searchParams.get("limit") ?? 20,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid parameters", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const result = await fetchHeliusTransactions(
    parsed.data.address,
    parsed.data.limit,
  );
  return NextResponse.json(result);
}
