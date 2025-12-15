/**
 * DeFi MCP Tools
 *
 * MCP tool registrations for all DeFi service integrations.
 * Provides AI agents with access to token prices, swaps, analytics, and more.
 */

import type { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { z } from "zod";
import {
  getBirdeyeService,
  getJupiterService,
  getCoinGeckoService,
  getHeliusService,
  getCoinMarketCapService,
  getZeroExService,
  getDefinedService,
} from "@/lib/services/defi";
import {
  successResponse,
  errorResponse,
  type AuthResultWithOrg,
} from "../types";

/**
 * Register all DeFi tools with the MCP server
 */
export function registerDeFiTools(
  server: McpServer,
  getAuthContext: () => AuthResultWithOrg,
) {
  // ============================================
  // PRICE & MARKET DATA TOOLS
  // ============================================

  // Get token price (multi-source)
  server.registerTool(
    "defi_get_token_price",
    {
      description:
        "Get current price for a token. Supports Solana tokens (via Birdeye), CoinGecko coin IDs, or CMC symbols.",
      inputSchema: {
        source: z
          .enum(["birdeye", "coingecko", "coinmarketcap", "jupiter"])
          .optional()
          .default("coingecko")
          .describe("Data source to use"),
        identifier: z
          .string()
          .describe(
            "Token address (Solana), CoinGecko ID, or symbol depending on source",
          ),
        chain: z
          .enum(["solana", "ethereum", "base", "polygon", "arbitrum", "bsc"])
          .optional()
          .describe("Chain for address-based lookups"),
      },
    },
    async ({ source, identifier, chain }) => {
      try {
        let price;

        switch (source) {
          case "birdeye": {
            const birdeye = getBirdeyeService();
            price = await birdeye.getTokenPrice(identifier, chain as "solana");
            break;
          }
          case "jupiter": {
            const jupiter = getJupiterService();
            price = await jupiter.getTokenPrice(identifier);
            break;
          }
          case "coingecko": {
            const coingecko = getCoinGeckoService();
            price = await coingecko.getCoinPrice(identifier);
            break;
          }
          case "coinmarketcap": {
            const cmc = getCoinMarketCapService();
            price = await cmc.getTokenPrice(identifier);
            break;
          }
        }

        return successResponse({
          source,
          price: {
            address: price.address,
            symbol: price.symbol,
            priceUsd: price.priceUsd,
            priceChange24h: price.priceChange24h,
            volume24h: price.volume24h,
            marketCap: price.marketCap,
            lastUpdated: price.lastUpdated?.toISOString(),
          },
        });
      } catch (error) {
        return errorResponse(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    },
  );

  // Get trending tokens
  server.registerTool(
    "defi_get_trending",
    {
      description: "Get trending/popular tokens from various sources",
      inputSchema: {
        source: z
          .enum(["birdeye", "coingecko", "coinmarketcap"])
          .optional()
          .default("coingecko")
          .describe("Data source"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(20)
          .describe("Number of tokens to return"),
      },
    },
    async ({ source, limit }) => {
      try {
        let trending;

        switch (source) {
          case "birdeye": {
            const birdeye = getBirdeyeService();
            trending = await birdeye.getTrendingTokens({ limit });
            break;
          }
          case "coingecko": {
            const coingecko = getCoinGeckoService();
            trending = await coingecko.getTrending();
            break;
          }
          case "coinmarketcap": {
            const cmc = getCoinMarketCapService();
            trending = await cmc.getTrending(limit);
            break;
          }
        }

        return successResponse({
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
        });
      } catch (error) {
        return errorResponse(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    },
  );

  // Get global market overview
  server.registerTool(
    "defi_get_market_overview",
    {
      description:
        "Get global cryptocurrency market overview with total market cap, volume, and dominance",
      inputSchema: {
        source: z
          .enum(["coingecko", "coinmarketcap"])
          .optional()
          .default("coingecko")
          .describe("Data source"),
      },
    },
    async ({ source }) => {
      try {
        let overview;

        if (source === "coinmarketcap") {
          const cmc = getCoinMarketCapService();
          overview = await cmc.getMarketOverview();
        } else {
          const coingecko = getCoinGeckoService();
          overview = await coingecko.getGlobalData();
        }

        return successResponse({
          source,
          overview: {
            totalMarketCapUsd: overview.totalMarketCapUsd,
            totalVolume24hUsd: overview.totalVolume24hUsd,
            btcDominance: overview.btcDominance,
            ethDominance: overview.ethDominance,
            activeCoins: overview.activeCoins,
            lastUpdated: overview.lastUpdated.toISOString(),
          },
        });
      } catch (error) {
        return errorResponse(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    },
  );

  // ============================================
  // SOLANA-SPECIFIC TOOLS
  // ============================================

  // Get Solana token overview (Birdeye)
  server.registerTool(
    "defi_solana_token_overview",
    {
      description:
        "Get detailed Solana token overview including liquidity, volume, holders, and price",
      inputSchema: {
        address: z.string().describe("Solana token mint address"),
      },
    },
    async ({ address }) => {
      try {
        const birdeye = getBirdeyeService();
        const overview = await birdeye.getTokenOverview(address);

        return successResponse({
          token: {
            address: overview.address,
            symbol: overview.symbol,
            name: overview.name,
            decimals: overview.decimals,
            logoUri: overview.logoURI,
          },
          price: overview.price,
          priceChange24h: overview.priceChange24hPercent,
          volume24h: overview.v24hUSD,
          liquidity: overview.liquidity,
          marketCap: overview.mc,
          holders: overview.holder,
          lastTradeTime: overview.lastTradeHumanTime,
        });
      } catch (error) {
        return errorResponse(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    },
  );

  // Get Solana wallet portfolio (Birdeye)
  server.registerTool(
    "defi_solana_wallet_portfolio",
    {
      description: "Get Solana wallet token holdings and portfolio value",
      inputSchema: {
        wallet: z.string().describe("Solana wallet address"),
      },
    },
    async ({ wallet }) => {
      try {
        const birdeye = getBirdeyeService();
        const portfolio = await birdeye.getWalletPortfolio(wallet);

        return successResponse({
          wallet: portfolio.address,
          totalValueUsd: portfolio.totalValueUsd,
          holdings: portfolio.holdings.map((h) => ({
            token: {
              address: h.token.address,
              symbol: h.token.symbol,
              name: h.token.name,
            },
            balance: h.balance,
            balanceUsd: h.balanceUsd,
            percentage: h.percentage,
          })),
        });
      } catch (error) {
        return errorResponse(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    },
  );

  // Get Jupiter swap quote
  server.registerTool(
    "defi_jupiter_quote",
    {
      description: "Get a swap quote from Jupiter DEX aggregator on Solana",
      inputSchema: {
        inputMint: z.string().describe("Input token mint address"),
        outputMint: z.string().describe("Output token mint address"),
        amount: z
          .string()
          .describe("Input amount in smallest units (lamports)"),
        slippageBps: z
          .number()
          .int()
          .min(0)
          .max(10000)
          .optional()
          .default(50)
          .describe("Slippage tolerance in basis points"),
      },
    },
    async ({ inputMint, outputMint, amount, slippageBps }) => {
      try {
        const jupiter = getJupiterService();
        const quote = await jupiter.getQuote({
          inputMint,
          outputMint,
          amount,
          slippageBps,
        });

        return successResponse({
          inputToken: {
            address: quote.inputToken.address,
            symbol: quote.inputToken.symbol,
            name: quote.inputToken.name,
          },
          outputToken: {
            address: quote.outputToken.address,
            symbol: quote.outputToken.symbol,
            name: quote.outputToken.name,
          },
          inputAmount: quote.inputAmount,
          outputAmount: quote.outputAmount,
          priceImpactPercent: quote.priceImpactPercent,
          routes: quote.routes.map((r) => ({
            protocol: r.protocol,
            portion: r.portion,
          })),
        });
      } catch (error) {
        return errorResponse(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    },
  );

  // Get Helius transaction history
  server.registerTool(
    "defi_helius_transactions",
    {
      description:
        "Get parsed transaction history for a Solana address using Helius",
      inputSchema: {
        address: z.string().describe("Solana address"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(20)
          .describe("Number of transactions to return"),
      },
    },
    async ({ address, limit }) => {
      try {
        const helius = getHeliusService();
        const result = await helius.getTransactionHistory(address, { limit });

        return successResponse({
          address,
          transactions: result.transactions.map((tx) => ({
            signature: tx.signature,
            blockTime: tx.blockTime,
            type: tx.type,
            tokenAddress: tx.tokenAddress,
            amount: tx.amount,
            from: tx.from,
            to: tx.to,
          })),
          hasMore: result.hasMore,
        });
      } catch (error) {
        return errorResponse(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    },
  );

  // ============================================
  // EVM SWAP TOOLS (0x)
  // ============================================

  // Get 0x swap quote
  server.registerTool(
    "defi_0x_quote",
    {
      description: "Get a swap quote from 0x DEX aggregator for EVM chains",
      inputSchema: {
        sellToken: z.string().describe("Token address to sell"),
        buyToken: z.string().describe("Token address to buy"),
        sellAmount: z.string().describe("Amount to sell in smallest units"),
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
          .optional()
          .default("ethereum")
          .describe("EVM chain"),
        slippagePercentage: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .default(0.01)
          .describe("Slippage tolerance as decimal (0.01 = 1%)"),
      },
    },
    async ({ sellToken, buyToken, sellAmount, chain, slippagePercentage }) => {
      try {
        const zeroex = getZeroExService();
        const quote = await zeroex.getQuote(
          { sellToken, buyToken, sellAmount, slippagePercentage },
          chain,
        );

        return successResponse({
          chain,
          inputToken: quote.inputToken.address,
          outputToken: quote.outputToken.address,
          inputAmount: quote.inputAmount,
          outputAmount: quote.outputAmount,
          priceImpactPercent: quote.priceImpactPercent,
          estimatedGas: quote.estimatedGas,
          routes: quote.routes.map((r) => ({
            protocol: r.protocol,
            portion: r.portion,
          })),
        });
      } catch (error) {
        return errorResponse(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    },
  );

  // ============================================
  // CROSS-CHAIN ANALYTICS (Defined.fi)
  // ============================================

  // Search tokens across chains
  server.registerTool(
    "defi_search_tokens",
    {
      description: "Search for tokens across multiple chains using Defined.fi",
      inputSchema: {
        query: z.string().describe("Search query (name, symbol, or address)"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(20)
          .describe("Maximum results"),
      },
    },
    async ({ query, limit }) => {
      try {
        const defined = getDefinedService();
        const tokens = await defined.searchTokens(query, { limit });

        return successResponse({
          tokens: tokens.map((t) => ({
            address: t.address,
            symbol: t.symbol,
            name: t.name,
            networkId: t.networkId,
            logoUri: t.info?.imageSmallUrl,
          })),
        });
      } catch (error) {
        return errorResponse(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    },
  );

  // Get token holders
  server.registerTool(
    "defi_token_holders",
    {
      description: "Get top holders for a token using Defined.fi",
      inputSchema: {
        address: z.string().describe("Token contract address"),
        networkId: z
          .number()
          .int()
          .describe("Network ID (1=Ethereum, 137=Polygon, 8453=Base, etc.)"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(20)
          .describe("Number of holders to return"),
      },
    },
    async ({ address, networkId, limit }) => {
      try {
        const defined = getDefinedService();
        const result = await defined.getTokenHolders(
          address,
          networkId as Parameters<typeof defined.getTokenHolders>[1],
          { limit },
        );

        return successResponse({
          address,
          networkId,
          holders: result.holders.map((h) => ({
            address: h.address,
            balance: h.balance,
            sharePercent: h.share,
          })),
        });
      } catch (error) {
        return errorResponse(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    },
  );

  // ============================================
  // HISTORICAL DATA
  // ============================================

  // Get OHLCV data
  server.registerTool(
    "defi_get_ohlcv",
    {
      description: "Get OHLCV (candlestick) data for a token",
      inputSchema: {
        source: z
          .enum(["birdeye", "coingecko"])
          .optional()
          .default("coingecko")
          .describe("Data source"),
        identifier: z
          .string()
          .describe("Token address (Birdeye) or CoinGecko ID"),
        interval: z
          .enum(["1m", "5m", "15m", "1H", "4H", "1D", "1W"])
          .optional()
          .default("1H")
          .describe("Time interval"),
        days: z
          .enum(["1", "7", "14", "30", "90", "180", "365"])
          .optional()
          .default("7")
          .describe("Number of days (CoinGecko only)"),
      },
    },
    async ({ source, identifier, interval, days }) => {
      try {
        let ohlcv;

        if (source === "birdeye") {
          const birdeye = getBirdeyeService();
          ohlcv = await birdeye.getOHLCV(identifier, {
            interval: interval as "1H",
          });
        } else {
          const coingecko = getCoinGeckoService();
          ohlcv = await coingecko.getOHLC(identifier, { days: days as "7" });
        }

        return successResponse({
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
        });
      } catch (error) {
        return errorResponse(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    },
  );

  // ============================================
  // HEALTH CHECK
  // ============================================

  // Check DeFi service health
  server.registerTool(
    "defi_health_check",
    {
      description: "Check health status of DeFi service integrations",
      inputSchema: {
        services: z
          .array(
            z.enum([
              "birdeye",
              "jupiter",
              "coingecko",
              "helius",
              "coinmarketcap",
              "zeroex",
              "defined",
            ]),
          )
          .optional()
          .describe("Services to check (all if not specified)"),
      },
    },
    async ({ services }) => {
      try {
        const checks: Record<string, { healthy: boolean; latencyMs: number }> =
          {};
        const allServices = services ?? [
          "birdeye",
          "jupiter",
          "coingecko",
          "helius",
          "coinmarketcap",
          "zeroex",
          "defined",
        ];

        const promises = allServices.map(async (service) => {
          try {
            let result;
            switch (service) {
              case "birdeye":
                result = await getBirdeyeService().healthCheck();
                break;
              case "jupiter":
                result = await getJupiterService().healthCheck();
                break;
              case "coingecko":
                result = await getCoinGeckoService().healthCheck();
                break;
              case "helius":
                result = await getHeliusService().healthCheck();
                break;
              case "coinmarketcap":
                result = await getCoinMarketCapService().healthCheck();
                break;
              case "zeroex":
                result = await getZeroExService().healthCheck();
                break;
              case "defined":
                result = await getDefinedService().healthCheck();
                break;
              default:
                result = { healthy: false, latencyMs: -1 };
            }
            checks[service] = result;
          } catch {
            checks[service] = { healthy: false, latencyMs: -1 };
          }
        });

        await Promise.all(promises);

        const allHealthy = Object.values(checks).every((c) => c.healthy);

        return successResponse({
          status: allHealthy ? "healthy" : "degraded",
          services: checks,
        });
      } catch (error) {
        return errorResponse(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    },
  );
}
