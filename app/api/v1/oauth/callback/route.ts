import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { GET as handleGenericCallback } from "@/app/api/v1/oauth/[platform]/callback/route";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<Response> {
  const provider = request.nextUrl.searchParams.get("provider")?.toLowerCase();

  if (!provider) {
    return NextResponse.json({ error: "provider query parameter is required" }, { status: 400 });
  }

  return handleGenericCallback(request, {
    params: Promise.resolve({ platform: provider }),
  });
}
