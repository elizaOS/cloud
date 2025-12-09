import { NextRequest } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { aiAppBuilderService, type SandboxProgress } from "@/lib/services/ai-app-builder";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const CreateSessionSchema = z.object({
  appId: z.string().uuid().optional(),
  appName: z.string().min(1).max(100).optional(),
  appDescription: z.string().max(500).optional(),
  initialPrompt: z.string().max(2000).optional(),
  templateType: z
    .enum(["chat", "agent-dashboard", "landing-page", "analytics", "blank"])
    .default("blank"),
  includeMonetization: z.boolean().default(false),
  includeAnalytics: z.boolean().default(true),
});

/**
 * POST /api/v1/app-builder/stream
 * Create a new app builder session with SSE progress updates
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    const body = await request.json();
    const validationResult = CreateSessionSchema.safeParse(body);

    if (!validationResult.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid request data",
          details: validationResult.error.format(),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = validationResult.data;

    // Create a TransformStream for SSE
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Helper to send SSE events
    const sendEvent = async (event: string, data: unknown) => {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      await writer.write(encoder.encode(message));
    };

    // Start session creation in background
    (async () => {
      try {
        const session = await aiAppBuilderService.startSession({
          userId: user.id,
          organizationId: user.organization_id,
          appId: data.appId,
          appName: data.appName,
          appDescription: data.appDescription,
          initialPrompt: data.initialPrompt,
          templateType: data.templateType,
          includeMonetization: data.includeMonetization,
          includeAnalytics: data.includeAnalytics,
          onProgress: async (progress: SandboxProgress) => {
            await sendEvent("progress", progress);
          },
        });

        logger.info("Created app builder session via stream", {
          sessionId: session.id,
          userId: user.id,
        });

        // Send the final session data
        await sendEvent("complete", {
          success: true,
          session: {
            id: session.id,
            sandboxId: session.sandboxId,
            sandboxUrl: session.sandboxUrl,
            status: session.status,
            examplePrompts: session.examplePrompts,
          },
        });
      } catch (error) {
        logger.error("Failed to create app builder session via stream", { error });
        await sendEvent("error", {
          success: false,
          error: error instanceof Error ? error.message : "Failed to create session",
        });
      } finally {
        await writer.close();
      }
    })();

    return new Response(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    logger.error("Auth failed for app builder stream", { error });
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Authentication failed",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
}
