/**
 * Discord Gateway Service
 *
 * Multi-tenant Discord gateway that maintains WebSocket connections
 * and forwards events to Eliza Cloud.
 */

import { serve } from "@hono/node-server";
import { hostname } from "os";
import { Hono } from "hono";
import { GatewayManager } from "./gateway-manager";
import { logger } from "./logger";

const app = new Hono();

// Pod name is critical for connection tracking and failover.
// MUST be set in production via POD_NAME env var (K8s injects from metadata.name).
// Fallback to hostname is for local development only - hostname may change in K8s
// if pod is rescheduled, causing orphaned connections.
const podName = process.env.POD_NAME ?? `gateway-${hostname()}`;
if (!process.env.POD_NAME) {
  logger.warn(
    "POD_NAME not set - using hostname fallback. This is only suitable for local development. " +
      "In production, set POD_NAME via K8s downward API to ensure proper failover.",
    { podName },
  );
}

const port = parseInt(process.env.PORT ?? "3000", 10);

// Initialize gateway manager
const gatewayManager = new GatewayManager({
  podName,
  elizaCloudUrl: process.env.ELIZA_CLOUD_URL ?? "https://elizacloud.ai",
  internalApiKey: process.env.INTERNAL_API_KEY ?? "",
  redisUrl: process.env.REDIS_URL ?? process.env.KV_REST_API_URL,
  redisToken: process.env.KV_REST_API_TOKEN,
});

// Liveness check - is the pod alive and should NOT be restarted?
// Returns 200 for healthy/degraded (don't restart), 503 for unhealthy (restart)
// Degraded pods return 200 because restarting would disconnect all bots
app.get("/health", (c) => {
  const health = gatewayManager.getHealth();
  const alive = health.status !== "unhealthy";
  return c.json(health, alive ? 200 : 503);
});

// Readiness check - can this pod accept new work?
// Returns 503 for degraded/unhealthy to deprioritize in load balancing
app.get("/ready", (c) => {
  const health = gatewayManager.getHealth();
  const ready =
    health.status === "healthy" &&
    health.controlPlane.healthy &&
    (health.totalBots === 0 || health.connectedBots > 0);
  return c.json({ ready, ...health }, ready ? 200 : 503);
});

// Metrics endpoint for Prometheus
app.get("/metrics", (c) => {
  const metrics = gatewayManager.getMetrics();
  return c.text(metrics, 200, { "Content-Type": "text/plain" });
});

// Status endpoint with detailed info
app.get("/status", (c) => {
  const status = gatewayManager.getStatus();
  return c.json(status);
});

// Graceful shutdown
const shutdown = async () => {
  logger.info("Shutting down gracefully...");
  await gatewayManager.shutdown();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Start server
serve({ fetch: app.fetch, port }, () => {
  logger.info(`Discord Gateway started on port ${port}`, { podName });
});

// Start gateway manager
gatewayManager.start().catch((err) => {
  logger.error("Failed to start gateway manager", { error: err });
  process.exit(1);
});
