import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
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

async function getGoogleStatus(organizationId: string): Promise<LegacyServiceStatus> {
  try {
    const connections = await oauthService.listConnections({
      organizationId,
      platform: "google",
    });

    return {
      id: "google",
      name: "Google",
      connected: connections.some((connection) => connection.status === "active"),
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

async function getTwilioStatus(organizationId: string): Promise<LegacyServiceStatus> {
  try {
    const status = await twilioAutomationService.getConnectionStatus(organizationId);

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

async function getBlooioStatus(organizationId: string): Promise<LegacyServiceStatus> {
  try {
    const status = await blooioAutomationService.getConnectionStatus(organizationId);

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
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  try {
    const services = await Promise.all([
      getGoogleStatus(user.organization_id),
      getTwilioStatus(user.organization_id),
      getBlooioStatus(user.organization_id),
    ]);

    return NextResponse.json({ services });
  } catch (error) {
    logger.error("[OAuth Status] Failed to build legacy status response", {
      organizationId: user.organization_id,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json({ error: "Failed to fetch OAuth status" }, { status: 500 });
  }
}
