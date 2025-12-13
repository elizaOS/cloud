/**
 * x402 Route Helper
 * Utilities for handling x402 payments in API routes
 */

import { facilitatorService, type PaymentRequirement } from '../services/facilitator';
import { verifyX402Payment } from './x402-handler';
import type { Address } from 'viem';
import x402Config from '@/config/x402.json';

export interface X402PaymentContext {
  payer: Address;
  amount: string;
  verified: boolean;
}

/**
 * Check if request has x402 payment header
 */
export function hasX402Payment(req: Request): boolean {
  return req.headers.get('X-Payment') !== null;
}

/**
 * Get x402 payment header from request
 */
export function getX402PaymentHeader(req: Request): string | null {
  return req.headers.get('X-Payment');
}

/**
 * Create x402 payment requirement response
 */
export function createX402RequirementResponse(
  amount: number,
  resource: string,
  network: string = x402Config.defaults.network
): Response {
  const usdcAddress = (x402Config.networks as Record<string, { usdc: string }>)[network]?.usdc || '0x0000000000000000000000000000000000000000';
  const payToAddress = (x402Config.elizaToken.evm as Record<string, string>)[network] || '0x0000000000000000000000000000000000000000';

  const requirement: PaymentRequirement = {
    scheme: 'exact',
    network,
    maxAmountRequired: amount.toString(),
    payTo: payToAddress as Address,
    asset: usdcAddress as Address,
    resource,
  };

  const requirementHeader = Buffer.from(JSON.stringify(requirement)).toString('base64');

  return Response.json(
    {
      error: {
        message: `Payment required: $${amount.toFixed(2)}`,
        type: 'payment_required',
        code: 'insufficient_balance',
      },
      paymentRequirement: requirement,
    },
    {
      status: 402,
      headers: {
        'X-Payment-Requirement': requirementHeader,
        'WWW-Authenticate': 'x402',
      },
    }
  );
}

/**
 * Verify x402 payment from request
 * Returns payment context if valid, null if invalid
 */
export async function verifyX402PaymentFromRequest(
  req: Request,
  requirement: PaymentRequirement
): Promise<X402PaymentContext | null> {
  const paymentHeader = getX402PaymentHeader(req);
  if (!paymentHeader) return null;

  const result = await verifyX402Payment(paymentHeader, requirement);
  if (!result.isValid || !result.payer) return null;

  return {
    payer: result.payer,
    amount: requirement.maxAmountRequired,
    verified: true,
  };
}
