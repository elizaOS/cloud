/**
 * CoinGecko Service - Cryptocurrency market data
 * API: https://www.coingecko.com/en/api/documentation
 */

import { logger } from "@/lib/utils/logger";
import { CoinGeckoClient } from "./client";
import type {
  CoinGeckoSimplePrice,
  CoinGeckoMarketCoin,
  CoinGeckoCoinDetail,
  CoinGeckoOHLC,
  CoinGeckoMarketChart,
  CoinGeckoTrendingResponse,
  CoinGeckoGlobalData,
  CoinGeckoSearchResult,
  CoinGeckoCoinListItem,
  CoinGeckoExchange,
  CoinGeckoCurrency,
} from "./types";
import type { TokenPrice, OHLCVDataPoint, TrendingToken, MarketOverview, TokenInfo } from "../types";

export * from "./types";
export * from "./schemas";

export interface CoinGeckoConfig {
  apiKey?: string;
  timeout?: number;
}

const PLATFORM_IDS: Record<string, string> = {
  ethereum: "ethereum",
  polygon: "polygon-pos",
  bsc: "binance-smart-chain",
  solana: "solana",
  base: "base",
  arbitrum: "arbitrum-one",
  optimism: "optimistic-ethereum",
  avalanche: "avalanche",
};

export class CoinGeckoService {
  private readonly client: CoinGeckoClient;
  private coinListCache: CoinGeckoCoinListItem[] | null = null;
  private coinListCacheTime: number = 0;
  private readonly COIN_CACHE_TTL = 3600000; // 1 hour

  constructor(config: CoinGeckoConfig = {}) {
    this.client = new CoinGeckoClient({ apiKey: config.apiKey, timeout: config.timeout });
  }

  static fromEnv(): CoinGeckoService {
    return new CoinGeckoService({
      apiKey: process.env.COINGECKO_API_KEY,
      timeout: process.env.COINGECKO_TIMEOUT ? parseInt(process.env.COINGECKO_TIMEOUT, 10) : undefined,
    });
  }

  async getSimplePrice(
    coinIds: string[],
    options: { vsCurrencies?: CoinGeckoCurrency[]; includeMarketCap?: boolean; include24hVol?: boolean; include24hChange?: boolean } = {}
  ): Promise<CoinGeckoSimplePrice> {
    logger.info(`[CoinGecko] Getting prices for ${coinIds.length} coins`);

    return this.client.get<CoinGeckoSimplePrice>("/simple/price", {
      ids: coinIds.join(","),
      vs_currencies: (options.vsCurrencies ?? ["usd"]).join(","),
      include_market_cap: options.includeMarketCap,
      include_24hr_vol: options.include24hVol,
      include_24hr_change: options.include24hChange,
    });
  }

  async getTokenPrice(
    platform: string,
    contractAddresses: string[],
    options: { vsCurrencies?: CoinGeckoCurrency[]; includeMarketCap?: boolean; include24hVol?: boolean; include24hChange?: boolean } = {}
  ): Promise<Map<string, TokenPrice>> {
    const platformId = PLATFORM_IDS[platform] ?? platform;
    logger.info(`[CoinGecko] Getting token prices on ${platformId}`);

    const response = await this.client.get<Record<string, Record<string, number>>>(`/simple/token_price/${platformId}`, {
      contract_addresses: contractAddresses.join(","),
      vs_currencies: (options.vsCurrencies ?? ["usd"]).join(","),
      include_market_cap: options.includeMarketCap,
      include_24hr_vol: options.include24hVol,
      include_24hr_change: options.include24hChange,
    });

    const prices = new Map<string, TokenPrice>();
    for (const [address, data] of Object.entries(response)) {
      prices.set(address.toLowerCase(), {
        address,
        symbol: "",
        priceUsd: data.usd ?? 0,
        priceChange24h: data.usd_24h_change,
        volume24h: data.usd_24h_vol,
        marketCap: data.usd_market_cap,
        lastUpdated: new Date(),
      });
    }
    return prices;
  }

  async getMarkets(
    options: {
      vsCurrency?: CoinGeckoCurrency;
      ids?: string[];
      category?: string;
      order?: "market_cap_desc" | "market_cap_asc" | "volume_desc" | "volume_asc";
      perPage?: number;
      page?: number;
      sparkline?: boolean;
      priceChangePercentage?: ("1h" | "24h" | "7d" | "14d" | "30d" | "200d" | "1y")[];
    } = {}
  ): Promise<CoinGeckoMarketCoin[]> {
    logger.info("[CoinGecko] Getting market data");

    return this.client.get<CoinGeckoMarketCoin[]>("/coins/markets", {
      vs_currency: options.vsCurrency ?? "usd",
      ids: options.ids?.join(","),
      category: options.category,
      order: options.order ?? "market_cap_desc",
      per_page: options.perPage ?? 100,
      page: options.page ?? 1,
      sparkline: options.sparkline,
      price_change_percentage: options.priceChangePercentage?.join(","),
    });
  }

  async getCoinDetail(
    coinId: string,
    options: { localization?: boolean; tickers?: boolean; marketData?: boolean; communityData?: boolean; developerData?: boolean; sparkline?: boolean } = {}
  ): Promise<CoinGeckoCoinDetail> {
    logger.info(`[CoinGecko] Getting detail for ${coinId}`);

    return this.client.get<CoinGeckoCoinDetail>(`/coins/${coinId}`, {
      localization: options.localization ?? false,
      tickers: options.tickers ?? false,
      market_data: options.marketData ?? true,
      community_data: options.communityData ?? false,
      developer_data: options.developerData ?? false,
      sparkline: options.sparkline ?? false,
    });
  }

  async getMarketChart(coinId: string, options: { vsCurrency?: CoinGeckoCurrency; days: number | "max"; interval?: "daily" | "hourly" }): Promise<CoinGeckoMarketChart> {
    logger.info(`[CoinGecko] Getting market chart for ${coinId}`);

    return this.client.get<CoinGeckoMarketChart>(`/coins/${coinId}/market_chart`, {
      vs_currency: options.vsCurrency ?? "usd",
      days: options.days,
      interval: options.interval,
    });
  }

  async getOHLC(coinId: string, options: { vsCurrency?: CoinGeckoCurrency; days: "1" | "7" | "14" | "30" | "90" | "180" | "365" | "max" }): Promise<OHLCVDataPoint[]> {
    logger.info(`[CoinGecko] Getting OHLC for ${coinId}`);

    const response = await this.client.get<CoinGeckoOHLC[]>(`/coins/${coinId}/ohlc`, {
      vs_currency: options.vsCurrency ?? "usd",
      days: options.days,
    });

    return response.map(([timestamp, open, high, low, close]) => ({
      timestamp, open, high, low, close, volume: 0, // CoinGecko OHLC doesn't include volume
    }));
  }

  async getTrending(): Promise<TrendingToken[]> {
    logger.info("[CoinGecko] Getting trending coins");

    const response = await this.client.get<CoinGeckoTrendingResponse>("/search/trending");

    return response.coins.map((item, index) => ({
      token: {
        address: item.item.id,
        symbol: item.item.symbol,
        name: item.item.name,
        decimals: 18,
        chainId: "ethereum" as const,
        logoUri: item.item.large,
      },
      rank: index + 1,
      priceUsd: item.item.data?.price ?? 0,
      priceChange24h: item.item.data?.price_change_percentage_24h?.usd ?? 0,
      volume24h: parseFloat(item.item.data?.total_volume ?? "0"),
      trendScore: item.item.score,
    }));
  }

  async getGlobalData(): Promise<MarketOverview> {
    logger.info("[CoinGecko] Getting global market data");
    const response = await this.client.get<CoinGeckoGlobalData>("/global");

    return {
      totalMarketCapUsd: response.data.total_market_cap.usd,
      totalVolume24hUsd: response.data.total_volume.usd,
      btcDominance: response.data.market_cap_percentage.btc,
      ethDominance: response.data.market_cap_percentage.eth,
      activeCoins: response.data.active_cryptocurrencies,
      lastUpdated: new Date(response.data.updated_at * 1000),
    };
  }

  async search(query: string): Promise<CoinGeckoSearchResult> {
    logger.info(`[CoinGecko] Searching: "${query}"`);
    return this.client.get<CoinGeckoSearchResult>("/search", { query });
  }

  async searchTokens(query: string): Promise<TokenInfo[]> {
    const result = await this.search(query);
    return result.coins.slice(0, 50).map((coin) => ({
      address: coin.id,
      symbol: coin.symbol,
      name: coin.name,
      decimals: 18,
      chainId: "ethereum" as const,
      logoUri: coin.large,
    }));
  }

  async getCoinList(includePlatform: boolean = false): Promise<CoinGeckoCoinListItem[]> {
    if (this.coinListCache && Date.now() - this.coinListCacheTime < this.COIN_CACHE_TTL) {
      return this.coinListCache;
    }

    logger.info("[CoinGecko] Fetching coin list");
    const coins = await this.client.get<CoinGeckoCoinListItem[]>("/coins/list", { include_platform: includePlatform });
    this.coinListCache = coins;
    this.coinListCacheTime = Date.now();
    return coins;
  }

  async findCoinIdBySymbol(symbol: string): Promise<string | null> {
    const coins = await this.getCoinList();
    const coin = coins.find((c) => c.symbol.toLowerCase() === symbol.toLowerCase());
    return coin?.id ?? null;
  }

  async findCoinIdByAddress(platform: string, address: string): Promise<string | null> {
    const coins = await this.getCoinList(true);
    const platformId = PLATFORM_IDS[platform] ?? platform;
    const coin = coins.find((c) => c.platforms?.[platformId]?.toLowerCase() === address.toLowerCase());
    return coin?.id ?? null;
  }

  async getExchanges(options: { perPage?: number; page?: number } = {}): Promise<CoinGeckoExchange[]> {
    logger.info("[CoinGecko] Getting exchanges list");
    return this.client.get<CoinGeckoExchange[]>("/exchanges", { per_page: options.perPage ?? 100, page: options.page ?? 1 });
  }

  async getSupportedCurrencies(): Promise<string[]> {
    return this.client.get<string[]>("/simple/supported_vs_currencies");
  }

  async getCoinPrice(coinId: string): Promise<TokenPrice> {
    const data = await this.getSimplePrice([coinId], { include24hChange: true, include24hVol: true, includeMarketCap: true });
    const coinData = data[coinId];
    if (!coinData) throw new Error(`Coin not found: ${coinId}`);

    return {
      address: coinId,
      symbol: "",
      priceUsd: coinData.usd,
      priceChange24h: coinData.usd_24h_change,
      volume24h: coinData.usd_24h_vol,
      marketCap: coinData.usd_market_cap,
      lastUpdated: new Date(coinData.last_updated_at ? coinData.last_updated_at * 1000 : Date.now()),
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    return this.client.healthCheck();
  }
}

let serviceInstance: CoinGeckoService | null = null;

export function getCoinGeckoService(): CoinGeckoService {
  if (!serviceInstance) serviceInstance = CoinGeckoService.fromEnv();
  return serviceInstance;
}

export function resetCoinGeckoService(): void {
  serviceInstance = null;
}
