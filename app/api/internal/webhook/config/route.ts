import { NextRequest, NextResponse } from "next/server";
import { withInternalAuth } from "@/lib/auth/internal-api";
import { withCache } from "@/lib/cache/service-cache";
import { charactersService } from "@/lib/services/characters/characters";
import { secretsService } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const SUPPORTED_PLATFORMS = ["telegram", "blooio", "twilio", "whatsapp"] as const;
type Platform = (typeof SUPPORTED_PLATFORMS)[number];

const CACHE_TTL_SECONDS = 300;

async function resolveAgentOrg(agentId: string): Promise<string | null> {
  const character = await charactersService.getById(agentId);
  return character?.organization_id ?? null;
}

async function fetchAgentTelegramConfig(orgId: string, agentId: string) {
  const [botToken, webhookSecret] = await Promise.all([
    secretsService.get(orgId, "TELEGRAM_BOT_TOKEN", agentId),
    secretsService.get(orgId, "TELEGRAM_WEBHOOK_SECRET", agentId),
  ]);
  if (!botToken) return null;
  return { agentId, botToken, webhookSecret };
}

async function fetchAgentBlooioConfig(orgId: string, agentId: string) {
  const [apiKey, webhookSecret, fromNumber] = await Promise.all([
    secretsService.get(orgId, "BLOOIO_API_KEY", agentId),
    secretsService.get(orgId, "BLOOIO_WEBHOOK_SECRET", agentId),
    secretsService.get(orgId, "BLOOIO_FROM_NUMBER", agentId),
  ]);
  if (!apiKey) return null;
  return { agentId, apiKey, blooioWebhookSecret: webhookSecret, fromNumber };
}

async function fetchAgentTwilioConfig(orgId: string, agentId: string) {
  const [accountSid, authToken, phoneNumber] = await Promise.all([
    secretsService.get(orgId, "TWILIO_ACCOUNT_SID", agentId),
    secretsService.get(orgId, "TWILIO_AUTH_TOKEN", agentId),
    secretsService.get(orgId, "TWILIO_PHONE_NUMBER", agentId),
  ]);
  if (!accountSid || !authToken) return null;
  return { agentId, accountSid, authToken, phoneNumber };
}

async function fetchAgentWhatsAppConfig(orgId: string, agentId: string) {
  const [accessToken, phoneNumberId, appSecret, verifyToken, businessPhone] = await Promise.all([
    secretsService.get(orgId, "WHATSAPP_ACCESS_TOKEN", agentId),
    secretsService.get(orgId, "WHATSAPP_PHONE_NUMBER_ID", agentId),
    secretsService.get(orgId, "WHATSAPP_APP_SECRET", agentId),
    secretsService.get(orgId, "WHATSAPP_VERIFY_TOKEN", agentId),
    secretsService.get(orgId, "WHATSAPP_PHONE_NUMBER", agentId),
  ]);
  if (!accessToken || !phoneNumberId) return null;
  return {
    agentId,
    accessToken,
    phoneNumberId,
    appSecret,
    verifyToken,
    businessPhone,
  };
}

async function fetchAgentConfig(
  platform: Platform,
  agentId: string,
): Promise<Record<string, unknown> | null> {
  const orgId = await resolveAgentOrg(agentId);
  if (!orgId) {
    logger.warn("Agent not found for webhook config", { agentId, platform });
    return null;
  }

  switch (platform) {
    case "telegram":
      return fetchAgentTelegramConfig(orgId, agentId);
    case "blooio":
      return fetchAgentBlooioConfig(orgId, agentId);
    case "twilio":
      return fetchAgentTwilioConfig(orgId, agentId);
    case "whatsapp":
      return fetchAgentWhatsAppConfig(orgId, agentId);
  }
}

export const GET = withInternalAuth(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId");
  const platform = searchParams.get("platform");

  if (!agentId || !platform) {
    return NextResponse.json({ error: "agentId and platform required" }, { status: 400 });
  }

  if (!SUPPORTED_PLATFORMS.includes(platform as Platform)) {
    return NextResponse.json({ error: `Unsupported platform: ${platform}` }, { status: 400 });
  }

  const cacheKey = `webhook-config:${platform}:agent:${agentId}`;

  const config = await withCache(cacheKey, CACHE_TTL_SECONDS, () =>
    fetchAgentConfig(platform as Platform, agentId),
  );

  if (!config) {
    return NextResponse.json({ error: "Platform not configured" }, { status: 404 });
  }

  return NextResponse.json(config);
});
