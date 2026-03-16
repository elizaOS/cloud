import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getAdminInfrastructureSnapshot } from "@/lib/services/admin-infrastructure";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { role } = await requireAdmin(request);
  if (role !== "super_admin") {
    return NextResponse.json(
      { success: false, error: "Super admin access required" },
      { status: 403 },
    );
  }

  try {
    const snapshot = await getAdminInfrastructureSnapshot();

    return NextResponse.json({
      success: true,
      data: snapshot,
    });
  } catch (error) {
    logger.error("[Admin Infrastructure] Failed to build infrastructure snapshot", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { success: false, error: "Failed to load infrastructure snapshot" },
      { status: 500 },
    );
  }
}
