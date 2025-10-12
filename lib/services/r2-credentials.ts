/**
 * Cloudflare R2 Temporary Access Credentials Service
 * Uses Cloudflare's native temp-access-credentials API for secure, scoped access
 * Implements proper AWS SigV4 signing for R2 operations
 * 
 * @see https://developers.cloudflare.com/r2/api/s3/tokens/
 */

interface R2TemporaryCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiresAt: string;
}

interface PresignedUrlOptions {
  bucket: string;
  key: string;
  expiresIn?: number; // seconds, default 3600
  method?: "GET" | "PUT";
  contentType?: string;
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

  // Import consolidation helper
  const { getCloudflareAccountId, getCloudflareAuthHeaders } = await import("@/lib/config/env-consolidation");

  // Validate environment variables
  const accountId = getCloudflareAccountId();
  const parentAccessKeyId = process.env.R2_ACCESS_KEY_ID;
  const parentSecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !parentAccessKeyId || !parentSecretAccessKey) {
    throw new Error(
      "Missing R2 credentials. Set CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY"
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
    // Use consolidated auth headers
    const authHeaders = getCloudflareAuthHeaders();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...authHeaders,
    };

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
 * Generate a presigned URL for R2 operations using AWS SigV4
 * This creates a URL that can be used directly without additional signing
 */
export async function generatePresignedUrl(
  credentials: R2TemporaryCredentials,
  options: PresignedUrlOptions
): Promise<string> {
  const { bucket, key, expiresIn = 3600, method = "GET", contentType } = options;
  
  const accountId = process.env.R2_ACCOUNT_ID;
  if (!accountId) {
    throw new Error("R2_ACCOUNT_ID is required");
  }

  const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`;
  const region = "auto"; // R2 uses 'auto' as region

  // Use AWS SDK S3 client for presigned URL generation
  const { S3Client, GetObjectCommand, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");

  const s3Client = new S3Client({
    region,
    endpoint,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  try {
    const command =
      method === "PUT"
        ? new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            ContentType: contentType || "application/gzip",
          })
        : new GetObjectCommand({
            Bucket: bucket,
            Key: key,
          });

    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn,
    });

    return presignedUrl;
  } catch (error) {
    throw new Error(
      `Failed to generate presigned URL: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Generate upload instructions with presigned URL
 * Deprecated: Use generatePresignedUrl directly
 */
export async function getUploadInstructions(
  credentials: R2TemporaryCredentials,
  r2Key: string
): Promise<{
  url: string;
  headers: Record<string, string>;
  method: "PUT";
}> {
  const bucketName = process.env.R2_BUCKET_NAME || "eliza-artifacts";
  
  const presignedUrl = await generatePresignedUrl(credentials, {
    bucket: bucketName,
    key: r2Key,
    method: "PUT",
    expiresIn: 600, // 10 minutes for upload
  });

  return {
    url: presignedUrl,
    method: "PUT",
    headers: {
      "Content-Type": "application/gzip",
    },
  };
}

