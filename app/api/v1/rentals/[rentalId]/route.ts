/**
 * GPU Rental Management API
 *
 * Get, update, or terminate a specific rental.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Rental {
  id: string;
  userId: string;
  gpuType: string;
  status: "provisioning" | "running" | "completed" | "failed" | "terminated";
  sshHost: string;
  sshPort: number;
  containerImage?: string;
  expiresAt: Date;
  createdAt: Date;
  terminatedAt?: Date;
}

// In-memory rentals for demo
const rentals = new Map<string, Rental>();

/**
 * GET /api/v1/rentals/[rentalId]
 * Get rental details
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ rentalId: string }> },
) {
  const user = await requireAuth().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { rentalId } = await params;

  const rental = rentals.get(rentalId);
  if (!rental) {
    // Return simulated rental for demo
    return NextResponse.json({
      id: rentalId,
      userId: user.id,
      gpuType: "H200",
      status: "running",
      sshHost: `gpu-${rentalId.slice(0, 8)}.compute.jeju.ai`,
      sshPort: 22,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      createdAt: new Date().toISOString(),
    });
  }

  // Verify ownership
  if (rental.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(rental);
}

/**
 * DELETE /api/v1/rentals/[rentalId]
 * Terminate a rental early
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ rentalId: string }> },
) {
  const user = await requireAuth().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { rentalId } = await params;

  let rental = rentals.get(rentalId);

  if (!rental) {
    // Create a mock terminated rental
    rental = {
      id: rentalId,
      userId: user.id,
      gpuType: "H200",
      status: "terminated",
      sshHost: `gpu-${rentalId.slice(0, 8)}.compute.jeju.ai`,
      sshPort: 22,
      expiresAt: new Date(),
      createdAt: new Date(Date.now() - 3600000),
      terminatedAt: new Date(),
    };
    rentals.set(rentalId, rental);
  } else {
    // Verify ownership
    if (rental.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    rental.status = "terminated";
    rental.terminatedAt = new Date();
  }

  // In production:
  // 1. Stop the container
  // 2. Release GPU resources
  // 3. Calculate refund if applicable
  // 4. Update on-chain rental contract

  console.log(`[GPU Rental] ${rentalId} terminated by user`);

  return NextResponse.json({
    success: true,
    rentalId,
    status: "terminated",
    refundWei: "0", // No refund in demo
  });
}
