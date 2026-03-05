import { NextRequest, NextResponse } from "next/server";
import { withInternalAuth } from "@/lib/auth/internal-api";
import { withCache } from "@/lib/cache/service-cache";
import { telegramAutomationService } from "@/lib/services/telegram-automation";
import { blooioAutomationService } from "@/lib/services/blooio-automation";
import { twilioAutomationService } from "@/lib/services/twilio-automation";
import { secretsService } from "@/lib/services/secrets";
import { charactersService } from "@/lib/services/characters/characters";
import { elizaAppConfig } from "@/lib/services/eliza-app/config";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const SUPPORTED_PLATFORMS = [
  "telegram",
  "blooio",
  "twilio",
  "whatsapp",
] as const;
type Platform = (typeof SUPPORTED_PLATFORMS)[number];

const CACHE_TTL_SECONDS = 300;

// ── Per-org config (legacy: org-scoped automation services) ──────────────

async function fetchOrgTelegramConfig(orgId: string) {
  const [botToken, webhookSecret] = await Promise.all([
    telegramAutomationService.getBotToken(orgId),
    telegramAutomationService.getWebhookSecret(orgId),
  ]);
  if (!botToken) return null;
  return {
    agentId: elizaAppConfig.defaultAgentId,
    orgId,
    botToken,
    webhookSecret,
  };
}

async function fetchOrgBlooioConfig(orgId: string) {
  const [apiKey, webhookSecret, fromNumber] = await Promise.all([
    blooioAutomationService.getApiKey(orgId),
    blooioAutomationService.getWebhookSecret(orgId),
    blooioAutomationService.getFromNumber(orgId),
  ]);
  if (!apiKey) return null;
  return {
    agentId: elizaAppConfig.defaultAgentId,
    orgId,
    apiKey,
    blooioWebhookSecret: webhookSecret,
    fromNumber,
  };
}

async function fetchOrgTwilioConfig(orgId: string) {
  const [accountSid, authToken, phoneNumber] = await Promise.all([
    twilioAutomationService.getAccountSid(orgId),
    twilioAutomationService.getAuthToken(orgId),
    twilioAutomationService.getPhoneNumber(orgId),
  ]);
  if (!accountSid || !authToken) return null;
  return {
    agentId: elizaAppConfig.defaultAgentId,
    orgId,
    accountSid,
    authToken,
    phoneNumber,
  };
}

async function fetchOrgConfig(platform: Platform, orgId: string) {
  switch (platform) {
    case "telegram":
      return fetchOrgTelegramConfig(orgId);
    case "blooio":
      return fetchOrgBlooioConfig(orgId);
    case "twilio":
      return fetchOrgTwilioConfig(orgId);
    case "whatsapp":
      return null;
  }
}

// ── Per-agent config (secrets table with project_id = agentId) ───────────

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
  const [accessToken, phoneNumberId, appSecret, verifyToken, businessPhone] =
    await Promise.all([
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

// ── Handler ──────────────────────────────────────────────────────────────

export const GET = withInternalAuth(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");
  const agentId = searchParams.get("agentId");
  const platform = searchParams.get("platform");

  if ((!orgId && !agentId) || !platform) {
    return NextResponse.json(
      { error: "platform required, plus either orgId or agentId" },
      { status: 400 },
    );
  }

  if (!SUPPORTED_PLATFORMS.includes(platform as Platform)) {
    return NextResponse.json(
      { error: `Unsupported platform: ${platform}` },
      { status: 400 },
    );
  }

  const cacheKey = agentId
    ? `webhook-config:${platform}:agent:${agentId}`
    : `webhook-config:${platform}:org:${orgId}`;

  const config = await withCache(cacheKey, CACHE_TTL_SECONDS, () =>
    agentId
      ? fetchAgentConfig(platform as Platform, agentId)
      : fetchOrgConfig(platform as Platform, orgId!),
  );

  if (!config) {
    return NextResponse.json(
      { error: "Platform not configured" },
      { status: 404 },
    );
  }

  return NextResponse.json(config);
});
