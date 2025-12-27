/**
 * OIF Cross-Chain Payment Router
 *
 * Routes payments and payouts across chains via the Open Intents Framework.
 */

import { createPublicClient, http, formatUnits, type Address } from "viem";
import {
  getOIFAggregatorUrl,
  isCrossChainEnabled,
  getSupportedSourceChains,
  getSettlementChain,
  getSettlementFallbackChain,
  isSourceChainSupported,
  getNetworkConfig,
  USDC_ADDRESSES,
  ELIZA_TOKEN_ADDRESSES,
  type X402Network,
} from "@/lib/config/x402";
import { jeju, jejuTestnet, jejuLocalnet } from "@/lib/config/chains";
import { base, baseSepolia } from "viem/chains";
import { logger } from "@/lib/utils/logger";
import { extractErrorMessage } from "@/lib/utils/error-handling";

export interface CreateIntentRequest {
  sourceChainId: number;
  destinationChainId: number;
  inputToken: Address;
  outputToken: Address;
  inputAmount: string;
  minOutputAmount: string;
  sender: Address;
  recipient: Address;
  deadline: number;
  solver?: Address;
}

export interface Intent extends CreateIntentRequest {
  id: string;
  status:
    | "pending"
    | "matched"
    | "filling"
    | "filled"
    | "expired"
    | "cancelled";
  createdAt: number;
  matchedAt?: number;
  filledAt?: number;
  fillTxHash?: string;
  outputAmount?: string;
}

export interface RouteQuote {
  routes: Array<{
    sourceChain: number;
    destinationChain: number;
    inputToken: Address;
    outputToken: Address;
    inputAmount: string;
    outputAmount: string;
    estimatedGas: string;
    estimatedTime: number;
    solver: Address;
    confidence: number;
  }>;
  bestRoute: number;
  totalGas: string;
  totalTime: number;
}

export interface PayoutRoutingRequest {
  amountUsd: number;
  token: string;
  recipient: Address;
  preferredChain?: X402Network;
  allowFallback?: boolean;
}

export interface PayoutRoutingResult {
  success: boolean;
  route?: {
    chain: X402Network;
    chainId: number;
    token: Address;
    amount: string;
    estimatedGas: string;
    estimatedTime: number;
  };
  error?: string;
}

const CHAIN_IDS: Record<X402Network, number> = {
  "jeju-localnet": 1337,
  "jeju-testnet": 420690,
  jeju: 420691,
  "base-sepolia": 84532,
  base: 8453,
};

const CHAIN_CONFIRM_TIMES: Record<X402Network, number> = {
  "jeju-localnet": 2,
  "jeju-testnet": 6,
  jeju: 6,
  "base-sepolia": 4,
  base: 4,
};

const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

const VIEM_CHAINS: Record<X402Network, typeof jeju> = {
  "jeju-localnet": jejuLocalnet,
  "jeju-testnet": jejuTestnet,
  jeju: jeju,
  "base-sepolia": baseSepolia,
  base: base,
};

function getHotWalletAddress(): Address | null {
  const address =
    process.env.EVM_PAYOUT_WALLET_ADDRESS || process.env.X402_RECIPIENT_ADDRESS;
  if (!address || address === "0x0000000000000000000000000000000000000000")
    return null;
  return address as Address;
}

function getTokenAddress(chain: X402Network, token: string): Address | null {
  if (token.toLowerCase() === "usdc") return USDC_ADDRESSES[chain];

  if (token.toLowerCase() === "elizaos" || token.toLowerCase() === "eliza") {
    const evmTokens = ELIZA_TOKEN_ADDRESSES.evm;
    const tokenKey =
      chain === "jeju"
        ? "jeju"
        : chain === "jeju-testnet"
          ? "jeju-testnet"
          : chain === "base"
            ? "base"
            : chain === "base-sepolia"
              ? "base"
              : null;
    if (tokenKey && evmTokens[tokenKey]) return evmTokens[tokenKey] as Address;
  }

  return null;
}

class OIFRouterService {
  private aggregatorUrl = getOIFAggregatorUrl();

  isAvailable(): boolean {
    return isCrossChainEnabled();
  }

  getSupportedChains(): number[] {
    return getSupportedSourceChains();
  }

  canAcceptFromChain(chainId: number): boolean {
    return isSourceChainSupported(chainId);
  }

  async getQuote(
    sourceChainId: number,
    destinationChainId: number,
    inputToken: Address,
    outputToken: Address,
    inputAmount: string,
  ): Promise<RouteQuote | null> {
    if (!this.isAvailable()) {
      logger.warn("[OIF] Cross-chain routing not available");
      return null;
    }

    const response = await fetch(`${this.aggregatorUrl}/api/routes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceChainId,
        destinationChainId,
        inputToken,
        outputToken,
        inputAmount,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error("[OIF] Failed to get quote", { error });
      return null;
    }

    return response.json();
  }

  async createIntent(request: CreateIntentRequest): Promise<Intent | null> {
    if (!this.isAvailable()) {
      logger.warn("[OIF] Cross-chain routing not available");
      return null;
    }

    const response = await fetch(`${this.aggregatorUrl}/api/intents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error("[OIF] Failed to create intent", { error });
      return null;
    }

    const intent = await response.json();
    logger.info("[OIF] Intent created", {
      intentId: intent.id,
      source: request.sourceChainId,
      dest: request.destinationChainId,
    });

    return intent;
  }

  async getIntent(intentId: string): Promise<Intent | null> {
    const response = await fetch(
      `${this.aggregatorUrl}/api/intents/${intentId}`,
    );

    if (!response.ok) {
      return null;
    }

    return response.json();
  }

  async waitForFill(
    intentId: string,
    timeoutMs = 300000,
  ): Promise<Intent | null> {
    const startTime = Date.now();
    const pollInterval = 2000;

    while (Date.now() - startTime < timeoutMs) {
      const intent = await this.getIntent(intentId);

      if (!intent) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        continue;
      }

      if (intent.status === "filled") {
        return intent;
      }

      if (intent.status === "expired" || intent.status === "cancelled") {
        logger.warn("[OIF] Intent failed", {
          intentId,
          status: intent.status,
        });
        return intent;
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    logger.warn("[OIF] Intent fill timeout", { intentId, timeoutMs });
    return null;
  }

  async getPayoutRoute(
    request: PayoutRoutingRequest,
  ): Promise<PayoutRoutingResult> {
    const { preferredChain, allowFallback = true } = request;

    // If cross-chain not enabled, return settlement chain
    if (!this.isAvailable()) {
      const chain = getSettlementChain();
      return {
        success: true,
        route: {
          chain,
          chainId: CHAIN_IDS[chain],
          token: "0x0000000000000000000000000000000000000000" as Address,
          amount: "0",
          estimatedGas: "0",
          estimatedTime: 0,
        },
      };
    }

    // Try preferred chain first
    if (preferredChain) {
      const route = await this.checkChainAvailability(preferredChain, request);
      if (route) {
        return { success: true, route };
      }
    }

    // Try primary settlement chain (Jeju)
    const primaryChain = getSettlementChain();
    const primaryRoute = await this.checkChainAvailability(
      primaryChain,
      request,
    );
    if (primaryRoute) {
      return { success: true, route: primaryRoute };
    }

    // Try fallback chain (Base)
    if (allowFallback) {
      const fallbackChain = getSettlementFallbackChain();
      const fallbackRoute = await this.checkChainAvailability(
        fallbackChain,
        request,
      );
      if (fallbackRoute) {
        return { success: true, route: fallbackRoute };
      }
    }

    return {
      success: false,
      error: "No available route found for payout",
    };
  }

  private async checkChainAvailability(
    chain: X402Network,
    request: PayoutRoutingRequest,
  ): Promise<PayoutRoutingResult["route"] | null> {
    const chainId = CHAIN_IDS[chain];
    const networkConfig = getNetworkConfig(chain);
    const viemChain = VIEM_CHAINS[chain];

    const tokenAddress = getTokenAddress(chain, request.token);
    if (
      !tokenAddress ||
      tokenAddress === "0x0000000000000000000000000000000000000000"
    ) {
      logger.debug("[OIF] Token not configured on chain", {
        chain,
        token: request.token,
      });
      return null;
    }

    // Get hot wallet address
    const hotWallet = getHotWalletAddress();
    if (!hotWallet) {
      logger.debug("[OIF] No hot wallet configured");
      return null;
    }

    try {
      const publicClient = createPublicClient({
        chain: viemChain,
        transport: http(networkConfig.rpcUrl),
      });

      // Check token balance
      const tokenBalance = await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_BALANCE_ABI,
        functionName: "balanceOf",
        args: [hotWallet],
      });

      // Convert request amount to token units (assuming 9 decimals for elizaOS)
      const requiredAmount = BigInt(Math.floor(request.amountUsd * 1e9));

      if (tokenBalance < requiredAmount) {
        logger.debug("[OIF] Insufficient token balance", {
          chain,
          balance: tokenBalance.toString(),
          required: requiredAmount.toString(),
        });
        return null;
      }

      // Check ETH balance for gas
      const ethBalance = await publicClient.getBalance({ address: hotWallet });
      const minGasBalance = BigInt(1e16); // 0.01 ETH minimum

      if (ethBalance < minGasBalance) {
        logger.debug("[OIF] Insufficient ETH for gas", {
          chain,
          balance: formatUnits(ethBalance, 18),
        });
        return null;
      }

      // Estimate gas for transfer
      const gasPrice = await publicClient.getGasPrice();
      const estimatedGas = 65000n; // Typical ERC20 transfer
      const gasCost = gasPrice * estimatedGas;

      // Estimate time based on chain
      const estimatedTime = CHAIN_CONFIRM_TIMES[chain];

      logger.debug("[OIF] Chain available for payout", {
        chain,
        tokenBalance: formatUnits(tokenBalance, 9),
        ethBalance: formatUnits(ethBalance, 18),
        gasCost: formatUnits(gasCost, 18),
      });

      return {
        chain,
        chainId,
        token: tokenAddress,
        amount: tokenBalance.toString(),
        estimatedGas: gasCost.toString(),
        estimatedTime,
      };
    } catch (error) {
      logger.warn("[OIF] Chain availability check failed", {
        chain,
        error: extractErrorMessage(error),
      });
      return null;
    }
  }

  refreshConfig(): void {
    this.aggregatorUrl = getOIFAggregatorUrl();
  }
}

export const oifRouter = new OIFRouterService();

export function canAcceptCrossChainPayment(sourceChainId: number): boolean {
  return oifRouter.canAcceptFromChain(sourceChainId);
}

export async function getOptimalPayoutChain(
  recipient: Address,
  preferredChain?: X402Network,
): Promise<X402Network> {
  const result = await oifRouter.getPayoutRoute({
    amountUsd: 0,
    token: "elizaOS",
    recipient,
    preferredChain,
  });
  return result.route?.chain ?? getSettlementChain();
}

export interface CrossChainPayoutRequest {
  sourceChain: X402Network;
  destinationChain: X402Network;
  token: "elizaOS" | "usdc";
  amount: string;
  recipient: Address;
  deadline?: number;
}

export interface CrossChainPayoutResult {
  success: boolean;
  txHash?: string;
  intentId?: string;
  chain: X402Network;
  crossChain: boolean;
  error?: string;
}

export async function executeCrossChainPayout(
  request: CrossChainPayoutRequest,
): Promise<CrossChainPayoutResult> {
  const { sourceChain, destinationChain, token, amount, recipient, deadline } =
    request;

  // If same chain, no cross-chain needed
  if (sourceChain === destinationChain) {
    return {
      success: true,
      chain: sourceChain,
      crossChain: false,
    };
  }

  // Check if cross-chain is available
  if (!oifRouter.isAvailable()) {
    logger.warn(
      "[OIF] Cross-chain not available, falling back to source chain",
      {
        sourceChain,
        requestedChain: destinationChain,
      },
    );
    return {
      success: true,
      chain: sourceChain, // Fall back to source chain
      crossChain: false,
    };
  }

  // Get token addresses
  const sourceChainId = CHAIN_IDS[sourceChain];
  const destChainId = CHAIN_IDS[destinationChain];
  const inputToken = getTokenAddress(sourceChain, token);
  const outputToken = getTokenAddress(destinationChain, token);

  if (!inputToken || !outputToken) {
    return {
      success: false,
      chain: sourceChain,
      crossChain: false,
      error: `Token ${token} not configured on ${!inputToken ? sourceChain : destinationChain}`,
    };
  }

  // Create intent for cross-chain transfer
  const intentDeadline = deadline || Math.floor(Date.now() / 1000) + 3600; // 1 hour default

  const senderAddress = (process.env.EVM_PAYOUT_WALLET_ADDRESS ||
    process.env.X402_RECIPIENT_ADDRESS) as Address;

  if (
    !senderAddress ||
    senderAddress === "0x0000000000000000000000000000000000000000"
  ) {
    return {
      success: false,
      chain: sourceChain,
      crossChain: false,
      error: "No payout wallet configured",
    };
  }

  const intent = await oifRouter.createIntent({
    sourceChainId,
    destinationChainId: destChainId,
    inputToken,
    outputToken,
    inputAmount: amount,
    minOutputAmount: amount, // 1:1 for same token
    sender: senderAddress,
    recipient,
    deadline: intentDeadline,
  });

  if (!intent) {
    logger.error("[OIF] Failed to create cross-chain intent", {
      sourceChain,
      destinationChain,
      token,
    });
    return {
      success: false,
      chain: sourceChain,
      crossChain: false,
      error: "Failed to create cross-chain intent",
    };
  }

  logger.info("[OIF] Cross-chain payout intent created", {
    intentId: intent.id,
    sourceChain,
    destinationChain,
    amount,
    recipient,
  });

  return {
    success: true,
    intentId: intent.id,
    chain: destinationChain,
    crossChain: true,
  };
}

export async function resolvePayoutChain(
  preferredChain: X402Network,
  fallbackChain: X402Network,
  token: string,
  amount: string,
  recipient: Address,
): Promise<{ chain: X402Network; crossChain: boolean }> {
  // Check if token is available on preferred chain
  const preferredToken = getTokenAddress(preferredChain, token);

  if (
    preferredToken &&
    preferredToken !== "0x0000000000000000000000000000000000000000"
  ) {
    // Token available on preferred chain
    const route = await oifRouter.getPayoutRoute({
      amountUsd: 0,
      token,
      recipient,
      preferredChain,
      allowFallback: false,
    });

    if (route.success && route.route?.chain === preferredChain) {
      return { chain: preferredChain, crossChain: false };
    }
  }

  // Try cross-chain to preferred if we have it on fallback
  if (oifRouter.isAvailable()) {
    const fallbackToken = getTokenAddress(fallbackChain, token);
    if (
      fallbackToken &&
      fallbackToken !== "0x0000000000000000000000000000000000000000"
    ) {
      // Can do cross-chain from fallback to preferred
      return { chain: preferredChain, crossChain: true };
    }
  }

  // Use fallback chain directly
  return { chain: fallbackChain, crossChain: false };
}
