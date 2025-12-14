import { NextRequest, NextResponse } from "next/server";
import { managedDomainsRepository } from "@/db/repositories/managed-domains";
import { containersRepository } from "@/db/repositories/containers";
import { charactersRepository } from "@/db/repositories/characters";
import { userMcpsRepository } from "@/db/repositories/user-mcps";
import { generateSuspensionPage } from "./app-serve";
import { logger } from "@/lib/utils/logger";

type RouteResult = { success: true; response: NextResponse } | { success: false; status: number; message: string; html: string };

const errorPage = (title: string, message: string) => `<!DOCTYPE html>
<html><head><title>${title}</title><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:linear-gradient(135deg,#1a1a2e,#16213e);color:#e0e0e0}.c{text-align:center;padding:2rem;max-width:500px}h1{font-size:2rem;margin-bottom:1rem;color:#ff6b6b}p{font-size:1.1rem;line-height:1.6;opacity:.8}a{color:#4ecdc4}</style>
</head><body><div class="c"><h1>${title}</h1><p>${message}</p><p><a href="https://eliza.gg">Powered by Eliza</a></p></div></body></html>`;

const fail = (status: number, message: string, html?: string): RouteResult => ({
  success: false, status, message, html: html || errorPage("Error", message),
});

export async function routeCustomDomain(
  request: NextRequest,
  hostname: string,
  pathname: string
): Promise<RouteResult> {
  const domain = await managedDomainsRepository.findByDomain(hostname);

  if (!domain) {
    return fail(404, `Domain ${hostname} not configured`, errorPage("Domain Not Found", `The domain <strong>${hostname}</strong> is not connected to any resource.`));
  }

  if (domain.status === "suspended" || domain.moderationStatus === "suspended") {
    return fail(403, "Domain suspended", generateSuspensionPage(hostname, domain.suspensionReason || undefined));
  }

  if (domain.status === "pending" || !domain.verified) {
    return fail(403, "Domain not verified", errorPage("Pending Verification", `The domain <strong>${hostname}</strong> is pending DNS verification.`));
  }

  switch (domain.resourceType) {
    case "app":
      return routeToApp(request, hostname, pathname);
    case "container":
      return routeToContainer(request, domain.containerId!, hostname, pathname);
    case "agent":
      return routeToAgent(request, domain.agentId!, hostname, pathname);
    case "mcp":
      return routeToMcp(request, domain.mcpId!, hostname, pathname);
    default:
      return fail(404, "Domain not assigned", errorPage("Not Configured", `The domain <strong>${hostname}</strong> is not assigned to any service.`));
  }
}

function routeToApp(request: NextRequest, hostname: string, pathname: string): RouteResult {
  const url = request.nextUrl.clone();
  url.pathname = `/app/_custom/${encodeURIComponent(hostname)}${pathname}`;
  return { success: true, response: NextResponse.rewrite(url) };
}

async function routeToContainer(
  request: NextRequest,
  containerId: string,
  hostname: string,
  pathname: string
): Promise<RouteResult> {
  const container = await containersRepository.findById(containerId);

  if (!container) return fail(404, "Container not found", errorPage("Not Found", "The container no longer exists."));
  if (container.status !== "running") return fail(503, "Container not running", errorPage("Unavailable", `Container is ${container.status}.`));
  if (!container.public_url) return fail(503, "No public URL", errorPage("Unavailable", "Container has no endpoint."));

  const targetUrl = new URL(pathname, container.public_url);
  targetUrl.search = request.nextUrl.search;

  logger.debug("[DomainRouter] Proxying to container", { hostname, containerId });
  return {
    success: true,
    response: NextResponse.rewrite(targetUrl, { headers: { "X-Forwarded-Host": hostname } }),
  };
}

async function routeToAgent(
  request: NextRequest,
  agentId: string,
  hostname: string,
  pathname: string
): Promise<RouteResult> {
  const agent = await charactersRepository.findById(agentId);
  if (!agent) return fail(404, "Agent not found", errorPage("Not Found", "The agent no longer exists."));

  const url = request.nextUrl.clone();

  if (pathname.startsWith("/a2a") || pathname.startsWith("/.well-known/agent")) {
    url.pathname = `/api/a2a/${agentId}${pathname.replace(/^\/a2a/, "")}`;
  } else if (pathname.startsWith("/mcp")) {
    url.pathname = `/api/mcp/${agentId}${pathname.replace(/^\/mcp/, "")}`;
  } else if (pathname === "/" || pathname === "") {
    url.pathname = `/api/agents/${agentId}/card`;
  } else {
    url.pathname = `/api/a2a/${agentId}${pathname}`;
  }

  logger.debug("[DomainRouter] Routing to agent", { hostname, agentId, path: url.pathname });
  return {
    success: true,
    response: NextResponse.rewrite(url, { headers: { "X-Agent-Domain": hostname, "X-Agent-Id": agentId } }),
  };
}

async function routeToMcp(
  request: NextRequest,
  mcpId: string,
  hostname: string,
  pathname: string
): Promise<RouteResult> {
  const mcp = await userMcpsRepository.findById(mcpId);
  if (!mcp) return fail(404, "MCP not found", errorPage("Not Found", "The MCP server no longer exists."));

  let mcpEndpoint: string | undefined;

  if (mcp.endpoint_type === "container" && mcp.container_id) {
    const container = await containersRepository.findById(mcp.container_id);
    mcpEndpoint = container?.public_url;
  } else if (mcp.endpoint_type === "external") {
    mcpEndpoint = mcp.external_endpoint;
  }

  if (!mcpEndpoint) return fail(503, "MCP endpoint not available", errorPage("Unavailable", "MCP has no endpoint."));

  const targetUrl = new URL((mcp.endpoint_path || "/mcp") + pathname, mcpEndpoint);
  targetUrl.search = request.nextUrl.search;

  logger.debug("[DomainRouter] Proxying to MCP", { hostname, mcpId });
  return {
    success: true,
    response: NextResponse.rewrite(targetUrl, { headers: { "X-Forwarded-Host": hostname, "X-MCP-Id": mcpId } }),
  };
}

export const domainRouterService = { routeCustomDomain, errorPage };

