/**
 * Pairing Token Service for eliza-cloud-v2 (milady_sandboxes)
 *
 * Generates and validates one-time tokens so the browser-side pair.html page
 * can exchange a short-lived token for an API key without user credentials.
 */

import crypto from "crypto";

interface PairingToken {
  token: string;
  userId: string;
  orgId: string;
  agentId: string;
  instanceUrl: string;
  expiresAt: number;
  used: boolean;
  createdAt: number;
}

const TOKEN_EXPIRY_MS = 60_000; // 60 seconds
const CLEANUP_INTERVAL_MS = 30_000;

class PairingTokenService {
  private tokens = new Map<string, PairingToken>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  start() {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
  }

  stop() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  generateToken(
    userId: string,
    orgId: string,
    agentId: string,
    instanceUrl: string,
  ): string {
    const token = crypto.randomBytes(32).toString("base64url");
    this.tokens.set(token, {
      token,
      userId,
      orgId,
      agentId,
      instanceUrl,
      expiresAt: Date.now() + TOKEN_EXPIRY_MS,
      used: false,
      createdAt: Date.now(),
    });
    return token;
  }

  validateToken(
    token: string,
    expectedOrigin?: string | null,
  ): PairingToken | null {
    const pt = this.tokens.get(token);
    if (!pt) return null;

    if (Date.now() > pt.expiresAt) {
      this.tokens.delete(token);
      return null;
    }

    if (pt.used) return null;

    // Optional origin check
    if (expectedOrigin) {
      try {
        const expected = new URL(expectedOrigin).origin;
        const tokenOrigin = new URL(pt.instanceUrl).origin;
        if (expected !== tokenOrigin) return null;
      } catch {
        return null;
      }
    }

    pt.used = true;
    setTimeout(() => this.tokens.delete(token), 1000);
    return pt;
  }

  private cleanup() {
    const now = Date.now();
    for (const [k, v] of this.tokens) {
      if (now > v.expiresAt || v.used) this.tokens.delete(k);
    }
  }
}

let instance: PairingTokenService | null = null;

export function getPairingTokenService(): PairingTokenService {
  if (!instance) {
    instance = new PairingTokenService();
    instance.start();
  }
  return instance;
}

export type { PairingToken };
