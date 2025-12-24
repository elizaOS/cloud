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

/**
 * Pre-uploaded file metadata.
 * Used for files uploaded before character creation.
 */
export interface PreUploadedFile {
  id: string;
  filename: string;
  blobUrl: string;
  contentType: string;
  size: number;
  uploadedAt: number;
}

/**
 * Upload status for tracking file processing.
 */
export type KnowledgeUploadStatus = "pending" | "processing" | "completed" | "failed";

/**
 * Individual file upload result with status tracking.
 */
export interface KnowledgeUploadResult {
  id: string;
  filename: string;
  size: number;
  contentType: string;
  status: KnowledgeUploadStatus;
  isQueued: boolean;
  jobId?: string;
  fragmentCount?: number;
  error?: string;
  uploadedAt: number;
}

/**
 * Batch upload response with aggregated status.
 */
export interface KnowledgeUploadBatchResponse {
  success: boolean;
  files: KnowledgeUploadResult[];
  summary: {
    total: number;
    immediate: number;
    queued: number;
    failed: number;
  };
  message: string;
}

/**
 * Job data stored for knowledge upload processing.
 * Includes index signature for jobs table compatibility.
 */
export interface KnowledgeUploadJobData {
  filename: string;
  blobUrl: string;
  contentType: string;
  size: number;
  characterId: string;
  uploadedBy: string;
  uploadedAt: number;
  [key: string]: unknown;
}
