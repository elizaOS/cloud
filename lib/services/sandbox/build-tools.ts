/**
 * Build verification and type checking utilities for sandbox environments.
 */

import { logger } from "@/lib/utils/logger";
import type { SandboxInstance } from "./types";

// Minimal delay - Next.js Turbopack HMR is very fast (~50ms)
const BUILD_CHECK_DELAY_MS = 50;

/**
 * Check build status by verifying the dev server is responding
 * and parsing logs/response for errors.
 *
 * NOTE: Uses curl internally for health check - this is intentional
 * and bypasses the AI command allowlist (curl is blocked for AI).
 */
export async function checkBuild(sandbox: SandboxInstance): Promise<string> {
  // Reduced delay - HMR should have already processed changes
  await new Promise((r) => setTimeout(r, BUILD_CHECK_DELAY_MS));

  // Run log check and curl health check in parallel for speed
  const [logsResult, curlResult] = await Promise.all([
    sandbox.runCommand({
      cmd: "sh",
      args: [
        "-c",
        "tail -100 /tmp/next-dev.log 2>/dev/null | grep -i -E 'error|failed|cannot' | grep -v 'warning:' | tail -20",
      ],
    }),
    sandbox.runCommand({
      cmd: "curl",
      args: [
        "-s",
        "-w",
        "\n---STATUS:%{http_code}---",
        "-m",
        "5",
        "http://localhost:3000",
      ],
    }),
  ]);

  const logs = await logsResult.stdout();
  const response = await curlResult.stdout();

  const statusMatch = response.match(/---STATUS:(\d+)---/);
  const statusCode = statusMatch ? parseInt(statusMatch[1]) : 0;
  const body = response.replace(/---STATUS:\d+---/, "");

  const errors: string[] = [];

  if (statusCode >= 400 || statusCode === 0) {
    errors.push(`HTTP ${statusCode}: Page failed to load`);
  }

  // Parse error patterns from response body
  const errorPatterns = [
    /Error:([^<]+)/gi,
    /Cannot ([^<]+)/gi,
    /Module not found([^<]+)/gi,
    /SyntaxError([^<]+)/gi,
    /TypeError([^<]+)/gi,
    /Build Error/gi,
    /CssSyntaxError([^<]+)/gi,
  ];

  for (const pattern of errorPatterns) {
    const matches = body.matchAll(pattern);
    for (const match of matches) {
      const err = match[0].substring(0, 200).trim();
      if (!errors.includes(err)) {
        errors.push(err);
      }
    }
  }

  // Add relevant log errors (excluding deprecation warnings)
  if (logs.trim()) {
    const logErrors = logs
      .split("\n")
      .filter((l) => l.trim() && !l.includes("DeprecationWarning"))
      .slice(0, 5);
    errors.push(...logErrors);
  }

  if (errors.length === 0) {
    return "BUILD OK - No errors detected!";
  }

  const uniqueErrors = [...new Set(errors)].slice(0, 10);
  return `BUILD ERRORS:\n${uniqueErrors.join("\n")}\n\nPlease fix these errors!`;
}

/**
 * Wait for dev server to be ready with exponential backoff.
 * Starts polling quickly (200ms) and gradually slows down.
 */
export async function waitForDevServer(
  sandbox: SandboxInstance,
  port: number = 3000,
  maxWaitMs: number = 60000,
): Promise<void> {
  const startTime = Date.now();
  let delay = 200; // Start with 200ms polling
  const maxDelay = 2000; // Cap at 2 seconds
  let attempt = 0;

  while (Date.now() - startTime < maxWaitMs) {
    attempt++;
    const result = await sandbox.runCommand({
      cmd: "curl",
      args: [
        "-s",
        "-o",
        "/dev/null",
        "-w",
        "%{http_code}",
        "-m",
        "3", // 3 second timeout per request
        `http://localhost:${port}`,
      ],
    });
    const statusCode = await result.stdout();

    if (statusCode === "200" || statusCode === "304") {
      const totalTime = Date.now() - startTime;
      logger.info("Dev server ready", {
        attempts: attempt,
        totalMs: totalTime,
      });
      return;
    }

    // Exponential backoff: 200ms → 300ms → 450ms → ... → 2000ms (capped)
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(Math.floor(delay * 1.5), maxDelay);
  }

  throw new Error(`Dev server did not start within ${maxWaitMs / 1000}s`);
}
