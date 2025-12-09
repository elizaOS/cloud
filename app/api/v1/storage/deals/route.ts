/**
 * Storage Deals API
 * 
 * Marketplace-compatible storage deal management.
 * Implements the Jeju storage marketplace provider interface.
 * 
 * POST /api/v1/storage/deals - Create a storage deal (x402 payment required)
 * GET /api/v1/storage/deals - List deals for a user
 * 
 * @see apps/storage for the core storage marketplace
 */

import { NextRequest, NextResponse } from 'next/server';
import { storageProviderService, StorageTier, StorageTierType } from '@/lib/services/storage-provider';
import {
  X402_ENABLED,
  X402_RECIPIENT_ADDRESS,
  getDefaultNetwork,
  isX402Configured,
} from '@/lib/config/x402';
import { logger } from '@/lib/utils/logger';

export const maxDuration = 60;

/**
 * POST - Create a new storage deal
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();
  
  const { 
    sizeBytes, 
    durationDays = 30, 
    tier = StorageTier.WARM,
    replicationFactor = 1,
    user,
  } = body;
  
  if (!sizeBytes || sizeBytes <= 0) {
    return NextResponse.json(
      { error: 'sizeBytes is required and must be positive' },
      { status: 400 }
    );
  }
  
  if (!user) {
    return NextResponse.json(
      { error: 'user address is required' },
      { status: 400 }
    );
  }
  
  // Check for payment
  const paymentHeader = request.headers.get('X-PAYMENT');
  
  if (!paymentHeader && X402_ENABLED && isX402Configured()) {
    // Return payment requirement
    const paymentReq = storageProviderService.getPaymentRequirement('create_deal', {
      sizeBytes,
      durationDays,
      tier: tier as StorageTierType,
    });
    
    return NextResponse.json(
      {
        error: 'Payment required',
        message: 'Storage deal creation requires x402 payment',
        paymentRequirement: paymentReq,
      },
      {
        status: 402,
        headers: {
          'X-Payment-Requirement': JSON.stringify(paymentReq),
          'WWW-Authenticate': 'x402',
          'Access-Control-Expose-Headers': 'X-Payment-Requirement',
        },
      }
    );
  }
  
  logger.info('[Storage Deals] Creating deal', {
    user,
    sizeBytes,
    durationDays,
    tier,
    hasPayment: !!paymentHeader,
  });
  
  const { dealId, quote } = await storageProviderService.createDeal({
    user,
    sizeBytes,
    durationDays,
    tier: tier as StorageTierType,
    replicationFactor,
  });
  
  return NextResponse.json({
    success: true,
    dealId,
    quote: {
      ...quote,
      priceWei: quote.priceWei.toString(),
    },
    uploadEndpoint: `/api/v1/storage/deals/${dealId}/upload`,
    expiresIn: '24 hours',
  });
}

/**
 * GET - List deals for a user
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const user = searchParams.get('user');
  
  if (!user) {
    // Return provider info
    const info = storageProviderService.getProviderInfo();
    const stats = await storageProviderService.getStats();
    
    return NextResponse.json({
      provider: info,
      stats: {
        ...stats,
        totalRevenueWei: stats.totalRevenueWei.toString(),
      },
      x402Enabled: X402_ENABLED,
      x402Configured: isX402Configured(),
      network: getDefaultNetwork(),
    });
  }
  
  // List deals for user
  const deals = storageProviderService.listDeals(user);
  
  return NextResponse.json({
    user,
    count: deals.length,
    deals: deals.map(d => ({
      ...d,
      price: d.price.toString(),
    })),
  });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-PAYMENT',
      'Access-Control-Expose-Headers': 'X-Payment-Requirement',
    },
  });
}

