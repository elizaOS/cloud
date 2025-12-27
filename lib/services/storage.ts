/**
 * Decentralized Storage Service
 *
 * Provides x402-payable permissionless storage via:
 * - Vercel Blob (fast CDN storage)
 * - IPFS pinning (decentralized persistence)
 *
 * Payment methods:
 * - x402 micropayments (permissionless, no account needed)
 * - Credit balance (authenticated users)
 */

import { put, del, list, head } from "@vercel/blob";
import { logger } from "@/lib/utils/logger";
import { ipfsService, IPFSPaymentRequiredError } from "./ipfs";
import configJson from "@/config/x402.json";

// Storage pricing from x402 config
const PRICING = configJson.pricing.storage;

interface StorageUploadResult {
  id: string;
  url: string;
  cid?: string;
  ipfsGatewayUrl?: string;
  pathname: string;
  contentType: string;
  size: number;
  cost: number;
  expiresAt?: Date;
  pinned?: boolean;
}

interface StorageItem {
  id: string;
  url: string;
  pathname: string;
  contentType: string;
  size: number;
  uploadedAt: Date;
  ownerAddress?: string;
  cid?: string;
}

interface StorageStats {
  totalFiles: number;
  totalSizeBytes: number;
  totalSizeGB: number;
}

/**
 * Calculate storage cost for upload
 */
export function calculateUploadCost(sizeBytes: number): number {
  const sizeMB = sizeBytes / (1024 * 1024);
  const perMBCost = parseFloat(PRICING.uploadPerMB.replace("$", ""));
  const minFee = parseFloat(PRICING.minUploadFee.replace("$", ""));

  const cost = sizeMB * perMBCost;
  return Math.max(cost, minFee);
}

/**
 * Calculate storage cost for retrieval
 */
export function calculateRetrievalCost(sizeBytes: number): number {
  const sizeMB = sizeBytes / (1024 * 1024);
  const perMBCost = parseFloat(PRICING.retrievalPerMB.replace("$", ""));
  return sizeMB * perMBCost;
}

/**
 * Format price string for x402
 */
export function formatPrice(amount: number): string {
  return `$${amount.toFixed(4)}`;
}

/**
 * Storage service for permissionless file storage
 */
export const storageService = {
  /**
   * Upload a file to storage
   * Returns URL and metadata
   *
   * Options:
   * - pinToIPFS: Also pin to IPFS for decentralized persistence
   * - ipfsPaymentHeader: x402 payment for IPFS pinning
   */
  async upload(
    content: Buffer,
    options: {
      filename: string;
      contentType: string;
      ownerAddress?: string;
      paymentTxHash?: string;
      pinToIPFS?: boolean;
      ipfsPaymentHeader?: string;
    },
  ): Promise<StorageUploadResult> {
    const {
      filename,
      contentType,
      ownerAddress,
      pinToIPFS,
      ipfsPaymentHeader,
    } = options;
    const size = content.length;
    const cost = calculateUploadCost(size);

    // Generate unique pathname with timestamp
    const timestamp = Date.now();
    const id = `${timestamp}-${Math.random().toString(36).slice(2, 8)}`;
    const pathname = `storage/${ownerAddress || "public"}/${id}-${filename}`;

    logger.info("[Storage] Uploading file", {
      pathname,
      size,
      contentType,
      cost,
      ownerAddress,
      pinToIPFS,
    });

    // Upload to Vercel Blob
    const blob = await put(pathname, content, {
      access: "public",
      contentType,
      addRandomSuffix: false,
    });

    let cid: string | undefined;
    let ipfsGatewayUrl: string | undefined;
    let pinned = false;

    // Optionally pin to IPFS
    if (pinToIPFS) {
      const ipfsResult = await ipfsService
        .upload(content, {
          filename,
          paymentHeader: ipfsPaymentHeader,
        })
        .catch((err) => {
          if (err instanceof IPFSPaymentRequiredError) {
            logger.warn("[Storage] IPFS pinning requires payment", {
              filename,
            });
          } else {
            logger.error("[Storage] IPFS pinning failed", {
              error: err.message,
            });
          }
          return null;
        });

      if (ipfsResult) {
        cid = ipfsResult.cid;
        ipfsGatewayUrl = ipfsService.getGatewayUrl(ipfsResult.cid);
        pinned =
          ipfsResult.status === "pinned" || ipfsResult.status === "pinning";
      }
    }

    return {
      id,
      url: blob.url,
      cid,
      ipfsGatewayUrl,
      pathname: blob.pathname,
      contentType: blob.contentType || contentType,
      size,
      cost,
      pinned,
    };
  },

  /**
   * Get file metadata
   */
  async getMetadata(url: string): Promise<{
    size: number;
    contentType: string;
    uploadedAt: Date;
  } | null> {
    const metadata = await head(url);
    if (!metadata) return null;

    return {
      size: metadata.size,
      contentType: metadata.contentType,
      uploadedAt: metadata.uploadedAt,
    };
  },

  /**
   * List files with optional prefix filter
   */
  async list(options: {
    prefix?: string;
    ownerAddress?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{
    items: StorageItem[];
    cursor?: string;
    hasMore: boolean;
  }> {
    const prefix = options.ownerAddress
      ? `storage/${options.ownerAddress}/`
      : options.prefix || "storage/";

    const result = await list({
      prefix,
      limit: options.limit || 100,
      cursor: options.cursor,
    });

    const items: StorageItem[] = result.blobs.map((blob) => ({
      id: blob.pathname.split("/").pop()?.split("-")[0] || "",
      url: blob.url,
      pathname: blob.pathname,
      contentType: blob.contentType || "application/octet-stream",
      size: blob.size,
      uploadedAt: blob.uploadedAt,
    }));

    return {
      items,
      cursor: result.cursor,
      hasMore: result.hasMore,
    };
  },

  /**
   * Delete a file
   */
  async delete(url: string): Promise<void> {
    await del(url);
    logger.info("[Storage] Deleted file", { url });
  },

  /**
   * Get storage statistics
   */
  async getStats(ownerAddress?: string): Promise<StorageStats> {
    const prefix = ownerAddress ? `storage/${ownerAddress}/` : "storage/";

    let totalFiles = 0;
    let totalSize = 0;
    let cursor: string | undefined;

    // Paginate through all files to get totals
    do {
      const result = await list({ prefix, limit: 1000, cursor });
      totalFiles += result.blobs.length;
      totalSize += result.blobs.reduce((sum, b) => sum + b.size, 0);
      cursor = result.cursor;
    } while (cursor);

    return {
      totalFiles,
      totalSizeBytes: totalSize,
      totalSizeGB: totalSize / 1024 ** 3,
    };
  },

  /**
   * Get pricing info
   */
  getPricing() {
    return {
      uploadPerMB: PRICING.uploadPerMB,
      retrievalPerMB: PRICING.retrievalPerMB,
      pinPerGBMonth: PRICING.pinPerGBMonth,
      minUploadFee: PRICING.minUploadFee,
    };
  },
};

export default storageService;
