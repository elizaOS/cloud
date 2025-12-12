/**
 * Custom Domain Route Handler
 *
 * Routes custom domain requests to apps, containers, agents, or MCPs.
 */

import { NextRequest, NextResponse } from "next/server";
import { serveApp, getDomainByCustomDomain, generateErrorPage } from "@/lib/services/app-serve";
import { domainRouterService } from "@/lib/services/domain-router";
import { managedDomainsRepository } from "@/db/repositories/managed-domains";

interface RouteParams {
  params: Promise<{ hostname: string; path?: string[] }>;
}

async function parseParams(params: RouteParams["params"]) {
  const { hostname: encodedHostname, path } = await params;
  return {
    hostname: decodeURIComponent(encodedHostname),
    pathname: path ? `/${path.join("/")}` : "/",
  };
}

function htmlResponse(html: string, status: number, headers: Record<string, string> = {}) {
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html", ...headers } });
}

async function routeRequest(request: NextRequest, params: RouteParams["params"]) {
  const { hostname, pathname } = await parseParams(params);

  // Try managed domains first (supports all resource types)
  const managedDomain = await managedDomainsRepository.findByDomain(hostname);
  if (managedDomain?.resourceType) {
    const result = await domainRouterService.routeCustomDomain(request, hostname, pathname);
    if (result.success) return result.response;
    return htmlResponse(result.html, result.status);
  }

  // Fall back to legacy app domains
  const domain = await getDomainByCustomDomain(hostname);
  if (!domain) {
    return htmlResponse(generateErrorPage("Not Configured", `Domain ${hostname} is not connected to any service.`), 404);
  }
  if (!domain.custom_domain_verified) {
    return htmlResponse(generateErrorPage("Pending Verification", `Domain ${hostname} is pending DNS verification.`), 403);
  }

  const result = await serveApp(domain);
  if (!result.success) return htmlResponse(result.error.html, result.error.status);
  return new NextResponse(result.data.html, { status: 200, headers: { ...result.data.headers, "X-Custom-Domain": hostname } });
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  return routeRequest(request, params);
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { hostname, pathname } = await parseParams(params);
  const result = await domainRouterService.routeCustomDomain(request, hostname, pathname);
  if (result.success) return result.response;
  return NextResponse.json({ error: result.message }, { status: result.status });
}

export const PUT = POST;
export const DELETE = POST;
export const PATCH = POST;

export async function OPTIONS(_request: NextRequest, { params }: RouteParams) {
  const { hostname } = await parseParams(params);
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key, X-Payment",
      "Access-Control-Max-Age": "86400",
      "X-Custom-Domain": hostname,
    },
  });
}

