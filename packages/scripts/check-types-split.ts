/**
 * Split Type-Check Script
 *
 * WHY THIS EXISTS:
 * Running `tsc --noEmit` on the full project can use 15-20GB of RAM because
 * TypeScript loads the entire dependency graph into memory. This script splits
 * the type-check into smaller chunks by creating temporary tsconfig files for
 * each major directory.
 *
 * HOW IT WORKS:
 * 1. Creates a temporary tsconfig for each directory (app, components, lib, db)
 * 2. Runs tsc on each directory separately in sequence
 * 3. Each run starts fresh, keeping memory usage lower
 * 4. Reports errors from all directories at the end
 *
 * Usage: bun run scripts/check-types-split.ts
 */

import { exec } from "node:child_process";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

interface CheckResult {
  directory: string;
  success: boolean;
  output: string;
  duration: number;
}

/**
 * Split a directory into subdirectories for smaller type-check chunks.
 * Returns the subdirectories as an array, or [dir] if no subdirectories found.
 */
async function splitIntoSubdirectories(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const subdirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(dir, entry.name))
      .sort();

    return subdirs.length > 0 ? subdirs : [dir];
  } catch {
    return [dir];
  }
}

async function getDirectoriesToCheck(): Promise<string[]> {
  const libSubdirs = await splitIntoSubdirectories("lib");
  const appSubdirs = await splitIntoSubdirectories("app");
  const componentSubdirs = await splitIntoSubdirectories("components");

  return ["db", ...libSubdirs, ...componentSubdirs, ...appSubdirs];
}

async function createTempTsconfig(directory: string, baseTsconfig: object): Promise<string> {
  const safeDirectoryName = directory.replace(/[\\/]/g, ".");
  const workspaceRoot = process.cwd();
  const tempDir = join(workspaceRoot, "node_modules", ".cache", "check-types-split");
  await mkdir(tempDir, { recursive: true });
  const tempPath = join(
    tempDir,
    `eliza-cloud.tsconfig.${safeDirectoryName}.${process.pid}.${Date.now()}.json`,
  );

  const tempConfig = {
    ...baseTsconfig,
    compilerOptions: {
      ...(baseTsconfig as { compilerOptions: object }).compilerOptions,
      baseUrl: workspaceRoot,
      incremental: false,
      tsBuildInfoFile: undefined,
      skipLibCheck: true,
      skipDefaultLibCheck: true,
    },
    include: [
      resolve(workspaceRoot, "next-env.d.ts"),
      resolve(workspaceRoot, "types/**/*.d.ts"),
      resolve(workspaceRoot, "packages/types/**/*.d.ts"),
      resolve(workspaceRoot, `${directory}/**/*.ts`),
      resolve(workspaceRoot, `${directory}/**/*.tsx`),
    ],
    // Keep the same excludes (include __tests__ so bun:test files are not type-checked with node types)
    exclude: [
      resolve(workspaceRoot, "node_modules"),
      resolve(workspaceRoot, "ignore"),
      resolve(workspaceRoot, "e2e"),
      resolve(workspaceRoot, "scripts"),
      resolve(workspaceRoot, "tests"),
      resolve(workspaceRoot, "**/__tests__/**"),
      resolve(workspaceRoot, "**/*.test.ts"),
      resolve(workspaceRoot, "**/*.test.tsx"),
      resolve(workspaceRoot, ".next"),
      resolve(workspaceRoot, "out"),
      resolve(workspaceRoot, "build"),
      resolve(workspaceRoot, "dist"),
      resolve(workspaceRoot, ".turbo"),
      resolve(workspaceRoot, "coverage"),
      resolve(workspaceRoot, ".next/types"),
      resolve(workspaceRoot, ".next/dev/types"),
    ],
  };

  await writeFile(tempPath, JSON.stringify(tempConfig, null, 2));
  return tempPath;
}

async function checkDirectory(directory: string, baseTsconfig: object): Promise<CheckResult> {
  const start = Date.now();
  let tempConfigPath: string | null = null;

  try {
    console.log(`\n📁 Checking ${directory}/...`);

    tempConfigPath = await createTempTsconfig(directory, baseTsconfig);

    const { stdout, stderr } = await execAsync(
      `bunx tsc --noEmit --project ${tempConfigPath} 2>&1`,
      {
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=2048" },
      },
    );

    const output = stdout + stderr;
    const duration = Date.now() - start;

    console.log(`   ✓ ${directory}/ passed (${(duration / 1000).toFixed(1)}s)`);

    return { directory, success: true, output, duration };
  } catch (error) {
    const duration = Date.now() - start;
    const output =
      error instanceof Error
        ? (error as Error & { stdout?: string; stderr?: string }).stdout ||
          (error as Error & { stdout?: string; stderr?: string }).stderr ||
          error.message
        : String(error);

    console.log(`   ✗ ${directory}/ has errors (${(duration / 1000).toFixed(1)}s)`);

    return { directory, success: false, output, duration };
  } finally {
    if (tempConfigPath) {
      await unlink(tempConfigPath).catch(() => {});
    }
  }
}

async function main() {
  console.log("🔍 Split Type-Check");
  console.log("==================");
  console.log("Checking directories separately to reduce memory usage.\n");

  const baseTsconfigContent = await readFile("tsconfig.json", "utf-8");
  const baseTsconfig = JSON.parse(baseTsconfigContent);

  const directories = await getDirectoriesToCheck();
  console.log(`Found ${directories.length} directories to check\n`);

  const results: CheckResult[] = [];
  const totalStart = Date.now();

  for (const dir of directories) {
    if (global.gc) {
      global.gc();
    }

    const result = await checkDirectory(dir, baseTsconfig);
    results.push(result);
  }

  const totalDuration = Date.now() - totalStart;

  console.log("\n==================");
  console.log("📊 Summary");
  console.log("==================\n");

  const failed = results.filter((result) => !result.success);
  const passed = results.filter((result) => result.success);

  console.log(`Total time: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(`Passed: ${passed.length}/${results.length}`);

  if (failed.length > 0) {
    console.log(`\n❌ Errors found in ${failed.length} directory(s):\n`);

    for (const result of failed) {
      console.log(`\n--- ${result.directory}/ ---\n`);
      const lines = result.output.split("\n").filter((line) => {
        return (
          line.trim() &&
          !line.includes("Resolving dependencies") &&
          !line.includes("Saved lockfile")
        );
      });
      console.log(lines.join("\n"));
    }

    process.exit(1);
  }

  console.log("\n✅ All type checks passed!");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
