/**
 * OAuth Enrichment Service
 *
 * Exports for fetching and managing OAuth identity context.
 */

export {
  enrichConnection,
  getEnrichmentData,
  getAllEnrichmentData,
  clearEnrichmentData,
  shouldAttemptEnrichment,
  hasEnricher,
  getEnrichablePlatforms,
  type EnrichmentData,
} from "./enrichment-service";

// Re-export platform-specific types for consumers who need them
export type { GoogleEnrichmentData } from "./integrations/google";
export type { LinearEnrichmentData } from "./integrations/linear";
export type { GitHubEnrichmentData } from "./integrations/github";
export type { SlackEnrichmentData } from "./integrations/slack";
export type { NotionEnrichmentData } from "./integrations/notion";
export type { MicrosoftEnrichmentData } from "./integrations/microsoft";
