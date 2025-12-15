/**
 * DeFi MCP Tools
 */

import type { McpServer } from "@/lib/mcp/server";
import type { AuthResultWithOrg } from "./types";
import {
  fetchTokenPrice,
  fetchTrendingTokens,
  fetchMarketOverview,
  fetchSolanaTokenOverview,
  fetchSolanaWalletPortfolio,
  fetchJupiterQuote,
  fetchHeliusTransactions,
  fetchZeroExQuote,
  searchTokens,
  fetchTokenHolders,
  fetchOHLCV,
  checkServicesHealth,
} from "@/lib/services/defi/operations";
import type { ZeroExChain } from "@/lib/services/defi/zeroex";

const textContent = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data) }],
});

export function registerDeFiTools(
  server: McpServer,
  _getAuthContext: () => AuthResultWithOrg,
) {
  server.registerTool(
    "defi_get_token_price",
    {
      description:
        "Get token price from multiple sources (Birdeye, Jupiter, CoinGecko, CoinMarketCap)",
      inputSchema: {
        type: "object" as const,
        properties: {
          source: {
            type: "string",
            enum: ["birdeye", "jupiter", "coingecko", "coinmarketcap"],
          },
          identifier: {
            type: "string",
            description: "Token address or coin ID",
          },
        },
        required: ["source", "identifier"],
      },
    },
    async ({ source, identifier }: { source: string; identifier: string }) =>
      textContent(await fetchTokenPrice(source as "coingecko", identifier)),
  );

  server.registerTool(
    "defi_get_trending",
    {
      description: "Get trending tokens",
      inputSchema: {
        type: "object" as const,
        properties: {
          source: {
            type: "string",
            enum: ["birdeye", "coingecko", "coinmarketcap"],
          },
          limit: { type: "number" },
        },
        required: ["source"],
      },
    },
    async ({ source, limit = 20 }: { source: string; limit?: number }) =>
      textContent(await fetchTrendingTokens(source as "coingecko", limit)),
  );

  server.registerTool(
    "defi_get_market_overview",
    {
      description: "Get global cryptocurrency market overview",
      inputSchema: {
        type: "object" as const,
        properties: {
          source: { type: "string", enum: ["coingecko", "coinmarketcap"] },
        },
        required: ["source"],
      },
    },
    async ({ source }: { source: string }) =>
      textContent(await fetchMarketOverview(source as "coingecko")),
  );

  server.registerTool(
    "defi_solana_token_overview",
    {
      description: "Get detailed Solana token overview from Birdeye",
      inputSchema: {
        type: "object" as const,
        properties: {
          address: { type: "string", description: "Token mint address" },
        },
        required: ["address"],
      },
    },
    async ({ address }: { address: string }) =>
      textContent(await fetchSolanaTokenOverview(address)),
  );

  server.registerTool(
    "defi_solana_wallet_portfolio",
    {
      description: "Get Solana wallet portfolio from Birdeye",
      inputSchema: {
        type: "object" as const,
        properties: {
          address: { type: "string", description: "Wallet address" },
        },
        required: ["address"],
      },
    },
    async ({ address }: { address: string }) =>
      textContent(await fetchSolanaWalletPortfolio(address)),
  );

  server.registerTool(
    "defi_jupiter_quote",
    {
      description: "Get Jupiter swap quote on Solana",
      inputSchema: {
        type: "object" as const,
        properties: {
          inputMint: { type: "string" },
          outputMint: { type: "string" },
          amount: { type: "string" },
          slippageBps: { type: "number" },
        },
        required: ["inputMint", "outputMint", "amount"],
      },
    },
    async (p: {
      inputMint: string;
      outputMint: string;
      amount: string;
      slippageBps?: number;
    }) => textContent(await fetchJupiterQuote(p)),
  );

  server.registerTool(
    "defi_helius_transactions",
    {
      description: "Get Solana transaction history from Helius",
      inputSchema: {
        type: "object" as const,
        properties: {
          address: { type: "string" },
          limit: { type: "number" },
        },
        required: ["address"],
      },
    },
    async ({ address, limit = 20 }: { address: string; limit?: number }) =>
      textContent(await fetchHeliusTransactions(address, limit)),
  );

  server.registerTool(
    "defi_0x_quote",
    {
      description: "Get 0x swap quote for EVM chains",
      inputSchema: {
        type: "object" as const,
        properties: {
          sellToken: { type: "string" },
          buyToken: { type: "string" },
          sellAmount: { type: "string" },
          chain: {
            type: "string",
            enum: [
              "ethereum",
              "polygon",
              "bsc",
              "arbitrum",
              "optimism",
              "base",
              "avalanche",
            ],
          },
          slippagePercentage: { type: "number" },
        },
        required: ["sellToken", "buyToken", "sellAmount"],
      },
    },
    async (p: {
      sellToken: string;
      buyToken: string;
      sellAmount: string;
      chain?: string;
      slippagePercentage?: number;
    }) =>
      textContent(
        await fetchZeroExQuote({ ...p, chain: p.chain as ZeroExChain }),
      ),
  );

  server.registerTool(
    "defi_search_tokens",
    {
      description: "Search tokens across chains",
      inputSchema: {
        type: "object" as const,
        properties: {
          query: { type: "string" },
          source: { type: "string", enum: ["defined", "coingecko"] },
          limit: { type: "number" },
        },
        required: ["query"],
      },
    },
    async ({
      query,
      source = "coingecko",
      limit = 20,
    }: {
      query: string;
      source?: string;
      limit?: number;
    }) => textContent(await searchTokens(source as "coingecko", query, limit)),
  );

  server.registerTool(
    "defi_get_token_holders",
    {
      description: "Get token holders from Defined.fi",
      inputSchema: {
        type: "object" as const,
        properties: {
          tokenAddress: { type: "string" },
          networkId: { type: "number" },
          limit: { type: "number" },
        },
        required: ["tokenAddress", "networkId"],
      },
    },
    async ({
      tokenAddress,
      networkId,
      limit = 50,
    }: {
      tokenAddress: string;
      networkId: number;
      limit?: number;
    }) => textContent(await fetchTokenHolders(tokenAddress, networkId, limit)),
  );

  server.registerTool(
    "defi_get_ohlcv",
    {
      description: "Get OHLCV candlestick data",
      inputSchema: {
        type: "object" as const,
        properties: {
          identifier: { type: "string" },
          source: { type: "string", enum: ["birdeye", "coingecko"] },
          interval: {
            type: "string",
            enum: ["1m", "5m", "15m", "1H", "4H", "1D", "1W"],
          },
          days: {
            type: "string",
            enum: ["1", "7", "14", "30", "90", "180", "365"],
          },
        },
        required: ["identifier", "source"],
      },
    },
    async ({
      identifier,
      source,
      interval = "1H",
      days = "7",
    }: {
      identifier: string;
      source: string;
      interval?: string;
      days?: string;
    }) =>
      textContent(
        await fetchOHLCV(source as "birdeye", identifier, { interval, days }),
      ),
  );

  server.registerTool(
    "defi_health_check",
    {
      description: "Check health of DeFi services",
      inputSchema: { type: "object" as const, properties: {}, required: [] },
    },
    async () => textContent(await checkServicesHealth()),
  );
}
