/**
 * App Serving Route - Subdomain
 * 
 * Serves app content for subdomain requests (e.g., myapp.apps.elizacloud.ai).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  serveApp,
  getDomainBySubdomain,
  generateErrorPage,
} from "@/lib/services/app-serve";

const APP_DOMAIN = process.env.APP_DOMAIN || "apps.elizacloud.ai";

interface RouteParams {
  params: Promise<{ subdomain: string; path?: string[] }>;
}

export async function GET(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { subdomain } = await params;

  // Look up domain record
  const domain = await getDomainBySubdomain(subdomain);

  if (!domain) {
    return new NextResponse(
      generateErrorPage("App Not Found", `No app found at ${subdomain}.${APP_DOMAIN}`),
      {
        status: 404,
        headers: { "Content-Type": "text/html" },
      }
    );
  }

  // Serve the app
  const result = await serveApp(domain);

  if (!result.success) {
    return new NextResponse(result.error.html, {
      status: result.error.status,
      headers: { "Content-Type": "text/html" },
    });
  }

  return new NextResponse(result.data.html, {
    status: 200,
    headers: result.data.headers,
  });
}

