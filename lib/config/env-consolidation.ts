/**
 * Environment Variable Consolidation Helper
 * Handles backward compatibility and variable aliasing
 */

/**
 * Get Cloudflare Account ID from either variable
 * R2_ACCOUNT_ID is deprecated but supported for backward compatibility
 */
export function getCloudflareAccountId(): string | undefined {
  return process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
}

/**
 * Get R2 endpoint with proper default
 */
export function getR2Endpoint(): string {
  if (process.env.R2_ENDPOINT) {
    return process.env.R2_ENDPOINT;
  }

  const accountId = getCloudflareAccountId();
  if (accountId) {
    return `https://${accountId}.r2.cloudflarestorage.com`;
  }

  throw new Error(
    "Cannot determine R2 endpoint - CLOUDFLARE_ACCOUNT_ID or R2_ENDPOINT required",
  );
}

/**
 * Get R2 bucket name with default
 */
export function getR2BucketName(): string {
  return process.env.R2_BUCKET_NAME || "eliza-artifacts";
}

/**
 * Check if Cloudflare authentication is configured
 */
export function hasCloudflareAuth(): boolean {
  const hasApiToken = !!process.env.CLOUDFLARE_API_TOKEN;
  const hasLegacyAuth = !!(
    process.env.CLOUDFLARE_EMAIL && process.env.CLOUDFLARE_API_KEY
  );

  return hasApiToken || hasLegacyAuth;
}

/**
 * Get Cloudflare auth headers
 */
export function getCloudflareAuthHeaders(): Record<string, string> {
  if (process.env.CLOUDFLARE_API_TOKEN) {
    return {
      Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
    };
  }

  if (process.env.CLOUDFLARE_EMAIL && process.env.CLOUDFLARE_API_KEY) {
    console.warn(
      "⚠️  Using legacy Cloudflare authentication (email + key). Please migrate to API tokens.",
    );
    return {
      "X-Auth-Email": process.env.CLOUDFLARE_EMAIL,
      "X-Auth-Key": process.env.CLOUDFLARE_API_KEY,
    };
  }

  throw new Error("Cloudflare authentication not configured");
}

/**
 * Migration helper - log warnings for deprecated variables
 */
export function checkDeprecatedVariables(): void {
  const warnings: string[] = [];

  if (process.env.R2_ACCOUNT_ID && !process.env.CLOUDFLARE_ACCOUNT_ID) {
    warnings.push(
      "R2_ACCOUNT_ID is deprecated. Please use CLOUDFLARE_ACCOUNT_ID instead.",
    );
  }

  if (process.env.CLOUDFLARE_EMAIL || process.env.CLOUDFLARE_API_KEY) {
    warnings.push(
      "CLOUDFLARE_EMAIL and CLOUDFLARE_API_KEY are deprecated. Please use CLOUDFLARE_API_TOKEN instead.",
    );
  }

  if (process.env.R2_PUBLIC_DOMAIN) {
    warnings.push(
      "R2_PUBLIC_DOMAIN is no longer used. The endpoint is automatically configured.",
    );
  }

  if (warnings.length > 0) {
    console.warn("⚠️  Deprecated environment variables detected:");
    for (const warning of warnings) {
      console.warn(`  - ${warning}`);
    }
    console.warn("\nSee docs/ENV_SETUP_GUIDE.md for migration guide.");
    console.warn("");
  }
}

/**
 * Get consolidated environment configuration
 */
export function getConsolidatedConfig() {
  checkDeprecatedVariables();

  return {
    cloudflare: {
      accountId: getCloudflareAccountId(),
      hasAuth: hasCloudflareAuth(),
      authHeaders: hasCloudflareAuth() ? getCloudflareAuthHeaders() : undefined,
    },
    r2: {
      endpoint: process.env.R2_ENDPOINT ? getR2Endpoint() : undefined,
      bucketName: getR2BucketName(),
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    features: {
      containers: !!(
        getCloudflareAccountId() &&
        hasCloudflareAuth() &&
        process.env.R2_ACCESS_KEY_ID
      ),
      stripe: !!(
        process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET
      ),
      blob: !!process.env.BLOB_READ_WRITE_TOKEN,
      ai: !!(process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY),
    },
  };
}
