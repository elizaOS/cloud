/**
 * GPU Rental API
 *
 * Provides GPU compute resources for training workloads.
 * Integrates with Phala/other TEE providers for H200/H100 GPUs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { db, eq, gpuRentals } from '@/db';
import { v4 as uuidv4 } from 'uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RentalRequest {
  durationHours: number;
  gpuType: 'H200' | 'H100' | 'A100_80' | 'A100_40' | 'RTX4090';
  memoryGb?: number;
  containerImage?: string;
  startupScript?: string;
  sshPublicKey?: string;
}

interface GPUPricing {
  gpuType: string;
  pricePerHourWei: string;
  available: number;
  memoryGb: number;
  teeCapable: boolean;
}

// GPU pricing (in wei per hour) - would come from on-chain in production
const GPU_PRICING: Record<string, GPUPricing> = {
  H200: {
    gpuType: 'H200',
    pricePerHourWei: '5000000000000000', // 0.005 ETH/hr
    available: 10,
    memoryGb: 80,
    teeCapable: true,
  },
  H100: {
    gpuType: 'H100',
    pricePerHourWei: '4000000000000000', // 0.004 ETH/hr
    available: 20,
    memoryGb: 80,
    teeCapable: true,
  },
  A100_80: {
    gpuType: 'A100_80',
    pricePerHourWei: '2000000000000000', // 0.002 ETH/hr
    available: 50,
    memoryGb: 80,
    teeCapable: false,
  },
  A100_40: {
    gpuType: 'A100_40',
    pricePerHourWei: '1500000000000000', // 0.0015 ETH/hr
    available: 100,
    memoryGb: 40,
    teeCapable: false,
  },
  RTX4090: {
    gpuType: 'RTX4090',
    pricePerHourWei: '500000000000000', // 0.0005 ETH/hr
    available: 200,
    memoryGb: 24,
    teeCapable: false,
  },
};

/**
 * POST /api/v1/rentals
 * Create a new GPU rental
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as RentalRequest;

  const pricing = GPU_PRICING[body.gpuType];
  if (!pricing) {
    return NextResponse.json(
      { error: `Invalid GPU type: ${body.gpuType}` },
      { status: 400 }
    );
  }

  if (pricing.available <= 0) {
    return NextResponse.json(
      { error: `No ${body.gpuType} GPUs available` },
      { status: 503 }
    );
  }

  const rentalId = uuidv4();
  const costWei =
    BigInt(pricing.pricePerHourWei) * BigInt(body.durationHours);
  const expiresAt = Date.now() + body.durationHours * 60 * 60 * 1000;

  // In production, this would:
  // 1. Verify payment/credits
  // 2. Provision GPU from Phala/compute provider
  // 3. Setup container with image
  // 4. Configure SSH access

  // For now, create a rental record
  const rental = {
    id: rentalId,
    userId: session.user.id,
    gpuType: body.gpuType,
    durationHours: body.durationHours,
    containerImage: body.containerImage,
    startupScript: body.startupScript,
    sshPublicKey: body.sshPublicKey,
    status: 'provisioning' as const,
    costWei: costWei.toString(),
    expiresAt: new Date(expiresAt),
    createdAt: new Date(),
  };

  // Store rental (if table exists)
  // await db.insert(gpuRentals).values(rental);

  // Simulate provisioning delay
  setTimeout(() => {
    // Update status to 'running'
    console.log(`[GPU Rental] ${rentalId} provisioned`);
  }, 5000);

  return NextResponse.json({
    rentalId,
    providerAddress: '0x1234567890123456789012345678901234567890',
    sshHost: `gpu-${rentalId.slice(0, 8)}.compute.jeju.ai`,
    sshPort: 22,
    expiresAt,
    costWei: costWei.toString(),
    gpuType: body.gpuType,
    containerId: `container-${rentalId.slice(0, 8)}`,
  });
}

/**
 * GET /api/v1/rentals
 * List user's rentals
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // In production, fetch from database
  // const rentals = await db.select().from(gpuRentals).where(eq(gpuRentals.userId, session.user.id));

  return NextResponse.json({
    rentals: [],
  });
}
