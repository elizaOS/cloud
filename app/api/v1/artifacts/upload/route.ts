import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { db } from "@/db/drizzle";
import { artifacts } from "@/db/sass/schema";
import { nanoid } from "nanoid";
import { createArtifactUploadCredentials, createArtifactDownloadCredentials } from "@/lib/services/r2-credentials";

export const dynamic = "force-dynamic";

const R2_BUCKET = process.env.R2_BUCKET_NAME || "eliza-artifacts";

/**
 * POST /api/v1/artifacts/upload
 * Request a presigned URL for uploading an artifact
 */
export async function POST(request: NextRequest) {
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

    // Store artifact metadata in database FIRST
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

    // Generate Cloudflare temporary credentials for UPLOAD (scoped, write-only)
    const uploadCredentials = await createArtifactUploadCredentials({
      organizationId: user.organization_id,
      projectId,
      version,
      artifactId,
      ttlSeconds: 600, // 10 minutes
    });

    // Generate Cloudflare temporary credentials for DOWNLOAD (scoped, read-only)
    const downloadCredentials = await createArtifactDownloadCredentials({
      organizationId: user.organization_id,
      projectId,
      version,
      artifactId,
      ttlSeconds: 3600, // 1 hour (containers may take time to start)
    });

    // Construct R2 URLs
    const accountId = process.env.R2_ACCOUNT_ID;
    const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`;
    const uploadUrl = `${endpoint}/${R2_BUCKET}/${r2Key}`;

    return NextResponse.json({
      success: true,
      data: {
        artifactId,
        // Upload credentials and URL
        upload: {
          url: uploadUrl,
          method: "PUT",
          accessKeyId: uploadCredentials.accessKeyId,
          secretAccessKey: uploadCredentials.secretAccessKey,
          sessionToken: uploadCredentials.sessionToken,
          expiresAt: uploadCredentials.expiresAt,
        },
        // Download credentials (for container bootstrapping)
        download: {
          url: uploadUrl, // Same URL, different credentials
          method: "GET",
          accessKeyId: downloadCredentials.accessKeyId,
          secretAccessKey: downloadCredentials.secretAccessKey,
          sessionToken: downloadCredentials.sessionToken,
          expiresAt: downloadCredentials.expiresAt,
        },
        // Artifact metadata
        artifact: {
          id: artifactId,
          version,
          checksum,
          size,
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
