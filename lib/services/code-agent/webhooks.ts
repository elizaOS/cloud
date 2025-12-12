/**
 * Webhook dispatch for code agent session events with HMAC signing and retry.
 */
import crypto from "crypto";
import { logger } from "@/lib/utils/logger";
import type { CodeAgentEvent } from "./types";
import type { CodeAgentSession } from "@/db/schemas/code-agent-sessions";

const TIMEOUT_MS = 10000;
const RETRIES = [1000, 5000, 15000]; // delay per retry attempt

export interface WebhookPayload {
  eventType: string;
  sessionId: string;
  organizationId: string;
  timestamp: string;
  data: Record<string, unknown>;
  signature: string;
}

const sign = (data: string, secret: string) =>
  crypto.createHmac("sha256", secret).update(data).digest("hex");

async function sendWithRetry(url: string, payload: WebhookPayload, attempt = 0): Promise<boolean> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CodeAgent-Event": payload.eventType,
        "X-CodeAgent-Signature": payload.signature,
        "X-CodeAgent-Timestamp": payload.timestamp,
      },
      body: JSON.stringify(payload),
      signal: abort.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      logger.info("[Webhook] Delivered", { url, event: payload.eventType, attempt });
      return true;
    }

    logger.warn("[Webhook] Non-OK", { url, status: res.status, attempt });
    if (attempt < RETRIES.length && res.status >= 500) {
      await new Promise((r) => setTimeout(r, RETRIES[attempt]));
      return sendWithRetry(url, payload, attempt + 1);
    }
    return false;
  } catch (e) {
    clearTimeout(timer);
    logger.error("[Webhook] Error", { url, error: e instanceof Error ? e.message : String(e), attempt });
    if (attempt < RETRIES.length) {
      await new Promise((r) => setTimeout(r, RETRIES[attempt]));
      return sendWithRetry(url, payload, attempt + 1);
    }
    return false;
  }
}

const DEFAULT_EVENTS = ["session_ready", "session_error", "session_terminated"];

export function shouldDispatchEvent(session: CodeAgentSession, eventType: string): boolean {
  if (!session.webhook_url || !session.webhook_secret) return false;
  return (session.webhook_events ?? DEFAULT_EVENTS).includes(eventType);
}

export async function dispatchWebhook(session: CodeAgentSession, event: CodeAgentEvent): Promise<void> {
  if (!shouldDispatchEvent(session, event.type)) return;

  const timestamp = new Date().toISOString();
  const base = { eventType: event.type, sessionId: session.id, organizationId: session.organization_id, timestamp, data: { ...event } };
  const signature = sign(JSON.stringify(base), session.webhook_secret!);

  // Fire-and-forget
  sendWithRetry(session.webhook_url!, { ...base, signature }).catch(() => {});
}

export const generateWebhookSecret = () => crypto.randomBytes(32).toString("hex");

