#!/usr/bin/env tsx
/**
 * Backfill Secret Requirements
 *
 * Extracts and saves secret requirements for all existing workflows
 * that don't have requirements stored in the database.
 *
 * Usage:
 *   # Using .env.local database
 *   bunx tsx scripts/backfill-secret-requirements.ts
 *
 *   # Dry run (preview only, no changes)
 *   bunx tsx scripts/backfill-secret-requirements.ts --dry-run
 *
 *   # With custom database URL
 *   DATABASE_URL="postgres://..." bunx tsx scripts/backfill-secret-requirements.ts
 *
 *   # Process specific workflow
 *   bunx tsx scripts/backfill-secret-requirements.ts --workflow-id <uuid>
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables
config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

import { db } from "../db/client";
import { generatedWorkflows } from "../db/schemas/generated-workflows";
import { workflowSecretRequirements } from "../db/schemas/workflow-secret-requirements";
import { eq, sql, notInArray } from "drizzle-orm";
import { secretDependencyExtractor } from "../lib/services/workflow-engine/secret-dependency-extractor";

// Parse CLI arguments
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isVerbose = args.includes("--verbose") || args.includes("-v");
const workflowIdArgIndex = args.indexOf("--workflow-id");
const specificWorkflowId =
  workflowIdArgIndex !== -1 ? args[workflowIdArgIndex + 1] : undefined;

interface BackfillResult {
  workflowId: string;
  name: string;
  requirementsCount: number;
  providers: string[];
  status: "updated" | "skipped" | "error";
  error?: string;
}

/**
 * Get workflow IDs that already have requirements
 */
async function getWorkflowsWithRequirements(): Promise<Set<string>> {
  console.log("📋 Fetching workflows that already have requirements...");

  const results = await db
    .selectDistinct({ workflow_id: workflowSecretRequirements.workflow_id })
    .from(workflowSecretRequirements);

  const ids = new Set(results.map((r) => r.workflow_id));
  console.log(`   Found ${ids.size} workflows with existing requirements\n`);
  return ids;
}

/**
 * Get workflows that need backfilling
 */
async function getWorkflowsToBackfill(
  existingRequirementIds: Set<string>,
): Promise<
  Array<{
    id: string;
    name: string;
    execution_plan: Array<{
      step: number;
      serviceId: string;
      operation: string;
    }>;
  }>
> {
  console.log("🔍 Finding workflows that need secret requirements...");

  let query = db
    .select({
      id: generatedWorkflows.id,
      name: generatedWorkflows.name,
      execution_plan: generatedWorkflows.execution_plan,
    })
    .from(generatedWorkflows);

  // If specific workflow requested, only get that one
  if (specificWorkflowId) {
    const workflows = await query
      .where(eq(generatedWorkflows.id, specificWorkflowId))
      .limit(1);
    console.log(`   Targeting specific workflow: ${specificWorkflowId}\n`);
    return workflows;
  }

  // Otherwise get all workflows that don't have requirements yet
  if (existingRequirementIds.size > 0) {
    const workflows = await query.where(
      notInArray(generatedWorkflows.id, Array.from(existingRequirementIds)),
    );
    console.log(
      `   Found ${workflows.length} workflows needing requirements\n`,
    );
    return workflows;
  }

  const workflows = await query;
  console.log(`   Found ${workflows.length} workflows to process\n`);
  return workflows;
}

/**
 * Main backfill function
 */
async function backfillSecretRequirements(): Promise<void> {
  console.log("=".repeat(70));
  console.log("🔐 Workflow Secret Requirements Backfill Script");
  console.log("=".repeat(70));

  if (isDryRun) {
    console.log("⚠️  DRY RUN MODE - No changes will be made\n");
  }

  if (process.env.DATABASE_URL) {
    // Mask the connection string for security
    const masked = process.env.DATABASE_URL.replace(/\/\/[^@]+@/, "//*****@");
    console.log(`📊 Database: ${masked}\n`);
  }

  try {
    // Get workflows that already have requirements
    const existingRequirementIds = await getWorkflowsWithRequirements();

    // Get workflows to process
    const workflows = await getWorkflowsToBackfill(existingRequirementIds);

    if (workflows.length === 0) {
      console.log(
        "✅ All workflows already have secret requirements. Nothing to do!\n",
      );
      return;
    }

    const results: BackfillResult[] = [];
    const batchSize = 50;
    let processed = 0;

    console.log("🔄 Processing workflows...\n");

    for (const workflow of workflows) {
      try {
        // Skip workflows without execution plans
        if (
          !workflow.execution_plan ||
          !Array.isArray(workflow.execution_plan) ||
          workflow.execution_plan.length === 0
        ) {
          if (isVerbose) {
            console.log(`   ⏭️  "${workflow.name}": No execution plan, skipping`);
          }
          results.push({
            workflowId: workflow.id,
            name: workflow.name,
            requirementsCount: 0,
            providers: [],
            status: "skipped",
          });
          continue;
        }

        // Extract requirements
        const requirements = secretDependencyExtractor.extractFromPlan(
          workflow.execution_plan,
        );

        if (requirements.length === 0) {
          if (isVerbose) {
            console.log(
              `   ⏭️  "${workflow.name}": No requirements extracted, skipping`,
            );
          }
          results.push({
            workflowId: workflow.id,
            name: workflow.name,
            requirementsCount: 0,
            providers: [],
            status: "skipped",
          });
          continue;
        }

        const providers = [...new Set(requirements.map((r) => r.provider))];

        if (isVerbose || isDryRun) {
          console.log(
            `   📝 "${workflow.name}": ${requirements.length} requirements (${providers.join(", ")})`,
          );
        }

        if (!isDryRun) {
          // Save to database
          await secretDependencyExtractor.saveForWorkflow(
            workflow.id,
            requirements,
          );
        }

        results.push({
          workflowId: workflow.id,
          name: workflow.name,
          requirementsCount: requirements.length,
          providers,
          status: "updated",
        });

        processed++;

        // Log progress every batch
        if (processed % batchSize === 0) {
          console.log(`   ... processed ${processed}/${workflows.length}`);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        results.push({
          workflowId: workflow.id,
          name: workflow.name,
          requirementsCount: 0,
          providers: [],
          status: "error",
          error: errorMessage,
        });
        console.log(`   ❌ "${workflow.name}": Error - ${errorMessage}`);
      }
    }

    // Summary
    console.log("\n" + "=".repeat(70));
    console.log("📊 Backfill Summary");
    console.log("=".repeat(70));

    const updated = results.filter((r) => r.status === "updated");
    const skipped = results.filter((r) => r.status === "skipped");
    const errors = results.filter((r) => r.status === "error");

    const totalRequirements = updated.reduce(
      (sum, r) => sum + r.requirementsCount,
      0,
    );
    const allProviders = [
      ...new Set(updated.flatMap((r) => r.providers)),
    ].sort();

    console.log(
      `✅ Successfully ${isDryRun ? "would update" : "updated"}: ${updated.length} workflows`,
    );
    console.log(`⏭️  Skipped (no execution plan): ${skipped.length}`);
    console.log(`❌ Errors: ${errors.length}`);
    console.log(`📁 Total processed: ${results.length}`);
    console.log(`🔑 Total requirements: ${totalRequirements}`);
    console.log(`🔌 Providers: ${allProviders.join(", ") || "none"}`);

    if (errors.length > 0) {
      console.log("\n⚠️  Errors encountered:");
      for (const result of errors) {
        console.log(`   - "${result.name}": ${result.error}`);
      }
    }

    if (isDryRun) {
      console.log("\n💡 To apply these changes, run without --dry-run flag");
    } else if (updated.length > 0) {
      console.log("\n🎉 Backfill complete!");
    }

    console.log();
  } catch (error) {
    console.error("\n❌ Fatal error:", error);
    if (error instanceof Error) {
      console.error("Stack:", error.stack);
    }
    process.exit(1);
  }
}

// Run the script
backfillSecretRequirements()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
