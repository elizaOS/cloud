/**
 * Environment Variable Validation
 * Validates required environment variables on application startup
 */

export interface EnvValidationError {
  variable: string;
  message: string;
  required: boolean;
}

export interface EnvValidationResult {
  valid: boolean;
  errors: EnvValidationError[];
  warnings: EnvValidationError[];
}

/**
 * Environment variable definitions
 */
const ENV_VARS = {
  // Database - Single unified database for platform and ElizaOS
  DATABASE_URL: {
    required: true,
    description:
      "PostgreSQL connection string (unified platform + ElizaOS tables)",
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
} as const;

/**
 * Validate all environment variables
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
 * Validate environment and throw if invalid
 * Use this on application startup
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

  console.log("✅ Environment validation passed");
  if (result.warnings.length > 0) {
    console.log(
      `⚠️  ${result.warnings.length} optional variable(s) not set - some features may be unavailable`,
    );
  }
  console.log("");
}

/**
 * Check if a specific feature is configured
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
    default:
      return false;
  }
}

/**
 * Get list of configured features
 */
export function getConfiguredFeatures(): string[] {
  const features = ["containers", "stripe", "blob", "ai"];
  return features.filter((f) => isFeatureConfigured(f));
}

/**
 * Log configuration status on startup
 */
export function logConfigurationStatus(): void {
  console.log("📋 Feature Configuration Status:");

  const features = [
    { name: "Container Deployments", key: "containers" },
    { name: "Stripe Payments", key: "stripe" },
    { name: "Blob Storage", key: "blob" },
    { name: "AI Services", key: "ai" },
  ];

  for (const feature of features) {
    const configured = isFeatureConfigured(feature.key);
    const status = configured ? "✅ Enabled" : "⚠️  Disabled";
    console.log(`  ${status} - ${feature.name}`);
  }

  console.log("");
}
