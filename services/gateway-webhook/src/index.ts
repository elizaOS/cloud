import { Hono } from "hono";
import { Redis } from "@upstash/redis";
import { initAuth, getAuthHeader, shutdownAuth } from "./auth";
import { initProjectConfig, shutdownProjectConfig } from "./project-config";
import { handleWebhook } from "./webhook-handler";
import {
  getSharedWhatsAppVerifyToken,
  resolveWebhookConfig,
} from "./webhook-config";
import { telegramAdapter } from "./adapters/telegram";
import { blooioAdapter } from "./adapters/blooio";
import { twilioAdapter } from "./adapters/twilio";
import { whatsappAdapter } from "./adapters/whatsapp";
import type { PlatformAdapter, Platform } from "./adapters/types";
import { logger } from "./logger";

const PORT = Number(process.env.PORT ?? 3333);
const POD_NAME =
  process.env.POD_NAME ?? process.env.HOSTNAME ?? "webhook-local";

const adapters: Record<Platform, PlatformAdapter> = {
  telegram: telegramAdapter,
  blooio: blooioAdapter,
  twilio: twilioAdapter,
  whatsapp: whatsappAdapter,
};

const SUPPORTED_PLATFORMS = new Set<string>(Object.keys(adapters));

let draining = false;

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const app = new Hono();

app.get("/health", (c) =>
  c.json({ status: draining ? "draining" : "healthy", pod: POD_NAME }),
);
app.get("/ready", (c) => {
  if (draining) return c.json({ status: "draining" }, 503);
  return c.json({ status: "ready" });
});
app.post("/drain", (c) => {
  draining = true;
  logger.info("Drain requested");
  return c.json({ status: "draining" });
});

app.get("/webhook/:project/whatsapp", async (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");

  const verifyToken = getSharedWhatsAppVerifyToken(c.req.param("project"));
  if (mode === "subscribe" && token === verifyToken && challenge) {
    logger.info("WhatsApp webhook verified (shared)");
    return c.text(challenge, 200);
  }
  return c.text("Forbidden", 403);
});

app.get("/webhook/:project/whatsapp/:agentId", async (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");
  const agentId = c.req.param("agentId");

  const config = await resolveWebhookConfig(
    redis,
    process.env.ELIZA_CLOUD_URL!,
    getAuthHeader(),
    "whatsapp",
    c.req.param("project"),
    agentId,
  );

  if (
    mode === "subscribe" &&
    config?.verifyToken &&
    token === config.verifyToken &&
    challenge
  ) {
    logger.info("WhatsApp webhook verified", { agentId });
    return c.text(challenge, 200);
  }
  return c.text("Forbidden", 403);
});

app.post("/webhook/:project/:platform", async (c) => {
  const platform = c.req.param("platform");

  if (!SUPPORTED_PLATFORMS.has(platform)) {
    return c.json({ error: "unsupported platform" }, 400);
  }

  const adapter = adapters[platform as Platform];
  return handleWebhook(
    c.req.raw,
    adapter,
    {
      redis,
      cloudBaseUrl: process.env.ELIZA_CLOUD_URL!,
      getAuthHeader,
    },
    c.req.param("project"),
  );
});

app.post("/webhook/:project/:platform/:agentId", async (c) => {
  const platform = c.req.param("platform");

  if (!SUPPORTED_PLATFORMS.has(platform)) {
    return c.json({ error: "unsupported platform" }, 400);
  }

  const adapter = adapters[platform as Platform];
  return handleWebhook(
    c.req.raw,
    adapter,
    {
      redis,
      cloudBaseUrl: process.env.ELIZA_CLOUD_URL!,
      getAuthHeader,
    },
    c.req.param("project"),
    c.req.param("agentId"),
  );
});

async function start() {
  logger.info("Starting webhook gateway", { pod: POD_NAME, port: PORT });

  await initProjectConfig();
  await initAuth({
    cloudUrl: process.env.ELIZA_CLOUD_URL!,
    bootstrapSecret: process.env.GATEWAY_BOOTSTRAP_SECRET!,
    podName: POD_NAME,
  });

  Bun.serve({
    port: PORT,
    fetch: app.fetch,
  });

  logger.info("Webhook gateway listening", { port: PORT });
}

function shutdown(signal: string) {
  logger.info("Shutdown signal received", { signal });
  draining = true;
  shutdownProjectConfig();
  shutdownAuth();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

start().catch((err) => {
  logger.error("Failed to start webhook gateway", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
