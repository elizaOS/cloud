/**
 * x402 Facilitator Service
 * Prefers Jeju facilitator when available, falls back to Coinbase CDP
 */

import {
  discoverHttpFacilitator,
  verifyPaymentViaHttp,
  settlePaymentViaHttp,
  type HttpFacilitatorConfig,
} from "@/scripts/shared/x402-client";
import type { Address } from "viem";
import { extractErrorMessage } from "@/lib/utils/error-handling";

export interface PaymentRequirement {
  scheme: "exact" | "upto";
  network: string;
  maxAmountRequired: string;
  payTo: Address;
  asset: Address;
  resource: string;
  description?: string;
}

export interface FacilitatorService {
  verify(
    paymentHeader: string,
    requirements: PaymentRequirement,
  ): Promise<{
    isValid: boolean;
    invalidReason: string | null;
    payer: Address | null;
  }>;
  settle(
    paymentHeader: string,
    requirements: PaymentRequirement,
  ): Promise<{ success: boolean; txHash: string | null; error: string | null }>;
  getFacilitator(network: string): Promise<HttpFacilitatorConfig | null>;
}

class FacilitatorServiceImpl implements FacilitatorService {
  private cachedFacilitators = new Map<
    string,
    { facilitator: HttpFacilitatorConfig; expiry: number }
  >();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  async getFacilitator(network: string): Promise<HttpFacilitatorConfig | null> {
    const cached = this.cachedFacilitators.get(network);
    if (cached && Date.now() < cached.expiry) {
      return cached.facilitator;
    }

    const facilitator = await discoverHttpFacilitator(network, {
      timeoutMs: 3000,
    });

    if (facilitator) {
      this.cachedFacilitators.set(network, {
        facilitator,
        expiry: Date.now() + this.CACHE_TTL_MS,
      });
    }

    return facilitator;
  }

  async verify(
    paymentHeader: string,
    requirements: PaymentRequirement,
  ): Promise<{
    isValid: boolean;
    invalidReason: string | null;
    payer: Address | null;
  }> {
    const facilitator = await this.getFacilitator(requirements.network);
    if (!facilitator) {
      return {
        isValid: false,
        invalidReason: "No facilitator available",
        payer: null,
      };
    }

    try {
      const result = await verifyPaymentViaHttp(
        facilitator.url,
        paymentHeader,
        {
          scheme: requirements.scheme,
          network: requirements.network,
          maxAmountRequired: requirements.maxAmountRequired,
          payTo: requirements.payTo,
          asset: requirements.asset,
          resource: requirements.resource,
        },
      );
      return {
        isValid: result.isValid,
        invalidReason: result.invalidReason,
        payer: result.payer,
      };
    } catch (e) {
      return {
        isValid: false,
        invalidReason: extractErrorMessage(e),
        payer: null,
      };
    }
  }

  async settle(
    paymentHeader: string,
    requirements: PaymentRequirement,
  ): Promise<{
    success: boolean;
    txHash: string | null;
    error: string | null;
  }> {
    const facilitator = await this.getFacilitator(requirements.network);
    if (!facilitator) {
      return {
        success: false,
        txHash: null,
        error: "No facilitator available",
      };
    }

    try {
      const result = await settlePaymentViaHttp(
        facilitator.url,
        paymentHeader,
        {
          scheme: requirements.scheme,
          network: requirements.network,
          maxAmountRequired: requirements.maxAmountRequired,
          payTo: requirements.payTo,
          asset: requirements.asset,
          resource: requirements.resource,
        },
      );
      return {
        success: result.success,
        txHash: result.txHash,
        error: result.error,
      };
    } catch (e) {
      return { success: false, txHash: null, error: extractErrorMessage(e) };
    }
  }
}

export const facilitatorService: FacilitatorService =
  new FacilitatorServiceImpl();
