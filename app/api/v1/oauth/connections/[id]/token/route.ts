/**
 * GET /api/v1/oauth/connections/:id/token
 *
 * Removed. Raw OAuth tokens must never be exposed via user-facing APIs.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  return NextResponse.json({ error: "Not Found" }, { status: 404 });
}
