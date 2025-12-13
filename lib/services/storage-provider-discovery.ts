/**
 * Storage Provider Discovery Service
 * 
 * Discovers storage providers from multiple sources:
 * 1. Jeju Indexer (GraphQL) - on-chain registered providers
 * 2. ERC-8004 Identity Registry - agent-verified providers
 * 3. Local apps/storage pinning service
 * 
 * Enables x402-payable storage via permissionless provider selection.
 */

import { logger } from "@/lib/utils/logger";
import { extractErrorMessage } from "@/lib/utils/error-handling";

// ============================================================================
// Types
// ============================================================================

export interface StorageProviderInfo {
  address: string;
  name: string;
  endpoint: string;
  providerType: 'IPFS_NODE' | 'CLOUD_VERCEL' | 'CLOUD_S3' | 'CLOUD_R2' | 'ARWEAVE' | 'HYBRID';
  agentId?: number;
  isVerified: boolean;
  isActive: boolean;
  
  // Pricing (in USD)
  pricePerGBMonth: number;
  uploadPricePerGB: number;
  retrievalPricePerGB: number;
  
  // Capacity
  availableCapacityGB: number;
  totalCapacityGB: number;
  
  // Performance
  healthScore: number;
  avgLatencyMs: number;
  supportedTiers: ('HOT' | 'WARM' | 'COLD' | 'PERMANENT')[];
  
  // Stats
  totalDeals: number;
  avgRating: number;
  uptimePercent: number;
}

export interface StorageQuote {
  provider: StorageProviderInfo;
  sizeBytes: number;
  durationDays: number;
  tier: 'HOT' | 'WARM' | 'COLD' | 'PERMANENT';
  totalCostUSD: number;
  costBreakdown: {
    storage: number;
    upload: number;
    retrieval: number;
  };
  expiresAt: Date;
}

export interface DiscoveryOptions {
  minCapacityGB?: number;
  maxPricePerGBMonth?: number;
  minHealthScore?: number;
  requireVerified?: boolean;
  tier?: 'HOT' | 'WARM' | 'COLD' | 'PERMANENT';
  limit?: number;
}

// ============================================================================
// Configuration
// ============================================================================

const INDEXER_URL = process.env.INDEXER_URL || 'http://localhost:4350/graphql';
const STORAGE_SERVICE_URL = process.env.STORAGE_SERVICE_URL || 'http://localhost:3100';
const REFRESH_INTERVAL_MS = 60_000; // 1 minute cache

// ============================================================================
// GraphQL Queries
// ============================================================================

const STORAGE_PROVIDERS_QUERY = `
  query GetStorageProviders($first: Int, $where: StorageProviderWhereInput) {
    storageProviders(first: $first, where: $where, orderBy: healthScore_DESC) {
      id
      address
      name
      endpoint
      providerType
      agentId
      isVerified
      isActive
      pricePerGBMonth
      uploadPricePerGB
      retrievalPricePerGB
      availableCapacityGB
      totalCapacityGB
      healthScore
      avgLatencyMs
      supportedTiers
      totalDeals
      avgRating
      uptimePercent
    }
  }
`;

const STORAGE_STATS_QUERY = `
  query GetStorageMarketStats {
    storageMarketStats(where: { id_eq: "global" }) {
      totalProviders
      activeProviders
      verifiedProviders
      totalCapacityTB
      usedCapacityTB
      totalDeals
      activeDeals
      avgPricePerGBMonth
    }
  }
`;

// ============================================================================
// Cache
// ============================================================================

let cachedProviders: StorageProviderInfo[] = [];
let lastRefresh = 0;

// ============================================================================
// Service
// ============================================================================

export const storageProviderDiscoveryService = {
  /**
   * Discover storage providers from all sources
   */
  async discoverProviders(options: DiscoveryOptions = {}): Promise<StorageProviderInfo[]> {
    // Check cache
    if (Date.now() - lastRefresh < REFRESH_INTERVAL_MS && cachedProviders.length > 0) {
      return this.filterProviders(cachedProviders, options);
    }
    
    const providers: StorageProviderInfo[] = [];
    
    // 1. Try Indexer (on-chain providers)
    const indexerProviders = await this.fetchFromIndexer(options).catch((err) => {
      logger.warn("[StorageDiscovery] Indexer unavailable", { error: err.message });
      return [];
    });
    providers.push(...indexerProviders);
    
    // 2. Try local storage service (apps/storage)
    const localProviders = await this.fetchFromLocalStorage().catch((err) => {
      logger.debug("[StorageDiscovery] Local storage unavailable", { error: err.message });
      return [];
    });
    providers.push(...localProviders);
    
    // 3. Add cloud as a fallback provider (this service)
    const cloudProvider = this.getCloudProviderInfo();
    if (!providers.find(p => p.address === cloudProvider.address)) {
      providers.push(cloudProvider);
    }
    
    // Update cache
    cachedProviders = providers;
    lastRefresh = Date.now();
    
    logger.info("[StorageDiscovery] Discovered providers", { 
      total: providers.length,
      indexed: indexerProviders.length,
      local: localProviders.length,
    });
    
    return this.filterProviders(providers, options);
  },
  
  /**
   * Get best provider for given requirements
   */
  async getBestProvider(
    sizeBytes: number,
    durationDays: number,
    options: DiscoveryOptions = {}
  ): Promise<StorageProviderInfo | null> {
    const providers = await this.discoverProviders(options);
    if (providers.length === 0) return null;
    
    // Score providers
    const scored = providers.map(p => ({
      provider: p,
      score: this.scoreProvider(p, sizeBytes, durationDays, options),
    }));
    
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.provider || null;
  },
  
  /**
   * Get quote from provider
   */
  async getQuote(
    provider: StorageProviderInfo,
    sizeBytes: number,
    durationDays: number,
    tier: 'HOT' | 'WARM' | 'COLD' | 'PERMANENT' = 'WARM'
  ): Promise<StorageQuote> {
    const sizeGB = sizeBytes / (1024 ** 3);
    const months = durationDays / 30;
    
    const storageCost = sizeGB * provider.pricePerGBMonth * months;
    const uploadCost = sizeGB * provider.uploadPricePerGB;
    const retrievalCost = sizeGB * provider.retrievalPricePerGB;
    
    return {
      provider,
      sizeBytes,
      durationDays,
      tier,
      totalCostUSD: storageCost + uploadCost,
      costBreakdown: {
        storage: storageCost,
        upload: uploadCost,
        retrieval: retrievalCost,
      },
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min expiry
    };
  },
  
  /**
   * Get quotes from multiple providers, sorted by total cost
   */
  async getQuotes(
    sizeBytes: number,
    durationDays: number,
    options: DiscoveryOptions = {}
  ): Promise<StorageQuote[]> {
    const providers = await this.discoverProviders(options);
    const tier = options.tier || 'WARM';
    
    // Get all quotes in parallel, then sort by cost
    const quotes = await Promise.all(
      providers.map(p => this.getQuote(p, sizeBytes, durationDays, tier))
    );
    
    return quotes.sort((a, b) => a.totalCostUSD - b.totalCostUSD);
  },
  
  /**
   * Get marketplace stats
   */
  async getMarketStats(): Promise<{
    totalProviders: number;
    activeProviders: number;
    verifiedProviders: number;
    totalCapacityTB: number;
    avgPricePerGBMonth: number;
  }> {
    // Try indexer first
    const response = await fetch(INDEXER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: STORAGE_STATS_QUERY }),
    }).catch((error) => {
      logger.debug("[StorageProviderDiscovery] Indexer fetch failed", { error: extractErrorMessage(error) });
      return null;
    });
    
    if (response?.ok) {
      const data = await response.json();
      const stats = data.data?.storageMarketStats?.[0];
      if (stats) {
        return {
          totalProviders: stats.totalProviders,
          activeProviders: stats.activeProviders,
          verifiedProviders: stats.verifiedProviders,
          totalCapacityTB: Number(stats.totalCapacityTB) / 1024,
          avgPricePerGBMonth: Number(stats.avgPricePerGBMonth) / 1e18,
        };
      }
    }
    
    // Fallback to cached providers
    const providers = await this.discoverProviders();
    const active = providers.filter(p => p.isActive);
    const verified = providers.filter(p => p.isVerified);
    const totalCapacity = providers.reduce((sum, p) => sum + p.totalCapacityGB, 0);
    const avgPrice = providers.length > 0
      ? providers.reduce((sum, p) => sum + p.pricePerGBMonth, 0) / providers.length
      : 0.10;
    
    return {
      totalProviders: providers.length,
      activeProviders: active.length,
      verifiedProviders: verified.length,
      totalCapacityTB: totalCapacity / 1024,
      avgPricePerGBMonth: avgPrice,
    };
  },
  
  // ============================================================================
  // Private Methods
  // ============================================================================
  
  async fetchFromIndexer(options: DiscoveryOptions): Promise<StorageProviderInfo[]> {
    const where: Record<string, unknown> = { isActive_eq: true };
    if (options.requireVerified) where.isVerified_eq = true;
    if (options.minHealthScore) where.healthScore_gte = options.minHealthScore;
    if (options.minCapacityGB) where.availableCapacityGB_gte = options.minCapacityGB;
    
    const response = await fetch(INDEXER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: STORAGE_PROVIDERS_QUERY,
        variables: { first: options.limit || 50, where },
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Indexer request failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    const providers = data.data?.storageProviders || [];
    
    return providers.map((p: Record<string, unknown>) => ({
      address: p.address as string,
      name: p.name as string,
      endpoint: p.endpoint as string,
      providerType: p.providerType as StorageProviderInfo['providerType'],
      agentId: p.agentId as number | undefined,
      isVerified: p.isVerified as boolean,
      isActive: p.isActive as boolean,
      pricePerGBMonth: Number(p.pricePerGBMonth) / 1e18,
      uploadPricePerGB: Number(p.uploadPricePerGB) / 1e18,
      retrievalPricePerGB: Number(p.retrievalPricePerGB) / 1e18,
      availableCapacityGB: Number(p.availableCapacityGB),
      totalCapacityGB: Number(p.totalCapacityGB),
      healthScore: Number(p.healthScore),
      avgLatencyMs: Number(p.avgLatencyMs),
      supportedTiers: (p.supportedTiers as string[]) || ['WARM'],
      totalDeals: Number(p.totalDeals),
      avgRating: Number(p.avgRating),
      uptimePercent: Number(p.uptimePercent),
    }));
  },
  
  async fetchFromLocalStorage(): Promise<StorageProviderInfo[]> {
    const response = await fetch(`${STORAGE_SERVICE_URL}/health`);
    if (!response.ok) return [];
    
    const health = await response.json();
    if (health.status !== 'healthy') return [];
    
    // Local storage acts as a provider
    return [{
      address: '0x0000000000000000000000000000000000000001', // Placeholder for local
      name: 'Jeju Storage Node',
      endpoint: STORAGE_SERVICE_URL,
      providerType: 'IPFS_NODE',
      isVerified: false,
      isActive: true,
      pricePerGBMonth: 0.10,
      uploadPricePerGB: 0.001,
      retrievalPricePerGB: 0.0001,
      availableCapacityGB: 1000,
      totalCapacityGB: 1000,
      healthScore: 100,
      avgLatencyMs: 50,
      supportedTiers: ['HOT', 'WARM', 'COLD'],
      totalDeals: 0,
      avgRating: 100,
      uptimePercent: 100,
    }];
  },
  
  getCloudProviderInfo(): StorageProviderInfo {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    return {
      address: '0x0000000000000000000000000000000000000002', // Placeholder for cloud
      name: 'Eliza Cloud Storage',
      endpoint: `${baseUrl}/api/v1/storage`,
      providerType: 'CLOUD_VERCEL',
      isVerified: true,
      isActive: true,
      pricePerGBMonth: 0.10,
      uploadPricePerGB: 0.001,
      retrievalPricePerGB: 0.0001,
      availableCapacityGB: 10000,
      totalCapacityGB: 10000,
      healthScore: 100,
      avgLatencyMs: 30,
      supportedTiers: ['HOT', 'WARM'],
      totalDeals: 0,
      avgRating: 100,
      uptimePercent: 100,
    };
  },
  
  filterProviders(providers: StorageProviderInfo[], options: DiscoveryOptions): StorageProviderInfo[] {
    let filtered = providers.filter(p => p.isActive);
    
    if (options.minCapacityGB) {
      filtered = filtered.filter(p => p.availableCapacityGB >= options.minCapacityGB!);
    }
    if (options.maxPricePerGBMonth) {
      filtered = filtered.filter(p => p.pricePerGBMonth <= options.maxPricePerGBMonth!);
    }
    if (options.minHealthScore) {
      filtered = filtered.filter(p => p.healthScore >= options.minHealthScore!);
    }
    if (options.requireVerified) {
      filtered = filtered.filter(p => p.isVerified);
    }
    if (options.tier) {
      filtered = filtered.filter(p => p.supportedTiers.includes(options.tier!));
    }
    if (options.limit) {
      filtered = filtered.slice(0, options.limit);
    }
    
    return filtered;
  },
  
  scoreProvider(
    provider: StorageProviderInfo,
    sizeBytes: number,
    durationDays: number,
    options: DiscoveryOptions
  ): number {
    let score = 0;
    
    // Price score (35%)
    const maxPrice = options.maxPricePerGBMonth || 1.0;
    score += (1 - provider.pricePerGBMonth / maxPrice) * 35;
    
    // Health score (25%)
    score += (provider.healthScore / 100) * 25;
    
    // Latency score (20%) - lower is better
    const maxLatency = 500;
    score += Math.max(0, 1 - provider.avgLatencyMs / maxLatency) * 20;
    
    // Capacity score (10%)
    const sizeGB = sizeBytes / (1024 ** 3);
    const capacityRatio = sizeGB / provider.availableCapacityGB;
    score += Math.max(0, 1 - capacityRatio) * 10;
    
    // Verification bonus (10%)
    if (provider.isVerified || provider.agentId) {
      score += 10;
    }
    
    return score;
  },
  
  /**
   * Clear cache to force refresh
   */
  clearCache(): void {
    cachedProviders = [];
    lastRefresh = 0;
  },
};

export default storageProviderDiscoveryService;

