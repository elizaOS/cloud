import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { GET as getPredictionPreview } from "@/app/api/v1/market/preview/predictions/route";
import { GET as getWalletOverviewPreview } from "@/app/api/v1/market/preview/wallet-overview/route";
import { __resetPublicMarketPreviewCacheForTests } from "@/lib/services/market-preview";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

const coinGeckoPayload = [
  {
    id: "bitcoin",
    symbol: "btc",
    name: "Bitcoin",
    current_price: 103_000,
    price_change_percentage_24h: 2.1,
    market_cap_rank: 1,
    image: "https://assets.example.com/btc.png",
  },
  {
    id: "ethereum",
    symbol: "eth",
    name: "Ethereum",
    current_price: 4_900,
    price_change_percentage_24h: 1.4,
    market_cap_rank: 2,
    image: "https://assets.example.com/eth.png",
  },
  {
    id: "solana",
    symbol: "sol",
    name: "Solana",
    current_price: 210,
    price_change_percentage_24h: 4.3,
    market_cap_rank: 5,
    image: "https://assets.example.com/sol.png",
  },
  {
    id: "dogecoin",
    symbol: "doge",
    name: "Dogecoin",
    current_price: 0.33,
    price_change_percentage_24h: 12.8,
    market_cap_rank: 8,
    image: "https://assets.example.com/doge.png",
  },
];

const polymarketPayload = [
  {
    slug: "bitcoin-above-120k-by-2026",
    question: "Will Bitcoin trade above $120k by 2026?",
    outcomes: JSON.stringify(["Yes", "No"]),
    outcomePrices: JSON.stringify(["0.62", "0.38"]),
    volume24hr: "1532450.9",
    volume: "10400000",
    endDate: "2026-12-31T23:59:59.000Z",
    image: "https://assets.example.com/btc-market.png",
  },
];

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

describe("public market preview routes", () => {
  beforeEach(() => {
    mock.restore();
    restoreEnv();
    __resetPublicMarketPreviewCacheForTests();
    process.env.REDIS_RATE_LIMITING = "false";
  });

  afterEach(() => {
    mock.restore();
    restoreEnv();
    __resetPublicMarketPreviewCacheForTests();
    globalThis.fetch = ORIGINAL_FETCH;
  });

  test("wallet overview preview returns real-source metadata with CORS and rate-limit headers", async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://api.coingecko.com/")) {
        return Response.json(coinGeckoPayload);
      }
      if (url.startsWith("https://gamma-api.polymarket.com/markets")) {
        return Response.json(polymarketPayload);
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const response = await getWalletOverviewPreview(
      new NextRequest("https://elizacloud.ai/api/v1/market/preview/wallet-overview", {
        headers: { "x-forwarded-for": "203.0.113.10" },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=60, stale-while-revalidate=180",
    );
    expect(response.headers.get("X-RateLimit-Limit")).toBe("20");

    const body = await response.json();
    expect(body.sources.prices.providerId).toBe("coingecko");
    expect(body.sources.predictions.providerId).toBe("polymarket");
    expect(body.prices).toHaveLength(3);
    expect(body.movers[0]?.id).toBe("dogecoin");
    expect(body.predictions[0]?.highlightedOutcomeProbability).toBe(0.62);
  });

  test("prediction preview returns normalized Polymarket data", async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://gamma-api.polymarket.com/markets")) {
        return Response.json(polymarketPayload);
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const response = await getPredictionPreview(
      new NextRequest("https://elizacloud.ai/api/v1/market/preview/predictions", {
        headers: { "x-forwarded-for": "203.0.113.11" },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("X-RateLimit-Limit")).toBe("20");

    const body = await response.json();
    expect(body.source.providerId).toBe("polymarket");
    expect(body.predictions[0]).toMatchObject({
      slug: "bitcoin-above-120k-by-2026",
      highlightedOutcomeLabel: "Yes",
      highlightedOutcomeProbability: 0.62,
    });
  });
});
