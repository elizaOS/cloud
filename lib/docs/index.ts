/**
 * Documentation Library
 * Exports all documentation-related utilities
 */

// Client-safe exports (metadata only, no fs operations)
export {
  DOCS,
  DOC_SECTIONS,
  getDocsBySection,
  getDocBySlug as getDocMetadataBySlug,
  getAllDocSlugs,
  getSectionBySlug,
  type DocMetadata,
  type DocSection,
} from "./metadata";

// Server-only exports (uses fs module)
// Import these directly from ./markdown in server components only
export type { ProcessedDoc, TableOfContentsItem } from "./markdown";

