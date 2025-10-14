import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { artifactsService } from "@/lib/services";
import { nanoid } from "nanoid";
import { 
  createArtifactUploadCredentials, 
  createArtifactDownloadCredentials,
  generatePresignedUrl 
} from "@/lib/services/r2-credentials";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";

export const dynamic = "force-dynamic";

const R2_BUCKET = process.env.R2_BUCKET_NAME || "eliza-artifacts";
const R2_ENDPOINT = process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

/**
 * POST /api/v1/artifacts/upload
 * Request a presigned URL for uploading an artifact
 * Rate limited: 10 requests per minute
 */
async function handleArtifactUpload(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKey(request);
    const body = await request.json();

    // Validate request
    const { projectId, version, checksum, size, metadata } = body;

    if (!projectId || !version || !checksum || !size) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: projectId, version, checksum, size",
        },
        { status: 400 }
      );
    }

    // Check size limit (500MB)
    const MAX_SIZE = 500 * 1024 * 1024;
    if (size > MAX_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: `Artifact size exceeds limit of ${MAX_SIZE / 1024 / 1024}MB`,
        },
        { status: 400 }
      );
    }

    // Generate unique artifact ID
    const artifactId = nanoid();
    
    // Create R2 key
    const r2Key = `artifacts/${user.organization_id}/${projectId}/${version}/${artifactId}.tar.gz`;

    // CRITICAL: Generate credentials and presigned URLs BEFORE database insert
    // This prevents orphaned DB records if any generation step fails
    let uploadCredentials;
    let downloadCredentials;
    let uploadPresignedUrl;
    let downloadPresignedUrl;

    try {
      // Generate both credentials in parallel (independent operations)
      [uploadCredentials, downloadCredentials] = await Promise.all([
        createArtifactUploadCredentials({
          organizationId: user.organization_id,
          projectId,
          version,
          artifactId,
          ttlSeconds: 600, // 10 minutes (write-only)
        }),
        createArtifactDownloadCredentials({
          organizationId: user.organization_id,
          projectId,
          version,
          artifactId,
          ttlSeconds: 3600, // 1 hour (read-only, for containers)
        }),
      ]);
    } catch (credError) {
      const errorMsg = credError instanceof Error ? credError.message : "Unknown error";
      throw new Error(`Failed to create R2 credentials: ${errorMsg}`);
    }

    try {
      // Generate presigned URLs for direct upload/download
      const bucketName = R2_BUCKET;
      [uploadPresignedUrl, downloadPresignedUrl] = await Promise.all([
        generatePresignedUrl(uploadCredentials, {
          bucket: bucketName,
          key: r2Key,
          method: "PUT",
          expiresIn: 600,
          contentType: "application/gzip",
        }),
        generatePresignedUrl(downloadCredentials, {
          bucket: bucketName,
          key: r2Key,
          method: "GET",
          expiresIn: 3600,
        }),
      ]);
    } catch (urlError) {
      const errorMsg = urlError instanceof Error ? urlError.message : "Unknown error";
      throw new Error(`Failed to generate presigned URLs: ${errorMsg}`);
    }

    // Only insert into database after ALL prerequisites are successfully generated
    // This prevents orphaned database records
    await artifactsService.create({
      id: artifactId,
      organization_id: user.organization_id,
      project_id: projectId,
      version,
      checksum,
      size,
      r2_key: r2Key,
      r2_url: `https://${process.env.R2_PUBLIC_DOMAIN || process.env.R2_ACCOUNT_ID + '.r2.cloudflarestorage.com'}/${R2_BUCKET}/${r2Key}`,
      metadata: metadata || {},
      created_by: user.id,
      created_at: new Date(),
    });

    // Return presigned URLs only - CLI uses these directly without AWS signing
    // SECURITY: Raw credentials are NOT returned to reduce attack surface
    return NextResponse.json({
      success: true,
      data: {
        artifactId,
        // Presigned upload URL (valid for 10 minutes)
        upload: {
          url: uploadPresignedUrl,
          method: "PUT",
          expiresAt: uploadCredentials.expiresAt,
        },
        // Presigned download URL (valid for 1 hour, for container bootstrapping)
        download: {
          url: downloadPresignedUrl,
          method: "GET",
          expiresAt: downloadCredentials.expiresAt,
        },
        // Artifact metadata
        artifact: {
          id: artifactId,
          version,
          checksum,
          size,
          r2Key,
          r2Url: `${R2_ENDPOINT}/${R2_BUCKET}/${r2Key}`,
        },
      },
    });
  } catch (error) {
    console.error("Error creating artifact upload:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create artifact upload",
      },
      { status: 500 }
    );
  }
}

// Export rate-limited handler
export const POST = withRateLimit(handleArtifactUpload, RateLimitPresets.STRICT);
