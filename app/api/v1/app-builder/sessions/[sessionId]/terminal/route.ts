/**
 * Terminal API - Execute shell commands in sandbox with streaming output.
 *
 * POST: Execute a command and stream the output
 */

import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { AuthenticationError, ForbiddenError } from "@/lib/api/errors";
import { aiAppBuilder } from "@/lib/services/ai-app-builder";
import { sandboxService } from "@/lib/services/sandbox";
import { logger } from "@/lib/utils/logger";

// Security: Sanitize cwd path to prevent command injection
function sanitizeCwdPath(cwd: string): string | null {
  // Only allow alphanumeric, dash, underscore, dot, and forward slash
  if (!/^[a-zA-Z0-9_\-./]+$/.test(cwd)) {
    return null;
  }
  // Prevent path traversal
  if (cwd.includes("..")) {
    return null;
  }
  return cwd;
}

// Security: Blocked commands that could be dangerous
const BLOCKED_COMMANDS = [
  /rm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+)?[\/~]/, // rm with / or ~ targets
  /rm\s+-[a-zA-Z]*f[a-zA-Z]*\s+-[a-zA-Z]*r/, // rm -fr or rm -rf variations
  /rm\s+-[a-zA-Z]*r[a-zA-Z]*\s+-[a-zA-Z]*f/, // rm -rf variations
  /rm\s+--no-preserve-root/, // bypass safety
  /sudo\s/, // sudo anything
  />\s*\/etc\//, // writing to /etc
  />\s*\/dev\//, // writing to /dev
  /\beval\s/, // eval
  /\bexec\s/, // exec
  /\bkill\s+-9\s+1\b/, // kill -9 1 (init)
  /\bkillall\s/, // killall
  /shutdown/, // shutdown
  /reboot/, // reboot
  /poweroff/, // poweroff
  /init\s+[06]/, // init 0 or init 6
  /mkfs/, // format disk
  /\bdd\s+if=/, // dd dangerous
  /:\(\)\s*\{/, // fork bomb start
  /\bchmod\s+[0-7]*777/, // world writable
  /\bchown\s+root/, // chown to root
  /\/proc\//, // accessing /proc
  /\/sys\//, // accessing /sys
  /\.\.\/\.\.\/\.\./, // excessive path traversal
];

function isCommandAllowed(command: string): {
  allowed: boolean;
  reason?: string;
} {
  const trimmed = command.trim();

  // Check blocked patterns only
  for (const pattern of BLOCKED_COMMANDS) {
    if (pattern.test(trimmed)) {
      return { allowed: false, reason: "Command is blocked for security" };
    }
  }

  return { allowed: true };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  let user;
  try {
    const authResult = await requireAuthOrApiKeyWithOrg(request);
    user = authResult.user;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 },
      );
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 403 },
      );
    }
    logger.error("[App Builder] Terminal POST auth error", { error });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
  const { sessionId } = await params;

  try {
    // Verify session ownership
    await aiAppBuilder.verifySessionOwnership(sessionId, user.id);

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON" },
        { status: 400 },
      );
    }

    const { command, cwd } = body as { command: string; cwd?: string };

  if (!command || typeof command !== "string") {
    return NextResponse.json(
      { success: false, error: "Command is required" },
      { status: 400 },
    );
  }

  if (cwd !== undefined && typeof cwd !== "string") {
    return NextResponse.json(
      { success: false, error: "cwd must be a string" },
      { status: 400 },
    );
  }

  if (cwd !== undefined && typeof cwd !== "string") {
    return NextResponse.json(
      { success: false, error: "cwd must be a string" },
      { status: 400 },
    );
  }

    if (cwd !== undefined && typeof cwd !== "string") {
      return NextResponse.json(
        { success: false, error: "cwd must be a string" },
        { status: 400 },
      );
    }

    // Validate command
    const validation = isCommandAllowed(command);
    if (!validation.allowed) {
      return NextResponse.json(
        { success: false, error: validation.reason, blocked: true },
        { status: 403 },
      );
    }

    // Get sandbox instance
    const session = await aiAppBuilder.getSession(sessionId, user.id);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 },
      );
    }

    const sandbox = sandboxService.getSandboxInstance(session.sandboxId);
    if (!sandbox) {
      return NextResponse.json(
        { success: false, error: "Sandbox not available" },
        { status: 503 },
      );
    }

    logger.info("Terminal command execution", {
      sessionId,
      sandboxId: session.sandboxId,
      command: command.substring(0, 100),
      cwd,
    });

    // Execute command
    // The sandbox's working directory is already at the project root
    // Only cd if a specific cwd is requested and it's not the default
    let fullCommand = command;
    if (cwd && cwd !== "~" && cwd !== "/app" && cwd !== ".") {
      // Handle relative paths from project root
      const targetDir = cwd.startsWith("/") ? cwd : cwd.replace(/^~\/?/, "");
      // Sanitize: reject path traversal and shell metacharacters
      if (targetDir && targetDir !== "." && /^[a-zA-Z0-9_\-./]+$/.test(targetDir) && !targetDir.includes("..")) {
        const safePath = targetDir.replace(/'/g, "'\\''");
        fullCommand = `cd '${safePath}' && ${fullCommand}`;
      }
    }

    const result = await sandbox.runCommand({
      cmd: "sh",
      args: ["-c", fullCommand],
    });

    const stdout = await result.stdout();
    const stderr = await result.stderr();
    const exitCode = result.exitCode;

    return NextResponse.json({
      success: true,
      stdout,
      stderr,
      exitCode,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Session not found")) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 },
      );
    }
    if (error instanceof Error && error.message.includes("Access denied")) {
      return NextResponse.json(
        { success: false, error: "Access denied" },
        { status: 403 },
      );
    }
    logger.error("[App Builder] Terminal POST error", { error });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * Stream command output in real-time using Server-Sent Events.
 * This is useful for long-running commands like npm install.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  let user;
  try {
    const authResult = await requireAuthOrApiKeyWithOrg(request);
    user = authResult.user;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 },
      );
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 403 },
      );
    }
    logger.error("[App Builder] Terminal GET auth error", { error });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
  const { sessionId } = await params;

  try {
    await aiAppBuilder.verifySessionOwnership(sessionId, user.id);

    const url = new URL(request.url);
    const command = url.searchParams.get("command");
    const cwd = url.searchParams.get("cwd") || "/app";

    if (!command) {
      return NextResponse.json(
        { success: false, error: "Command is required" },
        { status: 400 },
      );
    }

    // Validate command
    const validation = isCommandAllowed(command);
    if (!validation.allowed) {
      return NextResponse.json(
        { success: false, error: validation.reason, blocked: true },
        { status: 403 },
      );
    }

    const normalizedCwd = (() => {
      if (!cwd) return null;
      if (/[;&|$`]/.test(cwd)) return null;
      const stripped = cwd.replace(/^~\/?/, "");
      const normalized = path.posix.normalize(stripped);
      if (normalized.includes("..")) return null;
      if (!/^[a-zA-Z0-9_\-./]+$/.test(normalized)) return null;
      const root = "/app";
      const resolved = normalized.startsWith("/")
        ? path.posix.normalize(normalized)
        : path.posix.normalize(path.posix.join(root, normalized));
      if (!resolved.startsWith(root)) return null;
      return resolved;
    })();

    if (!normalizedCwd) {
      return NextResponse.json(
        { success: false, error: "Invalid cwd" },
        { status: 400 },
      );
    }

    const session = await aiAppBuilder.getSession(sessionId, user.id);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 },
      );
    }

    const sandbox = sandboxService.getSandboxInstance(session.sandboxId);
    if (!sandbox) {
      return NextResponse.json(
        { success: false, error: "Sandbox not available" },
        { status: 503 },
      );
    }

    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Handle cwd if specified
          let fullCommand = command;
          if (normalizedCwd !== "/app" && normalizedCwd !== ".") {
            const safePath = normalizedCwd.replace(/'/g, "'\\''");
            fullCommand = `cd '${safePath}' && ${fullCommand}`;
          }
          const result = await sandbox.runCommand({
            cmd: "sh",
            args: ["-c", fullCommand],
          });

          // Try to stream logs if available
          if (typeof result.logs === "function") {
            for await (const log of result.logs()) {
              const data = JSON.stringify({
                stream: log.stream,
                data: log.data,
              });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
          } else {
            // Fall back to buffered output
            const stdout = await result.stdout();
            const stderr = await result.stderr();

            if (stdout) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ stream: "stdout", data: stdout })}\n\n`,
                ),
              );
            }
            if (stderr) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ stream: "stderr", data: stderr })}\n\n`,
                ),
              );
            }
          }

          // Send exit code
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "exit", exitCode: result.exitCode })}\n\n`,
            ),
          );
          controller.close();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Stream error";
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", error: message })}\n\n`,
            ),
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Session not found")) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 },
      );
    }
    if (error instanceof Error && error.message.includes("Access denied")) {
      return NextResponse.json(
        { success: false, error: "Access denied" },
        { status: 403 },
      );
    }
    logger.error("[App Builder] Terminal GET error", { error });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
