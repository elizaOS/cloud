import { NextRequest, NextResponse } from "next/server";
import { AuthenticationError, ForbiddenError } from "@/lib/api/errors";
import { requireAdmin } from "@/lib/auth";
import { getAdminInfrastructureSnapshot } from "@/lib/services/admin-infrastructure";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { role } = await requireAdmin(request);
    if (role !== "super_admin") {
      return NextResponse.json(
        { success: false, error: "Super admin access required" },
        { status: 403 },
      );
    }

    const snapshot = await getAdminInfrastructureSnapshot();

    return NextResponse.json({
      success: true,
      data: snapshot,
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    logger.error("[Admin Infrastructure] Failed to build infrastructure snapshot", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { success: false, error: "Failed to load infrastructure snapshot" },
      { status: 500 },
    );
  }
}
