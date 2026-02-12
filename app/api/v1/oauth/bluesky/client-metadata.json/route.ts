/**
 * Bluesky AT Protocol Client Metadata Endpoint
 *
 * GET /api/v1/oauth/bluesky/client-metadata.json
 *
 * Serves the AT Protocol client metadata document. This URL is the `client_id`.
 * AT Protocol authorization servers fetch this to validate the client during OAuth.
 */

import { NextResponse } from "next/server";
import { buildBlueskyClientMetadata } from "@/lib/services/oauth/providers";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const metadata = buildBlueskyClientMetadata();
  return NextResponse.json(metadata, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
