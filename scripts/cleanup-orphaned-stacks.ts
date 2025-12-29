/**
 * Cleanup Orphaned DWS Containers
 *
 * Run this script periodically (e.g., daily via cron) to:
 * 1. Find DWS containers that don't have corresponding entries in DB
 * 2. Delete orphaned containers
 * 3. Clean up expired resources
 *
 * Usage:
 *   bun run scripts/cleanup-orphaned-stacks.ts [--dry-run]
 */

import { db } from "@/db/client";
import { containers } from "@/db/schemas/containers";
import { inArray, isNotNull, lt, and } from "drizzle-orm";
import { dwsContainerService } from "@/lib/services/dws/containers";
import { logger } from "@/lib/utils/logger";

const DRY_RUN = process.argv.includes("--dry-run");

async function cleanupOrphanedContainers() {
  console.log("🧹 Starting orphaned container cleanup");
  if (DRY_RUN) {
    console.log("🔍 DRY RUN MODE - No changes will be made");
  }
  console.log("");

  // Step 1: Get all active DWS containers
  console.log("📋 Fetching DWS containers...");
  
  let dwsContainerIds: string[] = [];
  try {
    const dwsContainers = await dwsContainerService.listContainers({
      status: ["running", "pending", "deploying"],
    });
    dwsContainerIds = dwsContainers.map(c => c.id);
  } catch (error) {
    logger.warn("Could not fetch DWS containers, skipping remote cleanup", { error });
  }

  console.log(`Found ${dwsContainerIds.length} DWS containers`);
  console.log("");

  // Step 2: Get all active containers from database
  console.log("💾 Fetching active containers from database...");
  const activeContainers = await db
    .select({ 
      id: containers.id, 
      status: containers.status,
      dws_container_id: containers.dws_container_id,
    })
    .from(containers)
    .where(
      inArray(containers.status, [
        "running",
        "deploying",
        "building",
        "pending",
      ]),
    );

  const activeContainerIds = new Set(activeContainers.map((c) => c.id));
  const activeDbDwsIds = new Set(
    activeContainers
      .filter(c => c.dws_container_id)
      .map(c => c.dws_container_id!)
  );
  
  console.log(`Found ${activeContainerIds.size} active containers`);
  console.log("");

  // Step 3: Find orphaned DWS containers (not in DB)
  const orphanedDwsContainers = dwsContainerIds.filter(id => !activeDbDwsIds.has(id));

  console.log(`🔍 Found ${orphanedDwsContainers.length} orphaned DWS containers:`);
  for (const id of orphanedDwsContainers) {
    console.log(`  - ${id}`);
  }
  console.log("");

  // Step 4: Delete orphaned DWS containers
  if (orphanedDwsContainers.length > 0) {
    if (DRY_RUN) {
      console.log("🔍 DRY RUN: Would delete the above containers");
    } else {
      console.log("🗑️  Deleting orphaned containers...");
      let deleted = 0;
      let failed = 0;

      for (const containerId of orphanedDwsContainers) {
        try {
          await dwsContainerService.deleteContainer(containerId);
          console.log(`✅ Deleted: ${containerId}`);
          deleted++;
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`❌ Failed to delete ${containerId}:`, error);
          failed++;
        }
      }

      console.log("");
      console.log(`✅ Deleted ${deleted} containers`);
      if (failed > 0) {
        console.log(`❌ Failed to delete ${failed} containers`);
      }
    }
  } else {
    console.log("✅ No orphaned containers found");
  }

  // Step 5: Cleanup stale DB entries (containers with no DWS container and stopped)
  console.log("");
  console.log("🧹 Cleaning up stale database entries...");
  
  const staleContainers = await db
    .select({ id: containers.id, name: containers.name })
    .from(containers)
    .where(
      and(
        inArray(containers.status, ["stopped", "deleted", "error"]),
        lt(containers.updated_at, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) // 7 days old
      )
    );

  if (staleContainers.length > 0) {
    if (DRY_RUN) {
      console.log(`🔍 DRY RUN: Would clean up ${staleContainers.length} stale entries`);
      for (const c of staleContainers) {
        console.log(`  - ${c.name} (${c.id})`);
      }
    } else {
      console.log(`Cleaning up ${staleContainers.length} stale entries...`);
      // Mark as archived instead of deleting
      for (const c of staleContainers) {
        await db
          .update(containers)
          .set({ status: "archived", updated_at: new Date() })
          .where(inArray(containers.id, [c.id]));
      }
      console.log(`✅ Archived ${staleContainers.length} stale entries`);
    }
  } else {
    console.log("✅ No stale entries found");
  }

  console.log("");
  console.log("✅ Cleanup complete");
}

// Run cleanup
cleanupOrphanedContainers().catch((error) => {
  console.error("❌ Cleanup failed:", error);
  process.exit(1);
});
