/**
 * Twitter Connection Adapter
 *
 * OAuth 1.0a - tokens don't expire but can be revoked.
 * Connection ID format: twitter:{organizationId}:{owner|agent}
 */

import { secretsService } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";
import { Errors } from "../errors";
import { OAUTH_PROVIDERS } from "../provider-registry";
import type { OAuthConnection, TokenResult } from "../types";
import type { ConnectionAdapter } from "./index";
import {
  deletePlatformSecrets,
  fetchPlatformSecrets,
  getEarliestSecretDate,
  getSecretValue,
  updateSecretAccessTime,
} from "./secrets-adapter-utils";

const PLATFORM = "twitter";
const PREFIX = "TWITTER_";
const PATTERNS = OAUTH_PROVIDERS.twitter.secretPatterns!;
const ROLES = ["owner", "agent"] as const;
type TwitterConnectionRole = (typeof ROLES)[number];

const LEGACY_SECRET_NAMES = {
  accessToken: PATTERNS.accessToken!,
  accessTokenSecret: PATTERNS.accessTokenSecret!,
  username: PATTERNS.username!,
  userId: PATTERNS.userId!,
} as const;

function roleSecretName(role: TwitterConnectionRole, suffix: string): string {
  return `TWITTER_${role.toUpperCase()}_${suffix.replace(/^TWITTER_/, "")}`;
}

function roleSecretNames(role: TwitterConnectionRole) {
  return {
    accessToken: roleSecretName(role, LEGACY_SECRET_NAMES.accessToken),
    accessTokenSecret: roleSecretName(role, LEGACY_SECRET_NAMES.accessTokenSecret),
    username: roleSecretName(role, LEGACY_SECRET_NAMES.username),
    userId: roleSecretName(role, LEGACY_SECRET_NAMES.userId),
  } as const;
}

function connectionId(organizationId: string, role: TwitterConnectionRole): string {
  return `${PLATFORM}:${organizationId}:${role}`;
}

function parseConnectionId(organizationId: string, rawConnectionId: string): TwitterConnectionRole {
  for (const role of ROLES) {
    if (rawConnectionId === connectionId(organizationId, role)) {
      return role;
    }
  }
  throw Errors.connectionNotFound(rawConnectionId);
}

function ownsTwitterConnectionId(rawConnectionId: string): boolean {
  return rawConnectionId.startsWith(`${PLATFORM}:`);
}

function hasSecret(platformSecrets: { name: string }[], secretName: string): boolean {
  return platformSecrets.some((secret) => secret.name === secretName);
}

export const twitterAdapter: ConnectionAdapter = {
  platform: PLATFORM,

  async listConnections(organizationId: string): Promise<OAuthConnection[]> {
    const platformSecrets = await fetchPlatformSecrets(organizationId, PREFIX);
    const connections: OAuthConnection[] = [];

    for (const role of ROLES) {
      const names = roleSecretNames(role);
      if (!hasSecret(platformSecrets, names.accessToken)) {
        continue;
      }
      const [username, userId] = await Promise.all([
        getSecretValue(organizationId, names.username),
        getSecretValue(organizationId, names.userId),
      ]);
      const roleSecrets = platformSecrets.filter((secret) =>
        Object.values(names).includes(secret.name as (typeof names)[keyof typeof names]),
      );
      connections.push({
        id: connectionId(organizationId, role),
        connectionRole: role,
        platform: PLATFORM,
        platformUserId: userId || "unknown",
        username: username || undefined,
        displayName: username ? `@${username}` : undefined,
        status: "active",
        scopes: [],
        linkedAt: getEarliestSecretDate(roleSecrets.length > 0 ? roleSecrets : platformSecrets),
        tokenExpired: false,
        source: "secrets",
      });
    }

    if (connections.length === 0 && hasSecret(platformSecrets, LEGACY_SECRET_NAMES.accessToken)) {
      const [username, userId] = await Promise.all([
        getSecretValue(organizationId, LEGACY_SECRET_NAMES.username),
        getSecretValue(organizationId, LEGACY_SECRET_NAMES.userId),
      ]);
      connections.push({
        id: connectionId(organizationId, "owner"),
        connectionRole: "owner",
        platform: PLATFORM,
        platformUserId: userId || "unknown",
        username: username || undefined,
        displayName: username ? `@${username}` : undefined,
        status: "active",
        scopes: [],
        linkedAt: getEarliestSecretDate(platformSecrets),
        tokenExpired: false,
        source: "secrets",
      });
    }

    return connections;
  },

  async getToken(organizationId: string, connectionId: string): Promise<TokenResult> {
    const role = parseConnectionId(organizationId, connectionId);
    const names = roleSecretNames(role);

    const accessToken =
      (await getSecretValue(organizationId, names.accessToken)) ??
      (role === "owner"
        ? await getSecretValue(organizationId, LEGACY_SECRET_NAMES.accessToken)
        : null);
    if (!accessToken) throw Errors.platformNotConnected(PLATFORM);

    const accessTokenSecret =
      (await getSecretValue(organizationId, names.accessTokenSecret)) ??
      (role === "owner"
        ? await getSecretValue(organizationId, LEGACY_SECRET_NAMES.accessTokenSecret)
        : null);
    await updateSecretAccessTime(organizationId, names.accessToken);

    return {
      accessToken,
      accessTokenSecret: accessTokenSecret || undefined,
      scopes: [],
      refreshed: false,
      fromCache: false,
    };
  },

  async revoke(organizationId: string, connectionId: string): Promise<void> {
    const role = parseConnectionId(organizationId, connectionId);
    const roleScopedCount = await deletePlatformSecrets(
      organizationId,
      `TWITTER_${role.toUpperCase()}_`,
      "oauth-service",
    );
    let legacyCount = 0;
    if (role === "owner") {
      const audit = {
        actorType: "system" as const,
        actorId: "oauth-service",
        source: "revoke-connection",
      };
      for (const name of Object.values(LEGACY_SECRET_NAMES)) {
        if ((await getSecretValue(organizationId, name)) === null) {
          continue;
        }
        await secretsService.deleteByName(organizationId, name, audit);
        legacyCount += 1;
      }
    }
    logger.info("[TwitterAdapter] Connection revoked", {
      connectionId,
      organizationId,
      connectionRole: role,
      secretsDeleted: roleScopedCount + legacyCount,
    });
  },

  async ownsConnection(connectionId: string): Promise<boolean> {
    return ownsTwitterConnectionId(connectionId);
  },
};
