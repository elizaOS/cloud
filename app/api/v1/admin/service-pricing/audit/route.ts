import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { servicePricingRepository } from "@/db/repositories";
import { logger } from "@/lib/utils/logger";

function getAdminAuthStatus(error: unknown): 401 | 403 | null {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes("Unauthorized") ||
    message.includes("Authentication required") ||
    message.includes("Invalid or expired token") ||
    message.includes("Invalid or expired API key") ||
    message.includes("Invalid wallet signature") ||
    message.includes("Wallet authentication failed") ||
    message.includes("Wallet connection required for admin access")
  ) {
    return 401;
  }

  if (message.includes("Admin access required")) {
    return 403;
  }

  return null;
}

function handleAdminError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Internal server error";
  const authStatus = getAdminAuthStatus(error);

  if (authStatus) {
    return NextResponse.json({ error: message }, { status: authStatus });
  }

  logger.error("[Admin Service Pricing Audit] Failed to load audit history", {
    error: message,
  });
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const url = new URL(request.url);
    const serviceId = url.searchParams.get("service_id");

    const parsedLimit = parseInt(url.searchParams.get("limit") || "50", 10);
    const validLimit =
      Number.isNaN(parsedLimit) || parsedLimit < 1 ? 50 : parsedLimit;
    const limit = Math.max(1, Math.min(validLimit, 500));

    const parsedOffset = parseInt(url.searchParams.get("offset") || "0", 10);
    const offset = Math.max(0, Number.isNaN(parsedOffset) ? 0 : parsedOffset);

    if (!serviceId) {
      return NextResponse.json(
        { error: "service_id query parameter required" },
        { status: 400 },
      );
    }

    const history = await servicePricingRepository.listAuditHistory(
      serviceId,
      limit,
      offset,
    );

    return NextResponse.json({
      service_id: serviceId,
      history: history.map((h) => ({
        id: h.id,
        service_pricing_id: h.service_pricing_id,
        method: h.method,
        old_cost: h.old_cost ? Number(h.old_cost) : null,
        new_cost: Number(h.new_cost),
        change_type: h.change_type,
        changed_by: h.changed_by,
        reason: h.reason,
        created_at: h.created_at,
      })),
    });
  } catch (error) {
    return handleAdminError(error);
  }
}
