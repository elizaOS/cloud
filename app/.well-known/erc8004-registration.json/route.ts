/**
 * ERC-8004 Registration File Endpoint
 *
 * Returns the ERC-8004 registration file that describes this service.
 * This file is referenced by the tokenURI in the Identity Registry NFT.
 *
 * @see https://eips.ethereum.org/EIPS/eip-8004
 */

import { NextResponse } from "next/server";
import { generateRegistrationFile } from "@/lib/config/erc8004";

/**
 * GET /.well-known/erc8004-registration.json
 *
 * Returns the ERC-8004 registration file for Eliza Cloud service.
 */
export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";

  const registrationFile = generateRegistrationFile(baseUrl);

  return NextResponse.json(registrationFile, {
    headers: {
      "Content-Type": "application/json",
      // Cache for 24 hours (registration rarely changes)
      "Cache-Control": "public, max-age=86400",
      // Allow cross-origin access for agent discovery
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * OPTIONS handler for CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

