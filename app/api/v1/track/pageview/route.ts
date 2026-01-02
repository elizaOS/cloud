import { NextRequest, NextResponse } from "next/server";
import { appsService } from "@/lib/services/apps";
import { apiKeysService } from "@/lib/services/api-keys";
import { logger } from "@/lib/utils/logger";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Api-Key",
  "Access-Control-Max-Age": "86400",
};

function detectSource(origin: string, referer: string, pageUrl: string): string {
  const combined = `${origin} ${referer} ${pageUrl}`.toLowerCase();

  if (
    combined.includes("sandbox") ||
    combined.includes("vercel.app") ||
    combined.includes("vercel.dev") ||
    combined.includes("localhost") ||
    combined.includes("127.0.0.1") ||
    combined.includes("eliza.gg") ||
    combined.includes(".dev.") ||
    combined.includes("-preview")
  ) {
    return "sandbox_preview";
  }

  return "embed";
}

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
    const {
      app_id,
      page_url,
      referrer,
      screen_width,
      screen_height,
      pathname,
    } = body;

    const apiKey = req.headers.get("x-api-key");
    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";
    const origin = req.headers.get("origin") || "";
    const referer = req.headers.get("referer") || "";

    let appId = app_id;

    if (!appId && apiKey) {
      const validatedKey = await apiKeysService.validateApiKey(apiKey);
      if (validatedKey) {
        const app = await appsService.getByApiKeyId(validatedKey.id);
        if (app) {
          appId = app.id;
        }
      }
    }

    if (!appId) {
      return NextResponse.json(
        { success: false, error: "Missing app_id or valid API key" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const app = await appsService.getById(appId);
    if (!app) {
      return NextResponse.json(
        { success: false, error: "App not found" },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const pageUrlValue = page_url || pathname || "/";
    const source = detectSource(origin, referer, pageUrlValue);

    await appsService.trackPageView(appId, {
      pageUrl: pageUrlValue,
      referrer: referrer || referer,
      ipAddress,
      userAgent,
      source,
      metadata: {
        screen_width,
        screen_height,
        origin,
        referer,
        pathname,
      },
    });

    logger.debug("[Track] Page view recorded", {
      appId,
      pageUrl: pageUrlValue,
      source,
      responseTimeMs: Date.now() - startTime,
    });

    return NextResponse.json(
      { success: true },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    logger.error("[Track] Failed to record page view:", error);
    return NextResponse.json(
      { success: false, error: "Failed to track page view" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
