import { type NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { getCostBreakdown } from "@/lib/services";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKey(req);
    const searchParams = req.nextUrl.searchParams;

    const dimension = (searchParams.get("dimension") ||
      "model") as "model" | "provider" | "user" | "apiKey";
    const sortBy = (searchParams.get("sortBy") || "cost") as
      | "cost"
      | "requests"
      | "tokens";
    const sortOrder = (searchParams.get("sortOrder") || "desc") as
      | "asc"
      | "desc";
    const limit = parseInt(searchParams.get("limit") || "100", 10);

    const startDate = searchParams.get("startDate")
      ? new Date(searchParams.get("startDate")!)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = searchParams.get("endDate")
      ? new Date(searchParams.get("endDate")!)
      : new Date();

    const breakdown = await getCostBreakdown(
      user.organization_id,
      dimension,
      {
        startDate,
        endDate,
        sortBy,
        sortOrder,
        limit,
      }
    );

    return NextResponse.json({
      success: true,
      data: breakdown.map((item) => ({
        dimension: item.dimension,
        value: item.value,
        cost: item.cost,
        spent: item.cost,
        requests: item.requests,
        tokens: item.tokens,
        successCount: item.successCount,
        totalCount: item.totalCount,
        successRate:
          item.totalCount > 0 ? item.successCount / item.totalCount : 1.0,
      })),
    });
  } catch (error) {
    console.error("[Analytics Breakdown] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch breakdown data",
      },
      { status: 500 }
    );
  }
}
