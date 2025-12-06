/**
 * Shared type definitions for Knowledge/Document features
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

export interface QueryResult {
  id: string;
  content: string;
  similarity: number;
  metadata?: Record<string, unknown>;
}

