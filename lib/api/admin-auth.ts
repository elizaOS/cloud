import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, type AdminAuthResult } from "@/lib/auth";
import { AuthenticationError, ForbiddenError } from "@/lib/api/errors";
import { logger } from "@/lib/utils/logger";

export async function requireAdminWithResponse(
  request: NextRequest,
  logMessage: string,
): Promise<AdminAuthResult | NextResponse> {
  try {
    return await requireAdmin(request);
  } catch (error) {
    if (error instanceof WalletRequiredError || error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof AdminRequiredError || error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error(logMessage, { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
