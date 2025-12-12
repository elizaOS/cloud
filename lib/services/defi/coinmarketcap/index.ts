/**
 * CoinMarketCap Service - Cryptocurrency market data
 * API: https://coinmarketcap.com/api/documentation/v1/
 */

import { logger } from "@/lib/utils/logger";
import { BaseHttpClient } from "../base-client";
import type { TokenPrice, MarketOverview, TrendingToken } from "../types";

const CMC_BASE_URL = "https://pro-api.coinmarketcap.com/v1";

export interface CoinMarketCapConfig {
  apiKey: string;
  timeout?: number;
}

export interface CMCQuote {
  price: number;
  volume_24h: number;
  volume_change_24h: number;
  percent_change_1h: number;
  percent_change_24h: number;
  percent_change_7d: number;
  percent_change_30d: number;
  percent_change_60d: number;
  percent_change_90d: number;
  market_cap: number;
  market_cap_dominance: number;
  fully_diluted_market_cap: number;
  last_updated: string;
}

export interface CMCCryptocurrency {
  id: number;
  name: string;
  symbol: string;
  slug: string;
  num_market_pairs: number;
  date_added: string;
  tags: string[];
  max_supply: number | null;
  circulating_supply: number;
  total_supply: number;
  platform: { id: number; name: string; symbol: string; slug: string; token_address: string } | null;
  cmc_rank: number;
  self_reported_circulating_supply: number | null;
  self_reported_market_cap: number | null;
  last_updated: string;
  quote: Record<string, CMCQuote>;
}

export interface CMCGlobalMetrics {
  active_cryptocurrencies: number;
  total_cryptocurrencies: number;
  active_market_pairs: number;
  active_exchanges: number;
  total_exchanges: number;
  eth_dominance: number;
  btc_dominance: number;
  eth_dominance_yesterday: number;
  btc_dominance_yesterday: number;
  eth_dominance_24h_percentage_change: number;
  btc_dominance_24h_percentage_change: number;
  defi_volume_24h: number;
  defi_volume_24h_reported: number;
  defi_market_cap: number;
  defi_24h_percentage_change: number;
  stablecoin_volume_24h: number;
  stablecoin_volume_24h_reported: number;
  stablecoin_market_cap: number;
  stablecoin_24h_percentage_change: number;
  derivatives_volume_24h: number;
  derivatives_volume_24h_reported: number;
  derivatives_24h_percentage_change: number;
  quote: Record<string, {
    total_market_cap: number;
    total_volume_24h: number;
    total_volume_24h_reported: number;
    altcoin_volume_24h: number;
    altcoin_volume_24h_reported: number;
    altcoin_market_cap: number;
    defi_volume_24h: number;
    defi_volume_24h_reported: number;
    defi_24h_percentage_change: number;
    defi_market_cap: number;
    stablecoin_volume_24h: number;
    stablecoin_volume_24h_reported: number;
    stablecoin_24h_percentage_change: number;
    stablecoin_market_cap: number;
    derivatives_volume_24h: number;
    derivatives_volume_24h_reported: number;
    derivatives_24h_percentage_change: number;
    total_market_cap_yesterday: number;
    total_volume_24h_yesterday: number;
    total_market_cap_yesterday_percentage_change: number;
    total_volume_24h_yesterday_percentage_change: number;
    last_updated: string;
  }>;
  last_updated: string;
}

export interface CMCIdMapEntry {
  id: number;
  name: string;
  symbol: string;
  slug: string;
  rank: number;
  is_active: number;
  first_historical_data: string;
  last_historical_data: string;
  platform: { id: number; name: string; symbol: string; slug: string; token_address: string } | null;
}

class CoinMarketCapClient extends BaseHttpClient {
  constructor(config: { apiKey: string; timeout?: number }) {
    super({ baseUrl: CMC_BASE_URL, apiKey: config.apiKey, headers: { "X-CMC_PRO_API_KEY": config.apiKey, Accept: "application/json" }, timeout: config.timeout }, "CoinMarketCap");
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.get("/cryptocurrency/map", { limit: 1 });
      return { healthy: true, latencyMs: Date.now() - start };
    } catch {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }
}

export class CoinMarketCapService {
  private readonly client: CoinMarketCapClient;
  private idMapCache: Map<string, number> = new Map();
  private idMapCacheTime: number = 0;
  private readonly ID_CACHE_TTL = 3600000; // 1 hour

  constructor(config: CoinMarketCapConfig) {
    this.client = new CoinMarketCapClient({ apiKey: config.apiKey, timeout: config.timeout });
  }

  static fromEnv(): CoinMarketCapService {
    const apiKey = process.env.COINMARKETCAP_API_KEY;
    if (!apiKey) throw new Error("COINMARKETCAP_API_KEY environment variable is required");
    return new CoinMarketCapService({ apiKey });
  }

  async getLatestListings(
    options: {
      start?: number;
      limit?: number;
      convert?: string;
      sort?: "market_cap" | "name" | "symbol" | "date_added" | "price" | "circulating_supply" | "total_supply" | "volume_24h" | "percent_change_1h" | "percent_change_24h" | "percent_change_7d";
      sortDir?: "asc" | "desc";
    } = {}
  ): Promise<CMCCryptocurrency[]> {
    logger.info("[CoinMarketCap] Getting latest listings");

    const response = await this.client.get<{ data: CMCCryptocurrency[] }>("/cryptocurrency/listings/latest", {
      start: options.start ?? 1,
      limit: options.limit ?? 100,
      convert: options.convert ?? "USD",
      sort: options.sort ?? "market_cap",
      sort_dir: options.sortDir ?? "desc",
    });

    return response.data;
  }

  async getQuotes(ids: number[], convert: string = "USD"): Promise<Map<number, CMCCryptocurrency>> {
    logger.info(`[CoinMarketCap] Getting quotes for ${ids.length} cryptocurrencies`);

    const response = await this.client.get<{ data: Record<string, CMCCryptocurrency> }>("/cryptocurrency/quotes/latest", {
      id: ids.join(","),
      convert,
    });

    const result = new Map<number, CMCCryptocurrency>();
    for (const [id, data] of Object.entries(response.data)) {
      result.set(parseInt(id, 10), data);
    }
    return result;
  }

  async getQuotesBySymbol(symbols: string[], convert: string = "USD"): Promise<Map<string, CMCCryptocurrency>> {
    logger.info(`[CoinMarketCap] Getting quotes for symbols: ${symbols.join(",")}`);

    const response = await this.client.get<{ data: Record<string, CMCCryptocurrency[]> }>("/cryptocurrency/quotes/latest", {
      symbol: symbols.join(","),
      convert,
    });

    const result = new Map<string, CMCCryptocurrency>();
    for (const [symbol, dataArray] of Object.entries(response.data)) {
      if (dataArray.length > 0) result.set(symbol, dataArray[0]);
    }
    return result;
  }

  async getTokenPrice(symbol: string): Promise<TokenPrice> {
    const quotes = await this.getQuotesBySymbol([symbol]);
    const data = quotes.get(symbol.toUpperCase());
    if (!data) throw new Error(`Token not found: ${symbol}`);

    const quote = data.quote.USD;
    return {
      address: String(data.id),
      symbol: data.symbol,
      priceUsd: quote.price,
      priceChange24h: quote.percent_change_24h,
      volume24h: quote.volume_24h,
      marketCap: quote.market_cap,
      lastUpdated: new Date(quote.last_updated),
    };
  }

  async getGlobalMetrics(convert: string = "USD"): Promise<CMCGlobalMetrics> {
    logger.info("[CoinMarketCap] Getting global metrics");
    const response = await this.client.get<{ data: CMCGlobalMetrics }>("/global-metrics/quotes/latest", { convert });
    return response.data;
  }

  async getMarketOverview(): Promise<MarketOverview> {
    const metrics = await this.getGlobalMetrics();
    const usdQuote = metrics.quote.USD;

    return {
      totalMarketCapUsd: usdQuote.total_market_cap,
      totalVolume24hUsd: usdQuote.total_volume_24h,
      btcDominance: metrics.btc_dominance,
      ethDominance: metrics.eth_dominance,
      activeCoins: metrics.active_cryptocurrencies,
      lastUpdated: new Date(metrics.last_updated),
    };
  }

  async getTrending(limit: number = 20): Promise<TrendingToken[]> {
    logger.info("[CoinMarketCap] Getting trending (top gainers)");

    const listings = await this.getLatestListings({ limit: 200, sort: "percent_change_24h", sortDir: "desc" });

    return listings.slice(0, limit).map((coin, index) => {
      const quote = coin.quote.USD;
      return {
        token: { address: String(coin.id), symbol: coin.symbol, name: coin.name, decimals: 18, chainId: "ethereum" as const },
        rank: index + 1,
        priceUsd: quote.price,
        priceChange24h: quote.percent_change_24h,
        volume24h: quote.volume_24h,
      };
    });
  }

  async getIdMap(options: { start?: number; limit?: number; symbol?: string } = {}): Promise<CMCIdMapEntry[]> {
    logger.info("[CoinMarketCap] Getting ID map");

    const response = await this.client.get<{ data: CMCIdMapEntry[] }>("/cryptocurrency/map", {
      start: options.start ?? 1,
      limit: options.limit ?? 5000,
      symbol: options.symbol,
    });

    return response.data;
  }

  async findIdBySymbol(symbol: string): Promise<number | null> {
    const upperSymbol = symbol.toUpperCase();

    if (this.idMapCache.size > 0 && Date.now() - this.idMapCacheTime < this.ID_CACHE_TTL) {
      return this.idMapCache.get(upperSymbol) ?? null;
    }

    const idMap = await this.getIdMap();
    this.idMapCache.clear();
    for (const entry of idMap) {
      this.idMapCache.set(entry.symbol, entry.id);
    }
    this.idMapCacheTime = Date.now();

    return this.idMapCache.get(upperSymbol) ?? null;
  }

  async getCryptocurrencyInfo(ids: number[]): Promise<Record<number, {
    id: number; name: string; symbol: string; category: string; description: string; slug: string; logo: string;
    subreddit: string; notice: string; tags: string[];
    urls: { website: string[]; twitter: string[]; message_board: string[]; chat: string[]; facebook: string[]; explorer: string[]; reddit: string[]; technical_doc: string[]; source_code: string[]; announcement: string[] };
    platform: { id: number; name: string; symbol: string; slug: string; token_address: string } | null;
    date_added: string; date_launched: string | null; is_hidden: number;
    self_reported_circulating_supply: number | null; self_reported_market_cap: number | null; self_reported_tags: string[] | null; infinite_supply: boolean;
  }>> {
    logger.info(`[CoinMarketCap] Getting info for ${ids.length} cryptocurrencies`);

    const response = await this.client.get<{ data: Record<string, {
      id: number; name: string; symbol: string; category: string; description: string; slug: string; logo: string;
      subreddit: string; notice: string; tags: string[];
      urls: { website: string[]; twitter: string[]; message_board: string[]; chat: string[]; facebook: string[]; explorer: string[]; reddit: string[]; technical_doc: string[]; source_code: string[]; announcement: string[] };
      platform: { id: number; name: string; symbol: string; slug: string; token_address: string } | null;
      date_added: string; date_launched: string | null; is_hidden: number;
      self_reported_circulating_supply: number | null; self_reported_market_cap: number | null; self_reported_tags: string[] | null; infinite_supply: boolean;
    }> }>("/cryptocurrency/info", { id: ids.join(",") });

    const result: Record<number, typeof response.data[string]> = {};
    for (const [id, data] of Object.entries(response.data)) {
      result[parseInt(id, 10)] = data;
    }
    return result;
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    return this.client.healthCheck();
  }
}

let serviceInstance: CoinMarketCapService | null = null;

export function getCoinMarketCapService(): CoinMarketCapService {
  if (!serviceInstance) serviceInstance = CoinMarketCapService.fromEnv();
  return serviceInstance;
}

export function resetCoinMarketCapService(): void {
  serviceInstance = null;
}
