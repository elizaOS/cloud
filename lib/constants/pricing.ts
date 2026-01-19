/**
 * Pricing constants for container deployments and operations
 * All costs are in USD stored as decimal values in credit_balance
 *
 * BILLING MODEL: Daily billing for running containers
 * Base cost: $20/month = $0.67/day (rounded)
 */

export const CONTAINER_PRICING = {
  // One-time costs
  DEPLOYMENT: 0.5, // $0.50 (50 credits) per deployment
  IMAGE_UPLOAD: 0.25, // $0.25 per image upload

  // Recurring costs - DAILY BILLING
  // $20/month base = $20/30 = $0.6667/day
  MONTHLY_BASE_COST: 20.0, // $20/month reference
  DAILY_RUNNING_COST: 0.67, // $0.67/day per container ($20/30, rounded up)

  // Resource-based costs
  COST_PER_GB_STORAGE: 0.1, // $0.10/GB/month
  COST_PER_GB_BANDWIDTH: 0.05, // $0.05/GB outbound

  // Scaling costs
  COST_PER_ADDITIONAL_INSTANCE: 0.05, // $0.05 per instance per hour

  // Warning thresholds
  LOW_CREDITS_WARNING_THRESHOLD: 2.0, // Warn when < 3 days of credit ($0.67 * 3)
  SHUTDOWN_WARNING_HOURS: 48, // Hours before shutdown warning
} as const;

/**
 * Calculate daily container cost based on configuration
 */
export function calculateDailyContainerCost(config?: {
  desiredCount?: number;
  cpu?: number;
  memory?: number;
}): number {
  const baseCost = CONTAINER_PRICING.DAILY_RUNNING_COST;
  const instanceCount = config?.desiredCount || 1;

  // Base cost for first instance
  let totalCost = baseCost;

  // Additional instances cost the same daily rate
  if (instanceCount > 1) {
    totalCost += (instanceCount - 1) * baseCost;
  }

  // Premium for higher CPU (>1 vCPU = 1024 units)
  if (config?.cpu && config.cpu > 1024) {
    const cpuMultiplier = config.cpu / 1024;
    totalCost *= cpuMultiplier;
  }

  // Premium for higher memory (>2GB = 2048 MB)
  if (config?.memory && config.memory > 2048) {
    const memoryMultiplier = config.memory / 2048;
    totalCost *= Math.sqrt(memoryMultiplier); // Sub-linear scaling for memory
  }

  return Math.round(totalCost * 100) / 100; // Round to 2 decimal places
}

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
 * Gets the maximum number of containers allowed for an organization.
 *
 * @param creditBalance - Organization credit balance in USD.
 * @param orgSettings - Optional organization settings with custom limit.
 * @returns Maximum number of containers allowed.
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

  // Default tiering based on credit balance (USD)
  const balance = Number(creditBalance);
  if (balance >= 100.0) {
    return CONTAINER_LIMITS.ENTERPRISE_MAX_CONTAINERS; // $100+
  }
  if (balance >= 10.0) {
    return CONTAINER_LIMITS.PRO_MAX_CONTAINERS; // $10+
  }
  if (balance >= 1.0) {
    return CONTAINER_LIMITS.STARTER_MAX_CONTAINERS; // $1+
  }

  return CONTAINER_LIMITS.FREE_TIER_CONTAINERS; // Below $1
}

/**
 * Calculate total deployment cost for AWS ECS containers
 */
export function calculateDeploymentCost(config: {
  imageSize?: number;
  desiredCount?: number;
  cpu?: number; // CPU units (256 = 0.25 vCPU)
  memory?: number; // Memory in MB
}): number {
  let totalCost = CONTAINER_PRICING.DEPLOYMENT;


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
    totalCost += Math.round((cpuMultiplier - 1) * 2.0 * 100) / 100;
  }

  if (config.memory && config.memory > 512) {
    // Base is 512MB, charge extra for more memory
    const memoryMultiplier = config.memory / 512;
    totalCost += Math.round((memoryMultiplier - 1) * 1.0 * 100) / 100;
  }

  return totalCost;
}
