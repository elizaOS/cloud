/**
 * Helius API Zod Schemas
 *
 * Validation schemas for Helius API requests.
 */

import { z } from "zod";

/**
 * Transaction type filter
 */
export const TransactionTypeSchema = z.enum([
  "UNKNOWN",
  "NFT_SALE",
  "NFT_LISTING",
  "NFT_BID",
  "NFT_MINT",
  "SWAP",
  "TRANSFER",
  "BURN",
  "TOKEN_MINT",
  "STAKE_SOL",
  "UNSTAKE_SOL",
  "CLAIM_REWARDS",
]);

/**
 * Parse transactions request
 */
export const ParseTransactionsSchema = z.object({
  transactions: z.array(z.string().min(1)).min(1).max(100),
});

/**
 * Get transactions history request
 */
export const GetTransactionHistorySchema = z.object({
  address: z.string().min(1, "Address is required"),
  before: z.string().optional(),
  until: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional().default(100),
  source: z.string().optional(),
  type: TransactionTypeSchema.optional(),
});

/**
 * Get asset request (DAS API)
 */
export const GetAssetSchema = z.object({
  id: z.string().min(1, "Asset ID is required"),
});

/**
 * Get assets by owner request
 */
export const GetAssetsByOwnerSchema = z.object({
  ownerAddress: z.string().min(1, "Owner address is required"),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(1000).optional().default(100),
  sortBy: z
    .object({
      sortBy: z.enum(["created", "updated", "recent_action", "none"]),
      sortDirection: z.enum(["asc", "desc"]),
    })
    .optional(),
  before: z.string().optional(),
  after: z.string().optional(),
  displayOptions: z
    .object({
      showUnverifiedCollections: z.boolean().optional(),
      showCollectionMetadata: z.boolean().optional(),
      showGrandTotal: z.boolean().optional(),
      showFungible: z.boolean().optional(),
      showNativeBalance: z.boolean().optional(),
      showInscription: z.boolean().optional(),
      showZeroBalance: z.boolean().optional(),
    })
    .optional(),
});

/**
 * Get assets by group request
 */
export const GetAssetsByGroupSchema = z.object({
  groupKey: z.enum(["collection"]),
  groupValue: z.string().min(1, "Group value is required"),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(1000).optional().default(100),
});

/**
 * Search assets request
 */
export const SearchAssetsSchema = z.object({
  ownerAddress: z.string().optional(),
  creatorAddress: z.string().optional(),
  creatorVerified: z.boolean().optional(),
  authorityAddress: z.string().optional(),
  grouping: z.array(z.string()).optional(),
  delegateAddress: z.string().optional(),
  frozen: z.boolean().optional(),
  supply: z.number().optional(),
  supplyMint: z.string().optional(),
  compressed: z.boolean().optional(),
  compressible: z.boolean().optional(),
  royaltyTargetType: z.enum(["creators", "fanout", "single"]).optional(),
  royaltyTarget: z.string().optional(),
  royaltyAmount: z.number().optional(),
  burnt: z.boolean().optional(),
  sortBy: z
    .object({
      sortBy: z.enum(["created", "updated", "recent_action", "none"]),
      sortDirection: z.enum(["asc", "desc"]),
    })
    .optional(),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(1000).optional().default(100),
});

/**
 * Get token metadata request
 */
export const GetTokenMetadataSchema = z.object({
  mintAccounts: z.array(z.string().min(1)).min(1).max(100),
  includeOffChain: z.boolean().optional().default(true),
  disableCache: z.boolean().optional().default(false),
});

/**
 * Get balances request
 */
export const GetBalancesSchema = z.object({
  address: z.string().min(1, "Address is required"),
});

/**
 * Get priority fee request
 */
export const GetPriorityFeeSchema = z.object({
  accountKeys: z.array(z.string()).optional(),
  options: z
    .object({
      includeAllPriorityFeeLevels: z.boolean().optional(),
      recommended: z.boolean().optional(),
    })
    .optional(),
});

/**
 * Create webhook request
 */
export const CreateWebhookSchema = z.object({
  webhookURL: z.string().url("Webhook URL must be a valid URL"),
  transactionTypes: z.array(TransactionTypeSchema).min(1),
  accountAddresses: z.array(z.string()).min(1),
  webhookType: z
    .enum(["enhanced", "raw", "discord"])
    .optional()
    .default("enhanced"),
  txnStatus: z.enum(["all", "success", "failed"]).optional(),
  authHeader: z.string().optional(),
});

export type ParseTransactionsInput = z.infer<typeof ParseTransactionsSchema>;
export type GetTransactionHistoryInput = z.infer<
  typeof GetTransactionHistorySchema
>;
export type GetAssetInput = z.infer<typeof GetAssetSchema>;
export type GetAssetsByOwnerInput = z.infer<typeof GetAssetsByOwnerSchema>;
export type GetAssetsByGroupInput = z.infer<typeof GetAssetsByGroupSchema>;
export type SearchAssetsInput = z.infer<typeof SearchAssetsSchema>;
export type GetTokenMetadataInput = z.infer<typeof GetTokenMetadataSchema>;
export type GetBalancesInput = z.infer<typeof GetBalancesSchema>;
export type GetPriorityFeeInput = z.infer<typeof GetPriorityFeeSchema>;
export type CreateWebhookInput = z.infer<typeof CreateWebhookSchema>;
