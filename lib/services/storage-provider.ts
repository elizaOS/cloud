/**
 * Storage Provider Service
 * 
 * Implements the Jeju storage marketplace provider interface,
 * allowing cloud to participate as a decentralized storage provider.
 * 
 * Features:
 * - Vercel Blob as primary storage backend
 * - IPFS pinning as secondary/hybrid option
 * - x402 payment integration
 * - ERC-8004 agent identity
 * - Storage deal tracking and settlement
 */

import { storageService, calculateUploadCost, formatPrice } from './storage';
import { ipfsService } from './ipfs';
import { logger } from '@/lib/utils/logger';
import { extractErrorMessage } from '@/lib/utils/error-handling';
import configJson from '@/config/x402.json';

// Storage pricing from x402 config
const PRICING = configJson.pricing.storage;

// Storage tiers (aligned with packages/contracts/src/storage/IStorageTypes.sol)
export const StorageTier = {
  HOT: 0,
  WARM: 1,
  COLD: 2,
  PERMANENT: 3,
} as const;

export type StorageTierType = (typeof StorageTier)[keyof typeof StorageTier];

// Deal status
export const DealStatus = {
  PENDING: 0,
  ACTIVE: 1,
  COMPLETED: 2,
  FAILED: 3,
  TERMINATED: 4,
} as const;

export type DealStatusType = (typeof DealStatus)[keyof typeof DealStatus];

export interface StorageDeal {
  id: string;
  user: string;
  cid: string;
  size: number;
  tier: StorageTierType;
  durationDays: number;
  price: bigint;
  status: DealStatusType;
  createdAt: Date;
  expiresAt?: Date;
  blobUrl?: string;
  ipfsCid?: string;
}

export interface StorageQuote {
  provider: string;
  sizeBytes: number;
  durationDays: number;
  tier: StorageTierType;
  priceWei: bigint;
  priceETH: string;
  priceUSD: string;
  replicationFactor: number;
  backends: string[];
  expires: Date;
}

// Cloud provider info for marketplace
export const CLOUD_PROVIDER_INFO = {
  name: 'Jeju Cloud Storage',
  type: 'cloud',
  capabilities: ['vercel-blob', 'ipfs', 'x402-payments', 'erc8004-verified'],
  supportedTiers: [StorageTier.HOT, StorageTier.WARM, StorageTier.COLD, StorageTier.PERMANENT],
  replicationFactors: [1, 2, 3], // Number of copies/backends
  endpoints: {
    upload: '/api/v1/storage',
    download: '/api/v1/storage/[id]',
    ipfs: '/api/v1/storage/ipfs',
    deals: '/api/v1/storage/deals',
  },
};

// Pricing per tier (aligned with apps/storage STORAGE_PRICING in sdk/x402.ts)
const TIER_PRICING: Record<StorageTierType, bigint> = {
  [StorageTier.HOT]: 100_000_000_000_000n,        // 0.0001 ETH/GB/month
  [StorageTier.WARM]: 50_000_000_000_000n,        // 0.00005 ETH/GB/month  
  [StorageTier.COLD]: 10_000_000_000_000n,        // 0.00001 ETH/GB/month
  [StorageTier.PERMANENT]: 5_000_000_000_000_000n, // 0.005 ETH/GB one-time
};

// Bandwidth pricing (aligned with apps/storage)
const BANDWIDTH_PRICING = {
  UPLOAD_PER_GB: 10_000_000_000_000n,             // 0.00001 ETH/GB
  RETRIEVAL_PER_GB: 20_000_000_000_000n,          // 0.00002 ETH/GB
};

// Minimum fees
const MIN_FEES = {
  UPLOAD: 1_000_000_000_000n,                     // 0.000001 ETH
  PIN: 10_000_000_000_000n,                       // 0.00001 ETH
};

/**
 * Calculate storage cost in wei (aligned with apps/storage calculateStorageCost)
 */
export function calculateStorageCost(
  sizeBytes: number,
  durationDays: number,
  tier: StorageTierType = StorageTier.WARM,
  replicationFactor: number = 1
): bigint {
  const sizeGB = sizeBytes / (1024 ** 3);
  const months = durationDays / 30;
  const pricePerGBMonth = TIER_PRICING[tier];
  
  let baseCost: bigint;
  if (tier === StorageTier.PERMANENT) {
    // One-time cost for permanent storage
    baseCost = BigInt(Math.ceil(sizeGB * Number(pricePerGBMonth)));
  } else {
    // Monthly cost prorated by days
    baseCost = BigInt(Math.ceil(sizeGB * months * Number(pricePerGBMonth)));
  }
  
  // Add upload bandwidth cost (same as storage marketplace)
  const uploadCost = BigInt(Math.ceil(sizeGB * Number(BANDWIDTH_PRICING.UPLOAD_PER_GB)));
  
  // Apply replication factor
  const totalCost = (baseCost + uploadCost) * BigInt(replicationFactor);
  
  // Ensure minimum fee
  return totalCost > MIN_FEES.UPLOAD ? totalCost : MIN_FEES.UPLOAD;
}

/**
 * Format wei to human-readable price
 */
export function formatWeiPrice(weiAmount: bigint): { eth: string; usd: string } {
  const ethAmount = Number(weiAmount) / 1e18;
  const usdAmount = ethAmount * 3000; // Approximate ETH price
  
  return {
    eth: ethAmount.toFixed(6),
    usd: `$${usdAmount.toFixed(4)}`,
  };
}

/**
 * Get storage quote for a request
 */
export function getStorageQuote(
  sizeBytes: number,
  durationDays: number = 30,
  tier: StorageTierType = StorageTier.WARM,
  replicationFactor: number = 1
): StorageQuote {
  const priceWei = calculateStorageCost(sizeBytes, durationDays, tier, replicationFactor);
  const { eth, usd } = formatWeiPrice(priceWei);
  
  // Determine backends based on tier and replication
  const backends: string[] = ['vercel-blob'];
  if (replicationFactor > 1 || tier === StorageTier.PERMANENT) {
    backends.push('ipfs');
  }
  if (tier === StorageTier.PERMANENT && replicationFactor > 2) {
    backends.push('arweave');
  }
  
  return {
    provider: 'jeju-cloud',
    sizeBytes,
    durationDays,
    tier,
    priceWei,
    priceETH: eth,
    priceUSD: usd,
    replicationFactor,
    backends,
    expires: new Date(Date.now() + 5 * 60 * 1000), // 5 minute quote validity
  };
}

// In-memory deal tracking (in production, this would be in a database)
const deals = new Map<string, StorageDeal>();

/**
 * Storage Provider Service
 */
export const storageProviderService = {
  /**
   * Get provider info for marketplace discovery
   */
  getProviderInfo() {
    return {
      ...CLOUD_PROVIDER_INFO,
      pricing: TIER_PRICING,
      capacity: {
        total: 1_000_000_000_000, // 1 TB
        available: 800_000_000_000, // 800 GB
        reserved: 200_000_000_000, // 200 GB reserved
      },
      health: {
        status: 'healthy',
        uptime: 99.9,
        latencyMs: 50,
      },
    };
  },
  
  /**
   * Get quote for storage request
   */
  getQuote(
    sizeBytes: number,
    durationDays?: number,
    tier?: StorageTierType,
    replicationFactor?: number
  ): StorageQuote {
    return getStorageQuote(
      sizeBytes, 
      durationDays || 30, 
      tier ?? StorageTier.WARM, 
      replicationFactor || 1
    );
  },
  
  /**
   * Create a storage deal
   */
  async createDeal(params: {
    user: string;
    sizeBytes: number;
    durationDays: number;
    tier: StorageTierType;
    replicationFactor?: number;
    paymentTxHash?: string;
  }): Promise<{ dealId: string; quote: StorageQuote }> {
    const { user, sizeBytes, durationDays, tier, replicationFactor = 1 } = params;
    
    const quote = getStorageQuote(sizeBytes, durationDays, tier, replicationFactor);
    const dealId = `deal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    const deal: StorageDeal = {
      id: dealId,
      user,
      cid: '', // Will be set after upload
      size: sizeBytes,
      tier,
      durationDays,
      price: quote.priceWei,
      status: DealStatus.PENDING,
      createdAt: new Date(),
      expiresAt: tier === StorageTier.PERMANENT 
        ? undefined 
        : new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000),
    };
    
    deals.set(dealId, deal);
    
    logger.info('[StorageProvider] Deal created', {
      dealId,
      user,
      size: sizeBytes,
      tier,
      price: quote.priceETH,
    });
    
    return { dealId, quote };
  },
  
  /**
   * Upload content for a deal
   */
  async uploadForDeal(
    dealId: string,
    content: Buffer,
    options: {
      filename: string;
      contentType: string;
    }
  ): Promise<{
    blobUrl: string;
    ipfsCid?: string;
    gatewayUrl?: string;
  }> {
    const deal = deals.get(dealId);
    if (!deal) {
      throw new Error(`Deal not found: ${dealId}`);
    }
    
    if (deal.status !== DealStatus.PENDING) {
      throw new Error(`Deal ${dealId} is not pending`);
    }
    
    // Upload to Vercel Blob (primary)
    const result = await storageService.upload(content, {
      filename: options.filename,
      contentType: options.contentType,
      ownerAddress: deal.user,
      pinToIPFS: deal.tier === StorageTier.PERMANENT || deal.tier === StorageTier.COLD,
    });
    
    // Update deal with upload info
    deal.blobUrl = result.url;
    deal.cid = result.cid || `cloud-${result.id}`;
    deal.ipfsCid = result.cid;
    deal.status = DealStatus.ACTIVE;
    deals.set(dealId, deal);
    
    logger.info('[StorageProvider] Content uploaded for deal', {
      dealId,
      url: result.url,
      cid: deal.cid,
      ipfs: !!result.cid,
    });
    
    return {
      blobUrl: result.url,
      ipfsCid: result.cid,
      gatewayUrl: result.ipfsGatewayUrl,
    };
  },
  
  /**
   * Get deal details
   */
  getDeal(dealId: string): StorageDeal | undefined {
    return deals.get(dealId);
  },
  
  /**
   * List deals for a user
   */
  listDeals(user: string): StorageDeal[] {
    return Array.from(deals.values()).filter(d => d.user.toLowerCase() === user.toLowerCase());
  },
  
  /**
   * Terminate a deal early
   */
  async terminateDeal(dealId: string, user: string): Promise<{
    refundWei: bigint;
  }> {
    const deal = deals.get(dealId);
    if (!deal) {
      throw new Error(`Deal not found: ${dealId}`);
    }
    
    if (deal.user.toLowerCase() !== user.toLowerCase()) {
      throw new Error('Not authorized to terminate this deal');
    }
    
    if (deal.status !== DealStatus.ACTIVE && deal.status !== DealStatus.PENDING) {
      throw new Error(`Cannot terminate deal with status ${deal.status}`);
    }
    
    // Calculate refund (prorated for remaining time)
    let refundWei = 0n;
    if (deal.status === DealStatus.PENDING) {
      refundWei = deal.price;
    } else if (deal.expiresAt) {
      const remainingMs = deal.expiresAt.getTime() - Date.now();
      const totalMs = deal.durationDays * 24 * 60 * 60 * 1000;
      const remainingFraction = Math.max(0, remainingMs / totalMs);
      refundWei = BigInt(Math.floor(Number(deal.price) * remainingFraction));
    }
    
    deal.status = DealStatus.TERMINATED;
    deals.set(dealId, deal);
    
    // Delete from blob storage if exists
    if (deal.blobUrl) {
      await storageService.delete(deal.blobUrl).catch(err => {
        logger.warn('[StorageProvider] Failed to delete blob', { dealId, error: err.message });
      });
    }
    
    logger.info('[StorageProvider] Deal terminated', {
      dealId,
      refundWei: refundWei.toString(),
    });
    
    return { refundWei };
  },
  
  /**
   * Check deal health and status
   */
  async checkDealHealth(dealId: string): Promise<{
    available: boolean;
    backends: { name: string; available: boolean }[];
    lastChecked: Date;
  }> {
    const deal = deals.get(dealId);
    if (!deal) {
      throw new Error(`Deal not found: ${dealId}`);
    }
    
    const backends: { name: string; available: boolean }[] = [];
    
    // Check Vercel Blob
    if (deal.blobUrl) {
      const metadata = await storageService.getMetadata(deal.blobUrl);
      backends.push({ name: 'vercel-blob', available: !!metadata });
    }
    
    // Check IPFS
    if (deal.ipfsCid) {
      const ipfsHealth = await ipfsService.health().catch((error) => {
        logger.debug("[StorageProvider] IPFS health check failed", { error: extractErrorMessage(error) });
        return null;
      });
      backends.push({ name: 'ipfs', available: !!ipfsHealth });
    }
    
    const available = backends.some(b => b.available);
    
    return {
      available,
      backends,
      lastChecked: new Date(),
    };
  },
  
  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    totalDeals: number;
    activeDeals: number;
    totalStorageBytes: number;
    totalRevenueWei: bigint;
  }> {
    const allDeals = Array.from(deals.values());
    const activeDeals = allDeals.filter(d => d.status === DealStatus.ACTIVE);
    
    return {
      totalDeals: allDeals.length,
      activeDeals: activeDeals.length,
      totalStorageBytes: activeDeals.reduce((sum, d) => sum + d.size, 0),
      totalRevenueWei: allDeals.reduce((sum, d) => sum + d.price, 0n),
    };
  },
  
  /**
   * Generate x402 payment requirement for storage operation
   */
  getPaymentRequirement(
    operation: 'upload' | 'create_deal',
    params: {
      sizeBytes: number;
      durationDays?: number;
      tier?: StorageTierType;
    }
  ): {
    x402Version: number;
    accepts: Array<{
      scheme: string;
      network: string;
      maxAmountRequired: string;
      asset: string;
      payTo: string;
      resource: string;
      description: string;
    }>;
  } {
    const { sizeBytes, durationDays = 30, tier = StorageTier.WARM } = params;
    const priceWei = calculateStorageCost(sizeBytes, durationDays, tier);
    
    const recipientAddress = process.env.X402_RECIPIENT_ADDRESS || '0x0000000000000000000000000000000000000000';
    const network = process.env.X402_NETWORK || 'base-sepolia';
    
    const tierName = Object.keys(StorageTier).find(k => StorageTier[k as keyof typeof StorageTier] === tier) || 'WARM';
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
    
    return {
      x402Version: 1,
      accepts: [
        {
          scheme: 'exact',
          network,
          maxAmountRequired: priceWei.toString(),
          asset: '0x0000000000000000000000000000000000000000', // ETH
          payTo: recipientAddress,
          resource: `/api/v1/storage/${operation}`,
          description: `Storage ${operation}: ${sizeMB} MB, ${durationDays} days, ${tierName} tier`,
        },
        {
          scheme: 'credit',
          network,
          maxAmountRequired: priceWei.toString(),
          asset: '0x0000000000000000000000000000000000000000',
          payTo: recipientAddress,
          resource: `/api/v1/storage/${operation}`,
          description: 'Pay from prepaid credit balance',
        },
      ],
    };
  },
};

export default storageProviderService;

