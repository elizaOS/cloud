/**
 * Solana RPC Methods List API
 *
 * Returns the list of currently allowed Solana RPC methods.
 * Methods are dynamically loaded from the database (service_pricing table).
 *
 * Public endpoint - no authentication required.
 * Useful for:
 * - API consumers to discover available methods
 * - Integration testing
 * - Documentation generation
 *
 * CORS: Unrestricted by design - see lib/services/proxy/cors.ts
 */

import { NextResponse } from "next/server";
import { servicePricingRepository } from "@/db/repositories";
import { getCorsHeaders, handleCorsOptions } from "@/lib/services/proxy/cors";

export const maxDuration = 30;

export async function OPTIONS() {
  return handleCorsOptions("GET, OPTIONS");
}

export async function GET() {
  try {
    const pricingRecords = await servicePricingRepository.listByService("solana-rpc");

    // Only return active methods, excluding internal entries (prefixed with _)
    const activeMethods = pricingRecords
      .filter((record) => record.is_active && !record.method.startsWith("_"))
      .map((record) => ({
        method: record.method,
        cost: Number(record.cost),
        description: record.description,
      }))
      .sort((a, b) => a.method.localeCompare(b.method));

    return NextResponse.json(
      {
        service: "solana-rpc",
        total: activeMethods.length,
        methods: activeMethods,
        note: "Methods are dynamically managed via database. Add new methods via admin API.",
      },
      { headers: getCorsHeaders("GET, OPTIONS") },
    );
  } catch (_error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: getCorsHeaders("GET, OPTIONS") },
    );
  }
}
