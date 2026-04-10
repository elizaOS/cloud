/**
 * Generic OAuth Initiate Route
 *
 * POST /api/v1/oauth/[platform]/initiate
 *
 * Initiates OAuth flow for any provider that uses the generic OAuth system.
 * Returns an authorization URL for the user to visit.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { withRateLimit } from "@/lib/middleware/rate-limit";
import { OAuthError } from "@/lib/services/oauth";
import { getProvider, isProviderConfigured } from "@/lib/services/oauth/provider-registry";
import { initiateOAuth2 } from "@/lib/services/oauth/providers";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface InitiateRequestBody {
  redirectUrl?: string;
  scopes?: string[];
  connectionRole?: "owner" | "agent";
}

interface RouteParams {
  params: Promise<{
    platform: string;
  }>;
}

async function handleInitiate(request: NextRequest, context?: RouteParams): Promise<NextResponse> {
  if (!context) {
    return NextResponse.json({ error: "Missing route params" }, { status: 400 });
  }
  const { platform } = await context.params;
  const platformLower = platform.toLowerCase();
  let organizationId: string | undefined;

  // Get provider configuration
  const provider = getProvider(platformLower);

  if (!provider) {
    return NextResponse.json(
      {
        error: "PLATFORM_NOT_SUPPORTED",
        message: `Platform '${platform}' is not supported`,
      },
      { status: 400 },
    );
  }

  // Check if provider uses generic routes
  if (!provider.useGenericRoutes) {
    return NextResponse.json(
      {
        error: "PLATFORM_HAS_LEGACY_ROUTES",
        message: `Platform '${platform}' uses legacy routes. Use ${provider.routes?.initiate || "the platform-specific endpoint"} instead.`,
      },
      { status: 400 },
    );
  }

  // Check if provider is configured
  if (!isProviderConfigured(provider)) {
    logger.error(`[OAuth ${platform}] Provider not configured`, {
      missingEnvVars: provider.envVars.filter((v) => !process.env[v]),
    });
    return NextResponse.json(
      {
        error: "PLATFORM_NOT_CONFIGURED",
        message: `${provider.name} OAuth is not configured on this platform`,
      },
      { status: 503 },
    );
  }

  // Only OAuth2 is supported by the generic flow
  if (provider.type !== "oauth2") {
    return NextResponse.json(
      {
        error: "UNSUPPORTED_AUTH_TYPE",
        message: `Platform '${platform}' uses ${provider.type} authentication which is not supported by generic routes`,
      },
      { status: 400 },
    );
  }

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    organizationId = user.organization_id;

    let body: InitiateRequestBody = {};
    try {
      body = (await request.json()) as InitiateRequestBody;
    } catch {
      // Empty body is fine, use defaults
    }

    const redirectUrl = body.redirectUrl || "/dashboard/settings?tab=connections";
    const scopes = body.scopes || provider.defaultScopes || [];
    const connectionRole =
      body.connectionRole === "owner" || body.connectionRole === "agent"
        ? body.connectionRole
        : undefined;

    if (body.connectionRole && !connectionRole) {
      return NextResponse.json(
        {
          error: "INVALID_CONNECTION_ROLE",
          message: "connectionRole must be 'owner' or 'agent'",
        },
        { status: 400 },
      );
    }

    logger.info(`[OAuth ${platform}] Initiating auth`, {
      organizationId,
      userId: user.id,
      scopeCount: scopes.length,
      connectionRole,
    });

    const result = await initiateOAuth2(provider, {
      organizationId,
      userId: user.id,
      redirectUrl,
      scopes,
      connectionRole,
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
    logger.error(`[OAuth ${platform}] Failed to initiate auth`, {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof ApiError) {
      return NextResponse.json(error.toJSON(), { status: error.status });
    }

    if (error instanceof OAuthError) {
      return NextResponse.json(error.toResponse(), { status: error.httpStatus });
    }

    return NextResponse.json(
      {
        error: "INITIATE_FAILED",
        message: "Failed to initiate OAuth flow",
        details: error instanceof Error ? error.message : undefined,
      },
      { status: 500 },
    );
  }
}

/**
 * Get IP address from request for rate limiting
 */
function getIpKey(request: NextRequest): string {
  const ip =
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  return `oauth:generic:initiate:ip:${ip}`;
}

// Export with rate limiting: 10 requests per minute per IP
// Prevents state cache flooding attacks
export const POST = withRateLimit(handleInitiate, {
  windowMs: 60000, // 1 minute
  maxRequests: 10,
  keyGenerator: getIpKey,
});
