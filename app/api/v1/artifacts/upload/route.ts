import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { db } from "@/db/drizzle";
import { artifacts } from "@/db/sass/schema";
import { nanoid } from "nanoid";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const dynamic = "force-dynamic";

// Validate R2 configuration
if (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
  console.error("R2 credentials not configured");
}

// Initialize R2 client (S3-compatible)
const r2Client = process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY
  ? new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    })
  : null;

const R2_BUCKET = process.env.R2_BUCKET_NAME || "eliza-artifacts";

/**
 * POST /api/v1/artifacts/upload
 * Request a presigned URL for uploading an artifact
 */
export async function POST(request: NextRequest) {
  try {
    // Check R2 configuration
    if (!r2Client) {
      return NextResponse.json(
        {
          success: false,
          error: "R2 storage not configured. Please contact support.",
        },
        { status: 503 }
      );
    }

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

    // Generate presigned URL for upload (valid for 10 minutes)
    const putCommand = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: r2Key,
      ContentType: "application/gzip",
      Metadata: {
        organizationId: user.organization_id,
        projectId,
        version,
        checksum,
        userId: user.id,
        ...metadata,
      },
    });

    const uploadUrl = await getSignedUrl(r2Client, putCommand, { expiresIn: 600 });

    // Store artifact metadata in database
    await db.insert(artifacts).values({
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

    // Generate one-time scoped token for container to download artifact
    // This would typically use Cloudflare API to create a temporary token
    // For now, we'll use a signed URL approach
    const artifactUrl = `https://${process.env.R2_PUBLIC_DOMAIN || 'artifacts.elizacloud.ai'}/${r2Key}`;

    // Create a temporary access token (in production, this would be a CF API token)
    const tempToken = nanoid(32);

    // Store the temp token in cache/database with expiry
    // For now, we'll include it in the response

    return NextResponse.json({
      success: true,
      data: {
        artifactId,
        uploadUrl,
        artifactUrl,
        token: tempToken,
        expiresAt: new Date(Date.now() + 600 * 1000).toISOString(),
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
