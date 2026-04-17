// @ts-nocheck — MCP tool types cause exponential type inference
/**
 * LinkedIn MCP Tools - Posts, Profile
 * Uses per-organization OAuth tokens via oauthService.
 *
 * LinkedIn REST API (api.linkedin.com/rest/) requires versioned headers.
 */

import type { McpServer } from "mcp-handler";
import { z } from "zod3";
import { oauthService } from "@/lib/services/oauth";
import { logger } from "@/lib/utils/logger";
import { getAuthContext } from "../lib/context";
import { errorResponse, jsonResponse } from "../lib/responses";

const LINKEDIN_REST_BASE = "https://api.linkedin.com/rest";
const LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const LINKEDIN_API_VERSION = "202601";

async function getLinkedInToken(): Promise<string> {
  const { user } = getAuthContext();
  try {
    const result = await oauthService.getValidTokenByPlatform({
      organizationId: user.organization_id,
      userId: user.id,
      platform: "linkedin",
    });
    return result.accessToken;
  } catch (error) {
    logger.warn("[LinkedInMCP] Failed to get token", {
      organizationId: user.organization_id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(
      "LinkedIn account not connected. Connect in Settings > Connections.",
    );
  }
}

async function linkedinFetch(path: string, options: RequestInit = {}) {
  const token = await getLinkedInToken();
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
    const msg =
      error?.message ||
      error?.serviceErrorCode ||
      `LinkedIn API error: ${response.status}`;
    throw new Error(msg);
  }

  if (response.status === 204) return { _headers: response.headers };
  const text = await response.text();
  if (!text) return { _headers: response.headers };
  const data = JSON.parse(text);
  data._headers = response.headers;
  return data;
}

async function getUserInfo() {
  const token = await getLinkedInToken();
  const response = await fetch(LINKEDIN_USERINFO_URL, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok)
    throw new Error(`LinkedIn userinfo error: ${response.status}`);
  return response.json();
}

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function registerLinkedInTools(server: McpServer): void {
  // --- Connection status ---
  server.registerTool(
    "linkedin_status",
    {
      description: "Check LinkedIn OAuth connection status",
      inputSchema: {},
    },
    async () => {
      try {
        const { user } = getAuthContext();
        const connections = await oauthService.listConnections({
          organizationId: user.organization_id,
          userId: user.id,
          platform: "linkedin",
        });
        const active = connections.find((c) => c.status === "active");
        if (!active) {
          return jsonResponse({
            connected: false,
            message:
              "LinkedIn not connected. Connect in Settings > Connections.",
          });
        }
        return jsonResponse({
          connected: true,
          email: active.email,
          scopes: active.scopes,
          linkedAt: active.linkedAt,
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to check status"));
      }
    },
  );

  // --- Get current user profile ---
  server.registerTool(
    "linkedin_get_profile",
    {
      description:
        "Get the current LinkedIn user's profile information including name, email, and profile picture",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await getUserInfo();
        return jsonResponse({
          id: data.sub,
          personUrn: `urn:li:person:${data.sub}`,
          email: data.email,
          name: data.name,
          givenName: data.given_name,
          familyName: data.family_name,
          picture: data.picture,
          emailVerified: data.email_verified,
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get profile"));
      }
    },
  );

  // --- Create post ---
  server.registerTool(
    "linkedin_create_post",
    {
      description:
        "Create a new LinkedIn post on behalf of the authenticated user. Supports text posts with optional visibility settings.",
      inputSchema: {
        text: z.string().describe("The post content/commentary text"),
        visibility: z
          .enum(["PUBLIC", "CONNECTIONS"])
          .optional()
          .describe(
            "Post visibility. Default: 'PUBLIC'. Use 'CONNECTIONS' to limit to connections only.",
          ),
      },
    },
    async ({ text, visibility = "PUBLIC" }) => {
      try {
        const userInfo = await getUserInfo();
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

        const data = await linkedinFetch("/posts", {
          method: "POST",
          body: JSON.stringify(body),
        });

        const postId = data._headers?.get("x-restli-id") || "unknown";

        logger.info("[LinkedInMCP] Post created", {
          postId,
          author: authorUrn,
        });

        return jsonResponse({
          success: true,
          postId,
          author: authorUrn,
          visibility,
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to create post"));
      }
    },
  );

  // NOTE: List/Get posts require Community Management API (r_organization_social).
  // "Share on LinkedIn" product only supports CREATE, DELETE, and PARTIAL_UPDATE on /rest/posts.

  // --- Delete post ---
  server.registerTool(
    "linkedin_delete_post",
    {
      description: "Delete a LinkedIn post permanently",
      inputSchema: {
        postUrn: z
          .string()
          .describe(
            "The post URN to delete (e.g., urn:li:share:12345 or urn:li:ugcPost:12345)",
          ),
      },
    },
    async ({ postUrn }) => {
      try {
        const encodedUrn = encodeURIComponent(postUrn);
        await linkedinFetch(`/posts/${encodedUrn}`, {
          method: "DELETE",
          headers: { "X-RestLi-Method": "DELETE" },
        });

        return jsonResponse({ success: true, deleted: postUrn });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to delete post"));
      }
    },
  );
}
