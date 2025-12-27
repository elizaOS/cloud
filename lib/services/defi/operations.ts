/**
 * Shared business logic for DeFi services - used by MCP tools, A2A skills, and REST routes
 */

import {
  getBirdeyeService,
  getJupiterService,
  getCoinGeckoService,
  getHeliusService,
  getCoinMarketCapService,
  getZeroExService,
  getDefinedService,
} from "./index";
import type { ZeroExChain } from "./zeroex";

type PriceSource = "birdeye" | "jupiter" | "coingecko" | "coinmarketcap";
type TrendingSource = "birdeye" | "coingecko" | "coinmarketcap";
type MarketSource = "coingecko" | "coinmarketcap";
type OHLCVSource = "birdeye" | "coingecko";
type SearchSource = "defined" | "coingecko";

const PRICE_FETCHERS: Record<
  PriceSource,
  (
    id: string,
    chain?: string,
  ) => Promise<{
    priceUsd: number;
    priceChange24h?: number;
    volume24h?: number;
    marketCap?: number;
    lastUpdated?: Date;
  }>
> = {
  birdeye: (id, chain) =>
    getBirdeyeService().getTokenPrice(id, chain as "solana"),
  jupiter: (id) => getJupiterService().getTokenPrice(id),
  coingecko: (id) => getCoinGeckoService().getCoinPrice(id),
  coinmarketcap: (id) => getCoinMarketCapService().getTokenPrice(id),
};

export async function fetchTokenPrice(
  source: PriceSource,
  identifier: string,
  chain?: string,
) {
  const fetcher = PRICE_FETCHERS[source];
  if (!fetcher) throw new Error(`Unsupported source: ${source}`);

  const price = await fetcher(identifier, chain);
  return {
    source,
    identifier,
    priceUsd: price.priceUsd,
    priceChange24h: price.priceChange24h,
    volume24h: price.volume24h,
    marketCap: price.marketCap,
    lastUpdated: price.lastUpdated?.toISOString() ?? new Date().toISOString(),
  };
}

export async function fetchTrendingTokens(source: TrendingSource, limit = 20) {
  let trending;
  switch (source) {
    case "birdeye":
      trending = await getBirdeyeService().getTrendingTokens({ limit });
      break;
    case "coingecko":
      trending = await getCoinGeckoService().getTrending();
      break;
    case "coinmarketcap":
      trending = await getCoinMarketCapService().getTrending(limit);
      break;
    default:
      throw new Error(`Unsupported source: ${source}`);
  }

  return {
    source,
    tokens: trending.slice(0, limit).map((t) => ({
      address: t.token.address,
      symbol: t.token.symbol,
      name: t.token.name,
      rank: t.rank,
      priceUsd: t.priceUsd,
      priceChange24h: t.priceChange24h,
      volume24h: t.volume24h,
    })),
  };
}

export async function fetchMarketOverview(source: MarketSource) {
  const overview =
    source === "coinmarketcap"
      ? await getCoinMarketCapService().getMarketOverview()
      : await getCoinGeckoService().getGlobalData();

  return {
    source,
    totalMarketCapUsd: overview.totalMarketCapUsd,
    totalVolume24hUsd: overview.totalVolume24hUsd,
    btcDominance: overview.btcDominance,
    ethDominance: overview.ethDominance,
    activeCoins: overview.activeCoins,
    lastUpdated: overview.lastUpdated.toISOString(),
  };
}

export async function fetchSolanaTokenOverview(address: string) {
  const overview = await getBirdeyeService().getTokenOverview(address);
  return {
    address: overview.address,
    symbol: overview.symbol,
    name: overview.name,
    decimals: overview.decimals,
    price: overview.price,
    priceChange24h: overview.priceChange24hPercent,
    volume24h: overview.v24hUSD,
    liquidity: overview.liquidity,
    marketCap: overview.mc,
    holders: overview.holder,
  };
}

export async function fetchSolanaWalletPortfolio(wallet: string) {
  const portfolio = await getBirdeyeService().getWalletPortfolio(wallet);
  return {
    wallet: portfolio.address,
    totalValueUsd: portfolio.totalValueUsd,
    holdings: portfolio.holdings.map((h) => ({
      address: h.token.address,
      symbol: h.token.symbol,
      name: h.token.name,
      balance: h.balance,
      balanceUsd: h.balanceUsd,
      percentage: h.percentage,
    })),
  };
}

export async function fetchJupiterQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps?: number;
}) {
  const quote = await getJupiterService().getQuote({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amount,
    slippageBps: params.slippageBps ?? 50,
  });

  return {
    inputToken: {
      address: quote.inputToken.address,
      symbol: quote.inputToken.symbol,
    },
    outputToken: {
      address: quote.outputToken.address,
      symbol: quote.outputToken.symbol,
    },
    inputAmount: quote.inputAmount,
    outputAmount: quote.outputAmount,
    priceImpactPercent: quote.priceImpactPercent,
    routes: quote.routes.map((r) => ({
      protocol: r.protocol,
      portion: r.portion,
    })),
  };
}

export async function fetchHeliusTransactions(address: string, limit = 20) {
  const result = await getHeliusService().getTransactionHistory(address, {
    limit,
  });
  return {
    address,
    transactions: result.transactions.map((tx) => ({
      signature: tx.signature,
      blockTime: tx.blockTime,
      type: tx.type,
      from: tx.from,
      to: tx.to,
    })),
    hasMore: result.hasMore,
  };
}

export async function fetchZeroExQuote(params: {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  chain?: ZeroExChain;
  slippagePercentage?: number;
}) {
  const chain = params.chain ?? "ethereum";
  const quote = await getZeroExService().getQuote(
    {
      sellToken: params.sellToken,
      buyToken: params.buyToken,
      sellAmount: params.sellAmount,
      slippagePercentage: params.slippagePercentage ?? 0.01,
    },
    chain,
  );

  return {
    chain,
    sellToken: quote.inputToken.address,
    buyToken: quote.outputToken.address,
    sellAmount: quote.inputAmount,
    buyAmount: quote.outputAmount,
    priceImpactPercent: quote.priceImpactPercent,
    estimatedGas: quote.estimatedGas,
    routes: quote.routes.map((r) => ({
      protocol: r.protocol,
      portion: r.portion,
    })),
  };
}

export async function searchTokens(
  source: SearchSource,
  query: string,
  limit = 20,
) {
  if (source === "defined") {
    const tokens = await getDefinedService().searchTokens(query, { limit });
    return {
      source,
      query,
      tokens: tokens.map((t) => ({
        address: t.address,
        symbol: t.symbol,
        name: t.name,
        networkId: t.networkId,
      })),
    };
  }

  const tokens = await getCoinGeckoService().searchTokens(query);
  return {
    source,
    query,
    tokens: tokens.slice(0, limit).map((t) => ({
      address: t.address,
      symbol: t.symbol,
      name: t.name,
      chainId: t.chainId,
    })),
  };
}

export async function fetchTokenHolders(
  address: string,
  networkId: number,
  limit = 20,
) {
  const result = await getDefinedService().getTokenHolders(address, networkId, {
    limit,
  });
  return {
    address,
    networkId,
    holders: result.holders.map((h) => ({
      address: h.address,
      balance: h.balance,
      sharePercent: h.share,
    })),
  };
}

export async function fetchOHLCV(
  source: OHLCVSource,
  identifier: string,
  options: { interval?: string; days?: string } = {},
) {
  const ohlcv =
    source === "birdeye"
      ? await getBirdeyeService().getOHLCV(identifier, {
          interval: (options.interval ?? "1H") as "1H",
        })
      : await getCoinGeckoService().getOHLC(identifier, {
          days: (options.days ?? "7") as "7",
        });

  return {
    source,
    identifier,
    candles: ohlcv.slice(-100).map((c) => ({
      timestamp: c.timestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    })),
  };
}

// Wrap service getter + healthCheck in single async to catch missing env var errors
const safeHealthCheck = async (
  getter: () => {
    healthCheck: () => Promise<{ healthy: boolean; latencyMs: number }>;
  },
) => {
  const service = getter();
  return service.healthCheck();
};

const SERVICE_HEALTH_CHECKS = [
  { name: "birdeye", fn: () => safeHealthCheck(getBirdeyeService) },
  { name: "jupiter", fn: () => safeHealthCheck(getJupiterService) },
  { name: "coingecko", fn: () => safeHealthCheck(getCoinGeckoService) },
  { name: "helius", fn: () => safeHealthCheck(getHeliusService) },
  { name: "coinmarketcap", fn: () => safeHealthCheck(getCoinMarketCapService) },
  { name: "zeroex", fn: () => safeHealthCheck(getZeroExService) },
  { name: "defined", fn: () => safeHealthCheck(getDefinedService) },
] as const;

export async function checkServicesHealth(serviceNames?: string[]) {
  const services =
    serviceNames !== undefined
      ? SERVICE_HEALTH_CHECKS.filter((s) => serviceNames.includes(s.name))
      : SERVICE_HEALTH_CHECKS;

  const results = await Promise.allSettled(services.map((s) => s.fn()));
  const checks: Record<string, { healthy: boolean; latencyMs: number }> = {};

  services.forEach((service, i) => {
    const result = results[i];
    checks[service.name] =
      result.status === "fulfilled"
        ? result.value
        : { healthy: false, latencyMs: -1 };
  });

  const healthyCount = Object.values(checks).filter((c) => c.healthy).length;
  return {
    status:
      healthyCount === services.length
        ? ("healthy" as const)
        : healthyCount > 0
          ? ("degraded" as const)
          : ("down" as const),
    services: checks,
    summary: {
      total: services.length,
      healthy: healthyCount,
      unhealthy: services.length - healthyCount,
    },
  };
}
