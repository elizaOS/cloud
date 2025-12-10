/**
 * App Serving Route - Custom Domain
 * 
 * Serves app content for custom domain requests.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  serveApp,
  getDomainByCustomDomain,
  generateErrorPage,
} from "@/lib/services/app-serve";

interface RouteParams {
  params: Promise<{ hostname: string; path?: string[] }>;
}

export async function GET(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { hostname: encodedHostname } = await params;
  const hostname = decodeURIComponent(encodedHostname);

  // Look up domain record by custom domain
  const domain = await getDomainByCustomDomain(hostname);

  if (!domain) {
    return new NextResponse(
      generateErrorPage("Domain Not Configured", `The domain ${hostname} is not connected to any app.`),
      {
        status: 404,
        headers: { "Content-Type": "text/html" },
      }
    );
  }

  // Check if domain is verified
  if (!domain.custom_domain_verified) {
    return new NextResponse(
      generateErrorPage(
        "Domain Not Verified",
        `The domain ${hostname} is pending DNS verification. Please configure your DNS records.`
      ),
      {
        status: 403,
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
    headers: {
      ...result.data.headers,
      "X-Custom-Domain": hostname,
    },
  });
}

