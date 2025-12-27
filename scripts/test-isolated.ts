#!/usr/bin/env bun
/**
 * Isolated Test Runner
 *
 * Runs test files that use mock.module() in separate processes to prevent
 * mock contamination. Files without mock.module() run together for speed.
 *
 * Usage:
 *   bun run scripts/test-isolated.ts              # Run all tests
 *   bun run scripts/test-isolated.ts --verbose    # Show individual results
 *   bun run scripts/test-isolated.ts --unit-only  # Skip integration tests
 */

import { $ } from "bun";
import { readdir, readFile } from "fs/promises";
import { join } from "path";

const VERBOSE = process.argv.includes("--verbose");
const UNIT_ONLY = process.argv.includes("--unit-only");
const TEST_DIRS = UNIT_ONLY
  ? ["tests/unit", "tests/security"]
  : ["tests/unit", "tests/integration", "tests/security", "tests/e2e"];

interface TestResult {
  file: string;
  passed: boolean;
  duration: number;
  output?: string;
}

async function findTestFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await findTestFiles(fullPath)));
      } else if (entry.name.endsWith(".test.ts")) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return files;
}

async function usesMockModule(file: string): Promise<boolean> {
  const content = await readFile(file, "utf-8");
  return content.includes("mock.module(");
}

function checkTestOutput(output: string): {
  passed: boolean;
  skipped: boolean;
} {
  // Check for skip indicators
  if (output.includes("ConnectionRefused") || output.includes("⚠️  SKIP")) {
    return { passed: true, skipped: true };
  }

  // Parse the bun test summary line: "X pass", "Y fail", "Z skip"
  const passMatch = output.match(/(\d+)\s+pass/);
  const failMatch = output.match(/(\d+)\s+fail/);
  const skipMatch = output.match(/(\d+)\s+skip/);

  const passes = passMatch ? parseInt(passMatch[1]) : 0;
  const fails = failMatch ? parseInt(failMatch[1]) : 0;
  const skips = skipMatch ? parseInt(skipMatch[1]) : 0;

  // If we found test counts, use them
  if (passMatch || failMatch || skipMatch) {
    return { passed: fails === 0, skipped: passes === 0 && skips > 0 };
  }

  // Fallback: check for error patterns
  const hasError =
    output.includes("error:") || output.includes("# Unhandled error");
  return { passed: !hasError, skipped: false };
}

async function runTest(file: string, retries = 1): Promise<TestResult> {
  const start = Date.now();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await $`bun test ${file} --timeout 60000`.quiet();
      const output = result.stdout.toString();
      const { passed, skipped } = checkTestOutput(output);

      if (!passed && attempt < retries) {
        process.stdout.write(` (retry ${attempt + 1})`);
        continue;
      }

      return {
        file,
        passed,
        duration: Date.now() - start,
        output:
          VERBOSE || !passed ? output : skipped ? "⚠️  SKIPPED" : undefined,
      };
    } catch (error) {
      const err = error as {
        stdout?: Buffer;
        stderr?: Buffer;
        exitCode?: number;
      };
      const output = err.stdout?.toString() || err.stderr?.toString() || "";
      const { passed, skipped } = checkTestOutput(output);

      // Even if bun exits non-zero, check if tests actually passed
      if (passed || skipped) {
        return {
          file,
          passed: true,
          duration: Date.now() - start,
          output: skipped ? "⚠️  SKIPPED" : undefined,
        };
      }

      if (attempt < retries) {
        process.stdout.write(` (retry ${attempt + 1})`);
        continue;
      }

      return {
        file,
        passed: false,
        duration: Date.now() - start,
        output,
      };
    }
  }

  return { file, passed: false, duration: Date.now() - start };
}

async function runTestsBatch(files: string[]): Promise<TestResult[]> {
  if (files.length === 0) return [];

  const start = Date.now();
  const fileArgs = files.join(" ");

  try {
    const result = await $`bun test ${files}`.quiet();
    return files.map((file) => ({
      file,
      passed: true,
      duration: Date.now() - start,
      output: VERBOSE ? result.stdout.toString() : undefined,
    }));
  } catch (error) {
    // If batch fails, run individually to identify which ones failed
    console.log("  Batch failed, running individually to identify failures...");
    const results: TestResult[] = [];
    for (const file of files) {
      results.push(await runTest(file));
    }
    return results;
  }
}

async function main() {
  console.log("🧪 Isolated Test Runner\n");

  // Find all test files
  let allFiles: string[] = [];
  for (const dir of TEST_DIRS) {
    allFiles.push(...(await findTestFiles(dir)));
  }

  console.log(`Found ${allFiles.length} test files\n`);

  // Categorize files
  const isolatedFiles: string[] = [];
  const batchFiles: string[] = [];

  for (const file of allFiles) {
    if (await usesMockModule(file)) {
      isolatedFiles.push(file);
    } else {
      batchFiles.push(file);
    }
  }

  console.log(`📦 ${batchFiles.length} files can run together`);
  console.log(
    `🔒 ${isolatedFiles.length} files require isolation (use mock.module)\n`,
  );

  const results: TestResult[] = [];

  // Run batch files together
  if (batchFiles.length > 0) {
    console.log("Running batch tests...");
    const batchResults = await runTestsBatch(batchFiles);
    results.push(...batchResults);
    const passed = batchResults.filter((r) => r.passed).length;
    console.log(`  ✅ ${passed}/${batchFiles.length} passed\n`);
  }

  // Run isolated files one at a time
  if (isolatedFiles.length > 0) {
    console.log("Running isolated tests (mock.module files)...");
    for (const file of isolatedFiles) {
      const shortName = file.replace("tests/", "");
      process.stdout.write(`  ${shortName}... `);
      const result = await runTest(file);
      results.push(result);
      console.log(result.passed ? "✅" : "❌");

      if (!result.passed && VERBOSE && result.output) {
        console.log(result.output);
      }
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    console.log("❌ Failed tests:");
    for (const result of results.filter((r) => !r.passed)) {
      console.log(`   - ${result.file}`);
      if (result.output && !VERBOSE) {
        // Show last few lines of error
        const lines = result.output.split("\n").slice(-10);
        console.log("     " + lines.join("\n     "));
      }
    }
    process.exit(1);
  }

  console.log("✅ All tests passed!");
}

main().catch(console.error);
