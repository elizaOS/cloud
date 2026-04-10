import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorToResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import {
  assertAllowedAbsoluteRedirectUrl,
  getDefaultPlatformRedirectOrigins,
  sanitizeRelativeRedirectPath,
} from "@/lib/security/redirect-validation";
import { discordAutomationService } from "@/lib/services/discord-automation";
import { miladySandboxService } from "@/lib/services/milady-sandbox";
import { applyCorsHeaders, handleCorsOptions } from "@/lib/services/proxy/cors";

export const dynamic = "force-dynamic";

const CORS_METHODS = "POST, OPTIONS";
const LOOPBACK_REDIRECT_ORIGINS = [
  "http://localhost:*",
  "http://127.0.0.1:*",
  "https://localhost:*",
  "https://127.0.0.1:*",
] as const;

const oauthLinkSchema = z.object({
  returnUrl: z.string().trim().optional(),
  botNickname: z.string().trim().max(32).optional(),
});

export function OPTIONS() {
  return handleCorsOptions(CORS_METHODS);
}

function resolveManagedReturnUrl(rawValue: string | undefined): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const defaultPath = "/dashboard/settings?tab=agents";

  if (!rawValue) {
    return new URL(defaultPath, baseUrl).toString();
  }

  if (rawValue.startsWith("/")) {
    return new URL(sanitizeRelativeRedirectPath(rawValue, defaultPath), baseUrl).toString();
  }

  return assertAllowedAbsoluteRedirectUrl(rawValue, [
    ...getDefaultPlatformRedirectOrigins(),
    ...LOOPBACK_REDIRECT_ORIGINS,
  ]).toString();
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { agentId } = await params;

    if (!discordAutomationService.isOAuthConfigured()) {
      return applyCorsHeaders(
        NextResponse.json(
          { success: false, error: "Discord integration is not configured" },
          { status: 503 },
        ),
        CORS_METHODS,
      );
    }

    const sandbox = await miladySandboxService.getAgent(agentId, user.organization_id);
    if (!sandbox) {
      return applyCorsHeaders(
        NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 }),
        CORS_METHODS,
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = oauthLinkSchema.safeParse(body);
    if (!parsed.success) {
      return applyCorsHeaders(
        NextResponse.json(
          { success: false, error: "Invalid request", details: parsed.error.issues },
          { status: 400 },
        ),
        CORS_METHODS,
      );
    }

    const authorizeUrl = discordAutomationService.generateOAuthUrl({
      organizationId: user.organization_id,
      userId: user.id,
      agentId,
      flow: "milady-managed",
      nonce: randomBytes(16).toString("hex"),
      returnUrl: resolveManagedReturnUrl(parsed.data.returnUrl),
      ...(parsed.data.botNickname?.trim()
        ? { botNickname: parsed.data.botNickname.trim() }
        : sandbox.agent_name?.trim()
          ? { botNickname: sandbox.agent_name.trim().slice(0, 32) }
          : {}),
    });

    return applyCorsHeaders(
      NextResponse.json({
        success: true,
        data: {
          authorizeUrl,
          applicationId: discordAutomationService.getApplicationId(),
        },
      }),
      CORS_METHODS,
    );
  } catch (error) {
    return applyCorsHeaders(errorToResponse(error), CORS_METHODS);
  }
}
