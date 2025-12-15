/**
 * Crypto payment configuration and constants.
 */
import Decimal from "decimal.js";

export type OxaPayNetwork =
  | "ERC20"
  | "TRC20"
  | "BEP20"
  | "POLYGON"
  | "SOL"
  | "BASE"
  | "ARB"
  | "OP";

export interface NetworkConfig {
  id: OxaPayNetwork;
  name: string;
  confirmations: number;
  tolerancePercent: number;
  minAmount: Decimal;
  maxAmount: Decimal;
}

/**
 * Payment expiration time in milliseconds (30 minutes)
 */
export const PAYMENT_EXPIRATION_MS =
  Number(process.env.CRYPTO_PAYMENT_EXPIRATION_MINUTES || 30) * 60 * 1000;

/**
 * Payment expiration time in seconds for OxaPay API
 */
export const PAYMENT_EXPIRATION_SECONDS = PAYMENT_EXPIRATION_MS / 1000;

/**
 * Minimum payment amount in USD
 */
export const MIN_PAYMENT_AMOUNT = new Decimal(
  process.env.CRYPTO_MIN_PAYMENT_AMOUNT || "1"
);

/**
 * Maximum payment amount in USD
 */
export const MAX_PAYMENT_AMOUNT = new Decimal(
  process.env.CRYPTO_MAX_PAYMENT_AMOUNT || "10000"
);

/**
 * Network-specific configurations
 */
export const NETWORK_CONFIGS: Record<OxaPayNetwork, NetworkConfig> = {
  ERC20: {
    id: "ERC20",
    name: "Ethereum",
    confirmations: 12,
    tolerancePercent: 0.5,
    minAmount: MIN_PAYMENT_AMOUNT,
    maxAmount: MAX_PAYMENT_AMOUNT,
  },
  TRC20: {
    id: "TRC20",
    name: "Tron",
    confirmations: 19,
    tolerancePercent: 0.5,
    minAmount: MIN_PAYMENT_AMOUNT,
    maxAmount: MAX_PAYMENT_AMOUNT,
  },
  BEP20: {
    id: "BEP20",
    name: "BNB Smart Chain",
    confirmations: 15,
    tolerancePercent: 0.5,
    minAmount: MIN_PAYMENT_AMOUNT,
    maxAmount: MAX_PAYMENT_AMOUNT,
  },
  POLYGON: {
    id: "POLYGON",
    name: "Polygon",
    confirmations: 128,
    tolerancePercent: 0.5,
    minAmount: MIN_PAYMENT_AMOUNT,
    maxAmount: MAX_PAYMENT_AMOUNT,
  },
  SOL: {
    id: "SOL",
    name: "Solana",
    confirmations: 32,
    tolerancePercent: 0.5,
    minAmount: MIN_PAYMENT_AMOUNT,
    maxAmount: MAX_PAYMENT_AMOUNT,
  },
  BASE: {
    id: "BASE",
    name: "Base",
    confirmations: 10,
    tolerancePercent: 0.5,
    minAmount: MIN_PAYMENT_AMOUNT,
    maxAmount: MAX_PAYMENT_AMOUNT,
  },
  ARB: {
    id: "ARB",
    name: "Arbitrum",
    confirmations: 10,
    tolerancePercent: 0.5,
    minAmount: MIN_PAYMENT_AMOUNT,
    maxAmount: MAX_PAYMENT_AMOUNT,
  },
  OP: {
    id: "OP",
    name: "Optimism",
    confirmations: 10,
    tolerancePercent: 0.5,
    minAmount: MIN_PAYMENT_AMOUNT,
    maxAmount: MAX_PAYMENT_AMOUNT,
  },
};

/**
 * Calculate tolerance threshold for a payment amount.
 * Uses percentage-based tolerance for consistency across all payment sizes.
 */
export function calculateTolerance(
  amount: Decimal,
  network: OxaPayNetwork
): Decimal {
  const config = NETWORK_CONFIGS[network];
  const toleranceMultiplier = new Decimal(1).minus(
    new Decimal(config.tolerancePercent).dividedBy(100)
  );
  return amount.times(toleranceMultiplier);
}

/**
 * Validate that an amount is within acceptable range.
 */
export function validatePaymentAmount(amount: Decimal): {
  valid: boolean;
  error?: string;
} {
  if (amount.lessThan(MIN_PAYMENT_AMOUNT)) {
    return {
      valid: false,
      error: `Amount must be at least $${MIN_PAYMENT_AMOUNT.toString()}`,
    };
  }

  if (amount.greaterThan(MAX_PAYMENT_AMOUNT)) {
    return {
      valid: false,
      error: `Amount must not exceed $${MAX_PAYMENT_AMOUNT.toString()}`,
    };
  }

  return { valid: true };
}

/**
 * Validate that received amount meets the expected amount within tolerance.
 */
export function validateReceivedAmount(
  received: Decimal,
  expected: Decimal,
  network: OxaPayNetwork
): { valid: boolean; threshold: Decimal } {
  const threshold = calculateTolerance(expected, network);
  return {
    valid: received.greaterThanOrEqualTo(threshold),
    threshold,
  };
}

/**
 * Get network configuration by ID.
 */
export function getNetworkConfig(network: OxaPayNetwork): NetworkConfig {
  const config = NETWORK_CONFIGS[network];
  if (!config) {
    throw new Error(`Unsupported network: ${network}`);
  }
  return config;
}

/**
 * Get all supported networks.
 */
export function getSupportedNetworks(): OxaPayNetwork[] {
  return Object.keys(NETWORK_CONFIGS) as OxaPayNetwork[];
}
