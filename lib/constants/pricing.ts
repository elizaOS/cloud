/**
 * Pricing constants for container deployments and operations
 * All costs are in credits (1 credit = $0.01 USD equivalent)
 */

export const CONTAINER_PRICING = {
  // One-time costs
  DEPLOYMENT: 1000, // 1000 credits ($10) per deployment
  IMAGE_UPLOAD: 500, // 500 credits ($5) per image upload

  // Recurring costs (per hour, charged daily)
  RUNNING_COST_PER_HOUR: 10, // 10 credits/hour ($0.10/hour)
  RUNNING_COST_PER_DAY: 240, // 240 credits/day ($2.40/day)

  // Resource-based costs
  COST_PER_GB_STORAGE: 100, // 100 credits/GB/month
  COST_PER_GB_BANDWIDTH: 50, // 50 credits/GB outbound

  // Scaling costs
  COST_PER_ADDITIONAL_INSTANCE: 50, // 50 credits per instance per hour
} as const;

export const CONTAINER_LIMITS = {
  // Free tier
  FREE_TIER_CONTAINERS: 1,
  FREE_TIER_MAX_INSTANCES: 1,

  // Paid tiers (based on org settings)
  STARTER_MAX_CONTAINERS: 5,
  PRO_MAX_CONTAINERS: 25,
  ENTERPRISE_MAX_CONTAINERS: 100,

  // Technical limits
  MAX_IMAGE_SIZE_BYTES: 2 * 1024 * 1024 * 1024, // 2GB
  MAX_INSTANCES_PER_CONTAINER: 10,
  MAX_ENV_VARS: 50,
  MAX_ENV_VAR_SIZE: 32 * 1024, // 32KB
} as const;

/**
 * Get max containers allowed for an organization
 */
export function getMaxContainersForOrg(
  creditBalance: number,
  orgSettings?: Record<string, unknown>,
): number {
  // Check if org has custom limit in settings
  const customLimit = orgSettings?.max_containers as number | undefined;
  if (customLimit && customLimit > 0) {
    return customLimit;
  }

  // Default tiering based on credit balance
  if (creditBalance >= 100000) {
    return CONTAINER_LIMITS.ENTERPRISE_MAX_CONTAINERS; // 100k+ credits
  }
  if (creditBalance >= 10000) {
    return CONTAINER_LIMITS.PRO_MAX_CONTAINERS; // 10k+ credits
  }
  if (creditBalance >= 1000) {
    return CONTAINER_LIMITS.STARTER_MAX_CONTAINERS; // 1k+ credits
  }

  return CONTAINER_LIMITS.FREE_TIER_CONTAINERS; // Below 1k
}

/**
 * Calculate total deployment cost
 * Supports both legacy (maxInstances) and new (desiredCount, cpu, memory) parameters
 */
export function calculateDeploymentCost(config: {
  imageSize?: number;
  maxInstances?: number; // Legacy parameter
  desiredCount?: number; // New ECS parameter
  cpu?: number; // CPU units
  memory?: number; // Memory in MB
  includeUpload?: boolean;
}): number {
  let totalCost = CONTAINER_PRICING.DEPLOYMENT;

  if (config.includeUpload) {
    totalCost += CONTAINER_PRICING.IMAGE_UPLOAD;
  }

  // Use desiredCount if provided, otherwise fall back to maxInstances
  const instanceCount = config.desiredCount || config.maxInstances || 1;

  // Additional cost for scaling beyond single instance
  if (instanceCount > 1) {
    totalCost +=
      (instanceCount - 1) *
      CONTAINER_PRICING.COST_PER_ADDITIONAL_INSTANCE;
  }

  // Additional cost for higher CPU/memory allocations
  if (config.cpu && config.cpu > 256) {
    // Base is 256 CPU, charge extra for higher tiers
    const cpuMultiplier = config.cpu / 256;
    totalCost += Math.floor((cpuMultiplier - 1) * 200);
  }

  if (config.memory && config.memory > 512) {
    // Base is 512MB, charge extra for more memory
    const memoryMultiplier = config.memory / 512;
    totalCost += Math.floor((memoryMultiplier - 1) * 100);
  }

  return totalCost;
}
