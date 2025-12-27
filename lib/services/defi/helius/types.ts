/**
 * Helius API Types
 *
 * Type definitions for Helius Solana RPC and Data API.
 * Based on: https://docs.helius.dev/
 */

/**
 * Enhanced transaction response
 */
export interface HeliusEnhancedTransaction {
  description: string;
  type: HeliusTransactionType;
  source: string;
  fee: number;
  feePayer: string;
  signature: string;
  slot: number;
  timestamp: number;
  tokenTransfers: HeliusTokenTransfer[];
  nativeTransfers: HeliusNativeTransfer[];
  accountData: HeliusAccountData[];
  transactionError: string | null;
  instructions: HeliusInstruction[];
  events: HeliusTransactionEvents;
}

/**
 * Transaction types
 */
export type HeliusTransactionType =
  | "UNKNOWN"
  | "NFT_BID"
  | "NFT_BID_CANCELLED"
  | "NFT_LISTING"
  | "NFT_CANCEL_LISTING"
  | "NFT_SALE"
  | "NFT_MINT"
  | "NFT_AUCTION_CREATED"
  | "NFT_AUCTION_UPDATED"
  | "NFT_AUCTION_CANCELLED"
  | "NFT_PARTICIPATION_REWARD"
  | "NFT_MINT_REJECTED"
  | "CREATE_STORE"
  | "WHITELIST_CREATOR"
  | "ADD_TO_WHITELIST"
  | "REMOVE_FROM_WHITELIST"
  | "AUCTION_MANAGER_CLAIM_BID"
  | "EMPTY_PAYMENT_ACCOUNT"
  | "UPDATE_PRIMARY_SALE_METADATA"
  | "ADD_TOKEN_TO_VAULT"
  | "ACTIVATE_VAULT"
  | "INIT_VAULT"
  | "INIT_BANK"
  | "INIT_STAKE"
  | "MERGE_STAKE"
  | "SPLIT_STAKE"
  | "SET_BANK_FLAGS"
  | "SET_VAULT_LOCK"
  | "UPDATE_VAULT_OWNER"
  | "UPDATE_BANK_MANAGER"
  | "RECORD_RARITY_POINTS"
  | "ADD_RARITIES_TO_BANK"
  | "INIT_FARM"
  | "INIT_FARMER"
  | "REFRESH_FARMER"
  | "UPDATE_FARM"
  | "AUTHORIZE_FUNDER"
  | "DEAUTHORIZE_FUNDER"
  | "FUND_REWARD"
  | "CANCEL_REWARD"
  | "LOCK_REWARD"
  | "PAYOUT"
  | "VALIDATE_SAFETY_DEPOSIT_BOX_V2"
  | "SET_AUTHORITY"
  | "INIT_AUCTION_MANAGER_V2"
  | "UPDATE_EXTERNAL_PRICE_ACCOUNT"
  | "AUCTION_HOUSE_CREATE"
  | "CLOSE_ESCROW_ACCOUNT"
  | "WITHDRAW"
  | "DEPOSIT"
  | "TRANSFER"
  | "BURN"
  | "BURN_NFT"
  | "PLATFORM_FEE"
  | "LOAN"
  | "REPAY_LOAN"
  | "ADD_TO_POOL"
  | "REMOVE_FROM_POOL"
  | "CLOSE_POSITION"
  | "UNLABELED"
  | "CLOSE_ACCOUNT"
  | "WITHDRAW_GEM"
  | "DEPOSIT_GEM"
  | "STAKE_TOKEN"
  | "UNSTAKE_TOKEN"
  | "STAKE_SOL"
  | "UNSTAKE_SOL"
  | "CLAIM_REWARDS"
  | "BUY_SUBSCRIPTION"
  | "SWAP"
  | "INIT_SWAP"
  | "CANCEL_SWAP"
  | "REJECT_SWAP"
  | "INITIALIZE_ACCOUNT"
  | "TOKEN_MINT"
  | "CREATE_APPRAISAL"
  | "FUSE"
  | "DEPOSIT_FRACTIONAL_POOL"
  | "FRACTIONALIZE"
  | "CREATE_RAFFLE"
  | "BUY_TICKETS"
  | "UPDATE_ITEM"
  | "LIST_ITEM"
  | "DELIST_ITEM"
  | "ADD_ITEM"
  | "CLOSE_ITEM"
  | "BUY_ITEM"
  | "FILL_ORDER"
  | "UPDATE_ORDER"
  | "CREATE_ORDER"
  | "CLOSE_ORDER"
  | "CANCEL_ORDER"
  | "KICK_ITEM"
  | "UPGRADE_FOX"
  | "UPGRADE_FOX_REQUEST"
  | "LOAN_FOX"
  | "BORROW_FOX"
  | "SWITCH_FOX_REQUEST"
  | "SWITCH_FOX"
  | "CREATE_ESCROW"
  | "ACCEPT_REQUEST_ARTIST"
  | "CANCEL_ESCROW"
  | "ACCEPT_ESCROW_ARTIST"
  | "ACCEPT_ESCROW_USER"
  | "PLACE_BET"
  | "PLACE_SOL_BET"
  | "CREATE_BET"
  | "COMPRESSED_NFT_MINT"
  | "COMPRESSED_NFT_TRANSFER"
  | "COMPRESSED_NFT_BURN"
  | "COMPRESSED_NFT_REDEEM"
  | "COMPRESSED_NFT_CANCEL_REDEEM"
  | "COMPRESSED_NFT_DELEGATE"
  | "COMPRESSED_NFT_VERIFY_CREATOR"
  | "COMPRESSED_NFT_UNVERIFY_CREATOR"
  | "COMPRESSED_NFT_VERIFY_COLLECTION"
  | "COMPRESSED_NFT_UNVERIFY_COLLECTION"
  | "COMPRESSED_NFT_SET_VERIFY_COLLECTION"
  | "REQUEST_PNFT_MIGRATION"
  | "START_PNFT_MIGRATION"
  | "MIGRATE_TO_PNFT"
  | "UPDATE_RAFFLE";

/**
 * Token transfer
 */
export interface HeliusTokenTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  fromTokenAccount: string;
  toTokenAccount: string;
  tokenAmount: number;
  decimals: number;
  tokenStandard: string;
  mint: string;
}

/**
 * Native SOL transfer
 */
export interface HeliusNativeTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  amount: number;
}

/**
 * Account data
 */
export interface HeliusAccountData {
  account: string;
  nativeBalanceChange: number;
  tokenBalanceChanges: HeliusTokenBalanceChange[];
}

/**
 * Token balance change
 */
export interface HeliusTokenBalanceChange {
  userAccount: string;
  tokenAccount: string;
  rawTokenAmount: {
    tokenAmount: string;
    decimals: number;
  };
  mint: string;
}

/**
 * Instruction data
 */
export interface HeliusInstruction {
  accounts: string[];
  data: string;
  programId: string;
  innerInstructions: HeliusInnerInstruction[];
}

/**
 * Inner instruction
 */
export interface HeliusInnerInstruction {
  accounts: string[];
  data: string;
  programId: string;
}

/**
 * Transaction events
 */
export interface HeliusTransactionEvents {
  nft?: HeliusNFTEvent;
  swap?: HeliusSwapEvent;
  compressed?: HeliusCompressedNFTEvent[];
  setAuthority?: HeliusSetAuthorityEvent[];
  distributeCompressionRewards?: HeliusDistributeCompressionRewardsEvent[];
}

/**
 * NFT event
 */
export interface HeliusNFTEvent {
  description: string;
  type: string;
  source: string;
  amount: number;
  fee: number;
  feePayer: string;
  signature: string;
  slot: number;
  timestamp: number;
  saleType: string;
  buyer: string;
  seller: string;
  staker: string;
  nfts: HeliusNFTEventNFT[];
}

/**
 * NFT event NFT data
 */
export interface HeliusNFTEventNFT {
  mint: string;
  tokenStandard: string;
}

/**
 * Swap event
 */
export interface HeliusSwapEvent {
  nativeInput: {
    account: string;
    amount: string;
  } | null;
  nativeOutput: {
    account: string;
    amount: string;
  } | null;
  tokenInputs: HeliusSwapToken[];
  tokenOutputs: HeliusSwapToken[];
  tokenFees: HeliusSwapToken[];
  nativeFees: {
    account: string;
    amount: string;
  }[];
  innerSwaps: HeliusInnerSwap[];
}

/**
 * Swap token
 */
export interface HeliusSwapToken {
  userAccount: string;
  tokenAccount: string;
  mint: string;
  rawTokenAmount: {
    tokenAmount: string;
    decimals: number;
  };
}

/**
 * Inner swap
 */
export interface HeliusInnerSwap {
  tokenInputs: HeliusSwapToken[];
  tokenOutputs: HeliusSwapToken[];
  tokenFees: HeliusSwapToken[];
  nativeFees: {
    account: string;
    amount: string;
  }[];
  programInfo: {
    source: string;
    account: string;
    programName: string;
    instructionName: string;
  };
}

/**
 * Compressed NFT event
 */
export interface HeliusCompressedNFTEvent {
  type: string;
  treeId: string;
  leafIndex: number | null;
  seq: number | null;
  assetId: string | null;
  instructionIndex: number;
  innerInstructionIndex: number | null;
  newLeafOwner: string | null;
  oldLeafOwner: string | null;
  newLeafDelegate: string | null;
  oldLeafDelegate: string | null;
  treeDelegate: string | null;
  metadata: Record<string, unknown> | null;
  updateArgs: Record<string, unknown> | null;
}

/**
 * Set authority event
 */
export interface HeliusSetAuthorityEvent {
  account: string;
  from: string;
  to: string;
  instructionIndex: number;
  innerInstructionIndex: number | null;
}

/**
 * Distribute compression rewards event
 */
export interface HeliusDistributeCompressionRewardsEvent {
  amount: number;
  recipient: string;
}

/**
 * Digital Asset Standard (DAS) asset
 */
export interface HeliusAsset {
  interface: string;
  id: string;
  content: {
    $schema: string;
    json_uri: string;
    files: Array<{
      uri: string;
      cdn_uri?: string;
      mime?: string;
    }>;
    metadata: {
      name: string;
      symbol: string;
      description?: string;
      attributes?: Array<{
        trait_type: string;
        value: string | number;
      }>;
    };
    links?: {
      image?: string;
      external_url?: string;
      animation_url?: string;
    };
  };
  authorities: Array<{
    address: string;
    scopes: string[];
  }>;
  compression: {
    eligible: boolean;
    compressed: boolean;
    data_hash: string;
    creator_hash: string;
    asset_hash: string;
    tree: string;
    seq: number;
    leaf_id: number;
  };
  grouping: Array<{
    group_key: string;
    group_value: string;
  }>;
  royalty: {
    royalty_model: string;
    target: string | null;
    percent: number;
    basis_points: number;
    primary_sale_happened: boolean;
    locked: boolean;
  };
  creators: Array<{
    address: string;
    share: number;
    verified: boolean;
  }>;
  ownership: {
    frozen: boolean;
    delegated: boolean;
    delegate: string | null;
    ownership_model: string;
    owner: string;
  };
  supply: {
    print_max_supply: number;
    print_current_supply: number;
    edition_nonce: number | null;
  } | null;
  mutable: boolean;
  burnt: boolean;
  token_info?: {
    supply: number;
    decimals: number;
    token_program: string;
    associated_token_address: string;
    mint_authority?: string;
    freeze_authority?: string;
  };
}

/**
 * Webhook configuration
 */
export interface HeliusWebhook {
  webhookID: string;
  wallet: string;
  webhookURL: string;
  transactionTypes: HeliusTransactionType[];
  accountAddresses: string[];
  webhookType: "enhanced" | "raw" | "discord" | "enhancedDevnet" | "rawDevnet";
  txnStatus?: "all" | "success" | "failed";
  authHeader?: string;
}

/**
 * Priority fee response
 */
export interface HeliusPriorityFeeResponse {
  priorityFeeEstimate: number;
  priorityFeeLevels: {
    min: number;
    low: number;
    medium: number;
    high: number;
    veryHigh: number;
    unsafeMax: number;
  };
}

/**
 * Token metadata
 */
export interface HeliusTokenMetadata {
  mint: string;
  onChainAccountInfo?: {
    accountInfo: {
      key: string;
      isSigner: boolean;
      isWritable: boolean;
      lamports: number;
      data: {
        parsed: {
          info: {
            decimals: number;
            freezeAuthority: string | null;
            isInitialized: boolean;
            mintAuthority: string | null;
            supply: string;
          };
          type: string;
        };
        program: string;
        space: number;
      };
      owner: string;
      executable: boolean;
      rentEpoch: number;
    };
    error: string;
  };
  onChainMetadata?: {
    metadata: {
      tokenStandard: string;
      key: string;
      updateAuthority: string;
      mint: string;
      data: {
        name: string;
        symbol: string;
        uri: string;
        sellerFeeBasisPoints: number;
        creators: Array<{
          address: string;
          verified: boolean;
          share: number;
        }> | null;
      };
      primarySaleHappened: boolean;
      isMutable: boolean;
      editionNonce: number | null;
      uses: {
        useMethod: string;
        remaining: number;
        total: number;
      } | null;
      collection: {
        key: string;
        verified: boolean;
      } | null;
      collectionDetails: Record<string, unknown> | null;
    };
    error: string;
  };
  offChainMetadata?: {
    metadata: {
      name: string;
      symbol: string;
      description?: string;
      image?: string;
      attributes?: Array<{
        trait_type: string;
        value: string | number;
      }>;
    };
    uri: string;
    error: string;
  };
  legacyMetadata?: {
    chainId: number;
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    logoURI: string;
    tags: string[];
    extensions: Record<string, string>;
  };
}

/**
 * Balance response
 */
export interface HeliusBalance {
  nativeBalance: number;
  tokens: Array<{
    mint: string;
    amount: number;
    decimals: number;
    tokenAccount: string;
  }>;
}
