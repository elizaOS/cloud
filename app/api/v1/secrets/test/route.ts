import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { logger } from "@/lib/utils/logger";
import type { SecretProvider } from "@/db/schemas/secrets";
import { PROVIDERS } from "@/lib/api/secrets-helpers";

const TestSchema = z.object({
  provider: z.enum(PROVIDERS),
  value: z.string().min(1),
  customTestUrl: z.string().url().optional(),
});

interface TestResult {
  valid: boolean;
  provider: SecretProvider;
  message: string;
  metadata?: Record<string, string>;
}

type TestConfig = {
  url: string | ((key: string) => string);
  headers: (key: string) => Record<string, string>;
  method?: string;
  body?: string;
  isValid?: (res: Response) => boolean;
  extractMetadata?: (data: Record<string, unknown>) => Record<string, string> | undefined;
  extractError?: (data: Record<string, unknown>) => string | undefined;
};

const PROVIDER_CONFIGS: Partial<Record<SecretProvider, TestConfig>> = {
  openai: {
    url: "https://api.openai.com/v1/models",
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
    extractError: (d) => (d.error as { message?: string })?.message,
  },
  anthropic: {
    url: "https://api.anthropic.com/v1/messages",
    method: "POST",
    headers: (k) => ({ "x-api-key": k, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }),
    body: JSON.stringify({ model: "claude-3-haiku-20240307", max_tokens: 1, messages: [{ role: "user", content: "test" }] }),
    isValid: (res) => res.ok || res.status === 400,
    extractError: (d) => (d.error as { message?: string })?.message,
  },
  google: {
    url: (k) => `https://generativelanguage.googleapis.com/v1beta/models?key=${k}`,
    headers: () => ({}),
    extractError: (d) => (d.error as { message?: string })?.message,
  },
  elevenlabs: {
    url: "https://api.elevenlabs.io/v1/user",
    headers: (k) => ({ "xi-api-key": k }),
    extractMetadata: (d) => ({ subscription: (d.subscription as { tier?: string })?.tier || "" }),
  },
  stripe: {
    url: "https://api.stripe.com/v1/balance",
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
    extractError: (d) => (d.error as { message?: string })?.message,
  },
  discord: {
    url: "https://discord.com/api/v10/users/@me",
    headers: (k) => ({ Authorization: `Bot ${k}` }),
    extractMetadata: (d) => ({ username: d.username as string }),
  },
  telegram: {
    url: (k) => `https://api.telegram.org/bot${k}/getMe`,
    headers: () => ({}),
    isValid: async (res) => res.ok && (await res.clone().json()).ok,
    extractMetadata: (d) => ({ username: (d.result as { username?: string })?.username || "" }),
  },
  github: {
    url: "https://api.github.com/user",
    headers: (k) => ({ Authorization: `Bearer ${k}`, Accept: "application/vnd.github+json" }),
    extractMetadata: (d) => ({ login: d.login as string }),
  },
};

async function testProvider(provider: SecretProvider, key: string, customUrl?: string): Promise<TestResult> {
  if (provider === "custom") {
    if (!customUrl) throw new Error("customTestUrl required");
    const res = await fetch(customUrl, { headers: { Authorization: `Bearer ${key}` } });
    return { valid: res.ok, provider, message: res.ok ? "Request succeeded" : `HTTP ${res.status}` };
  }

  const config = PROVIDER_CONFIGS[provider];
  if (!config) throw new Error(`Testing not supported for: ${provider}`);

  const url = typeof config.url === "function" ? config.url(key) : config.url;
  const res = await fetch(url, {
    method: config.method || "GET",
    headers: config.headers(key),
    body: config.body,
  });

  const valid = config.isValid ? await Promise.resolve(config.isValid(res)) : res.ok;
  if (valid) {
    const data = await res.json().catch(() => ({}));
    return { valid: true, provider, message: "Valid", metadata: config.extractMetadata?.(data) };
  }

  const data = await res.json().catch(() => ({}));
  return { valid: false, provider, message: config.extractError?.(data) || `HTTP ${res.status}` };
}

async function handler(request: NextRequest): Promise<Response> {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const body = await request.json();
    
    const parsed = TestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.format() }, { status: 400 });
    }

    const { provider, value, customTestUrl } = parsed.data;

    if (provider !== "custom" && !PROVIDER_CONFIGS[provider]) {
      return NextResponse.json({ error: `Testing not supported for: ${provider}` }, { status: 400 });
    }

    if (provider === "custom" && !customTestUrl) {
      return NextResponse.json({ error: "customTestUrl required for custom provider" }, { status: 400 });
    }

    logger.info("[Secrets] Testing API key", { provider, userId: user.id });

    const result = await testProvider(provider, value, customTestUrl);
    return NextResponse.json({ ...result, testedAt: new Date().toISOString() });
  } catch (error) {
    logger.error("[Secrets] Test failed", { error: error instanceof Error ? error.message : error });
    return NextResponse.json({ valid: false, message: "Test failed", error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export const POST = withRateLimit(handler, RateLimitPresets.STRICT);

