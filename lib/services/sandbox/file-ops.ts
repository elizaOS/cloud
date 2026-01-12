/**
 * File system operations for sandbox environments.
 */

import type { SandboxInstance } from "./types";
import { isPathAllowed, ALLOWED_DIRECTORIES } from "./security";

/**
 * Read a file from the sandbox using shell.
 */
export async function readFileViaSh(
  sandbox: SandboxInstance,
  filePath: string,
): Promise<string | null> {
  const result = await sandbox.runCommand({ cmd: "cat", args: [filePath] });
  return result.exitCode === 0 ? await result.stdout() : null;
}

/**
 * Write a file to the sandbox using node for proper encoding handling.
 * Validates path against security rules before writing.
 */
export async function writeFileViaSh(
  sandbox: SandboxInstance,
  filePath: string,
  content: string,
): Promise<void> {
  if (!isPathAllowed(filePath)) {
    throw new Error(
      `Path not allowed: ${filePath}. Files must be in allowed directories (${ALLOWED_DIRECTORIES.join(", ")}) or match allowed root patterns (*.md, *.txt, config files, etc.)`,
    );
  }

  // Base64 encode content to handle special characters safely
  const base64Content = Buffer.from(content, "utf-8").toString("base64");
  const dir = filePath.split("/").slice(0, -1).join("/");

  // Create directory if needed (mkdir is called directly, not via run_command tool)
  if (dir) {
    await sandbox.runCommand({ cmd: "mkdir", args: ["-p", dir] });
  }

  // Use node to decode and write - handles all content types safely
  const script = `require('fs').writeFileSync(process.argv[1], Buffer.from(process.argv[2], 'base64').toString('utf-8'))`;
  const result = await sandbox.runCommand({
    cmd: "node",
    args: ["-e", script, filePath, base64Content],
  });

  if (result.exitCode !== 0) {
    throw new Error(`Failed to write ${filePath}: ${await result.stderr()}`);
  }
}

/**
 * List files in a directory, excluding common non-source directories.
 */
export async function listFilesViaSh(
  sandbox: SandboxInstance,
  dirPath: string,
): Promise<string[]> {
  const excludes = [
    ".git",
    ".next",
    "node_modules",
    ".pnpm",
    ".cache",
    ".turbo",
    "dist",
    ".vercel",
  ];
  const pruneArgs = excludes.map((d) => `-name "${d}" -prune`).join(" -o ");
  const findCmd = `find ${dirPath} \\( ${pruneArgs} \\) -o -type f -print 2>/dev/null | head -200`;

  const result = await sandbox.runCommand({
    cmd: "sh",
    args: ["-c", findCmd],
  });
  return result.exitCode === 0
    ? (await result.stdout()).split("\n").filter(Boolean)
    : [];
}
