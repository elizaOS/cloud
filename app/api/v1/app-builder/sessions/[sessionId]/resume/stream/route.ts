import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import {
  aiAppBuilderService,
  type SandboxProgress,
} from "@/lib/services/ai-app-builder";
import { logger } from "@/lib/utils/logger";

export const maxDuration = 300;

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const user = await requireAuthWithOrg();
  const { sessionId } = await params;

  logger.info("Resume session stream request", {
    sessionId,
    userId: user.id,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = async (event: string, data: unknown) => {
        try {
          const eventStr = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(eventStr));
        } catch {
          // Stream closed
        }
      };

      try {
        const session = await aiAppBuilderService.resumeSession(
          sessionId,
          user.id,
          {
            onProgress: async (progress: SandboxProgress) => {
              await sendEvent("progress", progress);
            },
            onRestoreProgress: async (current, total, filePath) => {
              await sendEvent("restore_progress", {
                current,
                total,
                filePath,
                percentage: Math.round((current / total) * 100),
              });
            },
          },
        );

        await sendEvent("complete", {
          success: true,
          session: {
            id: session.id,
            sandboxId: session.sandboxId,
            sandboxUrl: session.sandboxUrl,
            status: session.status,
            examplePrompts: session.examplePrompts,
            expiresAt: session.expiresAt,
            messages: session.messages,
          },
        });
      } catch (error) {
        logger.error("Resume session failed", {
          sessionId,
          error: error instanceof Error ? error.message : "Unknown error",
        });

        await sendEvent("error", {
          error:
            error instanceof Error
              ? error.message
              : "Failed to resume session",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
