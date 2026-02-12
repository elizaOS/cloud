/**
 * LinkedIn MCP Server - Posts, Profile
 *
 * Standalone MCP endpoint for LinkedIn tools with per-org OAuth.
 * Config: { "type": "streamable-http", "url": "/api/mcps/linkedin/streamable-http" }
 *
 * Uses LinkedIn REST API (api.linkedin.com/rest/) with versioned headers.
 */

import type { NextRequest } from "next/server";
import { logger } from "@/lib/utils/logger";
import { oauthService } from "@/lib/services/oauth";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { authContextStorage } from "@/app/api/mcp/lib/context";
import { checkRateLimitRedis } from "@/lib/middleware/rate-limit-redis";

export const maxDuration = 60;

const LINKEDIN_REST_BASE = "https://api.linkedin.com/rest";
const LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const LINKEDIN_API_VERSION = "202601";

interface McpHandlerResponse {
  status: number;
  headers?: Headers;
  text?: () => Promise<string>;
}

function isMcpHandlerResponse(resp: unknown): resp is McpHandlerResponse {
  return typeof resp === "object" && resp !== null && typeof (resp as McpHandlerResponse).status === "number";
}

let mcpHandler: ((req: Request) => Promise<Response>) | null = null;

async function getLinkedInMcpHandler() {
  if (mcpHandler) return mcpHandler;

  const { createMcpHandler } = await import("mcp-handler");
  const { z } = await import("zod3");

  async function getLinkedInToken(organizationId: string): Promise<string> {
    const result = await oauthService.getValidTokenByPlatform({ organizationId, platform: "linkedin" });
    return result.accessToken;
  }

  function getOrgId(): string {
    const ctx = authContextStorage.getStore();
    if (!ctx) throw new Error("Not authenticated");
    return ctx.user.organization_id;
  }

  async function linkedinFetch(orgId: string, path: string, options: RequestInit = {}) {
    const token = await getLinkedInToken(orgId);
    const url = path.startsWith("http") ? path : `${LINKEDIN_REST_BASE}${path}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": LINKEDIN_API_VERSION,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const msg = error?.message || error?.serviceErrorCode || `LinkedIn API error: ${response.status}`;
      throw new Error(msg);
    }

    if (response.status === 204) return { _headers: response.headers };
    const text = await response.text();
    if (!text) return { _headers: response.headers };
    const data = JSON.parse(text);
    data._headers = response.headers;
    return data;
  }

  async function getUserInfo(orgId: string) {
    const token = await getLinkedInToken(orgId);
    const response = await fetch(LINKEDIN_USERINFO_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`LinkedIn userinfo error: ${response.status}`);
    return response.json();
  }

  function jsonResult(data: object) {
    return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
  }

  function errorResult(msg: string) {
    return { content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }], isError: true };
  }

  mcpHandler = createMcpHandler(
    (server) => {
      // --- Connection status ---
      server.tool("linkedin_status", "Check LinkedIn OAuth connection status", {}, async () => {
        try {
          const orgId = getOrgId();
          const connections = await oauthService.listConnections({ organizationId: orgId, platform: "linkedin" });
          const active = connections.find((c) => c.status === "active");
          if (!active) return jsonResult({ connected: false });
          return jsonResult({ connected: true, email: active.email, scopes: active.scopes });
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : "Failed");
        }
      });

      // --- Get current user profile ---
      server.tool(
        "linkedin_get_profile",
        "Get the current LinkedIn user's profile information including name, email, and profile picture",
        {},
        async () => {
          try {
            const orgId = getOrgId();
            const data = await getUserInfo(orgId);
            return jsonResult({
              id: data.sub,
              personUrn: `urn:li:person:${data.sub}`,
              email: data.email,
              name: data.name,
              givenName: data.given_name,
              familyName: data.family_name,
              picture: data.picture,
              emailVerified: data.email_verified,
            });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed to get profile");
          }
        },
      );

      // --- Create post ---
      server.tool(
        "linkedin_create_post",
        "Create a new LinkedIn post on behalf of the authenticated user. Supports text posts with optional visibility settings.",
        {
          text: z.string().describe("The post content/commentary text"),
          visibility: z.enum(["PUBLIC", "CONNECTIONS"]).optional()
            .describe("Post visibility. Default: 'PUBLIC'. Use 'CONNECTIONS' to limit to connections only."),
        },
        async ({ text, visibility = "PUBLIC" }) => {
          try {
            const orgId = getOrgId();
            const userInfo = await getUserInfo(orgId);
            const authorUrn = `urn:li:person:${userInfo.sub}`;

            const body = {
              author: authorUrn,
              commentary: text,
              visibility,
              distribution: {
                feedDistribution: "MAIN_FEED",
                targetEntities: [],
                thirdPartyDistributionChannels: [],
              },
              lifecycleState: "PUBLISHED",
              isReshareDisabledByAuthor: false,
            };

            const data = await linkedinFetch(orgId, "/posts", {
              method: "POST",
              body: JSON.stringify(body),
            });

            const postId = data._headers?.get("x-restli-id") || "unknown";

            return jsonResult({
              success: true,
              postId,
              author: authorUrn,
              visibility,
            });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed to create post");
          }
        },
      );

      // NOTE: List/Get posts require Community Management API (r_organization_social).
      // "Share on LinkedIn" product only supports CREATE, DELETE, and PARTIAL_UPDATE on /rest/posts.

      // --- Delete post ---
      server.tool(
        "linkedin_delete_post",
        "Delete a LinkedIn post permanently",
        {
          postUrn: z.string().describe("The post URN to delete (e.g., urn:li:share:12345 or urn:li:ugcPost:12345)"),
        },
        async ({ postUrn }) => {
          try {
            const orgId = getOrgId();
            const encodedUrn = encodeURIComponent(postUrn);

            await linkedinFetch(orgId, `/posts/${encodedUrn}`, {
              method: "DELETE",
              headers: { "X-RestLi-Method": "DELETE" },
            });

            return jsonResult({ success: true, deleted: postUrn });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed to delete post");
          }
        },
      );
    },
    { capabilities: { tools: {} } },
    { streamableHttpEndpoint: "/api/mcps/linkedin/streamable-http", disableSse: true, maxDuration: 60 },
  );

  return mcpHandler;
}

async function handleRequest(
  req: NextRequest,
  { params }: { params: Promise<{ transport: string }> },
): Promise<Response> {
  const { transport } = await params;
  if (transport !== "streamable-http") {
    return new Response(
      JSON.stringify({ error: `Transport "${transport}" not supported. Use streamable-http.` }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const authResult = await requireAuthOrApiKeyWithOrg(req);

    const rateLimitKey = `mcp:ratelimit:linkedin:${authResult.user.organization_id}`;
    const rateLimit = await checkRateLimitRedis(rateLimitKey, 60000, 100);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ error: "rate_limit_exceeded" }), { status: 429, headers: { "Content-Type": "application/json" } });
    }

    const handler = await getLinkedInMcpHandler();
    const mcpResponse = await authContextStorage.run(authResult, () => handler(req as Request));

    if (!mcpResponse || !isMcpHandlerResponse(mcpResponse)) {
      return new Response(JSON.stringify({ error: "invalid_response" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    const bodyText = mcpResponse.text ? await mcpResponse.text() : "";
    const headers: Record<string, string> = {};
    mcpResponse.headers?.forEach((v: string, k: string) => { headers[k] = v; });

    return new Response(bodyText, { status: mcpResponse.status, headers });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error(`[LinkedInMCP] ${msg}`);
    const isAuth = msg.includes("API key") || msg.includes("auth") || msg.includes("Unauthorized");
    return new Response(JSON.stringify({ error: isAuth ? "authentication_required" : "internal_error", message: msg }), { status: isAuth ? 401 : 500, headers: { "Content-Type": "application/json" } });
  }
}

export const GET = handleRequest;
export const POST = handleRequest;
export const DELETE = handleRequest;
