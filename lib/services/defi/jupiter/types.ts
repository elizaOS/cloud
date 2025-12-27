/**
 * Jupiter API Types
 *
 * Type definitions for Jupiter DEX aggregator API responses and requests.
 * Based on: https://station.jup.ag/docs/apis/swap-api
 */

/**
 * Jupiter token info
 */
export interface JupiterTokenInfo {
  address: string;
  chainId: number;
  decimals: number;
  name: string;
  symbol: string;
  logoURI?: string;
  tags?: string[];
  extensions?: {
    coingeckoId?: string;
  };
}

/**
 * Quote response from /quote
 */
export interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: "ExactIn" | "ExactOut";
  slippageBps: number;
  platformFee: {
    amount: string;
    feeBps: number;
  } | null;
  priceImpactPct: string;
  routePlan: JupiterRoutePlan[];
  contextSlot?: number;
  timeTaken?: number;
}

/**
 * Route plan step
 */
export interface JupiterRoutePlan {
  swapInfo: {
    ammKey: string;
    label: string;
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    feeAmount: string;
    feeMint: string;
  };
  percent: number;
}

/**
 * Swap request body for /swap
 */
export interface JupiterSwapRequest {
  quoteResponse: JupiterQuoteResponse;
  userPublicKey: string;
  wrapAndUnwrapSol?: boolean;
  useSharedAccounts?: boolean;
  feeAccount?: string;
  trackingAccount?: string;
  computeUnitPriceMicroLamports?: number;
  prioritizationFeeLamports?: number | "auto";
  asLegacyTransaction?: boolean;
  useTokenLedger?: boolean;
  destinationTokenAccount?: string;
  dynamicComputeUnitLimit?: boolean;
  skipUserAccountsRpcCalls?: boolean;
  dynamicSlippage?: {
    minBps: number;
    maxBps: number;
  };
}

/**
 * Swap response from /swap
 */
export interface JupiterSwapResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports?: number;
  computeUnitLimit?: number;
  prioritizationType?: {
    computeBudget: {
      microLamports: number;
      estimatedMicroLamports: number;
    };
  };
  dynamicSlippageReport?: {
    slippageBps: number;
    otherAmount: number;
    simulatedIncurredSlippageBps: number;
    amplificationRatio: string;
  };
  simulationError?: {
    errorCode: string;
    error: string;
  };
}

/**
 * Token price from /price
 */
export interface JupiterPriceResponse {
  data: Record<string, JupiterPriceData>;
  timeTaken: number;
}

/**
 * Individual token price data
 */
export interface JupiterPriceData {
  id: string;
  type: string;
  price: string;
  extraInfo?: {
    lastSwappedPrice?: {
      lastJupiterSellAt: number;
      lastJupiterSellPrice: string;
      lastJupiterBuyAt: number;
      lastJupiterBuyPrice: string;
    };
    quotedPrice?: {
      buyPrice: string;
      buyAt: number;
      sellPrice: string;
      sellAt: number;
    };
    confidenceLevel?: "high" | "medium" | "low";
    depth?: {
      buyPriceImpactRatio: {
        depth: Record<string, number>;
        timestamp: number;
      };
      sellPriceImpactRatio: {
        depth: Record<string, number>;
        timestamp: number;
      };
    };
  };
}

/**
 * Token list response
 */
export interface JupiterTokenListResponse {
  tokens: JupiterTokenInfo[];
}

/**
 * Market info for a token pair
 */
export interface JupiterMarketInfo {
  id: string;
  label: string;
  inputMint: string;
  outputMint: string;
  notEnoughLiquidity: boolean;
  inAmount: string;
  outAmount: string;
  minInAmount?: string;
  minOutAmount?: string;
  priceImpactPct: number;
  lpFee: {
    amount: string;
    mint: string;
    pct: number;
  };
  platformFee: {
    amount: string;
    mint: string;
    pct: number;
  };
}

/**
 * Indexed route map response
 */
export interface JupiterIndexedRouteMapResponse {
  mintKeys: string[];
  indexedRouteMap: Record<string, number[]>;
}

/**
 * Program ID to label mapping
 */
export interface JupiterProgramIdToLabelResponse {
  [programId: string]: string;
}

/**
 * Quote request parameters
 */
export interface JupiterQuoteParams {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps?: number;
  swapMode?: "ExactIn" | "ExactOut";
  dexes?: string[];
  excludeDexes?: string[];
  restrictIntermediateTokens?: boolean;
  onlyDirectRoutes?: boolean;
  asLegacyTransaction?: boolean;
  platformFeeBps?: number;
  maxAccounts?: number;
  autoSlippage?: boolean;
  maxAutoSlippageBps?: number;
  autoSlippageCollisionUsdValue?: number;
}

/**
 * Limit order request
 */
export interface JupiterLimitOrderRequest {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  expiredAt?: number;
  base?: string;
}

/**
 * Limit order response
 */
export interface JupiterLimitOrderResponse {
  order: string;
  tx: string;
}

/**
 * DCA (Dollar Cost Average) order request
 */
export interface JupiterDCAOrderRequest {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  inAmountPerCycle: string;
  cycleSecondsApart: number;
  minOutAmountPerCycle?: string;
  maxOutAmountPerCycle?: string;
  startAt?: number;
}

/**
 * Swap instructions response (for advanced users)
 */
export interface JupiterSwapInstructionsResponse {
  tokenLedgerInstruction?: {
    programId: string;
    accounts: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
    data: string;
  };
  computeBudgetInstructions: Array<{
    programId: string;
    accounts: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
    data: string;
  }>;
  setupInstructions: Array<{
    programId: string;
    accounts: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
    data: string;
  }>;
  swapInstruction: {
    programId: string;
    accounts: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
    data: string;
  };
  cleanupInstruction?: {
    programId: string;
    accounts: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
    data: string;
  };
  addressLookupTableAddresses: string[];
}
