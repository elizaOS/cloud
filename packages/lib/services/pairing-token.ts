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

// Domain aliases — waifu.fun and milady.ai resolve to the same containers.
// The dashboard rewrites URLs from one to the other, so the Origin header
// sent by pair.html may use either domain.
const DOMAIN_ALIASES: [string, string][] = [[".waifu.fun", ".milady.ai"]];

class PairingTokenService {
  /**
   * Given an origin like https://uuid.waifu.fun, return https://uuid.milady.ai
   * (and vice versa). Returns null if no alias applies.
   */
  private getAlternateDomainOrigin(origin: string): string | null {
    for (const [a, b] of DOMAIN_ALIASES) {
      try {
        const url = new URL(origin);
        if (url.hostname.endsWith(a)) {
          url.hostname = url.hostname.replace(new RegExp(`${a.replaceAll(".", "\\.")}$`), b);
          return url.origin;
        }
        if (url.hostname.endsWith(b)) {
          url.hostname = url.hostname.replace(new RegExp(`${b.replaceAll(".", "\\.")}$`), a);
          return url.origin;
        }
      } catch {
        // Invalid URL — skip
      }
    }
    return null;
  }

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

  async validateToken(token: string, expectedOrigin?: string | null): Promise<PairingToken | null> {
    if (!expectedOrigin) {
      return null;
    }

    let normalizedOrigin: string;
    try {
      normalizedOrigin = new URL(expectedOrigin).origin;
    } catch {
      return null;
    }

    // Try the exact origin first
    let row = await miladyPairingTokensRepository.consumeValidToken(
      hashToken(token),
      normalizedOrigin,
    );

    // If no match, try the alternate domain. The dashboard may rewrite
    // waifu.fun → milady.ai (or vice versa) which changes the Origin header
    // but both domains resolve to the same agent container.
    if (!row) {
      const alternateOrigin = this.getAlternateDomainOrigin(normalizedOrigin);
      if (alternateOrigin) {
        row = await miladyPairingTokensRepository.consumeValidToken(
          hashToken(token),
          alternateOrigin,
        );
      }
    }

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
