import { NextRequest, NextResponse } from "next/server";
import { toCompatAgent } from "@/lib/api/compat-envelope";
import { errorToResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { managedMiladyDiscordService } from "@/lib/services/milady-managed-discord";
import { applyCorsHeaders, handleCorsOptions } from "@/lib/services/proxy/cors";

export const dynamic = "force-dynamic";

const CORS_METHODS = "POST, OPTIONS";

export function OPTIONS() {
  return handleCorsOptions(CORS_METHODS);
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const result = await managedMiladyDiscordService.ensureGatewayAgent({
      organizationId: user.organization_id,
      userId: user.id,
    });

    return applyCorsHeaders(
      NextResponse.json({
        success: true,
        data: {
          agent: toCompatAgent(result.sandbox),
          created: result.created,
        },
      }),
      CORS_METHODS,
    );
  } catch (error) {
    return applyCorsHeaders(errorToResponse(error), CORS_METHODS);
  }
}
