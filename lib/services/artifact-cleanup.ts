/**
 * Artifact Cleanup and Retention Service
 * Manages lifecycle of artifacts in R2 storage
 */

import { db } from "@/db/drizzle";
import { artifacts } from "@/db/sass/schema";
import { and, eq, desc } from "drizzle-orm";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

export interface ArtifactRetentionPolicy {
  maxVersionsPerProject: number; // Keep N most recent versions
  maxAgeInDays: number; // Delete artifacts older than N days
  minVersionsToKeep: number; // Always keep at least N versions
}

const DEFAULT_POLICY: ArtifactRetentionPolicy = {
  maxVersionsPerProject: 10,
  maxAgeInDays: 90,
  minVersionsToKeep: 3,
};

/**
 * Initialize S3 client for R2 operations
 */
function getR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 credentials not configured. Cannot perform cleanup operations."
    );
  }

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

/**
 * Delete artifact from R2 storage
 */
export async function deleteArtifactFromR2(r2Key: string): Promise<boolean> {
  try {
    const client = getR2Client();
    const bucketName = process.env.R2_BUCKET_NAME || "eliza-artifacts";

    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: r2Key,
    });

    await client.send(command);
    console.log("Artifact deleted from R2", { r2Key });
    return true;
  } catch (error) {
    console.error(
      "Failed to delete artifact from R2",
      error instanceof Error ? error.message : String(error),
      { r2Key }
    );
    return false;
  }
}

/**
 * Clean up old artifacts for a specific project
 */
export async function cleanupProjectArtifacts(
  organizationId: string,
  projectId: string,
  policy: Partial<ArtifactRetentionPolicy> = {}
): Promise<{ deleted: number; errors: number }> {
  const finalPolicy = { ...DEFAULT_POLICY, ...policy };
  let deleted = 0;
  let errors = 0;

  try {
    console.log("Starting artifact cleanup", {
      organizationId,
      projectId,
      policy: finalPolicy,
    });

    // Get all artifacts for this project, ordered by creation date (newest first)
    const allArtifacts = await db
      .select()
      .from(artifacts)
      .where(
        and(
          eq(artifacts.organization_id, organizationId),
          eq(artifacts.project_id, projectId)
        )
      )
      .orderBy(desc(artifacts.created_at));

    console.log(`Found ${allArtifacts.length} artifacts for project`, {
      projectId,
    });

    // Keep track of which artifacts to delete
    const artifactsToDelete: typeof allArtifacts = [];

    // Strategy 1: Keep only N most recent versions
    if (allArtifacts.length > finalPolicy.maxVersionsPerProject) {
      const excess = allArtifacts.slice(finalPolicy.maxVersionsPerProject);
      artifactsToDelete.push(...excess);
    }

    // Strategy 2: Delete artifacts older than N days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - finalPolicy.maxAgeInDays);

    for (const artifact of allArtifacts) {
      const createdAt = new Date(artifact.created_at);
      if (
        createdAt < cutoffDate &&
        !artifactsToDelete.find((a) => a.id === artifact.id)
      ) {
        // Only add if not already in delete list
        artifactsToDelete.push(artifact);
      }
    }

    // Safety check: Never delete all artifacts, keep minimum versions
    const remainingCount = allArtifacts.length - artifactsToDelete.length;
    if (remainingCount < finalPolicy.minVersionsToKeep) {
      const toRemoveFromDeletion =
        finalPolicy.minVersionsToKeep - remainingCount;
      artifactsToDelete.splice(0, toRemoveFromDeletion);
      console.warn("Retention policy prevented deletion of minimum versions", {
        minVersionsToKeep: finalPolicy.minVersionsToKeep,
        adjusted: toRemoveFromDeletion,
      });
    }

    // Delete artifacts - but skip those in use by running containers
    for (const artifact of artifactsToDelete) {
      try {
        // Safety check: Don't delete artifacts in use by running containers
        const { containers } = await import("@/db/sass/schema");
        const { sql } = await import("drizzle-orm");
        
        const containersUsingArtifact = await db
          .select({ id: containers.id, name: containers.name, status: containers.status })
          .from(containers)
          .where(
            and(
              eq(containers.organization_id, organizationId),
              sql`${containers.metadata}->>'artifact_url' = ${artifact.r2_url}`,
              // Only check non-terminal states
              sql`${containers.status} NOT IN ('failed', 'deleted', 'deleting')`,
            )
          );

        if (containersUsingArtifact.length > 0) {
          console.warn("Skipping artifact deletion - in use by containers", {
            artifactId: artifact.id,
            version: artifact.version,
            containersUsing: containersUsingArtifact.map(c => ({ id: c.id, name: c.name, status: c.status })),
          });
          continue; // Skip this artifact
        }

        // Safe to delete - artifact is not in use
        const r2Success = await deleteArtifactFromR2(artifact.r2_key);
        
        if (r2Success) {
          // Delete from database
          await db.delete(artifacts).where(eq(artifacts.id, artifact.id));
          deleted++;
          console.log("Artifact cleaned up", {
            artifactId: artifact.id,
            version: artifact.version,
            size: artifact.size,
          });
        } else {
          errors++;
        }
      } catch (error) {
        errors++;
        console.error(
          "Failed to delete artifact",
          error instanceof Error ? error.message : String(error),
          { artifactId: artifact.id }
        );
      }
    }

    console.log("Artifact cleanup completed", {
      organizationId,
      projectId,
      deleted,
      errors,
      remaining: allArtifacts.length - deleted,
    });

    return { deleted, errors };
  } catch (error) {
    console.error(
      "Artifact cleanup failed",
      error instanceof Error ? error.message : String(error),
      { organizationId, projectId }
    );
    throw error;
  }
}

/**
 * Clean up all old artifacts across all organizations
 * Run this periodically via cron
 */
export async function cleanupAllArtifacts(
  policy: Partial<ArtifactRetentionPolicy> = {}
): Promise<{ totalDeleted: number; totalErrors: number }> {
  try {
    console.log("Starting global artifact cleanup");

    // Get unique organization/project combinations
    const projectGroups = await db
      .selectDistinct({
        organizationId: artifacts.organization_id,
        projectId: artifacts.project_id,
      })
      .from(artifacts);

    console.log(`Found ${projectGroups.length} project(s) with artifacts`);

    let totalDeleted = 0;
    let totalErrors = 0;

    // Clean up each project
    for (const group of projectGroups) {
      const result = await cleanupProjectArtifacts(
        group.organizationId,
        group.projectId,
        policy
      );
      totalDeleted += result.deleted;
      totalErrors += result.errors;
    }

    console.log("Global artifact cleanup completed", {
      totalDeleted,
      totalErrors,
    });

    return { totalDeleted, totalErrors };
  } catch (error) {
    console.error(
      "Global artifact cleanup failed",
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}

/**
 * Get artifact statistics for an organization
 */
export async function getArtifactStats(organizationId: string): Promise<{
  totalArtifacts: number;
  totalSizeBytes: number;
  projectCount: number;
  oldestArtifact?: Date;
  newestArtifact?: Date;
}> {
  const orgArtifacts = await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.organization_id, organizationId));

  const totalSizeBytes = orgArtifacts.reduce(
    (sum, artifact) => sum + artifact.size,
    0
  );

  const uniqueProjects = new Set(orgArtifacts.map((a) => a.project_id));

  const dates = orgArtifacts
    .map((a) => new Date(a.created_at))
    .sort((a, b) => a.getTime() - b.getTime());

  return {
    totalArtifacts: orgArtifacts.length,
    totalSizeBytes,
    projectCount: uniqueProjects.size,
    oldestArtifact: dates[0],
    newestArtifact: dates[dates.length - 1],
  };
}

