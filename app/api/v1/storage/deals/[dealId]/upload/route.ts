/**
 * Storage Deal Upload API
 * 
 * POST /api/v1/storage/deals/[dealId]/upload - Upload content for a deal
 */

import { NextRequest, NextResponse } from 'next/server';
import { storageProviderService } from '@/lib/services/storage-provider';
import { logger } from '@/lib/utils/logger';

export const maxDuration = 120;

interface RouteParams {
  params: Promise<{ dealId: string }>;
}

/**
 * POST - Upload content for deal
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { dealId } = await params;
  
  // Verify deal exists
  const deal = storageProviderService.getDeal(dealId);
  if (!deal) {
    return NextResponse.json(
      { error: 'Deal not found' },
      { status: 404 }
    );
  }
  
  // Get file from form data
  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  
  if (!file) {
    return NextResponse.json(
      { error: 'No file provided' },
      { status: 400 }
    );
  }
  
  // Verify size matches deal
  if (file.size > deal.size * 1.1) { // Allow 10% tolerance
    return NextResponse.json(
      { 
        error: 'File size exceeds deal limit',
        dealSize: deal.size,
        fileSize: file.size,
      },
      { status: 400 }
    );
  }
  
  logger.info('[Storage Deals] Uploading content', {
    dealId,
    filename: file.name,
    size: file.size,
  });
  
  // Read file content
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  // Upload content
  const result = await storageProviderService.uploadForDeal(dealId, buffer, {
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
  });
  
  // Get updated deal
  const updatedDeal = storageProviderService.getDeal(dealId);
  
  return NextResponse.json({
    success: true,
    dealId,
    cid: updatedDeal?.cid,
    blobUrl: result.blobUrl,
    ipfsCid: result.ipfsCid,
    gatewayUrl: result.gatewayUrl,
    status: updatedDeal?.status,
    expiresAt: updatedDeal?.expiresAt?.toISOString(),
  });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    },
  });
}

