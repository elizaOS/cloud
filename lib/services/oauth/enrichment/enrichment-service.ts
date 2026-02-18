/**
 * Enrichment Service
 *
 * Core logic for fetching, storing, and retrieving OAuth enrichment data.
 * Enrichment data provides identity context (name, org, teams, projects)
 * that the agent uses to personalize responses.
 *
 * Features:
 * - Per-platform enricher functions
 * - Cooldown to prevent retry storms
 * - UPSERT pattern for data persistence
 * - Failure markers to prevent infinite retries
 */

import { db } from "@/db/client";
import { contextEnrichment } from "@/db/schemas/context-enrichment";
import { eq, and } from "drizzle-orm";
import { oauthService } from "../oauth-service";
import { logger } from "@/lib/utils/logger";

import { enrichGoogle, type GoogleEnrichmentData } from "./integrations/google";
import { enrichLinear, type LinearEnrichmentData } from "./integrations/linear";
import { enrichGitHub, type GitHubEnrichmentData } from "./integrations/github";
import { enrichSlack, type SlackEnrichmentData } from "./integrations/slack";
import { enrichNotion, type NotionEnrichmentData } from "./integrations/notion";
import { enrichMicrosoft, type MicrosoftEnrichmentData } from "./integrations/microsoft";

// Platform-specific enrichment data types
export type EnrichmentData =
  | GoogleEnrichmentData
  | LinearEnrichmentData
  | GitHubEnrichmentData
  | SlackEnrichmentData
  | NotionEnrichmentData
  | MicrosoftEnrichmentData
  | { _enrichmentFailed: true; _error: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Enricher = (token: string) => Promise<any>;

const enrichers: Record<string, Enricher> = {
  google: enrichGoogle,
  linear: enrichLinear,
  github: enrichGitHub,
  slack: enrichSlack,
  notion: enrichNotion,
  microsoft: enrichMicrosoft,
};

// Cooldown tracking to prevent retry storms
const ENRICHMENT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const enrichmentAttempts = new Map<string, number>();

function getCooldownKey(orgId: string, platform: string, connectionId: string): string {
  return `${orgId}:${platform}:${connectionId}`;
}

/**
 * Check if we should attempt enrichment (cooldown + dedup)
 */
export function shouldAttemptEnrichment(
  orgId: string,
  platform: string,
  connectionId: string
): boolean {
  const key = getCooldownKey(orgId, platform, connectionId);
  const lastAttempt = enrichmentAttempts.get(key);

  if (lastAttempt && Date.now() - lastAttempt < ENRICHMENT_COOLDOWN_MS) {
    return false;
  }

  enrichmentAttempts.set(key, Date.now());
  return true;
}

/**
 * Enrich a connection with identity context from the platform.
 *
 * - Checks cooldown to prevent retry storms
 * - Fetches token via oauthService
 * - Calls platform-specific enricher
 * - Stores result in DB (UPSERT pattern)
 * - On failure, stores failure marker
 */
export async function enrichConnection(
  orgId: string,
  platform: string,
  connectionId: string
): Promise<void> {
  const platformLower = platform.toLowerCase();

  // Check if enricher exists for this platform
  const enricher = enrichers[platformLower];
  if (!enricher) {
    logger.debug(`[enrichConnection] No enricher for platform: ${platformLower}`);
    return;
  }

  // Check if already successfully enriched (no cooldown needed for skipping successful enrichments)
  const existing = await getEnrichmentData(orgId, platformLower, connectionId);
  if (existing && !("_enrichmentFailed" in existing)) {
    logger.debug("[enrichConnection] Already enriched", {
      orgId,
      platform: platformLower,
      connectionId,
    });
    return;
  }

  // Apply cooldown only for retries (existing with failure OR no data but recently attempted)
  // Skip cooldown if this is first-time enrichment (no existing data)
  if (existing && "_enrichmentFailed" in existing) {
    // Retry scenario: apply cooldown to prevent retry storms
    if (!shouldAttemptEnrichment(orgId, platformLower, connectionId)) {
      logger.debug("[enrichConnection] Skipped retry due to cooldown", {
        orgId,
        platform: platformLower,
        connectionId,
      });
      return;
    }
  }
  // For first-time enrichment (no existing data), proceed without cooldown check

  logger.info("[enrichConnection] Starting enrichment", {
    orgId,
    platform: platformLower,
    connectionId,
  });

  let data: Record<string, unknown>;

  try {
    // Get valid token
    const tokenResult = await oauthService.getValidToken({
      organizationId: orgId,
      connectionId,
      platform: platformLower,
    });

    // Call platform-specific enricher
    data = await enricher(tokenResult.accessToken);

    logger.info("[enrichConnection] Enrichment successful", {
      orgId,
      platform: platformLower,
      connectionId,
      dataKeys: Object.keys(data),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("[enrichConnection] Enrichment failed", {
      orgId,
      platform: platformLower,
      connectionId,
      error: errorMessage,
    });

    // Store failure marker to prevent infinite retries
    data = { _enrichmentFailed: true, _error: errorMessage };
  }

  // UPSERT into context_enrichment
  await db
    .insert(contextEnrichment)
    .values({
      organization_id: orgId,
      platform: platformLower,
      connection_id: connectionId,
      data,
      enriched_at: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        contextEnrichment.organization_id,
        contextEnrichment.platform,
        contextEnrichment.connection_id,
      ],
      set: {
        data,
        enriched_at: new Date(),
        updated_at: new Date(),
      },
    });
}

/**
 * Get enrichment data for a connection.
 * Returns null if no enrichment exists.
 */
export async function getEnrichmentData(
  orgId: string,
  platform: string,
  connectionId: string
): Promise<Record<string, unknown> | null> {
  const [row] = await db
    .select({ data: contextEnrichment.data })
    .from(contextEnrichment)
    .where(
      and(
        eq(contextEnrichment.organization_id, orgId),
        eq(contextEnrichment.platform, platform.toLowerCase()),
        eq(contextEnrichment.connection_id, connectionId)
      )
    )
    .limit(1);

  return row?.data ?? null;
}

/**
 * Get all enrichment data for an organization.
 * Returns a map of connectionId -> data.
 */
export async function getAllEnrichmentData(
  orgId: string
): Promise<Map<string, { platform: string; data: Record<string, unknown> }>> {
  const rows = await db
    .select({
      connection_id: contextEnrichment.connection_id,
      platform: contextEnrichment.platform,
      data: contextEnrichment.data,
    })
    .from(contextEnrichment)
    .where(eq(contextEnrichment.organization_id, orgId));

  const result = new Map<string, { platform: string; data: Record<string, unknown> }>();
  for (const row of rows) {
    result.set(row.connection_id, {
      platform: row.platform,
      data: row.data,
    });
  }
  return result;
}

/**
 * Clear enrichment data for a connection.
 * Called when connection is revoked.
 */
export async function clearEnrichmentData(
  orgId: string,
  platform: string,
  connectionId: string
): Promise<void> {
  await db
    .delete(contextEnrichment)
    .where(
      and(
        eq(contextEnrichment.organization_id, orgId),
        eq(contextEnrichment.platform, platform.toLowerCase()),
        eq(contextEnrichment.connection_id, connectionId)
      )
    );

  // Clear cooldown entry
  const key = getCooldownKey(orgId, platform.toLowerCase(), connectionId);
  enrichmentAttempts.delete(key);

  logger.info("[clearEnrichmentData] Cleared enrichment", {
    orgId,
    platform,
    connectionId,
  });
}

/**
 * Check if a platform has an enricher available.
 */
export function hasEnricher(platform: string): boolean {
  return platform.toLowerCase() in enrichers;
}

/**
 * Get list of platforms that support enrichment.
 */
export function getEnrichablePlatforms(): string[] {
  return Object.keys(enrichers);
}
