import { NextRequest, NextResponse } from "next/server";
import { elizaAppSessionService } from "@/lib/services/eliza-app";
import { oauthService } from "@/lib/services/oauth";
import { getProvider } from "@/lib/services/oauth/provider-registry";

interface InitiateBody {
  returnPath?: string;
  scopes?: string[];
}

function sanitizeReturnPath(path: string | undefined): string {
  if (!path || !path.startsWith("/")) {
    return "/connected";
  }

  return path;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
): Promise<NextResponse> {
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

  const { platform } = await params;
  const normalizedPlatform = platform.toLowerCase();
  const provider = getProvider(normalizedPlatform);
  if (!provider) {
    return NextResponse.json(
      { error: "Unsupported platform", code: "PLATFORM_NOT_SUPPORTED" },
      { status: 400 },
    );
  }

  let body: InitiateBody = {};
  try {
    body = (await request.json()) as InitiateBody;
  } catch {
    // Empty body is fine.
  }

  const returnPath = sanitizeReturnPath(body.returnPath);
  const redirectUrl = `/api/eliza-app/auth/connection-success?source=eliza-app&return_path=${encodeURIComponent(returnPath)}`;

  try {
    const result = await oauthService.initiateAuth({
      organizationId: session.organizationId,
      userId: session.userId,
      platform: normalizedPlatform,
      redirectUrl,
      scopes: body.scopes,
    });

    return NextResponse.json({
      authUrl: result.authUrl,
      state: result.state,
      provider: {
        id: provider.id,
        name: provider.name,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to initiate OAuth",
        code: "INITIATE_FAILED",
      },
      { status: 500 },
    );
  }
}
