import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getCreditBalance } from "@/lib/queries/credits";
import { creditEventEmitter } from "@/lib/events/credit-events";
import type { CreditUpdateEvent } from "@/lib/events/credit-events";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_INTERVAL = 30000;
const CONNECTION_TIMEOUT = 300000;

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const organizationId = user.organization_id;

    logger.info(
      `[Credits SSE] Client connected: user=${user.id}, org=${organizationId}`
    );

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
          const initialBalance = await getCreditBalance(organizationId);
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
            logger.debug(`[Credits SSE] Sending update to client:`, event);
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
          logger.info(
            `[Credits SSE] Connection timeout for org=${organizationId}`
          );
          cleanup();
        }, CONNECTION_TIMEOUT);

        const cleanup = () => {
          if (heartbeatInterval) clearInterval(heartbeatInterval);
          if (connectionTimeout) clearTimeout(connectionTimeout);
          if (unsubscribe) unsubscribe();

          creditEventEmitter.decrementConnections(organizationId);

          try {
            controller.close();
          } catch {
            // Connection may already be closed
          }

          logger.info(
            `[Credits SSE] Client disconnected: org=${organizationId}`
          );
        };

        request.signal.addEventListener("abort", cleanup);
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
