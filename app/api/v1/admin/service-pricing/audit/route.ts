import { NextRequest, NextResponse } from "next/server";
import { servicePricingRepository } from "@/db/repositories";
import { requireAdminWithResponse } from "@/lib/api/admin-auth";
import { logger } from "@/lib/utils/logger";

export async function GET(request: NextRequest) {
  const authResult = await requireAdminWithResponse(
    request,
    "[Admin] Service pricing audit auth error",
  );
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const url = new URL(request.url);
    const serviceId = url.searchParams.get("service_id");
    const rawLimit = url.searchParams.get("limit");
    const parsedLimit = rawLimit ? parseInt(rawLimit, 10) : 50;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 500) : 50;
    const rawOffset = url.searchParams.get("offset");
    const parsedOffset = rawOffset ? parseInt(rawOffset, 10) : 0;
    const offset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;

    if (!serviceId) {
      return NextResponse.json(
        { error: "service_id query parameter is required" },
        { status: 400 },
      );
    }

    const history = await servicePricingRepository.listAuditHistory(serviceId, limit, offset);

    return NextResponse.json({
      service_id: serviceId,
      limit,
      offset,
      history: history.map((h) => ({
        id: h.id,
        service_pricing_id: h.service_pricing_id,
        method: h.method,
        old_cost: h.old_cost,
        new_cost: h.new_cost,
        change_type: h.change_type,
        reason: h.reason,
        changed_by: h.changed_by,
        updated_by: h.changed_by,
        ip_address: h.ip_address,
        user_agent: h.user_agent,
        created_at: h.created_at,
      })),
    });
  } catch (error) {
    logger.error("[Admin] Service pricing audit error", { error });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
