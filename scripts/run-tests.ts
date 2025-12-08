#!/usr/bin/env bun
/**
 * Test runner script that runs tests in groups to avoid parallel execution issues
 * with database connections and module caching.
 */

import { $ } from "bun";

const TIMEOUT = 120000; // 2 minutes per test group

interface TestGroup {
  name: string;
  pattern: string;
  exclude?: string[];
}

// Files that require live server/API key - excluded from default run
const EXCLUDED_FILES = [
  "tests/integration/comprehensive-api.test.ts",
];

// Define test groups that can run independently
const testGroups: TestGroup[] = [
  { name: "Unit Tests", pattern: "tests/unit/" },
  { name: "Security Tests", pattern: "tests/security/" },
  { 
    name: "Integration Tests", 
    pattern: "tests/integration/",
    exclude: EXCLUDED_FILES 
  },
];

async function runTestGroup(group: TestGroup): Promise<{ passed: boolean; output: string }> {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`Running: ${group.name}`);
  console.log(`${"═".repeat(70)}\n`);

  // Build test files list, excluding specified files
  let patterns = group.pattern.split(" ").filter(p => p.trim());
  
  // If there are excludes, we need to list files and filter
  if (group.exclude && group.exclude.length > 0) {
    const excludeSet = new Set(group.exclude);
    const glob = new Bun.Glob("**/*.test.ts");
    const files: string[] = [];
    for await (const file of glob.scan(patterns[0])) {
      const fullPath = `${patterns[0]}${file}`;
      if (!excludeSet.has(fullPath)) {
        files.push(fullPath);
      }
    }
    if (files.length === 0) {
      console.log("No test files found (after exclusions)");
      return { passed: true, output: "0 pass\n0 fail" };
    }
    patterns = files;
  }

  const result = await $`bun test --timeout ${TIMEOUT} ${patterns}`.nothrow();
  const output = result.stdout.toString() + result.stderr.toString();
  
  return { passed: result.exitCode === 0, output };
}

async function main() {
  console.log("\n🧪 Eliza Cloud Test Suite\n");
  console.log(`Running ${testGroups.length} test groups sequentially...\n`);

  const results: { name: string; passed: boolean }[] = [];
  let totalPassed = 0;
  let totalFailed = 0;

  for (const group of testGroups) {
    const { passed, output } = await runTestGroup(group);
    results.push({ name: group.name, passed });

    // Extract pass/fail counts from output
    const passMatch = output.match(/(\d+) pass/);
    const failMatch = output.match(/(\d+) fail/);
    if (passMatch) totalPassed += parseInt(passMatch[1]);
    if (failMatch) totalFailed += parseInt(failMatch[1]);
  }

  // Print summary
  console.log("\n" + "═".repeat(70));
  console.log("                         TEST SUMMARY");
  console.log("═".repeat(70) + "\n");

  for (const result of results) {
    const status = result.passed ? "✅ PASS" : "❌ FAIL";
    console.log(`  ${status}  ${result.name}`);
  }

  console.log(`\n  Total: ${totalPassed} passed, ${totalFailed} failed\n`);
  console.log("═".repeat(70) + "\n");

  // Exit with appropriate code
  const allPassed = results.every((r) => r.passed);
  process.exit(allPassed ? 0 : 1);
}

main().catch((e) => {
  console.error("Test runner failed:", e);
  process.exit(1);
});

