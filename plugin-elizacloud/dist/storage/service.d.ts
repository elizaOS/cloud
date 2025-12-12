/**
 * Cloud Storage Service
 *
 * Provides file storage operations via ElizaOS Cloud API.
 * Uses credit-based authenticated storage endpoints.
 *
 * Storage costs are deducted from your credit balance automatically.
 * - Upload: ~$0.01 per MB (minimum $0.001)
 * - Download: Free for your own files
 * - Delete: Free for your own files
 */
import type { CloudStorageConfig, StorageUploadResult, StorageListResult, StorageUploadOptions } from "./types";
/**
 * Creates a cloud storage service instance
 */
export declare function createCloudStorageService(config: CloudStorageConfig): CloudStorageService;
/**
 * Cloud Storage Service for ElizaOS Cloud
 */
export declare class CloudStorageService {
    private apiKey;
    private baseUrl;
    constructor(config: CloudStorageConfig);
    /**
     * Upload a file to cloud storage
     */
    upload(file: Buffer | Blob | File, options?: StorageUploadOptions): Promise<StorageUploadResult>;
    /**
     * Download a file from cloud storage
     * @param id - File ID
     * @param url - Full URL of the file (required for download)
     */
    download(id: string, url?: string): Promise<Buffer | null>;
    /**
     * List files in cloud storage
     * Lists files owned by your organization
     */
    list(options?: {
        prefix?: string;
        limit?: number;
        cursor?: string;
    }): Promise<StorageListResult>;
    /**
     * Delete a file from cloud storage
     * @param id - File ID
     * @param url - Full URL of the file (required for deletion)
     */
    delete(id: string, url?: string): Promise<boolean>;
    /**
     * Get storage stats for your organization
     */
    getStats(): Promise<{
        totalFiles: number;
        totalSize: number;
        totalSizeGB: number;
        pricing: {
            uploadPerMB: string;
            retrievalPerMB: string;
            minUploadFee: string;
        };
    } | null>;
}
