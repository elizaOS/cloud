/**
 * Storage Quote API
 * 
 * GET /api/v1/storage/quote - Get storage quote for pricing
 * 
 * Implements the Jeju storage marketplace quote interface.
 */

import { NextRequest, NextResponse } from 'next/server';
import { storageProviderService, StorageTier, StorageTierType } from '@/lib/services/storage-provider';

/**
 * GET - Get storage quote
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  
  const sizeBytes = parseInt(searchParams.get('sizeBytes') || '0');
  const durationDays = parseInt(searchParams.get('durationDays') || '30');
  const tierParam = searchParams.get('tier')?.toUpperCase() || 'WARM';
  const replicationFactor = parseInt(searchParams.get('replicationFactor') || '1');
  
  if (sizeBytes <= 0) {
    return NextResponse.json(
      { error: 'sizeBytes is required and must be positive' },
      { status: 400 }
    );
  }
  
  // Parse tier
  const tier = (StorageTier[tierParam as keyof typeof StorageTier] ?? StorageTier.WARM) as StorageTierType;
  
  const quote = storageProviderService.getQuote(
    sizeBytes,
    durationDays,
    tier,
    replicationFactor
  );
  
  return NextResponse.json({
    quote: {
      ...quote,
      priceWei: quote.priceWei.toString(),
    },
    tierOptions: Object.keys(StorageTier).filter(k => isNaN(Number(k))),
    humanReadable: {
      size: `${(sizeBytes / (1024 ** 2)).toFixed(2)} MB`,
      duration: tier === StorageTier.PERMANENT ? 'Permanent' : `${durationDays} days`,
      price: `${quote.priceETH} ETH (${quote.priceUSD})`,
    },
  });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

