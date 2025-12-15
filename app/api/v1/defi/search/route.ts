/**
 * GET /api/v1/defi/search - Search tokens
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { searchTokens } from "@/lib/services/defi/operations";

const QuerySchema = z.object({
  query: z.string().min(1),
  source: z.enum(["defined", "coingecko"]).default("coingecko"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    query: searchParams.get("query"),
    source: searchParams.get("source") ?? "coingecko",
    limit: searchParams.get("limit") ?? 20,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid parameters", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const result = await searchTokens(
    parsed.data.source,
    parsed.data.query,
    parsed.data.limit,
  );
  return NextResponse.json(result);
}
