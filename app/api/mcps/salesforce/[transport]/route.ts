// @ts-nocheck — MCP tool types cause exponential type inference
/**
 * Salesforce MCP Server - Accounts, Contacts, Opportunities, Leads, SOQL/SOSL
 *
 * Standalone MCP endpoint for Salesforce tools with per-org OAuth.
 * Config: { "type": "streamable-http", "url": "/api/mcps/salesforce/streamable-http" }
 *
 * Salesforce requires a per-org instance URL (e.g. https://mycompany.my.salesforce.com)
 * which is discovered at runtime via the userinfo endpoint and cached.
 */

import type { NextRequest } from "next/server";
import { logger } from "@/lib/utils/logger";
import { oauthService } from "@/lib/services/oauth";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { authContextStorage } from "@/app/api/mcp/lib/context";
import { checkRateLimitRedis } from "@/lib/middleware/rate-limit-redis";

export const maxDuration = 60;

const SALESFORCE_API_VERSION = "v60.0";

interface McpHandlerResponse {
  status: number;
  headers?: Headers;
  text?: () => Promise<string>;
}

function isMcpHandlerResponse(resp: unknown): resp is McpHandlerResponse {
  return typeof resp === "object" && resp !== null && typeof (resp as McpHandlerResponse).status === "number";
}

let mcpHandler: ((req: Request) => Promise<Response>) | null = null;

// Cache instance URLs per-org (30 min TTL)
const instanceUrlCache = new Map<string, { url: string; expiresAt: number }>();
const INSTANCE_URL_TTL_MS = 30 * 60 * 1000;

async function getSalesforceMcpHandler() {
  if (mcpHandler) return mcpHandler;

  const { createMcpHandler } = await import("mcp-handler");
  const { z } = await import("zod3");

  async function getSalesforceToken(organizationId: string): Promise<string> {
    const result = await oauthService.getValidTokenByPlatform({ organizationId, platform: "salesforce" });
    return result.accessToken;
  }

  /**
   * Resolve the Salesforce instance URL for an org.
   * Calls the userinfo endpoint and extracts the custom_domain or profile base URL.
   */
  async function resolveInstanceUrl(token: string, orgId: string): Promise<string> {
    const cached = instanceUrlCache.get(orgId);
    if (cached && cached.expiresAt > Date.now()) return cached.url;

    const res = await fetch("https://login.salesforce.com/services/oauth2/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`Failed to resolve Salesforce instance URL: ${res.status}`);
    }

    const data = await res.json();

    // Prefer custom_domain, fall back to parsing the profile URL
    let instanceUrl: string | undefined;
    if (data.urls?.custom_domain) {
      instanceUrl = data.urls.custom_domain;
    } else if (data.profile) {
      const match = data.profile.match(/^(https:\/\/[^/]+)/);
      if (match) instanceUrl = match[1];
    }

    if (!instanceUrl) {
      throw new Error("Could not determine Salesforce instance URL from userinfo response");
    }

    // Remove trailing slash
    instanceUrl = instanceUrl.replace(/\/$/, "");
    instanceUrlCache.set(orgId, { url: instanceUrl, expiresAt: Date.now() + INSTANCE_URL_TTL_MS });

    return instanceUrl;
  }

  async function salesforceFetch(orgId: string, path: string, options: RequestInit = {}) {
    const token = await getSalesforceToken(orgId);
    const instanceUrl = await resolveInstanceUrl(token, orgId);
    const url = `${instanceUrl}${path}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => []);
      const msg = Array.isArray(error) && error[0]?.message
        ? error[0].message
        : error?.message || `Salesforce API error: ${response.status}`;
      throw new Error(msg);
    }

    if (response.status === 204) return {};
    const text = await response.text();
    if (!text) return {};
    return JSON.parse(text);
  }

  function getOrgId(): string {
    const ctx = authContextStorage.getStore();
    if (!ctx) throw new Error("Not authenticated");
    return ctx.user.organization_id;
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
      server.tool("salesforce_status", "Check Salesforce OAuth connection status", {}, async () => {
        try {
          const orgId = getOrgId();
          const connections = await oauthService.listConnections({ organizationId: orgId, platform: "salesforce" });
          const active = connections.find((c) => c.status === "active");
          if (!active) return jsonResult({ connected: false });
          return jsonResult({ connected: true, email: active.email, scopes: active.scopes });
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : "Failed");
        }
      });

      // --- SOQL Query (most flexible tool) ---
      server.tool(
        "salesforce_query",
        "Run a SOQL query against Salesforce. Use for listing, filtering, and aggregating any data. Examples: SELECT Id, Name FROM Account LIMIT 10, SELECT Id, Name, Email FROM Contact WHERE AccountId = '001xx'",
        {
          query: z.string().min(1).describe("SOQL query string, e.g. SELECT Id, Name FROM Account WHERE Industry = 'Technology' LIMIT 20"),
        },
        async ({ query }) => {
          try {
            const orgId = getOrgId();
            const data = await salesforceFetch(orgId, `/services/data/${SALESFORCE_API_VERSION}/query?q=${encodeURIComponent(query)}`);
            return jsonResult({
              totalSize: data.totalSize,
              done: data.done,
              records: data.records?.map((r: Record<string, unknown>) => {
                const { attributes, ...fields } = r;
                return fields;
              }),
              nextRecordsUrl: data.nextRecordsUrl,
            });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed to execute query");
          }
        },
      );

      // --- Query more (pagination) ---
      server.tool(
        "salesforce_query_more",
        "Fetch the next page of results from a paginated SOQL query using the nextRecordsUrl returned from salesforce_query",
        {
          nextRecordsUrl: z.string().min(1).describe("The nextRecordsUrl from a previous query response"),
        },
        async ({ nextRecordsUrl }) => {
          try {
            const orgId = getOrgId();
            const data = await salesforceFetch(orgId, nextRecordsUrl);
            return jsonResult({
              totalSize: data.totalSize,
              done: data.done,
              records: data.records?.map((r: Record<string, unknown>) => {
                const { attributes, ...fields } = r;
                return fields;
              }),
              nextRecordsUrl: data.nextRecordsUrl,
            });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed to fetch next page");
          }
        },
      );

      // --- SOSL Search ---
      server.tool(
        "salesforce_search",
        "Search across multiple Salesforce objects using SOSL. Use for full-text search across objects. Example: FIND {John} IN ALL FIELDS RETURNING Contact(Id, Name, Email), Lead(Id, Name)",
        {
          search: z.string().min(1).describe("SOSL search string, e.g. FIND {search term} IN ALL FIELDS RETURNING Account(Id, Name), Contact(Id, Name, Email)"),
        },
        async ({ search }) => {
          try {
            const orgId = getOrgId();
            const data = await salesforceFetch(orgId, `/services/data/${SALESFORCE_API_VERSION}/search?q=${encodeURIComponent(search)}`);
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed to search");
          }
        },
      );

      // --- List available SObjects ---
      server.tool(
        "salesforce_list_objects",
        "List all available Salesforce objects (SObjects) in the org. Returns object names, labels, and key properties. Use this to discover what objects are available before querying.",
        {},
        async () => {
          try {
            const orgId = getOrgId();
            const data = await salesforceFetch(orgId, `/services/data/${SALESFORCE_API_VERSION}/sobjects`);
            const objects = data.sobjects?.map((obj: Record<string, unknown>) => ({
              name: obj.name,
              label: obj.label,
              queryable: obj.queryable,
              createable: obj.createable,
              updateable: obj.updateable,
              deletable: obj.deletable,
              custom: obj.custom,
            }));
            return jsonResult({ objects, count: objects?.length });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed to list objects");
          }
        },
      );

      // --- Describe SObject (get schema/fields) ---
      server.tool(
        "salesforce_describe_object",
        "Get the full schema of a Salesforce object including all fields, their types, and properties. Use this to understand what fields are available before creating or querying records.",
        {
          objectName: z.string().min(1).describe("API name of the SObject, e.g. Account, Contact, Opportunity, Lead, or a custom object like MyObject__c"),
        },
        async ({ objectName }) => {
          try {
            const orgId = getOrgId();
            const data = await salesforceFetch(orgId, `/services/data/${SALESFORCE_API_VERSION}/sobjects/${encodeURIComponent(objectName)}/describe`);
            const fields = data.fields?.map((f: Record<string, unknown>) => ({
              name: f.name,
              label: f.label,
              type: f.type,
              required: !f.nillable && !f.defaultedOnCreate,
              createable: f.createable,
              updateable: f.updateable,
              picklistValues: (f.picklistValues as Array<Record<string, unknown>>)?.length > 0
                ? (f.picklistValues as Array<Record<string, unknown>>).filter((v: Record<string, unknown>) => v.active).map((v: Record<string, unknown>) => v.value)
                : undefined,
              referenceTo: (f.referenceTo as string[])?.length > 0 ? f.referenceTo : undefined,
            }));
            return jsonResult({
              name: data.name,
              label: data.label,
              fields,
              recordTypeInfos: data.recordTypeInfos?.filter((rt: Record<string, unknown>) => rt.available),
            });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed to describe object");
          }
        },
      );

      // --- Get single record ---
      server.tool(
        "salesforce_get_record",
        "Get a single Salesforce record by its ID. Optionally specify which fields to return.",
        {
          objectName: z.string().min(1).describe("API name of the SObject, e.g. Account, Contact"),
          recordId: z.string().min(1).describe("The 15 or 18-character Salesforce record ID"),
          fields: z.array(z.string()).optional().describe("Specific fields to return. If omitted, returns all accessible fields."),
        },
        async ({ objectName, recordId, fields }) => {
          try {
            const orgId = getOrgId();
            const fieldParam = fields?.length ? `?fields=${fields.join(",")}` : "";
            const data = await salesforceFetch(orgId, `/services/data/${SALESFORCE_API_VERSION}/sobjects/${encodeURIComponent(objectName)}/${recordId}${fieldParam}`);
            const { attributes, ...record } = data;
            return jsonResult(record);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed to get record");
          }
        },
      );

      // --- Create record ---
      server.tool(
        "salesforce_create_record",
        "Create a new record in Salesforce. Use salesforce_describe_object first to see available fields.",
        {
          objectName: z.string().min(1).describe("API name of the SObject, e.g. Account, Contact, Lead"),
          fields: z.record(z.any()).describe("Field values for the new record, e.g. { Name: 'Acme Corp', Industry: 'Technology' }"),
        },
        async ({ objectName, fields }) => {
          try {
            const orgId = getOrgId();
            const data = await salesforceFetch(orgId, `/services/data/${SALESFORCE_API_VERSION}/sobjects/${encodeURIComponent(objectName)}`, {
              method: "POST",
              body: JSON.stringify(fields),
            });
            return jsonResult({ success: data.success, id: data.id });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed to create record");
          }
        },
      );

      // --- Update record ---
      server.tool(
        "salesforce_update_record",
        "Update fields on an existing Salesforce record. Only include the fields you want to change.",
        {
          objectName: z.string().min(1).describe("API name of the SObject, e.g. Account, Contact"),
          recordId: z.string().min(1).describe("The record ID to update"),
          fields: z.record(z.any()).describe("Fields to update, e.g. { Industry: 'Finance', Phone: '555-1234' }"),
        },
        async ({ objectName, recordId, fields }) => {
          try {
            const orgId = getOrgId();
            await salesforceFetch(orgId, `/services/data/${SALESFORCE_API_VERSION}/sobjects/${encodeURIComponent(objectName)}/${recordId}`, {
              method: "PATCH",
              body: JSON.stringify(fields),
            });
            return jsonResult({ success: true, id: recordId });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed to update record");
          }
        },
      );

      // --- Delete record ---
      server.tool(
        "salesforce_delete_record",
        "Delete a Salesforce record by its ID.",
        {
          objectName: z.string().min(1).describe("API name of the SObject, e.g. Account, Contact"),
          recordId: z.string().min(1).describe("The record ID to delete"),
        },
        async ({ objectName, recordId }) => {
          try {
            const orgId = getOrgId();
            await salesforceFetch(orgId, `/services/data/${SALESFORCE_API_VERSION}/sobjects/${encodeURIComponent(objectName)}/${recordId}`, {
              method: "DELETE",
            });
            return jsonResult({ success: true, deleted: recordId });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed to delete record");
          }
        },
      );

      // --- Get recently viewed records ---
      server.tool(
        "salesforce_recent_records",
        "Get recently viewed records for a specific Salesforce object type.",
        {
          objectName: z.string().min(1).describe("API name of the SObject, e.g. Account, Contact, Opportunity"),
          limit: z.number().int().min(1).max(200).optional().describe("Maximum records to return (default 10)"),
        },
        async ({ objectName, limit = 10 }) => {
          try {
            const orgId = getOrgId();
            const data = await salesforceFetch(orgId, `/services/data/${SALESFORCE_API_VERSION}/sobjects/${encodeURIComponent(objectName)}/recent?limit=${limit}`);
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed to get recent records");
          }
        },
      );
    },
    { capabilities: { tools: {} } },
    { streamableHttpEndpoint: "/api/mcps/salesforce/streamable-http", disableSse: true, maxDuration: 60 },
  );

  return mcpHandler;
}

async function handleRequest(req: NextRequest): Promise<Response> {
  try {
    const authResult = await requireAuthOrApiKeyWithOrg(req);

    const rateLimitKey = `mcp:ratelimit:salesforce:${authResult.user.organization_id}`;
    const rateLimit = await checkRateLimitRedis(rateLimitKey, 60000, 100);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ error: "rate_limit_exceeded" }), { status: 429, headers: { "Content-Type": "application/json" } });
    }

    const handler = await getSalesforceMcpHandler();
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
    logger.error(`[SalesforceMCP] ${msg}`);
    const isAuth = msg.includes("API key") || msg.includes("auth") || msg.includes("Unauthorized");
    return new Response(JSON.stringify({ error: isAuth ? "authentication_required" : "internal_error", message: msg }), { status: isAuth ? 401 : 500, headers: { "Content-Type": "application/json" } });
  }
}

async function withTransportValidation(
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
  return handleRequest(req);
}

export const GET = withTransportValidation;
export const POST = withTransportValidation;
export const DELETE = withTransportValidation;
