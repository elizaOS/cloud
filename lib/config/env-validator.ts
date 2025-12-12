/**
 * Environment Variable Validation
 *
 * Validates required environment variables on application startup.
 */

import { logger } from "@/lib/utils/logger";

/**
 * Error information for a validation failure.
 */
export interface EnvValidationError {
  variable: string;
  message: string;
  required: boolean;
}

/**
 * Result of environment validation.
 */
export interface EnvValidationResult {
  /** Whether all required variables are valid. */
  valid: boolean;
  /** List of validation errors. */
  errors: EnvValidationError[];
  /** List of validation warnings. */
  warnings: EnvValidationError[];
}

/**
 * Environment variable definitions
 */
const ENV_VARS = {
  // Database - Single database for platform and ElizaOS
  DATABASE_URL: {
    required: true,
    description:
      "PostgreSQL connection string (platform + ElizaOS tables)",
    validate: (value: string) =>
      value.startsWith("postgresql://") || value.startsWith("postgres://"),
    errorMessage: "Must be a valid PostgreSQL connection string",
  },

  // Privy Authentication
  NEXT_PUBLIC_PRIVY_APP_ID: {
    required: true,
    description: "Privy application ID",
    validate: (value: string) => value.length > 0,
    errorMessage: "Must be a valid Privy app ID",
  },
  PRIVY_APP_SECRET: {
    required: true,
    description: "Privy application secret",
    validate: (value: string) => value.length > 0,
    errorMessage: "Must be a valid Privy app secret",
  },
  PRIVY_WEBHOOK_SECRET: {
    required: false,
    description: "Privy webhook secret for user synchronization",
    validate: (value: string) => value.length >= 32,
    errorMessage: "Must be at least 32 characters for security",
  },

  // AI Services
  OPENAI_API_KEY: {
    required: false,
    description: "OpenAI API key for Eliza serverless",
    validate: (value: string) => value.startsWith("sk-"),
    errorMessage: "Must start with 'sk-'",
  },
  AI_GATEWAY_API_KEY: {
    required: false,
    description: "AI Gateway API key",
  },

  // Storage
  BLOB_READ_WRITE_TOKEN: {
    required: false,
    description: "Vercel Blob storage token",
    validate: (value: string) => value.startsWith("vercel_blob_"),
    errorMessage: "Must start with 'vercel_blob_'",
  },

  // Stripe (optional)
  STRIPE_SECRET_KEY: {
    required: false,
    description: "Stripe secret key for payments",
    validate: (value: string) =>
      value.startsWith("sk_test_") || value.startsWith("sk_live_"),
    errorMessage: "Must start with 'sk_test_' or 'sk_live_'",
  },
  STRIPE_WEBHOOK_SECRET: {
    required: false,
    description: "Stripe webhook secret",
    validate: (value: string) => value.startsWith("whsec_"),
    errorMessage: "Must start with 'whsec_'",
  },

  // Token Redemption & Payouts (CRITICAL SECURITY)
  EVM_PAYOUT_PRIVATE_KEY: {
    required: false,
    description: "Private key for EVM token payouts (NEVER log or expose)",
    validate: (value: string) => {
      // Validate hex format (with or without 0x prefix)
      const normalized = value.startsWith("0x") ? value.slice(2) : value;
      return /^[a-fA-F0-9]{64}$/.test(normalized);
    },
    errorMessage: "Must be a valid 32-byte hex private key",
  },
  EVM_PAYOUT_WALLET_ADDRESS: {
    required: false,
    description: "EVM wallet address for payouts (checksummed)",
    validate: (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value),
    errorMessage: "Must be a valid Ethereum address (0x + 40 hex chars)",
  },
  SOLANA_PAYOUT_PRIVATE_KEY: {
    required: false,
    description: "Base58-encoded private key for Solana payouts (NEVER log or expose)",
    validate: (value: string) => {
      // Base58 validation (Solana keys are 64 bytes = ~88 base58 chars)
      return /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(value);
    },
    errorMessage: "Must be a valid base58-encoded Solana private key",
  },
  SOLANA_PAYOUT_WALLET_ADDRESS: {
    required: false,
    description: "Solana wallet address for payouts",
    validate: (value: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value),
    errorMessage: "Must be a valid base58-encoded Solana address",
  },
  AGENT0_PRIVATE_KEY: {
    required: false,
    description: "Private key for decentralized x402 settlement (NEVER log or expose)",
    validate: (value: string) => {
      const normalized = value.startsWith("0x") ? value.slice(2) : value;
      return /^[a-fA-F0-9]{64}$/.test(normalized);
    },
    errorMessage: "Must be a valid 32-byte hex private key",
  },

  // Encryption
  KMS_KEY_ID: {
    required: false,
    description: "AWS KMS key ID for envelope encryption",
    validate: (value: string) => value.length > 0,
    errorMessage: "Must be a valid KMS key ID or ARN",
  },
  ENCRYPTION_KEY: {
    required: false,
    description: "Fallback encryption key when KMS unavailable (32 bytes hex)",
    validate: (value: string) => {
      const normalized = value.startsWith("0x") ? value.slice(2) : value;
      return /^[a-fA-F0-9]{64}$/.test(normalized);
    },
    errorMessage: "Must be a valid 32-byte hex key",
  },
} as const;

/**
 * Validates all environment variables.
 *
 * @returns Validation result with errors and warnings.
 */
export function validateEnvironment(): EnvValidationResult {
  const errors: EnvValidationError[] = [];
  const warnings: EnvValidationError[] = [];

  for (const [variable, config] of Object.entries(ENV_VARS)) {
    const value = process.env[variable];

    // Check if required variable is missing
    if (config.required && !value) {
      errors.push({
        variable,
        message: `${variable} is required but not set. ${config.description}`,
        required: true,
      });
      continue;
    }

    // Skip validation if variable is not set and not required
    if (!value) {
      if (!config.required && !("default" in config && config.default)) {
        warnings.push({
          variable,
          message: `${variable} is not set. ${config.description}. Some features may be unavailable.`,
          required: false,
        });
      }
      continue;
    }

    // Validate format if validator is provided
    if ("validate" in config && config.validate && !config.validate(value)) {
      const errorMsg =
        "errorMessage" in config && config.errorMessage
          ? config.errorMessage
          : "Invalid format";
      if (config.required) {
        errors.push({
          variable,
          message: `${variable}: ${errorMsg}`,
          required: true,
        });
      } else {
        warnings.push({
          variable,
          message: `${variable}: ${errorMsg}. Feature may not work correctly.`,
          required: false,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates environment and throws if invalid.
 *
 * Use this on application startup. Logs warnings and throws on errors.
 *
 * @throws Error if environment validation fails.
 */
export function requireValidEnvironment(): void {
  const result = validateEnvironment();

  // Log warnings
  if (result.warnings.length > 0) {
    console.warn("⚠️  Environment warnings:");
    for (const warning of result.warnings) {
      console.warn(`  - ${warning.message}`);
    }
    console.warn("");
  }

  // Throw on errors
  if (!result.valid) {
    console.error("❌ Environment validation failed:");
    for (const error of result.errors) {
      console.error(`  - ${error.message}`);
    }
    console.error("");
    console.error(
      "Please check your .env.local file and set the required variables.",
    );
    console.error("See example.env.local for reference.");
    throw new Error("Invalid environment configuration");
  }

  logger.info("✅ Environment validation passed");
  if (result.warnings.length > 0) {
    logger.info(
      `⚠️  ${result.warnings.length} optional variable(s) not set - some features may be unavailable`,
    );
  }
  logger.info("");
}

/**
 * Checks if a specific feature is configured.
 *
 * @param feature - Feature name ("containers", "stripe", "blob", "ai").
 * @returns True if the feature is configured.
 */
export function isFeatureConfigured(feature: string): boolean {
  switch (feature) {
    case "containers":
      // Check for AWS ECS/ECR configuration
      return !!(
        process.env.AWS_REGION &&
        process.env.AWS_ACCESS_KEY_ID &&
        process.env.AWS_SECRET_ACCESS_KEY &&
        process.env.ECS_CLUSTER_NAME &&
        process.env.AWS_VPC_ID
      );
    case "stripe":
      return !!(
        process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET
      );
    case "blob":
      return !!process.env.BLOB_READ_WRITE_TOKEN;
    case "ai":
      return !!(process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY);
    case "evm-payouts":
      // Either private key (to derive address) or explicit address with key
      return !!(
        process.env.EVM_PAYOUT_PRIVATE_KEY ||
        (process.env.EVM_PAYOUT_WALLET_ADDRESS && process.env.EVM_PRIVATE_KEY)
      );
    case "solana-payouts":
      return !!(
        process.env.SOLANA_PAYOUT_PRIVATE_KEY ||
        process.env.SOLANA_PAYOUT_WALLET_ADDRESS
      );
    case "x402":
      return !!process.env.AGENT0_PRIVATE_KEY;
    case "encryption":
      return !!(process.env.KMS_KEY_ID || process.env.ENCRYPTION_KEY);
    default:
      return false;
  }
}

/**
 * Gets a list of all configured features.
 *
 * @returns Array of configured feature names.
 */
export function getConfiguredFeatures(): string[] {
  const features = ["containers", "stripe", "blob", "ai"];
  return features.filter((f) => isFeatureConfigured(f));
}

/**
 * Logs configuration status on startup.
 *
 * Prints which features are enabled/disabled.
 */
export function logConfigurationStatus(): void {
  logger.info("📋 Feature Configuration Status:");

  const features = [
    { name: "Container Deployments", key: "containers" },
    { name: "Stripe Payments", key: "stripe" },
    { name: "Blob Storage", key: "blob" },
    { name: "AI Services", key: "ai" },
    { name: "EVM Token Payouts", key: "evm-payouts" },
    { name: "Solana Token Payouts", key: "solana-payouts" },
    { name: "x402 Decentralized Settlement", key: "x402" },
    { name: "Secret Encryption", key: "encryption" },
  ];

  for (const feature of features) {
    const configured = isFeatureConfigured(feature.key);
    const status = configured ? "✅ Enabled" : "⚠️  Disabled";
    logger.info(`  ${status} - ${feature.name}`);
  }

  logger.info("");
}
