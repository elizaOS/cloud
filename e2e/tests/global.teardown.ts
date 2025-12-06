import { test as teardown } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * Global Teardown
 *
 * Runs after all tests complete to clean up resources.
 */

teardown("cleanup test artifacts", async () => {
  console.log("[Teardown] Cleaning up test artifacts...");

  // Clean up any temporary files created during tests
  const tempDir = path.join(__dirname, "..", ".temp");
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  // Note: Synpress wallet cache is preserved between runs for performance
  // To force rebuild, run: npx synpress --force

  console.log("[Teardown] Cleanup complete");
});
