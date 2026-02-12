
import { NextRequest, NextResponse } from "next/server";
import { requireAdminWithResponse } from "@/lib/api/admin-auth";
import { logger } from "@/lib/utils/logger";
import { servicePricingRepository } from "@/db/repositories";

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
    const limit =
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, 500)
        : 50;

    if (!serviceId) {
      return NextResponse.json(
        { error: "service_id query parameter is required" },
        { status: 400 },
      );
    }

    const history = await servicePricingRepository.listAuditHistory(
      serviceId,
      limit,
    );

    return NextResponse.json({
      service_id: serviceId,
      history: history.map(h => ({
        id: h.id,
        method: h.method,
        old_cost: h.old_cost,
        new_cost: h.new_cost,
        reason: h.reason,
        updated_by: h.updated_by,
        created_at: h.created_at,
      })),
    });
  } catch (error) {
    logger.error("[Admin] Service pricing audit error", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
