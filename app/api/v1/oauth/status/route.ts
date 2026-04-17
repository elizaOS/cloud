import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { blooioAutomationService } from "@/lib/services/blooio-automation";
import { oauthService } from "@/lib/services/oauth";
import { twilioAutomationService } from "@/lib/services/twilio-automation";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type LegacyServiceStatus = {
  id: string;
  name: string;
  connected: boolean;
  error?: string;
};

async function getGoogleStatus(
  organizationId: string,
  userId: string,
): Promise<LegacyServiceStatus> {
  try {
    const connections = await oauthService.listConnections({
      organizationId,
      userId,
      platform: "google",
    });

    return {
      id: "google",
      name: "Google",
      connected: connections.some(
        (connection) => connection.status === "active",
      ),
    };
  } catch (error) {
    return {
      id: "google",
      name: "Google",
      connected: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function getTwilioStatus(
  organizationId: string,
): Promise<LegacyServiceStatus> {
  try {
    const status =
      await twilioAutomationService.getConnectionStatus(organizationId);

    return {
      id: "twilio",
      name: "Twilio",
      connected: status.connected,
    };
  } catch (error) {
    return {
      id: "twilio",
      name: "Twilio",
      connected: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function getBlooioStatus(
  organizationId: string,
): Promise<LegacyServiceStatus> {
  try {
    const status =
      await blooioAutomationService.getConnectionStatus(organizationId);

    return {
      id: "blooio",
      name: "Blooio",
      connected: status.connected,
    };
  } catch (error) {
    return {
      id: "blooio",
      name: "Blooio",
      connected: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  let organizationId: string | undefined;

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    organizationId = user.organization_id;

    const services = await Promise.all([
      getGoogleStatus(user.organization_id, user.id),
      getTwilioStatus(user.organization_id),
      getBlooioStatus(user.organization_id),
    ]);

    return NextResponse.json({ services });
  } catch (error) {
    logger.error("[OAuth Status] Failed to build legacy status response", {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof ApiError) {
      return NextResponse.json(error.toJSON(), { status: error.status });
    }

    return NextResponse.json(
      { error: "Failed to fetch OAuth status" },
      { status: 500 },
    );
  }
}
