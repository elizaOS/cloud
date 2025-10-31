import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { organizationsService } from "@/lib/services";
import { creditEventEmitter } from "@/lib/events/credit-events";
import type { CreditUpdateEvent } from "@/lib/events/credit-events";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

// Heartbeat every 30 seconds to keep connection alive
const HEARTBEAT_INTERVAL = 30000;

// Connection timeout: Serverless-friendly default of 5 minutes (300000ms)
// Configurable via SSE_CONNECTION_TIMEOUT environment variable
// For serverless environments, shorter connections with reconnection logic
// are more cost-effective and reliable than long-lived connections
// Vercel Pro max: 300s (5 minutes)
const CONNECTION_TIMEOUT = parseInt(
  process.env.SSE_CONNECTION_TIMEOUT || "300000",
  10
);

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const organizationId = user.organization_id;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let heartbeatInterval: NodeJS.Timeout | null = null;
        let connectionTimeout: NodeJS.Timeout | null = null;
        let unsubscribe: (() => void) | null = null;

        const sendEvent = (event: string, data: unknown) => {
          const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          try {
            controller.enqueue(encoder.encode(message));
          } catch (error) {
            logger.error("[Credits SSE] Error sending event:", error);
          }
        };

        try {
          const org = await organizationsService.getById(organizationId);
          const initialBalance = Number(org?.credit_balance ?? 0);
          sendEvent("initial", {
            balance: initialBalance,
            timestamp: new Date(),
          });
        } catch (error) {
          logger.error("[Credits SSE] Error fetching initial balance:", error);
          sendEvent("error", { message: "Failed to fetch initial balance" });
        }

        unsubscribe = creditEventEmitter.subscribeToCreditUpdates(
          organizationId,
          (event: CreditUpdateEvent) => {
            sendEvent("update", {
              balance: event.newBalance,
              delta: event.delta,
              reason: event.reason,
              timestamp: event.timestamp,
            });
          }
        );

        creditEventEmitter.incrementConnections(organizationId);

        heartbeatInterval = setInterval(() => {
          sendEvent("heartbeat", { timestamp: new Date() });
        }, HEARTBEAT_INTERVAL);

        connectionTimeout = setTimeout(() => {
          cleanup();
        }, CONNECTION_TIMEOUT);

        const cleanup = async () => {
          if (heartbeatInterval) clearInterval(heartbeatInterval);
          if (connectionTimeout) clearTimeout(connectionTimeout);
          if (unsubscribe) {
            try {
              unsubscribe();
            } catch (error) {
              logger.error("[Credits SSE] Error unsubscribing:", error);
            }
          }

          creditEventEmitter.decrementConnections(organizationId);

          try {
            controller.close();
          } catch {
            // Connection may already be closed
          }
        };

        request.signal.addEventListener("abort", () => {
          cleanup().catch((error) => {
            logger.error("[Credits SSE] Cleanup error:", error);
          });
        });
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
  } catch (error) {
    logger.error("[Credits SSE] Connection error:", error);
    return new Response(JSON.stringify({ error: "Authentication failed" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
}
