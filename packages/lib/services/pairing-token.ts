import crypto from "crypto";
import { miladyPairingTokensRepository } from "@/db/repositories/milady-pairing-tokens";

interface PairingToken {
  userId: string;
  orgId: string;
  agentId: string;
  instanceUrl: string;
  expectedOrigin: string;
  expiresAt: number;
  createdAt: number;
}

const TOKEN_EXPIRY_MS = 60_000; // 60 seconds

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

class PairingTokenService {
  async generateToken(
    userId: string,
    orgId: string,
    agentId: string,
    instanceUrl: string,
  ): Promise<string> {
    const expectedOrigin = new URL(instanceUrl).origin;
    const token = crypto.randomBytes(32).toString("base64url");
    const now = Date.now();

    await miladyPairingTokensRepository.create({
      token_hash: hashToken(token),
      organization_id: orgId,
      user_id: userId,
      agent_id: agentId,
      instance_url: instanceUrl,
      expected_origin: expectedOrigin,
      expires_at: new Date(now + TOKEN_EXPIRY_MS),
    });

    return token;
  }

  async validateToken(
    token: string,
    expectedOrigin?: string | null,
  ): Promise<PairingToken | null> {
    if (!expectedOrigin) {
      return null;
    }

    let normalizedOrigin: string;
    try {
      normalizedOrigin = new URL(expectedOrigin).origin;
    } catch {
      return null;
    }

    const row = await miladyPairingTokensRepository.consumeValidToken(
      hashToken(token),
      normalizedOrigin,
    );

    if (!row) {
      return null;
    }

    return {
      userId: row.user_id,
      orgId: row.organization_id,
      agentId: row.agent_id,
      instanceUrl: row.instance_url,
      expectedOrigin: row.expected_origin,
      expiresAt: row.expires_at.getTime(),
      createdAt: row.created_at.getTime(),
    };
  }
}

let instance: PairingTokenService | null = null;

export function getPairingTokenService(): PairingTokenService {
  if (!instance) {
    instance = new PairingTokenService();
  }
  return instance;
}

export type { PairingToken };
