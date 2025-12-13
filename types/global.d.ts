/**
 * Global Type Declarations
 *
 * Extends built-in types and declares missing module types.
 */

// =============================================================================
// Browser API Extensions
// =============================================================================

/**
 * Safari's prefixed AudioContext
 * @see https://developer.mozilla.org/en-US/docs/Web/API/AudioContext
 */
interface Window {
  webkitAudioContext: typeof AudioContext;
  /** Tauri API object - present when running in Tauri */
  __TAURI__?: Record<string, unknown>;
  /** Tauri internal API object */
  __TAURI_INTERNALS__?: Record<string, unknown>;
}

// =============================================================================
// External Package Type Declarations
// =============================================================================

/**
 * @elizaos/plugin-sql/node - Database adapter factory
 * Type definitions are missing from the published package
 */
declare module "@elizaos/plugin-sql/node" {
  import type { IDatabaseAdapter, UUID } from "@elizaos/core";

  interface DatabaseAdapterConfig {
    postgresUrl: string;
  }

  export function createDatabaseAdapter(
    config: DatabaseAdapterConfig,
    agentId: UUID,
  ): IDatabaseAdapter;
}
