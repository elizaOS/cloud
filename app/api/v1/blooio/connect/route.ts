/**
 * Blooio Connect Route
 *
 * Stores Blooio API credentials for an organization.
 * Unlike OAuth providers, Blooio uses API key authentication.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { blooioAutomationService } from "@/lib/services/blooio-automation";
import { logger } from "@/lib/utils/logger";
import { invalidateOAuthState } from "@/lib/services/oauth/invalidation";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const blooioConnectSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
  webhookSecret: z.string().optional(),
  phoneNumber: z.string().optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Request body must be a JSON object" },
        { status: 400 },
      );
    }

    const parsedBody = blooioConnectSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: parsedBody.error.issues[0]?.message || "Invalid request body" },
        { status: 400 },
      );
    }

    // Frontend sends `phoneNumber`, map to internal `fromNumber`
    const { apiKey, webhookSecret, phoneNumber } = parsedBody.data;
    const fromNumber = phoneNumber;

    // Validate the API key
    const validation = await blooioAutomationService.validateApiKey(apiKey);

    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error || "Invalid API key" },
        { status: 400 },
      );
    }

    // Store credentials
    await blooioAutomationService.storeCredentials(
      user.organization_id,
      user.id,
      {
        apiKey,
        webhookSecret,
        fromNumber,
      },
    );

    // Get the webhook URL to display to user
    const webhookUrl = blooioAutomationService.getWebhookUrl(
      user.organization_id,
    );

    await invalidateOAuthState(user.organization_id, "blooio", user.id);

    logger.info("[Blooio Connect] Credentials stored", {
      organizationId: user.organization_id,
      userId: user.id,
      hasFromNumber: !!fromNumber,
    });

    return NextResponse.json({
      success: true,
      message: "Blooio connected successfully",
      webhookUrl,
      instructions:
        "Configure this webhook URL in your Blooio dashboard to receive inbound messages.",
    });
  } catch (error) {
    logger.error("[Blooio Connect] Failed to connect", {
      error: error instanceof Error ? error.message : String(error),
      organizationId: user.organization_id,
    });
    return NextResponse.json(
      { error: "Failed to connect Blooio" },
      { status: 500 },
    );
  }
}
