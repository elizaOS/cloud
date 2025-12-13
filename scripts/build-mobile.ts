#!/usr/bin/env bun
/**
 * Build script for mobile (Tauri) static export
 *
 * This script builds the Next.js app as a static export for Tauri mobile apps.
 * It sets the appropriate environment variables and outputs to the `out/` directory.
 */

import { $ } from "bun";

async function main() {
  console.log("🏗️  Building static frontend for mobile...\n");

  // Set environment for mobile build
  const env = {
    ...process.env,
    TAURI_BUILD: "true",
    NEXT_PUBLIC_IS_MOBILE_APP: "true",
    NEXT_PUBLIC_IS_TAURI: "true",
  };

  // Run Next.js build with static export
  // The next.config.ts should detect TAURI_BUILD and enable static export
  const result = await $`next build`.env(env).nothrow();

  if (result.exitCode !== 0) {
    console.error("❌ Build failed");
    process.exit(1);
  }

  console.log("\n✅ Mobile build complete! Output in out/");
}

main();

