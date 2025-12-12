/**
 * DeFi A2A Skills
 *
 * A2A skill implementations for DeFi services.
 */

import type { A2AContext } from "../types";
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

type Data = Record<string, unknown>;

function str(data: Data, key: string, fallback?: string): string {
  return (data[key] as string) ?? fallback ?? "";
}

function num(data: Data, key: string, fallback?: number): number {
  return (data[key] as number) ?? fallback ?? 0;
}

export async function executeSkillGetTokenPrice(_text: string, data: Data, _ctx: A2AContext) {
  const identifier = str(data, "identifier");
  if (!identifier) throw new Error("identifier is required");
  
  return fetchTokenPrice(
    (str(data, "source", "coingecko")) as "coingecko",
    identifier,
    str(data, "chain") || undefined
  );
}

export async function executeSkillGetTrendingTokens(_text: string, data: Data, _ctx: A2AContext) {
  return fetchTrendingTokens(
    str(data, "source", "coingecko") as "coingecko",
    num(data, "limit", 20)
  );
}

export async function executeSkillGetMarketOverview(_text: string, data: Data, _ctx: A2AContext) {
  return fetchMarketOverview(str(data, "source", "coingecko") as "coingecko");
}

export async function executeSkillSolanaTokenOverview(_text: string, data: Data, _ctx: A2AContext) {
  const address = str(data, "address");
  if (!address) throw new Error("address is required");
  return fetchSolanaTokenOverview(address);
}

export async function executeSkillSolanaWalletPortfolio(_text: string, data: Data, _ctx: A2AContext) {
  const wallet = str(data, "wallet");
  if (!wallet) throw new Error("wallet is required");
  return fetchSolanaWalletPortfolio(wallet);
}

export async function executeSkillJupiterQuote(_text: string, data: Data, _ctx: A2AContext) {
  const inputMint = str(data, "inputMint");
  const outputMint = str(data, "outputMint");
  const amount = str(data, "amount");
  if (!inputMint || !outputMint || !amount) throw new Error("inputMint, outputMint, and amount are required");
  
  return fetchJupiterQuote({
    inputMint,
    outputMint,
    amount,
    slippageBps: num(data, "slippageBps", 50),
  });
}

export async function executeSkillHeliusTransactions(_text: string, data: Data, _ctx: A2AContext) {
  const address = str(data, "address");
  if (!address) throw new Error("address is required");
  return fetchHeliusTransactions(address, num(data, "limit", 20));
}

export async function executeSkillZeroExQuote(_text: string, data: Data, _ctx: A2AContext) {
  const sellToken = str(data, "sellToken");
  const buyToken = str(data, "buyToken");
  const sellAmount = str(data, "sellAmount");
  if (!sellToken || !buyToken || !sellAmount) throw new Error("sellToken, buyToken, and sellAmount are required");

  return fetchZeroExQuote({
    sellToken,
    buyToken,
    sellAmount,
    chain: (str(data, "chain", "ethereum")) as ZeroExChain,
    slippagePercentage: num(data, "slippagePercentage", 0.01),
  });
}

export async function executeSkillSearchTokens(text: string, data: Data, _ctx: A2AContext) {
  const query = str(data, "query") || text;
  if (!query) throw new Error("query is required");
  return searchTokens(str(data, "source", "coingecko") as "coingecko", query, num(data, "limit", 20));
}

export async function executeSkillGetTokenHolders(_text: string, data: Data, _ctx: A2AContext) {
  const address = str(data, "address");
  const networkId = num(data, "networkId");
  if (!address || !networkId) throw new Error("address and networkId are required");
  return fetchTokenHolders(address, networkId, num(data, "limit", 20));
}

export async function executeSkillGetOHLCV(_text: string, data: Data, _ctx: A2AContext) {
  const identifier = str(data, "identifier");
  if (!identifier) throw new Error("identifier is required");
  
  return fetchOHLCV(
    str(data, "source", "coingecko") as "coingecko",
    identifier,
    { interval: str(data, "interval", "1H"), days: str(data, "days", "7") }
  );
}

export async function executeSkillDeFiHealthCheck(_text: string, data: Data, _ctx: A2AContext) {
  return checkServicesHealth(data.services as string[] | undefined);
}
