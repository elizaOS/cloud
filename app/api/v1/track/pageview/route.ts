import { NextRequest, NextResponse } from "next/server";
import { appsService } from "@/lib/services/apps";
import { logger } from "@/lib/utils/logger";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Api-Key",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * POST /api/v1/track/pageview
 * Lightweight endpoint for tracking page views from sandbox apps.
 * Accepts API key in header or app_id in body.
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await req.json();
    const { app_id, page_url, referrer, screen_width, screen_height, pathname } = body;

    const apiKey = req.headers.get("x-api-key");
    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";
    const origin = req.headers.get("origin") || req.headers.get("referer") || "";

    let appId = app_id;

    if (!appId && apiKey) {
      const app = await appsService.getByApiKeyId(apiKey);
      if (app) {
        appId = app.id;
      }
    }

    if (!appId) {
      return NextResponse.json(
        { success: false, error: "Missing app_id or valid API key" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const app = await appsService.getById(appId);
    if (!app) {
      return NextResponse.json(
        { success: false, error: "App not found" },
        { status: 404, headers: CORS_HEADERS },
      );
    }

    await appsService.trackPageView(appId, {
      pageUrl: page_url || pathname || "/",
      referrer,
      ipAddress,
      userAgent,
      source: origin.includes("sandbox") || origin.includes("vercel.app")
        ? "sandbox_preview"
        : "embed",
      metadata: {
        screen_width,
        screen_height,
        origin,
        pathname,
      },
    });

    logger.debug("[Track] Page view recorded", {
      appId,
      pageUrl: page_url || pathname,
      responseTimeMs: Date.now() - startTime,
    });

    return NextResponse.json(
      { success: true },
      { status: 200, headers: CORS_HEADERS },
    );
  } catch (error) {
    logger.error("[Track] Failed to record page view:", error);
    return NextResponse.json(
      { success: false, error: "Failed to track page view" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
