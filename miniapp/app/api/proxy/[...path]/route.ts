/**
 * Miniapp Proxy Layer
 *
 * This catch-all route forwards requests to the Eliza Cloud API.
 * It hides the cloud URL from the client and handles authentication.
 *
 * Supported routes:
 *   /api/proxy/user          -> /api/v1/miniapp/user
 *   /api/proxy/agents        -> /api/v1/miniapp/agents
 *   /api/proxy/agents/:id    -> /api/v1/miniapp/agents/:id
 *   /api/proxy/agents/:id/chats -> /api/v1/miniapp/agents/:id/chats
 *   /api/proxy/billing       -> /api/v1/miniapp/billing
 *   /api/proxy/stream/:roomId -> /api/eliza/rooms/:roomId/messages/stream
 */

import { NextRequest, NextResponse } from "next/server";

import { siteConfig } from "@/app/config";
import { getCloudUrl } from "@/lib/cloud-url";
const ELIZA_CLOUD_API_KEY = process.env.ELIZA_CLOUD_API_KEY;
// Optional: App ID for monetization tracking (if your app has monetization enabled)
const ELIZA_APP_ID = process.env.ELIZA_APP_ID;

/**
 * Forward request to Eliza Cloud
 */
async function forwardRequest(
  request: NextRequest,
  path: string[],
  method: string,
): Promise<Response> {
  // Build the target URL
  let targetPath: string;

  // Handle special routes
  if (path[0] === "stream" && path[1]) {
    // Stream endpoint: /api/proxy/stream/:roomId -> /api/eliza/rooms/:roomId/messages/stream
    targetPath = `/api/eliza/rooms/${path[1]}/messages/stream`;
  } else {
    // Miniapp endpoints: /api/proxy/* -> /api/v1/miniapp/*
    targetPath = `/api/v1/miniapp/${path.join("/")}`;
  }

  const cloudUrl = getCloudUrl();
  const targetUrl = new URL(targetPath, cloudUrl);

  // Preserve query parameters
  const url = new URL(request.url);
  url.searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value);
  });

  // Build headers
  const headers = new Headers();

  // Add ngrok-skip-browser-warning header to bypass ngrok's interstitial page
  headers.set("ngrok-skip-browser-warning", "true");

  // Forward essential headers
  const headersToForward = [
    "content-type",
    "accept",
    "origin",
    "referer",
    "user-agent",
    // x402 payment headers for permissionless access
    "x-payment",
    "x-payment-response",
  ];

  for (const header of headersToForward) {
    const value = request.headers.get(header);
    if (value) {
      headers.set(header, value);
    }
  }

  // Add API key authorization (for the miniapp app-level access)
  if (ELIZA_CLOUD_API_KEY) {
    headers.set("X-Api-Key", ELIZA_CLOUD_API_KEY);
  }

  // Add App ID for monetization tracking if configured
  if (ELIZA_APP_ID) {
    headers.set("X-App-Id", ELIZA_APP_ID);
  }

  // Forward authentication header
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");

    // API keys start with "eliza_" - pass as Authorization header
    if (token.startsWith("eliza_")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    // Miniapp tokens start with "miniapp_" - pass as X-Miniapp-Token
    else if (token.startsWith("miniapp_")) {
      headers.set("X-Miniapp-Token", token);
    }
    // Otherwise, pass as-is (could be either)
    else {
      headers.set("Authorization", authHeader);
    }
  }

  // Also forward X-Miniapp-Token if explicitly set
  const miniappToken = request.headers.get("x-miniapp-token");
  if (miniappToken) {
    headers.set("X-Miniapp-Token", miniappToken);
  }

  // Get request body for non-GET requests
  let body: string | null = null;
  if (method !== "GET" && method !== "HEAD") {
    body = await request.text();

    // For stream requests, inject the miniapp's prompt config
    if (path[0] === "stream" && path[1] && body && siteConfig.prompts) {
      const parsedBody = JSON.parse(body) as Record<string, unknown>;
      parsedBody.appPromptConfig = siteConfig.prompts;
      body = JSON.stringify(parsedBody);
    }
  }

  try {
    const response = await fetch(targetUrl.toString(), {
      method,
      headers,
      body,
    });

    const contentType = response.headers.get("content-type") || "";

    // For streaming responses, return as-is
    if (contentType.includes("text/event-stream")) {
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // For JSON responses, parse and forward
    if (contentType.includes("application/json")) {
      const data = await response.json();

      return NextResponse.json(data, {
        status: response.status,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods":
            "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers":
            "Content-Type, Authorization, X-Miniapp-Token",
        },
      });
    }

    // For other responses (text, html, etc.), forward as-is
    const text = await response.text();
    return new Response(text, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods":
          "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-Miniapp-Token",
      },
    });
  } catch (error) {
    console.error("[Miniapp Proxy] Error forwarding request:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to connect to Eliza Cloud",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      {
        status: 502,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }
}

/**
 * OPTIONS handler for CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-Miniapp-Token, X-Payment, X-Payment-Response",
      "Access-Control-Expose-Headers": "X-Payment-Requirement",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return forwardRequest(request, path, "GET");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return forwardRequest(request, path, "POST");
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return forwardRequest(request, path, "PUT");
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return forwardRequest(request, path, "PATCH");
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return forwardRequest(request, path, "DELETE");
}
