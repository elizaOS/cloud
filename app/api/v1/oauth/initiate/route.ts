import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { POST as initiateOAuth } from "@/app/api/v1/oauth/[platform]/initiate/route";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function handle(request: NextRequest): Promise<Response> {
  const provider = request.nextUrl.searchParams.get("provider")?.toLowerCase();

  if (!provider) {
    return NextResponse.json(
      { error: "provider query parameter is required" },
      { status: 400 },
    );
  }

  return initiateOAuth(request, {
    params: Promise.resolve({ platform: provider }),
  });
}

export const GET = handle;
export const POST = handle;
