import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { POST as connectBlooio } from "@/app/api/v1/blooio/connect/route";
import {
  DELETE as disconnectBlooio,
  POST as disconnectBlooioPost,
} from "@/app/api/v1/blooio/disconnect/route";
import { POST as connectTwilio } from "@/app/api/v1/twilio/connect/route";
import {
  DELETE as disconnectTwilio,
  POST as disconnectTwilioPost,
} from "@/app/api/v1/twilio/disconnect/route";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type RouteParams = Promise<{
  platform: string;
}>;

async function resolvePlatform(
  params: RouteParams,
): Promise<"twilio" | "blooio" | null> {
  const { platform } = await params;
  const normalized = platform.toLowerCase();

  if (normalized === "twilio" || normalized === "blooio") {
    return normalized;
  }

  return null;
}

export async function POST(
  request: NextRequest,
  context: { params: RouteParams },
): Promise<Response> {
  const platform = await resolvePlatform(context.params);

  if (!platform) {
    return NextResponse.json(
      { error: "Unsupported platform" },
      { status: 404 },
    );
  }

  if (platform === "twilio") {
    return connectTwilio(request);
  }

  return connectBlooio(request);
}

export async function DELETE(
  request: NextRequest,
  context: { params: RouteParams },
): Promise<Response> {
  const platform = await resolvePlatform(context.params);

  if (!platform) {
    return NextResponse.json(
      { error: "Unsupported platform" },
      { status: 404 },
    );
  }

  if (platform === "twilio") {
    return disconnectTwilio(request);
  }

  return disconnectBlooio(request);
}

// Support clients that used POST for disconnect semantics.
export async function PATCH(
  request: NextRequest,
  context: { params: RouteParams },
): Promise<Response> {
  const platform = await resolvePlatform(context.params);

  if (!platform) {
    return NextResponse.json(
      { error: "Unsupported platform" },
      { status: 404 },
    );
  }

  if (platform === "twilio") {
    return disconnectTwilioPost(request);
  }

  return disconnectBlooioPost(request);
}
