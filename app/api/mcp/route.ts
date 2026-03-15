import type { NextRequest } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { checkRateLimitRedis } from "@/lib/middleware/rate-limit-redis";
import { authContextStorage } from "./lib/context";

export const maxDuration = 60;
let mcpHandlerPromise: Promise<(req: Request) => Promise<unknown>> | null = null;

/**
 * Response shape from mcp-handler's createMcpHandler().
 * We extract properties manually because undici polyfills Response,
 * breaking instanceof checks with Next.js native Response.
 */
interface McpHandlerResponse {
  status: number;
  statusText?: string;
  headers?: Headers;
  text?: () => Promise<string>;
}

function isMcpHandlerResponse(resp: unknown): resp is McpHandlerResponse {
  return (
    typeof resp === "object" &&
    resp !== null &&
    typeof (resp as McpHandlerResponse).status === "number"
  );
}

export async function getMcpHandler() {
  if (!mcpHandlerPromise) {
    mcpHandlerPromise = (async () => {
      const [{ createMcpHandler }, ...toolModules] = await Promise.all([
        import("mcp-handler"),
        import("./tools/credits"),
        import("./tools/api-keys"),
        import("./tools/generation"),
        import("./tools/memory"),
        import("./tools/conversations"),
        import("./tools/agents"),
        import("./tools/containers"),
        import("./tools/mcps"),
        import("./tools/rooms"),
        import("./tools/user"),
        import("./tools/knowledge"),
        import("./tools/redemption"),
        import("./tools/analytics"),
        import("./tools/google"),
        import("./tools/hubspot"),
        import("./tools/linear"),
        import("./tools/notion"),
        import("./tools/github"),
        import("./tools/asana"),
        import("./tools/dropbox"),
        import("./tools/salesforce"),
        import("./tools/airtable"),
        import("./tools/zoom"),
        import("./tools/jira"),
        import("./tools/linkedin"),
        import("./tools/twitter"),
      ]);

      const [
        credits,
        apiKeys,
        generation,
        memory,
        conversations,
        agents,
        containers,
        mcps,
        rooms,
        user,
        knowledge,
        redemption,
        analytics,
        google,
        hubspot,
        linear,
        notion,
        github,
        asana,
        dropbox,
        salesforce,
        airtable,
        zoom,
        jira,
        linkedin,
        twitter,
      ] = toolModules;

      return createMcpHandler(
        (server) => {
          credits.registerCreditTools(server);
          apiKeys.registerApiKeyTools(server);
          generation.registerGenerationTools(server);
          memory.registerMemoryTools(server);
          conversations.registerConversationTools(server);
          agents.registerAgentTools(server);
          containers.registerContainerTools(server);
          mcps.registerMcpTools(server);
          rooms.registerRoomTools(server);
          user.registerUserTools(server);
          knowledge.registerKnowledgeTools(server);
          redemption.registerRedemptionTools(server);
          analytics.registerAnalyticsTools(server);
          google.registerGoogleTools(server);
          hubspot.registerHubSpotTools(server);
          linear.registerLinearTools(server);
          notion.registerNotionTools(server);
          github.registerGitHubTools(server);
          asana.registerAsanaTools(server);
          dropbox.registerDropboxTools(server);
          salesforce.registerSalesforceTools(server);
          airtable.registerAirtableTools(server);
          zoom.registerZoomTools(server);
          jira.registerJiraTools(server);
          linkedin.registerLinkedInTools(server);
          twitter.registerTwitterTools(server);
        },
        {},
        { basePath: "/api" },
      );
    })();
  }

  return await mcpHandlerPromise;
}

/**
 * Handles MCP protocol requests (GET, POST, DELETE).
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleMcpRequest(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handleMcpRequest(req);
}

export async function DELETE(req: NextRequest): Promise<Response> {
  return handleMcpRequest(req);
}

async function handleMcpRequest(req: NextRequest): Promise<Response> {
  try {
    const authResult = await requireAuthOrApiKeyWithOrg(req);

    // Rate limiting
    const rateLimitKey = `mcp:ratelimit:${authResult.user.organization_id}`;
    const rateLimit = await checkRateLimitRedis(rateLimitKey, 60000, 100);

    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ error: "rate_limit_exceeded" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Call MCP handler with auth context (lazy-loaded)
    const handler = await getMcpHandler();
    const mcpResponse = await authContextStorage.run(authResult, async () => {
      return await handler(req as Request);
    });

    if (!mcpResponse) {
      return new Response(JSON.stringify({ error: "no_response" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Convert MCP handler response (use type guard for safety)
    if (!isMcpHandlerResponse(mcpResponse)) {
      return new Response(JSON.stringify({ error: "invalid_response" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const bodyText = mcpResponse.text ? await mcpResponse.text() : "";
    const headers: Record<string, string> = {};
    if (mcpResponse.headers && typeof mcpResponse.headers.forEach === "function") {
      mcpResponse.headers.forEach((value: string, key: string) => {
        headers[key] = value;
      });
    }

    return new Response(bodyText, {
      status: mcpResponse.status,
      headers,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const isAuthError =
      errorMessage.includes("API key") ||
      errorMessage.includes("auth") ||
      errorMessage.includes("Unauthorized") ||
      errorMessage.includes("Authentication");

    // Use native Response - polyfill breaks NextResponse instanceof checks
    // See: https://github.com/vercel/next.js/issues/58611
    return new Response(
      JSON.stringify({
        error: isAuthError ? "authentication_failed" : "internal_error",
        error_description: errorMessage,
      }),
      {
        status: isAuthError ? 401 : 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
