/**
 * Discord Gateway Service
 *
 * Multi-tenant Discord gateway that maintains WebSocket connections
 * and forwards events to Eliza Cloud.
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { GatewayManager } from "./gateway-manager";
import { logger } from "./logger";

const app = new Hono();
const podName = process.env.POD_NAME ?? `gateway-${Date.now()}`;
const port = parseInt(process.env.PORT ?? "3000", 10);

// Initialize gateway manager
const gatewayManager = new GatewayManager({
  podName,
  elizaCloudUrl: process.env.ELIZA_CLOUD_URL ?? "https://elizacloud.ai",
  internalApiKey: process.env.INTERNAL_API_KEY ?? "",
  redisUrl: process.env.REDIS_URL ?? process.env.KV_REST_API_URL,
  redisToken: process.env.KV_REST_API_TOKEN,
});

// Health check endpoint
app.get("/health", (c) => {
  const health = gatewayManager.getHealth();
  const status = health.status === "healthy" ? 200 : health.status === "degraded" ? 200 : 503;
  return c.json(health, status);
});

// Readiness check - ready when at least one bot is connected or no bots assigned
app.get("/ready", (c) => {
  const health = gatewayManager.getHealth();
  const ready = health.totalBots === 0 || health.connectedBots > 0;
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

