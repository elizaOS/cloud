/**
 * GET /api/v1/defi/health - DeFi services health check
 */

import { NextResponse } from "next/server";
import { checkServicesHealth } from "@/lib/services/defi/operations";

export async function GET() {
  const result = await checkServicesHealth();
  return NextResponse.json(result);
}
