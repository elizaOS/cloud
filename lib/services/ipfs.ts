/**
 * IPFS Pinning Service
 * 
 * Integrates with the Jeju IPFS pinning API for decentralized storage.
 * Supports x402 micropayments for permissionless pinning.
 * 
 * @see apps/ipfs/pinning-api
 */

import { logger } from "@/lib/utils/logger";

const IPFS_API_URL = process.env.IPFS_PINNING_API_URL || "http://localhost:3100";

interface PinResult {
  id: string;
  cid: string;
  name: string;
  status: "pinning" | "pinned" | "failed";
  size: number;
  created: string;
}

interface PinListResult {
  count: number;
  results: PinResult[];
}

interface PinRequest {
  cid?: string;
  name: string;
  origins?: string[];
  meta?: Record<string, string>;
}

/**
 * IPFS pinning service for decentralized storage
 */
export const ipfsService = {
  /**
   * Check IPFS API health
   */
  async health(): Promise<{ status: string; peerId?: string }> {
    const response = await fetch(`${IPFS_API_URL}/health`);
    if (!response.ok) {
      throw new Error(`IPFS API unhealthy: ${response.statusText}`);
    }
    return response.json();
  },
  
  /**
   * Pin content by CID
   */
  async pin(request: PinRequest, paymentHeader?: string): Promise<PinResult> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
    if (paymentHeader) {
      headers["X-PAYMENT"] = paymentHeader;
    }
    
    logger.info("[IPFS] Pinning content", { name: request.name, cid: request.cid });
    
    const response = await fetch(`${IPFS_API_URL}/pins`, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    });
    
    if (response.status === 402) {
      const paymentInfo = await response.json();
      throw new IPFSPaymentRequiredError(paymentInfo);
    }
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Pin failed: ${response.statusText}`);
    }
    
    return response.json();
  },
  
  /**
   * Upload and pin a file
   */
  async upload(
    content: Buffer | Blob,
    options: {
      filename: string;
      paymentHeader?: string;
    }
  ): Promise<PinResult> {
    const formData = new FormData();
    
    if (content instanceof Buffer) {
      formData.append("file", new Blob([content]), options.filename);
    } else {
      formData.append("file", content, options.filename);
    }
    
    const headers: Record<string, string> = {};
    if (options.paymentHeader) {
      headers["X-PAYMENT"] = options.paymentHeader;
    }
    
    logger.info("[IPFS] Uploading file", { filename: options.filename });
    
    const response = await fetch(`${IPFS_API_URL}/api/v0/add`, {
      method: "POST",
      headers,
      body: formData,
    });
    
    if (response.status === 402) {
      const paymentInfo = await response.json();
      throw new IPFSPaymentRequiredError(paymentInfo);
    }
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Upload failed: ${response.statusText}`);
    }
    
    return response.json();
  },
  
  /**
   * Get pin status by request ID
   */
  async getPin(id: string): Promise<PinResult> {
    const response = await fetch(`${IPFS_API_URL}/pins/${id}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get pin: ${response.statusText}`);
    }
    
    return response.json();
  },
  
  /**
   * List pins with filters
   */
  async listPins(options?: {
    cid?: string;
    name?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<PinListResult> {
    const params = new URLSearchParams();
    if (options?.cid) params.set("cid", options.cid);
    if (options?.name) params.set("name", options.name);
    if (options?.status) params.set("status", options.status);
    if (options?.limit) params.set("limit", options.limit.toString());
    if (options?.offset) params.set("offset", options.offset.toString());
    
    const response = await fetch(`${IPFS_API_URL}/pins?${params}`);
    
    if (!response.ok) {
      throw new Error(`Failed to list pins: ${response.statusText}`);
    }
    
    return response.json();
  },
  
  /**
   * Unpin content
   */
  async unpin(id: string): Promise<void> {
    const response = await fetch(`${IPFS_API_URL}/pins/${id}`, {
      method: "DELETE",
    });
    
    if (!response.ok) {
      throw new Error(`Failed to unpin: ${response.statusText}`);
    }
    
    logger.info("[IPFS] Unpinned content", { id });
  },
  
  /**
   * Get IPFS gateway URL for a CID
   */
  getGatewayUrl(cid: string): string {
    const gateway = process.env.IPFS_GATEWAY_URL || "https://ipfs.io";
    return `${gateway}/ipfs/${cid}`;
  },
  
  /**
   * Calculate cost for pinning
   */
  calculatePinCost(sizeBytes: number, durationMonths: number = 1): number {
    const sizeGB = sizeBytes / (1024 ** 3);
    const pricePerGBMonth = 0.10; // $0.10/GB/month
    return sizeGB * pricePerGBMonth * durationMonths;
  },
};

/**
 * Error thrown when IPFS operation requires x402 payment
 */
export class IPFSPaymentRequiredError extends Error {
  paymentRequirement: {
    x402Version: number;
    accepts: Array<{
      scheme: string;
      network: string;
      maxAmountRequired: string;
      asset: string;
      payTo: string;
      resource: string;
      description: string;
    }>;
  };
  
  constructor(paymentInfo: IPFSPaymentRequiredError["paymentRequirement"]) {
    super("IPFS payment required");
    this.name = "IPFSPaymentRequiredError";
    this.paymentRequirement = paymentInfo;
  }
}

export default ipfsService;


