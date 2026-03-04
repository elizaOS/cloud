import { NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";

// This static route is deprecated in favor of the dynamic route at /api/v1/topup/[amount]/route.ts
export async function POST() {
    logger.warn("Deprecated /api/v1/topup/50 route accessed - use /api/v1/topup/[amount] instead");
    return NextResponse.json({
        error: "This endpoint is deprecated. Please use /api/v1/topup/[amount] instead.",
        statusCode: 410,
        redirectTo: "/api/v1/topup/50"
    }, {
        status: 410,
        headers: {
            'Location': '/api/v1/topup/50'
        }
    });
}
