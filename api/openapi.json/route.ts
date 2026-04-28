/**
 * OpenAPI Specification Endpoint
 *
 * Returns the OpenAPI 3.1.0 specification for the Eliza Cloud API.
 * Referenced in ERC-8004 registration for service discovery.
 *
 * GET /api/openapi.json
 */

import { Hono } from "hono";

import { discoverPublicApiRoutes } from "@/lib/docs/api-route-discovery";
import type { AppEnv } from "@/api-lib/context";

type OpenApiPathItem = Record<
  string,
  {
    operationId: string;
    summary: string;
    description?: string;
    tags?: string[];
    security?: Array<Record<string, string[]>>;
    requestBody?: unknown;
    parameters?: unknown[];
    responses: Record<string, unknown>;
  }
>;

function toOperationId(method: string, routePath: string): string {
  const clean = routePath
    .replace(/^\//, "")
    .replace(/[{}]/g, "")
    .replace(/[^a-zA-Z0-9/_-]/g, "")
    .replace(/[/-]+/g, "_");
  return `${method.toLowerCase()}_${clean}`;
}

function tagForPath(routePath: string): string {
  const parts = routePath.split("/").filter(Boolean);
  const group = parts[2] ?? "v1";
  return group === "v1" ? "v1" : group;
}

function getOpenApiServerUrl(env: { NEXT_PUBLIC_APP_URL?: string }): string {
  const configuredUrl = env.NEXT_PUBLIC_APP_URL;
  return configuredUrl && /^https:\/\/www\.(dev\.)?elizacloud\.ai$/.test(configuredUrl)
    ? configuredUrl
    : "https://www.elizacloud.ai";
}

const app = new Hono<AppEnv>();

app.get("/", async (c) => {
  const baseUrl = getOpenApiServerUrl(c.env);

  const discovered = await discoverPublicApiRoutes();
  const discoveredPaths: Record<string, OpenApiPathItem> = {};

  for (const r of discovered) {
    if (!discoveredPaths[r.path]) discoveredPaths[r.path] = {};
    const tag = tagForPath(r.path);

    for (const method of r.methods) {
      discoveredPaths[r.path][method.toLowerCase()] = {
        operationId: toOperationId(method, r.path),
        summary: r.meta?.name ?? `${method} ${r.path}`,
        description: r.meta?.description,
        tags: r.meta?.category ? [r.meta.category] : [tag],
        responses: {
          "200": { description: "Successful response" },
          "400": { description: "Bad request" },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Not found" },
          "429": { description: "Rate limited" },
          "500": { description: "Server error" },
        },
      };
    }
  }

  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Eliza Cloud API",
      version: "1.0.0",
      description:
        "AI agent infrastructure API. Supports REST, MCP, and A2A protocols with API key authentication.",
      contact: { name: "Eliza Cloud", url: "https://www.elizacloud.ai" },
      license: { name: "MIT", url: "https://opensource.org/licenses/MIT" },
    },
    servers: [{ url: baseUrl, description: "Production server" }],
    security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
    paths: { ...discoveredPaths },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", description: "Privy session token" },
        apiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description: "API Key for programmatic access",
        },
      },
    },
    tags: [],
    externalDocs: {
      description: "Eliza Cloud Documentation",
      url: "https://www.elizacloud.ai/docs",
    },
  };

  return c.json(spec, 200, {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=3600",
    "Access-Control-Allow-Origin": "*",
  });
});

export default app;
