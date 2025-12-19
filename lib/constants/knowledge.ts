/**
 * Shared constants for knowledge file processing.
 * Used across pre-upload, queue, and processing services.
 */

export const KNOWLEDGE_CONSTANTS = {
  MAX_FILES_PER_REQUEST: 10,
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  STALE_JOB_THRESHOLD_MS: 10 * 60 * 1000, // 10 minutes
  MAX_ATTEMPTS: 3,
  POLLING_INTERVAL_MS: 3000,
} as const;

export const ALLOWED_EXTENSIONS = [
  ".pdf",
  ".txt",
  ".md",
  ".doc",
  ".docx",
  ".json",
  ".xml",
  ".yaml",
  ".yml",
  ".csv",
] as const;

/**
 * Text-based extensions that are allowed with application/octet-stream content type.
 * Browsers may send these file types as octet-stream instead of their proper MIME type.
 */
export const TEXT_EXTENSIONS_FOR_OCTET_STREAM = [
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".yaml",
  ".yml",
  ".xml",
] as const;

export const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/json",
  "application/xml",
  "text/xml",
  "application/x-yaml",
  "text/yaml",
  "text/csv",
  "application/octet-stream",
] as const;

export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];
export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];
