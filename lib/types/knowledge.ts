/**
 * Shared type definitions for Knowledge/Document features
 */

/**
 * Knowledge document structure.
 */
export interface KnowledgeDocument {
  id: string;
  content: {
    text: string;
  };
  createdAt: number;
  metadata?: {
    fileName?: string;
    fileSize?: number;
    uploadedBy?: string;
    uploadedAt?: number;
    originalFilename?: string;
  };
}

/**
 * Query result from knowledge search.
 */
export interface QueryResult {
  id: string;
  content: string;
  similarity: number;
  metadata?: Record<string, unknown>;
}

