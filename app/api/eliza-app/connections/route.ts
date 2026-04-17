import { NextRequest, NextResponse } from "next/server";
import { elizaAppSessionService } from "@/lib/services/eliza-app";
import { getProvider } from "@/lib/services/oauth/provider-registry";

function getRequestedPlatform(request: NextRequest): string | null {
  const platform =
    request.nextUrl.searchParams.get("platform")?.toLowerCase() || "google";
  return getProvider(platform) ? platform : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return NextResponse.json(
      { error: "Authorization header required", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const session = await elizaAppSessionService.validateAuthHeader(authHeader);
  if (!session) {
    return NextResponse.json(
      { error: "Invalid or expired session", code: "INVALID_SESSION" },
      { status: 401 },
    );
  }

  const platform = getRequestedPlatform(request);
  if (!platform) {
    return NextResponse.json(
      { error: "Unsupported platform", code: "PLATFORM_NOT_SUPPORTED" },
      { status: 400 },
    );
  }

  try {
    const { oauthService } = await import("@/lib/services/oauth");
    const connections = await oauthService.listConnections({
      organizationId: session.organizationId,
      userId: session.userId,
      platform,
    });

    const active = connections.find(
      (connection) => connection.status === "active",
    );
    const expired = connections.find(
      (connection) => connection.status === "expired",
    );
    const current = active ?? expired ?? null;

    return NextResponse.json({
      platform,
      connected: Boolean(active),
      status: active ? "active" : expired ? "expired" : "not_connected",
      email: current?.email ?? null,
      scopes: current?.scopes ?? [],
      linkedAt: current?.linkedAt?.toISOString() ?? null,
      connectionId: current?.id ?? null,
      message: active
        ? null
        : expired
          ? "Connection expired. Reconnect Google to keep Gmail and Calendar working."
          : "Not connected yet.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load connection status",
        code: "CONNECTION_STATUS_FAILED",
      },
      { status: 500 },
    );
  }
}
