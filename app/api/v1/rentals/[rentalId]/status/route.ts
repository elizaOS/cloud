/**
 * GPU Rental Status API
 *
 * Get status of a specific rental including training progress.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RentalStatus {
  rentalId: string;
  status: "provisioning" | "running" | "completed" | "failed";
  modelCID?: string;
  modelHash?: string;
  logs?: string;
  error?: string;
  progress?: number;
  currentEpoch?: number;
  totalEpochs?: number;
}

// In-memory status for demo (would be Redis/DB in production)
const rentalStatuses = new Map<string, RentalStatus>();

/**
 * GET /api/v1/rentals/[rentalId]/status
 * Get rental status
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

  // Check in-memory status first
  let status = rentalStatuses.get(rentalId);

  if (!status) {
    // Simulate status progression
    // In production, this would query the actual GPU container
    const randomProgress = Math.random();

    if (randomProgress < 0.3) {
      status = {
        rentalId,
        status: "running",
        progress: Math.floor(Math.random() * 50),
        currentEpoch: Math.floor(Math.random() * 5),
        totalEpochs: 10,
      };
    } else if (randomProgress < 0.9) {
      status = {
        rentalId,
        status: "completed",
        modelCID: `Qm${Array(44)
          .fill(0)
          .map(() => "abcdef0123456789"[Math.floor(Math.random() * 16)])
          .join("")}`,
        modelHash: `0x${Array(64)
          .fill(0)
          .map(() => "abcdef0123456789"[Math.floor(Math.random() * 16)])
          .join("")}`,
        progress: 100,
      };
    } else {
      status = {
        rentalId,
        status: "failed",
        error: "Training failed: GPU memory exhausted",
      };
    }

    rentalStatuses.set(rentalId, status);
  }

  return NextResponse.json(status);
}

/**
 * PUT /api/v1/rentals/[rentalId]/status
 * Update rental status (internal use by compute nodes)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ rentalId: string }> },
) {
  // Verify internal auth (would check compute node signature)
  const authHeader = request.headers.get("X-Compute-Signature");
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { rentalId } = await params;
  const body = (await request.json()) as Partial<RentalStatus>;

  const existing = rentalStatuses.get(rentalId) ?? {
    rentalId,
    status: "provisioning" as const,
  };

  const updated: RentalStatus = {
    ...existing,
    ...body,
    rentalId,
  };

  rentalStatuses.set(rentalId, updated);

  return NextResponse.json({ success: true });
}
