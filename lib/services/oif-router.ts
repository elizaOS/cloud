/**
 * OIF Cross-Chain Payment Router
 *
 * Handles cross-chain payment routing via the Open Intents Framework (OIF).
 * This enables:
 * - Accepting payments from any supported chain (Ethereum, Base, Jeju, etc.)
 * - Routing payouts to user's preferred chain
 * - Optimal routing for cost/speed via intent aggregation
 *
 * @see /apps/intents for OIF implementation
 */

import {
  createPublicClient,
  http,
  formatUnits,
  type Address,
} from "viem";
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

// ============================================================================
// Types
// ============================================================================

/** Intent creation request */
export interface CreateIntentRequest {
  /** Source chain ID */
  sourceChainId: number;
  /** Destination chain ID */
  destinationChainId: number;
  /** Input token address on source chain */
  inputToken: Address;
  /** Output token address on destination chain */
  outputToken: Address;
  /** Amount of input token (in wei/smallest unit) */
  inputAmount: string;
  /** Minimum acceptable output amount */
  minOutputAmount: string;
  /** Sender address */
  sender: Address;
  /** Recipient address */
  recipient: Address;
  /** Deadline timestamp (unix seconds) */
  deadline: number;
  /** Optional: specific solver to use */
  solver?: Address;
}

/** Intent with ID and status */
export interface Intent extends CreateIntentRequest {
  id: string;
  status: "pending" | "matched" | "filling" | "filled" | "expired" | "cancelled";
  createdAt: number;
  matchedAt?: number;
  filledAt?: number;
  fillTxHash?: string;
  outputAmount?: string;
}

/** Route quote from aggregator */
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

/** Payout routing request */
export interface PayoutRoutingRequest {
  /** Amount in USD to pay out */
  amountUsd: number;
  /** Token to pay out (e.g., "elizaOS") */
  token: string;
  /** Recipient address */
  recipient: Address;
  /** Preferred destination chain */
  preferredChain?: X402Network;
  /** Allow fallback to other chains if preferred unavailable */
  allowFallback?: boolean;
}

/** Payout routing result */
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

// ============================================================================
// Chain and Token Helpers
// ============================================================================

/** ERC20 balanceOf ABI */
const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

/**
 * Get viem chain for a network
 */
function getViemChain(network: X402Network) {
  switch (network) {
    case "jeju-localnet": return jejuLocalnet;
    case "jeju-testnet": return jejuTestnet;
    case "jeju": return jeju;
    case "base-sepolia": return baseSepolia;
    case "base": return base;
  }
}

/**
 * Get hot wallet address for payouts
 */
function getHotWalletAddress(): Address | null {
  const address = process.env.EVM_PAYOUT_WALLET_ADDRESS || process.env.X402_RECIPIENT_ADDRESS;
  if (!address || address === "0x0000000000000000000000000000000000000000") {
    return null;
  }
  return address as Address;
}

// ============================================================================
// OIF Router Service
// ============================================================================

class OIFRouterService {
  private aggregatorUrl: string;

  constructor() {
    this.aggregatorUrl = getOIFAggregatorUrl();
  }

  /**
   * Check if OIF cross-chain routing is available
   */
  isAvailable(): boolean {
    return isCrossChainEnabled();
  }

  /**
   * Get supported source chains for payments
   */
  getSupportedChains(): number[] {
    return getSupportedSourceChains();
  }

  /**
   * Check if a chain can be used as payment source
   */
  canAcceptFromChain(chainId: number): boolean {
    return isSourceChainSupported(chainId);
  }

  /**
   * Get quote for cross-chain route
   */
  async getQuote(
    sourceChainId: number,
    destinationChainId: number,
    inputToken: Address,
    outputToken: Address,
    inputAmount: string
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

  /**
   * Create an intent for cross-chain transfer
   */
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

  /**
   * Get intent status
   */
  async getIntent(intentId: string): Promise<Intent | null> {
    const response = await fetch(`${this.aggregatorUrl}/api/intents/${intentId}`);

    if (!response.ok) {
      return null;
    }

    return response.json();
  }

  /**
   * Wait for intent to be filled (with timeout)
   */
  async waitForFill(intentId: string, timeoutMs = 300000): Promise<Intent | null> {
    const startTime = Date.now();
    const pollInterval = 2000;

    while (Date.now() - startTime < timeoutMs) {
      const intent = await this.getIntent(intentId);
      
      if (!intent) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        continue;
      }

      if (intent.status === "filled") {
        return intent;
      }

      if (intent.status === "expired" || intent.status === "cancelled") {
        logger.warn("[OIF] Intent failed", { 
          intentId, 
          status: intent.status 
        });
        return intent;
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    logger.warn("[OIF] Intent fill timeout", { intentId, timeoutMs });
    return null;
  }

  /**
   * Get optimal payout routing for a user
   *
   * This determines the best chain to use for paying out tokens,
   * considering:
   * - User's preferred chain
   * - Token availability
   * - Gas costs
   * - Speed
   */
  async getPayoutRoute(request: PayoutRoutingRequest): Promise<PayoutRoutingResult> {
    const { preferredChain, allowFallback = true } = request;

    // If cross-chain not enabled, return settlement chain
    if (!this.isAvailable()) {
      const chain = getSettlementChain();
      return {
        success: true,
        route: {
          chain,
          chainId: this.getChainId(chain),
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
    const primaryRoute = await this.checkChainAvailability(primaryChain, request);
    if (primaryRoute) {
      return { success: true, route: primaryRoute };
    }

    // Try fallback chain (Base)
    if (allowFallback) {
      const fallbackChain = getSettlementFallbackChain();
      const fallbackRoute = await this.checkChainAvailability(fallbackChain, request);
      if (fallbackRoute) {
        return { success: true, route: fallbackRoute };
      }
    }

    return {
      success: false,
      error: "No available route found for payout",
    };
  }

  /**
   * Check if a chain is available for payout
   * 
   * Validates:
   * 1. Token address is configured for the chain
   * 2. Hot wallet has sufficient token balance
   * 3. Hot wallet has sufficient ETH for gas
   * 4. Chain is reachable
   */
  private async checkChainAvailability(
    chain: X402Network,
    request: PayoutRoutingRequest
  ): Promise<PayoutRoutingResult["route"] | null> {
    const chainId = this.getChainId(chain);
    const networkConfig = getNetworkConfig(chain);
    const viemChain = getViemChain(chain);
    
    // Get token address for the chain
    const tokenAddress = this.getTokenAddress(chain, request.token);
    if (!tokenAddress || tokenAddress === "0x0000000000000000000000000000000000000000") {
      logger.debug("[OIF] Token not configured on chain", { chain, token: request.token });
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
      const estimatedTime = this.getEstimatedTime(chain);
      
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
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
  
  /**
   * Get token address for a chain and token symbol
   */
  private getTokenAddress(chain: X402Network, token: string): Address | null {
    if (token.toLowerCase() === "usdc") {
      return USDC_ADDRESSES[chain];
    }
    
    if (token.toLowerCase() === "elizaos" || token.toLowerCase() === "eliza") {
      const evmTokens = ELIZA_TOKEN_ADDRESSES.evm;
      // Map network to token config key
      const tokenKey = chain === "jeju" ? "jeju" 
        : chain === "jeju-testnet" ? "jeju-testnet"
        : chain === "base" ? "base"
        : chain === "base-sepolia" ? "base"
        : null;
      
      if (tokenKey && evmTokens[tokenKey]) {
        return evmTokens[tokenKey] as Address;
      }
    }
    
    return null;
  }
  
  /**
   * Get estimated confirmation time for a chain
   */
  private getEstimatedTime(chain: X402Network): number {
    const times: Record<X402Network, number> = {
      "jeju-localnet": 2,
      "jeju-testnet": 6,
      "jeju": 6,
      "base-sepolia": 4,
      "base": 4,
    };
    return times[chain] || 15;
  }

  /**
   * Get chain ID for a network
   */
  private getChainId(network: X402Network): number {
    const chainIds: Record<X402Network, number> = {
      "jeju-localnet": 1337,
      "jeju-testnet": 420690,
      "jeju": 420691,
      "base-sepolia": 84532,
      "base": 8453,
    };
    return chainIds[network];
  }

  /**
   * Refresh aggregator URL (for config changes)
   */
  refreshConfig(): void {
    this.aggregatorUrl = getOIFAggregatorUrl();
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const oifRouter = new OIFRouterService();

/**
 * Check if cross-chain payment is supported from a given chain
 */
export function canAcceptCrossChainPayment(sourceChainId: number): boolean {
  return oifRouter.canAcceptFromChain(sourceChainId);
}

/**
 * Get the best payout chain for a recipient
 */
export async function getOptimalPayoutChain(
  recipient: Address,
  preferredChain?: X402Network
): Promise<X402Network> {
  const result = await oifRouter.getPayoutRoute({
    amountUsd: 0, // Not needed for chain selection
    token: "elizaOS",
    recipient,
    preferredChain,
  });

  return result.route?.chain ?? getSettlementChain();
}

// ============================================================================
// Cross-Chain Payout via Intents (EIL - no bridges needed)
// ============================================================================

/** Cross-chain payout request */
export interface CrossChainPayoutRequest {
  /** Source chain where hot wallet has tokens */
  sourceChain: X402Network;
  /** User's preferred destination chain */
  destinationChain: X402Network;
  /** Token to pay out */
  token: "elizaOS" | "usdc";
  /** Amount in token units (wei/smallest unit) */
  amount: string;
  /** Recipient address on destination chain */
  recipient: Address;
  /** Deadline for fill (unix seconds) */
  deadline?: number;
}

/** Cross-chain payout result */
export interface CrossChainPayoutResult {
  success: boolean;
  /** If same-chain, direct tx hash. If cross-chain, intent ID. */
  txHash?: string;
  intentId?: string;
  /** Actual chain used for payout */
  chain: X402Network;
  /** Was cross-chain routing used? */
  crossChain: boolean;
  error?: string;
}

/**
 * Execute a payout to user's preferred chain via OIF intents.
 * 
 * If user wants tokens on a different chain than where we hold them,
 * we create an intent that solvers can fill. This enables:
 * - User on Base wants payout -> we have tokens on Jeju -> solver fills
 * - User on Jeju wants payout -> we have tokens on Base -> solver fills
 * - No bridges needed - just intents and solver liquidity
 */
export async function executeCrossChainPayout(
  request: CrossChainPayoutRequest
): Promise<CrossChainPayoutResult> {
  const { sourceChain, destinationChain, token, amount, recipient, deadline } = request;
  
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
    logger.warn("[OIF] Cross-chain not available, falling back to source chain", {
      sourceChain,
      requestedChain: destinationChain,
    });
    return {
      success: true,
      chain: sourceChain, // Fall back to source chain
      crossChain: false,
    };
  }
  
  // Get token addresses
  const sourceChainId = getChainIdForNetwork(sourceChain);
  const destChainId = getChainIdForNetwork(destinationChain);
  const inputToken = getTokenAddressForChain(sourceChain, token);
  const outputToken = getTokenAddressForChain(destinationChain, token);
  
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
  
  if (!senderAddress || senderAddress === "0x0000000000000000000000000000000000000000") {
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

/**
 * Get chain ID for a network
 */
function getChainIdForNetwork(network: X402Network): number {
  const chainIds: Record<X402Network, number> = {
    "jeju-localnet": 1337,
    "jeju-testnet": 420690,
    "jeju": 420691,
    "base-sepolia": 84532,
    "base": 8453,
  };
  return chainIds[network];
}

/**
 * Get token address for a chain
 */
function getTokenAddressForChain(chain: X402Network, token: string): Address | null {
  if (token.toLowerCase() === "usdc") {
    return USDC_ADDRESSES[chain];
  }
  
  if (token.toLowerCase() === "elizaos" || token.toLowerCase() === "eliza") {
    const evmTokens = ELIZA_TOKEN_ADDRESSES.evm;
    const tokenKey = chain === "jeju" ? "jeju" 
      : chain === "jeju-testnet" ? "jeju-testnet"
      : chain === "base" ? "base"
      : chain === "base-sepolia" ? "base"
      : null;
    
    if (tokenKey && evmTokens[tokenKey]) {
      return evmTokens[tokenKey] as Address;
    }
  }
  
  return null;
}

/**
 * Check if user's preferred chain can be used for payout
 * Returns the chain to actually use (may differ from preferred if unavailable)
 */
export async function resolvePayoutChain(
  preferredChain: X402Network,
  fallbackChain: X402Network,
  token: string,
  amount: string,
  recipient: Address
): Promise<{ chain: X402Network; crossChain: boolean }> {
  // Check if token is available on preferred chain
  const preferredToken = getTokenAddressForChain(preferredChain, token);
  
  if (preferredToken && preferredToken !== "0x0000000000000000000000000000000000000000") {
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
    const fallbackToken = getTokenAddressForChain(fallbackChain, token);
    if (fallbackToken && fallbackToken !== "0x0000000000000000000000000000000000000000") {
      // Can do cross-chain from fallback to preferred
      return { chain: preferredChain, crossChain: true };
    }
  }
  
  // Use fallback chain directly
  return { chain: fallbackChain, crossChain: false };
}

