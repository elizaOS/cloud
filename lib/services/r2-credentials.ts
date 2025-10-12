/**
 * Cloudflare R2 Temporary Access Credentials Service
 * Uses Cloudflare's native temp-access-credentials API for secure, scoped access
 * 
 * @see https://developers.cloudflare.com/r2/api/s3/tokens/
 */

interface R2TemporaryCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiresAt: string;
}

interface CreateR2TempCredentialsParams {
  bucketName: string;
  objectPrefix?: string;
  ttlSeconds?: number; // Time to live in seconds (default: 3600, max: 43200)
  permissions?: "read" | "write" | "readwrite";
}

/**
 * Create temporary R2 access credentials using Cloudflare's API
 * These credentials are scoped to specific buckets/objects and have a limited lifetime
 */
export async function createR2TempCredentials(
  params: CreateR2TempCredentialsParams
): Promise<R2TemporaryCredentials> {
  const {
    bucketName,
    objectPrefix = "",
    ttlSeconds = 3600,
    permissions = "read",
  } = params;

  // Validate environment variables
  const accountId = process.env.R2_ACCOUNT_ID;
  const parentAccessKeyId = process.env.R2_ACCESS_KEY_ID;
  const parentSecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !parentAccessKeyId || !parentSecretAccessKey) {
    throw new Error(
      "Missing R2 credentials. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY"
    );
  }

  // Map permissions to Cloudflare's format
  const permissionMap = {
    read: "ObjectRead",
    write: "ObjectWrite",
    readwrite: "ObjectReadWrite",
  };

  const permission = permissionMap[permissions];

  // Cloudflare R2 temp credentials API endpoint
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/temp-access-credentials`;

  try {
    // Use API token if available, otherwise fall back to email + key
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (process.env.CLOUDFLARE_API_TOKEN) {
      headers["Authorization"] = `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`;
    } else if (process.env.CLOUDFLARE_EMAIL && process.env.CLOUDFLARE_API_KEY) {
      headers["X-Auth-Email"] = process.env.CLOUDFLARE_EMAIL;
      headers["X-Auth-Key"] = process.env.CLOUDFLARE_API_KEY;
    } else {
      throw new Error(
        "Missing Cloudflare credentials. Set CLOUDFLARE_API_TOKEN or CLOUDFLARE_EMAIL + CLOUDFLARE_API_KEY"
      );
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        bucket: bucketName,
        prefix: objectPrefix,
        permission,
        ttl_seconds: ttlSeconds,
      }),
    });

    const data = await response.json() as {
      success: boolean;
      result?: {
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken: string;
      };
      errors?: Array<{ message: string }>;
    };

    if (!data.success || !data.result) {
      const errorMsg = data.errors?.map(e => e.message).join(", ") || "Unknown error";
      throw new Error(`Failed to create R2 temp credentials: ${errorMsg}`);
    }

    return {
      accessKeyId: data.result.accessKeyId,
      secretAccessKey: data.result.secretAccessKey,
      sessionToken: data.result.sessionToken,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`R2 temp credentials API error: ${error.message}`);
    }
    throw new Error("Unknown error creating R2 temp credentials");
  }
}

/**
 * Create temporary credentials for artifact upload
 * Scoped to specific artifact path with write permissions
 */
export async function createArtifactUploadCredentials(params: {
  organizationId: string;
  projectId: string;
  version: string;
  artifactId: string;
  ttlSeconds?: number;
}): Promise<R2TemporaryCredentials> {
  const { organizationId, projectId, version, artifactId, ttlSeconds = 600 } = params;

  const bucketName = process.env.R2_BUCKET_NAME || "eliza-artifacts";
  const objectPrefix = `artifacts/${organizationId}/${projectId}/${version}/${artifactId}`;

  return createR2TempCredentials({
    bucketName,
    objectPrefix,
    ttlSeconds,
    permissions: "write",
  });
}

/**
 * Create temporary credentials for artifact download
 * Scoped to specific artifact path with read-only permissions
 */
export async function createArtifactDownloadCredentials(params: {
  organizationId: string;
  projectId: string;
  version: string;
  artifactId: string;
  ttlSeconds?: number;
}): Promise<R2TemporaryCredentials> {
  const { organizationId, projectId, version, artifactId, ttlSeconds = 600 } = params;

  const bucketName = process.env.R2_BUCKET_NAME || "eliza-artifacts";
  const objectPrefix = `artifacts/${organizationId}/${projectId}/${version}/${artifactId}`;

  return createR2TempCredentials({
    bucketName,
    objectPrefix,
    ttlSeconds,
    permissions: "read",
  });
}

/**
 * Generate a presigned URL for upload using temporary credentials
 */
export function getUploadInstructions(
  credentials: R2TemporaryCredentials,
  r2Key: string
): {
  url: string;
  headers: Record<string, string>;
  method: "PUT";
} {
  const bucketName = process.env.R2_BUCKET_NAME || "eliza-artifacts";
  const accountId = process.env.R2_ACCOUNT_ID;
  const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`;

  return {
    url: `${endpoint}/${bucketName}/${r2Key}`,
    method: "PUT",
    headers: {
      "Content-Type": "application/gzip",
      "X-Amz-Security-Token": credentials.sessionToken,
      // Client must add AWS Signature V4 headers using the credentials
    },
  };
}

