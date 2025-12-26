/**
 * GET /api/v1/knowledge/sse?characterId=xxx
 * Server-Sent Events endpoint for real-time knowledge processing updates.
 *
 * Clients subscribe to receive events when files finish processing.
 * Uses Redis pub/sub for cross-instance event distribution.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { Redis } from "@upstash/redis";
import { logger } from "@/lib/utils/logger";
import { userCharactersRepository } from "@/db/repositories/characters";

export const maxDuration = 300; // 5 minutes max
export const dynamic = "force-dynamic";

interface SSEMessage {
  type: string;
  data: unknown;
  timestamp: string;
}

function formatSSE(data: SSEMessage): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

async function getRedisClient(): Promise<Redis> {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    throw new Error("Redis credentials not configured");
  }

  return new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthOrApiKey(request);
  const { searchParams } = new URL(request.url);

  const characterId = searchParams.get("characterId");
  if (!characterId) {
    return NextResponse.json(
      { error: "Missing characterId parameter" },
      { status: 400 },
    );
  }

  // Verify user owns this character
  const character = await userCharactersRepository.findById(characterId);
  if (!character) {
    return NextResponse.json({ error: "Character not found" }, { status: 404 });
  }

  if (character.organization_id !== auth.user.organization_id) {
    return NextResponse.json(
      { error: "Not authorized to access this character" },
      { status: 403 },
    );
  }

  const redis = await getRedisClient();
  const channel = `knowledge:events:${characterId}:queue`;

  logger.info("[Knowledge SSE] Starting stream", {
    characterId,
    userId: auth.user.id,
  });

  const encoder = new TextEncoder();

  type TimerId = ReturnType<typeof setTimeout>;

  const stream = new ReadableStream({
    async start(controller) {
      let isActive = true;
      let pollCount = 0;
      let pollInterval: TimerId | null = null;
      let timeoutHandle: TimerId | null = null;
      const POLL_INTERVAL_MS = 500;
      const HEARTBEAT_INTERVAL = 60; // Send heartbeat every 30 seconds (60 polls * 500ms)
      const MAX_DURATION_MS = 290000; // Just under 5 minutes

      const cleanup = async () => {
        if (pollInterval) {
          clearTimeout(pollInterval);
          pollInterval = null;
        }
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }
        isActive = false;
      };

      // Send initial connected event
      controller.enqueue(
        encoder.encode(
          formatSSE({
            type: "connected",
            data: { characterId },
            timestamp: new Date().toISOString(),
          }),
        ),
      );

      const poll = async (): Promise<void> => {
        if (!isActive) {
          await cleanup();
          return;
        }

        pollCount++;

        // Check for messages
        const messages = await redis.lrange(channel, 0, -1);

        if (messages && messages.length > 0) {
          // Clear the queue
          await redis.del(channel);

          for (const message of messages) {
            const parsed =
              typeof message === "string" ? JSON.parse(message) : message;
            controller.enqueue(
              encoder.encode(
                formatSSE({
                  type: parsed.type || "knowledge_update",
                  data: parsed,
                  timestamp: parsed.timestamp || new Date().toISOString(),
                }),
              ),
            );
          }
        }

        // Send heartbeat periodically
        if (pollCount % HEARTBEAT_INTERVAL === 0) {
          controller.enqueue(
            encoder.encode(
              formatSSE({
                type: "heartbeat",
                data: { pollCount, active: isActive },
                timestamp: new Date().toISOString(),
              }),
            ),
          );
        }

        // Schedule next poll
        if (isActive) {
          pollInterval = setTimeout(poll, POLL_INTERVAL_MS);
        }
      };

      // Start polling
      poll();

      // Handle client disconnect
      request.signal.addEventListener("abort", async () => {
        await cleanup();
        logger.info("[Knowledge SSE] Client disconnected", { characterId });
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });

      // Timeout after max duration
      timeoutHandle = setTimeout(async () => {
        await cleanup();
        logger.info("[Knowledge SSE] Timeout reached", { characterId });
        try {
          controller.enqueue(
            encoder.encode(
              formatSSE({
                type: "timeout",
                data: { message: "Connection timeout, please reconnect" },
                timestamp: new Date().toISOString(),
              }),
            ),
          );
          controller.close();
        } catch {
          /* already closed */
        }
      }, MAX_DURATION_MS);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

