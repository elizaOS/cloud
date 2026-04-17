import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorToResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { miladySandboxService } from "@/lib/services/milady-sandbox";
// redirect-validation not needed — GitHub uses generic OAuth callback which
// restricts to ALLOWED_REDIRECT_PATHS; we always redirect to a cloud path.
import {
  getProvider,
  isProviderConfigured,
} from "@/lib/services/oauth/provider-registry";
import { initiateOAuth2 } from "@/lib/services/oauth/providers";
import { applyCorsHeaders, handleCorsOptions } from "@/lib/services/proxy/cors";

export const dynamic = "force-dynamic";

const CORS_METHODS = "POST, OPTIONS";

const oauthLinkSchema = z.object({
  scopes: z.array(z.string()).optional(),
  postMessage: z.boolean().optional(),
  returnUrl: z.string().trim().max(2048).optional(),
});

export function OPTIONS() {
  return handleCorsOptions(CORS_METHODS);
}

/**
 * Build the redirect URL for after the GitHub OAuth callback.
 *
 * Unlike Discord (which has its own callback), GitHub uses the generic
 * OAuth callback. We redirect to a server-side completion endpoint that
 * auto-links the OAuth connection to the agent, then redirects to the
 * dashboard. This path is whitelisted in the generic callback's
 * ALLOWED_REDIRECT_PATHS.
 */
function resolveManagedReturnUrl(
  agentId: string,
  organizationId: string,
  userId: string,
  args?: {
    postMessage?: boolean;
    returnUrl?: string;
  },
): string {
  const params = new URLSearchParams({
    agent_id: agentId,
    org_id: organizationId,
    user_id: userId,
  });
  if (args?.postMessage) {
    params.set("post_message", "1");
  }
  if (args?.returnUrl) {
    params.set("return_url", args.returnUrl);
  }
  return `/api/v1/milady/github-oauth-complete?${params.toString()}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { agentId } = await params;

    const provider = getProvider("github");
    if (!provider || !isProviderConfigured(provider)) {
      return applyCorsHeaders(
        NextResponse.json(
          { success: false, error: "GitHub OAuth is not configured" },
          { status: 503 },
        ),
        CORS_METHODS,
      );
    }

    const sandbox = await miladySandboxService.getAgent(
      agentId,
      user.organization_id,
    );
    if (!sandbox) {
      return applyCorsHeaders(
        NextResponse.json(
          { success: false, error: "Agent not found" },
          { status: 404 },
        ),
        CORS_METHODS,
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = oauthLinkSchema.safeParse(body);
    if (!parsed.success) {
      return applyCorsHeaders(
        NextResponse.json(
          {
            success: false,
            error: "Invalid request",
            details: parsed.error.issues,
          },
          { status: 400 },
        ),
        CORS_METHODS,
      );
    }

    const scopes = parsed.data.scopes || provider.defaultScopes || [];
    const redirectUrl = resolveManagedReturnUrl(
      agentId,
      user.organization_id,
      user.id,
      {
        postMessage: parsed.data.postMessage,
        returnUrl: parsed.data.returnUrl,
      },
    );

    const result = await initiateOAuth2(provider, {
      organizationId: user.organization_id,
      userId: user.id,
      redirectUrl,
      scopes,
      connectionRole: "agent",
    });

    return applyCorsHeaders(
      NextResponse.json({
        success: true,
        data: {
          authorizeUrl: result.authUrl,
        },
      }),
      CORS_METHODS,
    );
  } catch (error) {
    return applyCorsHeaders(errorToResponse(error), CORS_METHODS);
  }
}
