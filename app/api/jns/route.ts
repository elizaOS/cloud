/**
 * JNS (Jeju Name Service) API Route
 *
 * Provides JNS status and resolution endpoints for Eliza Cloud.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getJNSClient,
  isJNSConfigured,
  getJNSDebugInfo,
  JEJU_APPS,
} from "@/lib/utils/jns";

export const dynamic = "force-dynamic";

/**
 * GET /api/jns - Get JNS status and configuration
 *
 * Query params:
 * - resolve: name to resolve (e.g., "gateway.jeju")
 * - app: Jeju app key to resolve (e.g., "gateway")
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const resolveParam = searchParams.get("resolve");
  const appParam = searchParams.get("app");

  // Get JNS configuration info
  const debugInfo = getJNSDebugInfo();

  // If resolve param provided, resolve the name
  if (resolveParam) {
    if (!debugInfo.configured) {
      return NextResponse.json(
        {
          error: "JNS not configured",
          configured: false,
          debugInfo,
        },
        { status: 503 },
      );
    }

    const client = getJNSClient();
    const resolved = await client.resolveApp(resolveParam);

    return NextResponse.json({
      status: "ok",
      configured: true,
      query: resolveParam,
      resolved,
      debugInfo,
    });
  }

  // If app param provided, resolve the Jeju app
  if (appParam) {
    const appName = JEJU_APPS[appParam as keyof typeof JEJU_APPS];
    if (!appName) {
      return NextResponse.json(
        {
          error: `Unknown Jeju app: ${appParam}`,
          validApps: Object.keys(JEJU_APPS),
        },
        { status: 400 },
      );
    }

    if (!debugInfo.configured) {
      return NextResponse.json(
        {
          error: "JNS not configured",
          configured: false,
          debugInfo,
        },
        { status: 503 },
      );
    }

    const client = getJNSClient();
    const [a2aEndpoint, mcpEndpoint] = await Promise.all([
      client.getAppA2AEndpoint(appParam as keyof typeof JEJU_APPS),
      client.getAppMCPEndpoint(appParam as keyof typeof JEJU_APPS),
    ]);

    return NextResponse.json({
      status: "ok",
      configured: true,
      app: appParam,
      name: appName,
      a2aEndpoint,
      mcpEndpoint,
      debugInfo,
    });
  }

  // Default: return status
  return NextResponse.json({
    status: "ok",
    configured: debugInfo.configured,
    apps: JEJU_APPS,
    debugInfo,
  });
}

