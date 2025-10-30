/**
 * Pricing constants for container deployments and operations
 * All costs are in USD (1 credit = $1.00 USD)
 */

/**
 * Helper function to round a value to 2 decimal places (USD format)
 */
function roundToUSD(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export const CONTAINER_PRICING = {
  // One-time costs
  DEPLOYMENT: 10.0, // $10.00 per deployment
  IMAGE_UPLOAD: 5.0, // $5.00 per image upload

  // Recurring costs (per hour, charged daily)
  RUNNING_COST_PER_HOUR: 0.1, // $0.10/hour
  RUNNING_COST_PER_DAY: 2.4, // $2.40/day

  // Resource-based costs
  COST_PER_GB_STORAGE: 1.0, // $1.00/GB/month
  COST_PER_GB_BANDWIDTH: 0.5, // $0.50/GB outbound

  // Scaling costs
  COST_PER_ADDITIONAL_INSTANCE: 0.5, // $0.50 per instance per hour
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
  orgSettings?: Record<string, unknown>
): number {
  // Check if org has custom limit in settings
  const customLimit = orgSettings?.max_containers as number | undefined;
  if (customLimit && customLimit > 0) {
    return customLimit;
  }

  // Default tiering based on credit balance (USD)
  if (creditBalance >= 1000) {
    return CONTAINER_LIMITS.ENTERPRISE_MAX_CONTAINERS; // $1000+
  }
  if (creditBalance >= 100) {
    return CONTAINER_LIMITS.PRO_MAX_CONTAINERS; // $100+
  }
  if (creditBalance >= 10) {
    return CONTAINER_LIMITS.STARTER_MAX_CONTAINERS; // $10+
  }

  return CONTAINER_LIMITS.FREE_TIER_CONTAINERS; // Below $10
}

/**
 * Calculate total deployment cost for AWS ECS containers
 */
export function calculateDeploymentCost(config: {
  imageSize?: number;
  desiredCount?: number;
  cpu?: number; // CPU units (256 = 0.25 vCPU)
  memory?: number; // Memory in MB
  includeUpload?: boolean;
}): number {
  let totalCost = CONTAINER_PRICING.DEPLOYMENT;

  if (config.includeUpload) {
    totalCost += CONTAINER_PRICING.IMAGE_UPLOAD;
  }

  const instanceCount = config.desiredCount || 1;

  // Additional cost for scaling beyond single instance
  if (instanceCount > 1) {
    totalCost +=
      (instanceCount - 1) * CONTAINER_PRICING.COST_PER_ADDITIONAL_INSTANCE;
  }

  // Additional cost for higher CPU/memory allocations
  if (config.cpu && config.cpu > 256) {
    // Base is 256 CPU, charge extra for higher tiers
    const cpuMultiplier = config.cpu / 256;
    totalCost += roundToUSD((cpuMultiplier - 1) * 2.0);
  }

  if (config.memory && config.memory > 512) {
    // Base is 512MB, charge extra for more memory
    const memoryMultiplier = config.memory / 512;
    totalCost += roundToUSD((memoryMultiplier - 1) * 1.0);
  }

  return totalCost;
}
