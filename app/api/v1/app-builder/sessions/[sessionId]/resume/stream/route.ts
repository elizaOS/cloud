import { NextRequest } from "next/server";
import { caughtErrorJson } from "@/lib/api/errors";
import { createStreamWriter, SSE_HEADERS } from "@/lib/api/stream-utils";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import {
  aiAppBuilderService as aiAppBuilder,
  type SandboxProgress,
} from "@/lib/services/ai-app-builder";
import { logger } from "@/lib/utils/logger";

// Max duration for session resume (sandbox creation + repo clone)
// Fluid compute limits: Hobby 300s, Pro/Enterprise 800s
export const maxDuration = 800;

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

/**
 * POST /api/v1/app-builder/sessions/[sessionId]/resume/stream
 *
 * Resumes a timed-out or stopped session by creating a new sandbox.
 * If the app has a GitHub repo, the sandbox will be cloned from it.
 * Returns a stream of progress events.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { sessionId } = await params;

    logger.info("Session resume request received", {
      sessionId,
      userId: user.id,
    });

    const stream = new TransformStream();
    const rawWriter = stream.writable.getWriter();
    const streamWriter = createStreamWriter(rawWriter);

    const abortController = new AbortController();

    request.signal?.addEventListener("abort", () => {
      logger.info("Client aborted session resume request");
      abortController.abort();
    });

    (async () => {
      streamWriter.startHeartbeat(15000);

      try {
        const session = await aiAppBuilder.resumeSession(sessionId, user.id, {
          onProgress: async (progress: SandboxProgress) => {
            if (!streamWriter.isConnected()) return;
            await streamWriter.sendEvent("progress", progress);
          },
          onRestoreProgress: async (restoreProgress) => {
            if (!streamWriter.isConnected()) return;
            await streamWriter.sendEvent("restore_progress", restoreProgress);
          },
        });

        logger.info("Session resumed successfully via stream", {
          sessionId,
          newSandboxId: session.sandboxId,
          userId: user.id,
        });

        if (streamWriter.isConnected()) {
          await streamWriter.sendEvent("complete", {
            success: true,
            session: {
              id: session.id,
              sandboxId: session.sandboxId,
              sandboxUrl: session.sandboxUrl,
              status: session.status,
              examplePrompts: session.examplePrompts,
              messages: session.messages,
              expiresAt: session.expiresAt,
              appId: session.appId,
              githubRepo: session.githubRepo,
            },
          });
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to resume session";

        logger.error("Failed to resume session via stream", {
          sessionId,
          error: errorMessage,
          userId: user.id,
        });

        if (streamWriter.isConnected()) {
          await streamWriter.sendEvent("error", {
            success: false,
            error: errorMessage,
          });
        }
      } finally {
        await streamWriter.close();
      }
    })();

    return new Response(stream.readable, { headers: SSE_HEADERS });
  } catch (error) {
    if (error instanceof Error && error.message.includes("cannot be resumed")) {
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    const { status, body } = caughtErrorJson(error);
    if (status >= 500) {
      logger.error("Error in session resume stream", { error });
    }
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
