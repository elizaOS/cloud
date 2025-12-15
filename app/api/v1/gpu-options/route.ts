/**
 * GPU Options API
 *
 * Lists available GPU types, pricing, and availability.
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface GPUOption {
  gpuType: "H200" | "H100" | "A100_80" | "A100_40" | "RTX4090";
  available: number;
  pricePerHourWei: string;
  memoryGb: number;
  teeCapable: boolean;
  description: string;
  provider: string;
}

// GPU options - would come from on-chain registry in production
const GPU_OPTIONS: GPUOption[] = [
  {
    gpuType: "H200",
    available: 10,
    pricePerHourWei: "5000000000000000", // 0.005 ETH/hr
    memoryGb: 80,
    teeCapable: true,
    description: "NVIDIA H200 80GB HBM3e - Best for large model training",
    provider: "Phala Network",
  },
  {
    gpuType: "H100",
    available: 20,
    pricePerHourWei: "4000000000000000", // 0.004 ETH/hr
    memoryGb: 80,
    teeCapable: true,
    description: "NVIDIA H100 80GB HBM3 - Excellent for GRPO training",
    provider: "Phala Network",
  },
  {
    gpuType: "A100_80",
    available: 50,
    pricePerHourWei: "2000000000000000", // 0.002 ETH/hr
    memoryGb: 80,
    teeCapable: false,
    description: "NVIDIA A100 80GB - Great value for medium models",
    provider: "Community Providers",
  },
  {
    gpuType: "A100_40",
    available: 100,
    pricePerHourWei: "1500000000000000", // 0.0015 ETH/hr
    memoryGb: 40,
    teeCapable: false,
    description: "NVIDIA A100 40GB - Cost-effective training",
    provider: "Community Providers",
  },
  {
    gpuType: "RTX4090",
    available: 200,
    pricePerHourWei: "500000000000000", // 0.0005 ETH/hr
    memoryGb: 24,
    teeCapable: false,
    description: "NVIDIA RTX 4090 24GB - Budget-friendly option",
    provider: "Community Providers",
  },
];

/**
 * GET /api/v1/gpu-options
 * List available GPU types and pricing
 */
export async function GET(_request: NextRequest) {
  // In production, fetch real-time availability from compute marketplace
  // const registry = await getComputeRegistry();
  // const options = await registry.getAvailableGPUs();

  return NextResponse.json({
    options: GPU_OPTIONS,
    lastUpdated: new Date().toISOString(),
    network: "jeju-mainnet",
  });
}
