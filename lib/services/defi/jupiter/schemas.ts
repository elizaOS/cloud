/**
 * Jupiter API Zod Schemas
 *
 * Validation schemas for Jupiter API requests.
 */

import { z } from "zod";

/**
 * Swap mode
 */
export const SwapModeSchema = z.enum(["ExactIn", "ExactOut"]);

/**
 * Quote request schema
 */
export const GetQuoteSchema = z.object({
  inputMint: z.string().min(1, "Input mint address is required"),
  outputMint: z.string().min(1, "Output mint address is required"),
  amount: z.string().min(1, "Amount is required"),
  slippageBps: z.number().int().min(0).max(10000).optional().default(50),
  swapMode: SwapModeSchema.optional().default("ExactIn"),
  onlyDirectRoutes: z.boolean().optional().default(false),
  asLegacyTransaction: z.boolean().optional().default(false),
  maxAccounts: z.number().int().min(1).optional(),
  excludeDexes: z.array(z.string()).optional(),
});

/**
 * Swap request schema
 */
export const GetSwapSchema = z.object({
  userPublicKey: z.string().min(1, "User public key is required"),
  wrapAndUnwrapSol: z.boolean().optional().default(true),
  useSharedAccounts: z.boolean().optional().default(true),
  computeUnitPriceMicroLamports: z.number().int().min(0).optional(),
  prioritizationFeeLamports: z.union([z.number().int().min(0), z.literal("auto")]).optional(),
  asLegacyTransaction: z.boolean().optional().default(false),
  dynamicComputeUnitLimit: z.boolean().optional().default(true),
});

/**
 * Price request schema
 */
export const GetPriceSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "At least one token ID is required"),
  vsToken: z.string().optional(),
  showExtraInfo: z.boolean().optional().default(false),
});

/**
 * Token search schema
 */
export const SearchTokensSchema = z.object({
  query: z.string().min(1, "Search query is required"),
});

/**
 * Route plan schema (for parsing quote response)
 */
export const RoutePlanSchema = z.object({
  swapInfo: z.object({
    ammKey: z.string(),
    label: z.string(),
    inputMint: z.string(),
    outputMint: z.string(),
    inAmount: z.string(),
    outAmount: z.string(),
    feeAmount: z.string(),
    feeMint: z.string(),
  }),
  percent: z.number(),
});

/**
 * Quote response schema
 */
export const QuoteResponseSchema = z.object({
  inputMint: z.string(),
  inAmount: z.string(),
  outputMint: z.string(),
  outAmount: z.string(),
  otherAmountThreshold: z.string(),
  swapMode: SwapModeSchema,
  slippageBps: z.number(),
  platformFee: z
    .object({
      amount: z.string(),
      feeBps: z.number(),
    })
    .nullable(),
  priceImpactPct: z.string(),
  routePlan: z.array(RoutePlanSchema),
  contextSlot: z.number().optional(),
  timeTaken: z.number().optional(),
});

export type GetQuoteInput = z.infer<typeof GetQuoteSchema>;
export type GetSwapInput = z.infer<typeof GetSwapSchema>;
export type GetPriceInput = z.infer<typeof GetPriceSchema>;
export type SearchTokensInput = z.infer<typeof SearchTokensSchema>;
export type QuoteResponse = z.infer<typeof QuoteResponseSchema>;

