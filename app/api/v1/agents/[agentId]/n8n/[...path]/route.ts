/**
 * Catch-all route for n8n workflow plugin routes.
 *
 * Maps: /api/v1/agents/{agentId}/n8n/{...path}
 *    →  plugin route: /n8n-workflow/{...path}
 *
 * The elizaOS runtime collects plugin routes during initialization and
 * prefixes them with the plugin name. So the plugin's `/workflows` route
 * becomes `/n8n-workflow/workflows` on the runtime.
 */

import type { Route, RouteRequest, RouteResponse } from "@elizaos/core";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { AgentMode } from "@/lib/eliza/agent-mode-types";
import { runtimeFactory } from "@/lib/eliza/runtime-factory";
import { userContextService } from "@/lib/eliza/user-context";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ agentId: string; path: string[] }>;
}

const PLUGIN_PREFIX = "/n8n-workflow";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
type JsonRecord = Record<string, JsonValue>;

async function handleRequest(
  request: NextRequest,
  context: RouteContext,
  method: string,
): Promise<NextResponse> {
  const { agentId, path } = await context.params;
  const requestPath = `${PLUGIN_PREFIX}/${path.join("/")}`;

  const authResult = await requireAuthOrApiKeyWithOrg(request);
  const { user } = authResult;

  const userContext = await userContextService.buildContext({
    user,
    apiKey: authResult.apiKey,
    isAnonymous: false,
    agentMode: AgentMode.ASSISTANT,
  });
  userContext.characterId = agentId;

  const runtime = await runtimeFactory.createRuntimeForUser(userContext);

  const route = matchRoute(runtime.routes, method, requestPath);
  if (!route) {
    return NextResponse.json(
      { success: false, error: `No route found: ${method} ${requestPath}` },
      { status: 404 },
    );
  }

  const routeRequest = await buildRouteRequest(request, route, requestPath);
  const { response, getData } = createRouteResponse();

  try {
    await route.handler!(routeRequest, response, runtime);
  } catch (error) {
    logger.error(`[n8n-route] Handler error: ${method} ${requestPath}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }

  const data = getData();
  return NextResponse.json(data.body, { status: data.status });
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  return handleRequest(request, context, "GET");
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  return handleRequest(request, context, "POST");
}

export async function PUT(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  return handleRequest(request, context, "PUT");
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  return handleRequest(request, context, "DELETE");
}

// ── Route matching ──────────────────────────────────────────────────────

/**
 * Match a request path against registered routes.
 * Tries literal paths first, then parameterized paths.
 */
function matchRoute(
  routes: Route[],
  method: string,
  requestPath: string,
): Route | undefined {
  const candidates = routes.filter((r) => r.type === method && r.handler);

  // Exact literal match first
  const exact = candidates.find((r) => r.path === requestPath);
  if (exact) return exact;

  // Parameterized match (e.g. /n8n-workflow/workflows/:id)
  for (const route of candidates) {
    if (matchParameterizedPath(route.path, requestPath)) {
      return route;
    }
  }

  return undefined;
}

/**
 * Check if a parameterized route path matches a request path.
 * e.g. "/n8n-workflow/workflows/:id/activate" matches "/n8n-workflow/workflows/abc123/activate"
 */
function matchParameterizedPath(
  routePath: string,
  requestPath: string,
): boolean {
  const routeSegments = routePath.split("/");
  const requestSegments = requestPath.split("/");

  if (routeSegments.length !== requestSegments.length) return false;

  return routeSegments.every(
    (seg, i) => seg.startsWith(":") || seg === requestSegments[i],
  );
}

/**
 * Extract named params from a matched parameterized path.
 * e.g. "/n8n-workflow/workflows/:id" + "/n8n-workflow/workflows/abc123" → { id: "abc123" }
 */
function extractParams(
  routePath: string,
  requestPath: string,
): Record<string, string> {
  const routeSegments = routePath.split("/");
  const requestSegments = requestPath.split("/");
  const params: Record<string, string> = {};

  for (let i = 0; i < routeSegments.length; i++) {
    if (routeSegments[i].startsWith(":")) {
      params[routeSegments[i].slice(1)] = requestSegments[i];
    }
  }

  return params;
}

// ── Request/Response adapters ───────────────────────────────────────────

async function buildRouteRequest(
  request: NextRequest,
  route: Route,
  requestPath: string,
): Promise<RouteRequest> {
  let body: JsonRecord | undefined;
  if (request.method !== "GET" && request.method !== "DELETE") {
    try {
      const parsedBody = await request.json();
      if (
        parsedBody &&
        typeof parsedBody === "object" &&
        !Array.isArray(parsedBody)
      ) {
        body = JSON.parse(JSON.stringify(parsedBody)) as JsonRecord;
      }
    } catch {
      // No body or invalid JSON — that's fine for some routes
    }
  }

  const query: Record<string, string | string[]> = {};
  for (const key of new Set(request.nextUrl.searchParams.keys())) {
    const values = request.nextUrl.searchParams.getAll(key);
    query[key] = values.length > 1 ? values : (values[0] ?? "");
  }

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    body,
    params: extractParams(route.path, requestPath),
    query,
    headers,
    method: request.method,
    path: requestPath,
    url: request.url,
  };
}

function createRouteResponse(): {
  response: RouteResponse;
  getData: () => { status: number; body: unknown };
} {
  let statusCode = 200;
  let responseBody: unknown;

  const response: RouteResponse = {
    status(code: number) {
      statusCode = code;
      return response;
    },
    json(data: unknown) {
      responseBody = data;
      return response;
    },
    send(data: unknown) {
      responseBody = data;
      return response;
    },
    end() {
      return response;
    },
  };

  return {
    response,
    getData: () => ({ status: statusCode, body: responseBody }),
  };
}
