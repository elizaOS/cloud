import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleGenericOAuthCallback } from "../generic-callback";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<Response> {
  const provider = request.nextUrl.searchParams.get("provider")?.toLowerCase();

  if (!provider) {
    return NextResponse.json({ error: "provider query parameter is required" }, { status: 400 });
  }

  return handleGenericOAuthCallback(request, {
    params: Promise.resolve({ platform: provider }),
  });
}
