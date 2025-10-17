/**
 * Cleanup Orphaned CloudFormation Stacks
 * 
 * Run this script periodically (e.g., daily via cron) to:
 * 1. Find CloudFormation stacks that don't have corresponding containers in DB
 * 2. Delete orphaned stacks
 * 3. Clean up expired ALB priorities
 * 
 * Usage:
 *   bun run scripts/cleanup-orphaned-stacks.ts [--dry-run]
 */

import {
  CloudFormationClient,
  ListStacksCommand,
  DeleteStackCommand,
  type StackSummary,
} from "@aws-sdk/client-cloudformation";
import { db } from "@/db/client";
import { containers } from "@/db/schemas/containers";
import { inArray } from "drizzle-orm";
import { dbPriorityManager } from "@/lib/services/alb-priority-manager";

const DRY_RUN = process.argv.includes("--dry-run");
const REGION = process.env.AWS_REGION || "us-east-1";

async function cleanupOrphanedStacks() {
  console.log(`🧹 Starting orphaned stack cleanup (region: ${REGION})`);
  if (DRY_RUN) {
    console.log("🔍 DRY RUN MODE - No changes will be made");
  }
  console.log("");

  const cfClient = new CloudFormationClient({ region: REGION });

  // Step 1: Get all ElizaOS user stacks from CloudFormation
  console.log("📋 Fetching CloudFormation stacks...");
  const listCommand = new ListStacksCommand({
    StackStatusFilter: [
      "CREATE_COMPLETE",
      "UPDATE_COMPLETE",
      "CREATE_IN_PROGRESS",
      "UPDATE_IN_PROGRESS",
    ],
  });

  const { StackSummaries } = await cfClient.send(listCommand);
  const userStacks =
    StackSummaries?.filter((s) => s.StackName?.startsWith("elizaos-user-")) ||
    [];

  console.log(`Found ${userStacks.length} ElizaOS user stacks`);
  console.log("");

  // Step 2: Get all active containers from database
  console.log("💾 Fetching active containers from database...");
  const activeContainers = await db
    .select({ id: containers.id, status: containers.status })
    .from(containers)
    .where(
      inArray(containers.status, [
        "running",
        "deploying",
        "building",
        "pending",
      ])
    );

  const activeContainerIds = new Set(activeContainers.map((c) => c.id));
  console.log(`Found ${activeContainerIds.size} active containers`);
  console.log("");

  // Step 3: Find orphaned stacks
  const orphanedStacks: StackSummary[] = [];
  for (const stack of userStacks) {
    const userId = stack.StackName!.replace("elizaos-user-", "");
    if (!activeContainerIds.has(userId)) {
      orphanedStacks.push(stack);
    }
  }

  console.log(`🔍 Found ${orphanedStacks.length} orphaned stacks:`);
  for (const stack of orphanedStacks) {
    console.log(
      `  - ${stack.StackName} (${stack.StackStatus}, created: ${stack.CreationTime?.toISOString()})`
    );
  }
  console.log("");

  // Step 4: Delete orphaned stacks
  if (orphanedStacks.length > 0) {
    if (DRY_RUN) {
      console.log("🔍 DRY RUN: Would delete the above stacks");
    } else {
      console.log("🗑️  Deleting orphaned stacks...");
      let deleted = 0;
      let failed = 0;

      for (const stack of orphanedStacks) {
        try {
          const deleteCommand = new DeleteStackCommand({
            StackName: stack.StackName,
          });
          await cfClient.send(deleteCommand);
          console.log(`✅ Deleted: ${stack.StackName}`);
          deleted++;

          // Wait a bit between deletions to avoid throttling
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`❌ Failed to delete ${stack.StackName}:`, error);
          failed++;
        }
      }

      console.log("");
      console.log(`✅ Deleted ${deleted} stacks`);
      if (failed > 0) {
        console.log(`❌ Failed to delete ${failed} stacks`);
      }
    }
  } else {
    console.log("✅ No orphaned stacks found");
  }

  // Step 5: Cleanup expired ALB priorities
  console.log("");
  console.log("🧹 Cleaning up expired ALB priorities...");

  if (DRY_RUN) {
    // In dry run, just count how many would be deleted
    const { db: dbClient } = await import("@/db/client");
    const { albPriorities } = await import("@/db/schemas/alb-priorities");
    const { lt, and, isNotNull } = await import("drizzle-orm");

    const expiredPriorities = await dbClient.query.albPriorities.findMany({
      where: and(
        isNotNull(albPriorities.expiresAt),
        lt(albPriorities.expiresAt, new Date())
      ),
    });

    console.log(
      `🔍 DRY RUN: Would delete ${expiredPriorities.length} expired priorities`
    );
  } else {
    const deletedPriorities =
      await dbPriorityManager.cleanupExpiredPriorities();
    console.log(`✅ Cleaned up ${deletedPriorities} expired ALB priorities`);
  }

  console.log("");
  console.log("✅ Cleanup complete!");
}

// Run cleanup
cleanupOrphanedStacks().catch((error) => {
  console.error("❌ Cleanup failed:", error);
  process.exit(1);
});

