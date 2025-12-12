/**
 * GET /api/v1/defi/ohlcv - OHLCV candlestick data
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchOHLCV } from "@/lib/services/defi/operations";

const QuerySchema = z.object({
  identifier: z.string().min(1),
  source: z.enum(["birdeye", "coingecko"]).default("coingecko"),
  interval: z.enum(["1m", "5m", "15m", "1H", "4H", "1D", "1W"]).default("1H"),
  days: z.enum(["1", "7", "14", "30", "90", "180", "365"]).default("7"),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    identifier: searchParams.get("identifier"),
    source: searchParams.get("source") ?? "coingecko",
    interval: searchParams.get("interval") ?? "1H",
    days: searchParams.get("days") ?? "7",
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid parameters", details: parsed.error.format() }, { status: 400 });
  }

  const { source, identifier, interval, days } = parsed.data;
  const result = await fetchOHLCV(source, identifier, { interval, days });
  return NextResponse.json(result);
}
