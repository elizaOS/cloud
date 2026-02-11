import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { WalletRequiredError, AdminRequiredError } from "@/lib/auth-errors";
import { logger } from "@/lib/utils/logger";
import { WalletRequiredError, AdminRequiredError } from "@/lib/auth-errors";
import { WalletRequiredError, AdminRequiredError } from "@/lib/auth-errors";
import { logger } from "@/lib/utils/logger";
import { servicePricingRepository } from "@/db/repositories";

export async function GET(request: NextRequest) {
  await requireAdmin(request);

  const url = new URL(request.url);
  const serviceId = url.searchParams.get("service_id");
  
  const parsedLimit = parseInt(url.searchParams.get("limit") || "50", 10);
  const validLimit = Number.isNaN(parsedLimit) || parsedLimit < 1 ? 50 : parsedLimit;
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
}
