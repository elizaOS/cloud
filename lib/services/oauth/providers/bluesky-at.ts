/**
 * Bluesky AT Protocol OAuth Provider
 *
 * Custom OAuth implementation for Bluesky/AT Protocol.
 * AT Protocol OAuth differs fundamentally from standard OAuth2:
 * - DPoP (mandatory proof-of-possession on every request)
 * - PAR (pushed authorization requests before redirect)
 * - PKCE S256 (mandatory)
 * - private_key_jwt client authentication (ES256 keypair, no client_secret)
 * - Client metadata discovery (client_id is a URL to a JSON document)
 * - Dynamic auth server discovery per user (handle → DID → PDS → auth server)
 * - Single-use refresh tokens (rotated on each use)
 *
 * Uses @atproto/oauth-client-node to handle DPoP, PAR, PKCE, nonce dance,
 * identity resolution, and token refresh automatically.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { cache } from "@/lib/cache/client";
import { dbRead, dbWrite } from "@/db/client";
import { writeTransaction } from "@/db/helpers";
import {
  platformCredentials,
  type platformCredentialTypeEnum,
} from "@/db/schemas/platform-credentials";
import { users } from "@/db/schemas/users";
import { secretsService } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";
import { and, eq, sql } from "drizzle-orm";

// ─── Constants ───────────────────────────────────────────────────────────────

const STATE_TTL_SECONDS = 3600; // 1 hour (longer than standard OAuth2 to accommodate identity resolution)
const STATE_KEY_PREFIX = "bsky_state:";
const META_KEY_PREFIX = "bsky_oauth_meta:";
const SESSION_SECRET_PREFIX = "BLUESKY_SESSION_";
const PLATFORM: (typeof platformCredentialTypeEnum.enumValues)[number] =
  "bluesky";

const AUDIT = {
  actorType: "system" as const,
  actorId: "bluesky-at-oauth",
  source: "bluesky-at-provider",
};

// ─── Multi-tenant context ────────────────────────────────────────────────────
// The NodeOAuthClient calls sessionStore.get(did) without org context.
// We use AsyncLocalStorage to carry the organizationId + userId into store callbacks.

interface OrgContextData {
  orgId: string;
  userId?: string;
}

const orgContext = new AsyncLocalStorage<OrgContextData>();

function getOrgId(): string | undefined {
  return orgContext.getStore()?.orgId;
}

function getUserId(): string | undefined {
  return orgContext.getStore()?.userId;
}

// ─── Client singleton ────────────────────────────────────────────────────────
// Reset on module re-evaluation (Next.js HMR) to pick up fresh sessionStore callbacks.

let _client: unknown = null;
let _clientPromise: Promise<unknown> | null = null;

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
}

/**
 * Build the AT Protocol client metadata document.
 * This same object is served at /api/v1/oauth/bluesky/client-metadata.json
 * and that URL becomes the `client_id`.
 */
export function buildClientMetadata() {
  const baseUrl = getBaseUrl();
  return {
    client_id: `${baseUrl}/api/v1/oauth/bluesky/client-metadata.json`,
    client_name: "Eliza Cloud",
    client_uri: baseUrl,
    logo_uri: `${baseUrl}/logo.png`,
    tos_uri: `${baseUrl}/tos`,
    policy_uri: `${baseUrl}/privacy`,
    redirect_uris: [`${baseUrl}/api/v1/oauth/bluesky/callback`],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: "atproto transition:generic",
    token_endpoint_auth_method: "private_key_jwt",
    token_endpoint_auth_signing_alg: "ES256",
    dpop_bound_access_tokens: true,
    application_type: "web",
    jwks_uri: `${baseUrl}/api/v1/oauth/bluesky/jwks.json`,
  };
}

type NodeOAuthClientType = InstanceType<
  typeof import("@atproto/oauth-client-node").NodeOAuthClient
>;

async function getClient(): Promise<NodeOAuthClientType> {
  if (_client) return _client as NodeOAuthClientType;
  if (_clientPromise) return (await _clientPromise) as NodeOAuthClientType;

  _clientPromise = (async () => {
    const { NodeOAuthClient } = await import("@atproto/oauth-client-node");
    const { JoseKey } = await import("@atproto/jwk-jose");

    const privateKeyPem = process.env.BLUESKY_PRIVATE_KEY;
    const keyId = process.env.BLUESKY_KEY_ID || "bluesky-key-1";
    if (!privateKeyPem) {
      throw new Error(
        "BLUESKY_PRIVATE_KEY environment variable is required for Bluesky OAuth",
      );
    }

    const key = await JoseKey.fromImportable(privateKeyPem, keyId);

    // Simple in-memory lock for token refresh coordination (suppresses library warning).
    // In serverless, each invocation is short-lived so contention is rare.
    const locks = new Map<string, Promise<void>>();
    const requestLock: (
      key: string,
      fn: () => Promise<void>,
    ) => Promise<void> = async (key, fn) => {
      while (locks.has(key)) await locks.get(key);
      const promise = fn().finally(() => locks.delete(key));
      locks.set(key, promise);
      return promise;
    };

    const client = new NodeOAuthClient({
      clientMetadata: buildClientMetadata(),
      keyset: [key],
      requestLock,

      // Handle resolution: Use Bluesky's XRPC endpoint to bypass DNS TXT resolution
      // which fails in serverless/Bun environments (system DNS can't resolve _atproto.* TXT records,
      // and HTTP well-known resolution fails due to SSRF protection or Bun fetch incompatibilities).
      // See: https://github.com/bluesky-social/atproto/issues/2926
      handleResolver: "https://bsky.social",
      fallbackNameservers: ["8.8.8.8", "1.1.1.1"],

      // StateStore: Redis-backed, short-lived (~1hr)
      // We wrap the NodeSavedState with orgId for multi-tenant callback handling
      stateStore: {
        async set(
          key: string,
          internalState: Record<string, unknown>,
        ): Promise<void> {
          const ctx = orgContext.getStore();
          await cache.set(
            `${STATE_KEY_PREFIX}${key}`,
            {
              _state: internalState,
              _orgId: ctx?.orgId || null,
              _userId: ctx?.userId || null,
            },
            STATE_TTL_SECONDS,
          );
        },
        async get(
          key: string,
        ): Promise<Record<string, unknown> | undefined> {
          const val = await cache.get<{
            _state: Record<string, unknown>;
            _orgId: string | null;
            _userId: string | null;
          }>(`${STATE_KEY_PREFIX}${key}`);
          if (!val) return undefined;
          return val._state;
        },
        async del(key: string): Promise<void> {
          await cache.del(`${STATE_KEY_PREFIX}${key}`);
        },
      },

      // SessionStore: Encrypted secrets-backed, long-lived, keyed by DID.
      // The library calls these callbacks deep in its async chain (restore → lock →
      // CachedGetter → getStored), which can lose AsyncLocalStorage context in Bun/
      // serverless. We fall back to DB lookup by DID when orgContext is unavailable.
      sessionStore: {
        async set(
          sub: string,
          session: Record<string, unknown>,
        ): Promise<void> {
          let orgId = getOrgId();
          let userId = getUserId();
          if (!orgId) {
            logger.debug("[BlueskyAT] orgContext lost in sessionStore.set, falling back to DB", { sub });
            const ctx = await findContextByDid(sub);
            if (!ctx) {
              throw new Error(`No credential found for DID ${sub} — cannot store session`);
            }
            orgId = ctx.orgId;
            userId = ctx.userId || undefined;
          }
          await upsertSessionSecret(orgId, sub, session, userId);
        },
        async get(
          sub: string,
        ): Promise<Record<string, unknown> | undefined> {
          let orgId = getOrgId();
          if (!orgId) {
            logger.debug("[BlueskyAT] orgContext lost in sessionStore.get, falling back to DB", { sub });
            const ctx = await findContextByDid(sub);
            orgId = ctx?.orgId;
          }
          if (!orgId) {
            logger.warn("[BlueskyAT] Could not determine org for session get", { sub });
            return undefined;
          }
          return await loadSessionSecret(orgId, sub);
        },
        async del(sub: string): Promise<void> {
          let orgId = getOrgId();
          if (!orgId) {
            logger.debug("[BlueskyAT] orgContext lost in sessionStore.del, falling back to DB", { sub });
            const ctx = await findContextByDid(sub);
            orgId = ctx?.orgId;
          }
          if (!orgId) {
            logger.warn("[BlueskyAT] Could not determine org for session del", { sub });
            return;
          }
          await deleteSessionSecret(orgId, sub);
        },
      },
    });

    _client = client;
    return client;
  })();

  return (await _clientPromise) as NodeOAuthClientType;
}

// ─── Session persistence helpers ─────────────────────────────────────────────

function sessionSecretName(orgId: string, did: string): string {
  return `${SESSION_SECRET_PREFIX}${orgId}_${did}`;
}

async function upsertSessionSecret(
  orgId: string,
  did: string,
  session: Record<string, unknown>,
  userId?: string,
): Promise<void> {
  const name = sessionSecretName(orgId, did);
  const serialized = JSON.stringify(session);

  // created_by is uuid NOT NULL REFERENCES users(id) — must be a real user UUID.
  // Fall back to finding any org member if userId not provided (e.g. during session restore).
  const createdBy = userId || (await findOrgUserId(orgId));
  if (!createdBy) {
    throw new Error(`No user found for organization ${orgId} — cannot store Bluesky session`);
  }

  try {
    await secretsService.create(
      {
        organizationId: orgId,
        name,
        value: serialized,
        scope: "organization",
        description: `Bluesky AT Protocol OAuth session for ${did}`,
        createdBy,
      },
      AUDIT,
    );
  } catch (error) {
    // If already exists, rotate
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (
      errorMsg.includes("already exists") ||
      errorMsg.includes("duplicate") ||
      errorMsg.includes("unique constraint")
    ) {
      const allSecrets = await secretsService.list(orgId);
      const existing = allSecrets.find((s) => s.name === name);
      if (existing) {
        await secretsService.rotate(existing.id, orgId, serialized, AUDIT);
        return;
      }
    }
    throw error;
  }
}

async function loadSessionSecret(
  orgId: string,
  did: string,
): Promise<Record<string, unknown> | undefined> {
  const name = sessionSecretName(orgId, did);
  try {
    const value = await secretsService.get(orgId, name);
    if (!value) return undefined;
    return JSON.parse(value);
  } catch (error) {
    logger.warn("[BlueskyAT] Failed to load session secret", {
      orgId,
      did,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

async function deleteSessionSecret(
  orgId: string,
  did: string,
): Promise<void> {
  const name = sessionSecretName(orgId, did);
  try {
    await secretsService.deleteByName(orgId, name, AUDIT);
  } catch (error) {
    logger.warn("[BlueskyAT] Failed to delete session secret", {
      orgId,
      did,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface BlueskyInitiateResult {
  authUrl: string;
}

export interface BlueskyCallbackResult {
  connectionId: string;
  organizationId: string;
  userId: string;
  did: string;
  handle: string;
  redirectUrl: string;
}

/**
 * Initiate Bluesky OAuth flow.
 * Requires the user's handle for AT Protocol identity resolution.
 */
export async function initiateBlueskyAuth(params: {
  organizationId: string;
  userId: string;
  handle: string;
  redirectUrl?: string;
}): Promise<BlueskyInitiateResult> {
  const { organizationId, userId, handle, redirectUrl } = params;
  const client = await getClient();

  // Generate a state key to carry our metadata through the OAuth flow
  const stateKey = crypto.randomUUID();
  await cache.set(
    `${META_KEY_PREFIX}${stateKey}`,
    {
      organizationId,
      userId,
      redirectUrl: redirectUrl || "/dashboard/settings?tab=connections",
    },
    STATE_TTL_SECONDS,
  );

  logger.info("[BlueskyAT] Initiating auth", {
    organizationId,
    userId,
    handle,
    stateKey: stateKey.substring(0, 8) + "...",
  });

  // Run within org context so the stateStore captures the orgId
  let url: URL;
  try {
    url = await orgContext.run({ orgId: organizationId, userId }, () =>
      client.authorize(handle, {
        scope: "atproto transition:generic",
        state: stateKey,
      }),
    );
  } catch (error) {
    // Clean up metadata on failure
    await cache.del(`${META_KEY_PREFIX}${stateKey}`);

    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("resolve identity") || msg.includes("resolve handle") || msg.includes("does not resolve")) {
      throw new Error(
        `Could not find Bluesky account "${handle}". Please check your handle is correct (e.g., alice.bsky.social).`,
      );
    }
    throw error;
  }

  return { authUrl: url.toString() };
}

/**
 * Handle Bluesky OAuth callback.
 */
export async function handleBlueskyCallback(
  searchParams: URLSearchParams,
): Promise<BlueskyCallbackResult> {
  const client = await getClient();

  // Pre-peek at the library state to get the orgId for session storage context.
  // The library's state key is in the URL's `state` param.
  const libraryStateKey = searchParams.get("state");
  if (!libraryStateKey) {
    throw new Error("Missing state parameter in callback");
  }

  const storedState = await cache.get<{
    _state: Record<string, unknown>;
    _orgId: string | null;
    _userId: string | null;
  }>(`${STATE_KEY_PREFIX}${libraryStateKey}`);

  if (!storedState?._orgId) {
    throw new Error("Invalid or expired OAuth state — missing organization context");
  }

  const preOrgId = storedState._orgId;
  const preUserId = storedState._userId || undefined;

  // Run callback within org context so sessionStore.set() can store per-org
  const { session, state: appState } = await orgContext.run(
    { orgId: preOrgId, userId: preUserId },
    async () => {
      const result = await client.callback(searchParams);
      return result;
    },
  );

  // Retrieve our metadata using the app state key
  if (!appState) {
    throw new Error("Missing app state from callback");
  }

  const meta = await cache.get<{
    organizationId: string;
    userId: string;
    redirectUrl: string;
  }>(`${META_KEY_PREFIX}${appState}`);

  if (!meta) {
    throw new Error("Invalid or expired OAuth metadata");
  }

  await cache.del(`${META_KEY_PREFIX}${appState}`);

  const { organizationId, userId, redirectUrl } = meta;
  const did = session.did;

  // Fetch profile info
  let handle = did;
  let displayName: string | undefined;
  let avatarUrl: string | undefined;

  try {
    const { Agent } = await import("@atproto/api");
    const agent = new Agent(session);
    const profile = await agent.getProfile({ actor: did });
    handle = profile.data.handle || did;
    displayName = profile.data.displayName || handle;
    avatarUrl = profile.data.avatar;
  } catch (error) {
    logger.warn("[BlueskyAT] Failed to fetch profile after callback", {
      did,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Find the session secret ID that was stored by sessionStore.set
  const allSecrets = await secretsService.list(organizationId);
  const sessionSecret = allSecrets.find(
    (s) => s.name === sessionSecretName(organizationId, did),
  );

  // Upsert platform_credentials record
  const connectionId = await writeTransaction(async (tx) => {
    const result = await tx
      .insert(platformCredentials)
      .values({
        organization_id: organizationId,
        user_id: userId,
        platform: PLATFORM,
        platform_user_id: did,
        platform_username: handle,
        platform_display_name: displayName,
        platform_avatar_url: avatarUrl,
        status: "active",
        access_token_secret_id: sessionSecret?.id || null,
        scopes: ["atproto", "transition:generic"],
        source_type: "web",
        linked_at: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          platformCredentials.organization_id,
          platformCredentials.platform,
          platformCredentials.platform_user_id,
        ],
        setWhere: sql`${platformCredentials.user_id} IS NULL OR ${platformCredentials.user_id} = ${userId}`,
        set: {
          user_id: userId,
          platform_username: handle,
          platform_display_name: displayName,
          platform_avatar_url: avatarUrl,
          status: "active",
          access_token_secret_id: sessionSecret?.id || null,
          scopes: ["atproto", "transition:generic"],
          linked_at: new Date(),
          updated_at: new Date(),
        },
      })
      .returning({ id: platformCredentials.id });

    if (result.length === 0) {
      throw new Error("OAUTH_ACCOUNT_ALREADY_LINKED");
    }

    return result[0].id;
  });

  logger.info("[BlueskyAT] Callback completed", {
    organizationId,
    userId,
    connectionId,
    did,
    handle,
  });

  return {
    connectionId,
    organizationId,
    userId,
    did,
    handle,
    redirectUrl,
  };
}

/**
 * Get an authenticated AT Protocol Agent for making API calls.
 * Restores the session (auto-refreshes tokens via DPoP internally).
 */
export async function getBlueskyAgent(
  organizationId: string,
): Promise<InstanceType<typeof import("@atproto/api").Agent>> {
  const cred = await findActiveBlueskyCredential(organizationId);
  if (!cred) {
    throw new Error(
      "Bluesky not connected. Connect in Settings > Connections.",
    );
  }

  const client = await getClient();

  // Restore session within org context for sessionStore callbacks
  const session = await orgContext.run(
    { orgId: organizationId, userId: cred.user_id || undefined },
    () => client.restore(cred.platform_user_id),
  );

  const { Agent } = await import("@atproto/api");
  return new Agent(session);
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

/**
 * Find any user ID belonging to an organization.
 * Used as fallback when userId is not available in context (e.g. session restore).
 */
async function findOrgUserId(orgId: string): Promise<string | undefined> {
  const [user] = await dbRead
    .select({ id: users.id })
    .from(users)
    .where(eq(users.organization_id, orgId))
    .limit(1);
  return user?.id;
}

/**
 * Look up org + user context from platform_credentials by DID.
 * Used as fallback when AsyncLocalStorage context is lost in sessionStore callbacks.
 */
async function findContextByDid(did: string): Promise<{ orgId: string; userId: string } | undefined> {
  const [cred] = await dbRead
    .select({
      organization_id: platformCredentials.organization_id,
      user_id: platformCredentials.user_id,
    })
    .from(platformCredentials)
    .where(
      and(
        eq(platformCredentials.platform, PLATFORM),
        eq(platformCredentials.platform_user_id, did),
        eq(platformCredentials.status, "active"),
      ),
    )
    .limit(1);
  if (!cred?.organization_id) return undefined;
  return { orgId: cred.organization_id, userId: cred.user_id || "" };
}

async function findActiveBlueskyCredential(organizationId: string) {
  const [cred] = await dbRead
    .select()
    .from(platformCredentials)
    .where(
      and(
        eq(platformCredentials.organization_id, organizationId),
        eq(platformCredentials.platform, PLATFORM),
        eq(platformCredentials.status, "active"),
      ),
    )
    .limit(1);
  return cred || null;
}
