// @ts-nocheck — MCP tool types cause exponential type inference
/**
 * Airtable MCP Server - Bases, Tables, Records
 *
 * Standalone MCP endpoint for Airtable tools with per-org OAuth.
 * Config: { "type": "streamable-http", "url": "/api/mcps/airtable/streamable-http" }
 */

import type { NextRequest } from "next/server";
import { authContextStorage } from "@/app/api/mcp/lib/context";
import { apiFailureResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { enforceMcpOrganizationRateLimit } from "@/lib/middleware/rate-limit";
import { oauthService } from "@/lib/services/oauth";
import { logger } from "@/lib/utils/logger";

export const maxDuration = 60;

interface McpHandlerResponse {
  status: number;
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

let mcpHandler: ((req: Request) => Promise<Response>) | null = null;

async function getAirtableMcpHandler() {
  if (mcpHandler) return mcpHandler;

  const { createMcpHandler } = await import("mcp-handler");
  const { z } = await import("zod3");

  async function getAirtableToken(organizationId: string): Promise<string> {
    const user = getAuthUser();
    const result = await oauthService.getValidTokenByPlatform({
      organizationId,
      userId: user.id,
      platform: "airtable",
    });
    return result.accessToken;
  }

  async function airtableFetch(
    orgId: string,
    endpoint: string,
    options: RequestInit = {},
  ) {
    const token = await getAirtableToken(orgId);
    const response = await fetch(`https://api.airtable.com${endpoint}`, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const msg =
        error?.error?.message ||
        error?.message ||
        `Airtable API error: ${response.status}`;
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

  function getAuthUser() {
    const ctx = authContextStorage.getStore();
    if (!ctx) throw new Error("Not authenticated");
    return ctx.user;
  }

  function jsonResult(data: object) {
    return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
  }

  function errorResult(msg: string) {
    return {
      content: [
        { type: "text" as const, text: JSON.stringify({ error: msg }) },
      ],
      isError: true,
    };
  }

  mcpHandler = createMcpHandler(
    (server) => {
      // --- Connection status ---
      server.tool(
        "airtable_status",
        "Check Airtable OAuth connection status",
        {},
        async () => {
          try {
            const orgId = getOrgId();
            const connections = await oauthService.listConnections({
              organizationId: orgId,
              userId: getAuthUser().id,
              platform: "airtable",
            });
            const active = connections.find((c) => c.status === "active");
            if (!active) return jsonResult({ connected: false });
            return jsonResult({
              connected: true,
              email: active.email,
              scopes: active.scopes,
            });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      // --- List bases ---
      server.tool(
        "airtable_list_bases",
        "List all Airtable bases accessible to the connected account",
        {
          offset: z
            .string()
            .optional()
            .describe("Pagination cursor from a previous response"),
        },
        async ({ offset }) => {
          try {
            const orgId = getOrgId();
            const params = new URLSearchParams();
            if (offset) params.set("offset", offset);
            const suffix = params.toString() ? `?${params.toString()}` : "";
            const data = await airtableFetch(orgId, `/v0/meta/bases${suffix}`);
            return jsonResult(data);
          } catch (e) {
            return errorResult(
              e instanceof Error ? e.message : "Failed to list bases",
            );
          }
        },
      );

      // --- Get base schema (list tables and fields) ---
      server.tool(
        "airtable_get_base_schema",
        "Get the schema of an Airtable base including all tables and their fields",
        {
          baseId: z.string().min(1).describe("The base ID (starts with 'app')"),
        },
        async ({ baseId }) => {
          try {
            const orgId = getOrgId();
            const data = await airtableFetch(
              orgId,
              `/v0/meta/bases/${baseId}/tables`,
            );
            return jsonResult(data);
          } catch (e) {
            return errorResult(
              e instanceof Error ? e.message : "Failed to get base schema",
            );
          }
        },
      );

      // --- List records ---
      server.tool(
        "airtable_list_records",
        "List records from an Airtable table with optional filtering, sorting, and field selection",
        {
          baseId: z.string().min(1).describe("The base ID (starts with 'app')"),
          tableIdOrName: z
            .string()
            .min(1)
            .describe("Table ID (starts with 'tbl') or table name"),
          fields: z
            .array(z.string())
            .optional()
            .describe("Only return these fields"),
          filterByFormula: z
            .string()
            .optional()
            .describe(
              "Airtable formula to filter records, e.g. {Status}='Done'",
            ),
          maxRecords: z
            .number()
            .int()
            .min(1)
            .optional()
            .describe("Maximum total records to return"),
          pageSize: z
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .describe("Records per page (max 100)"),
          offset: z
            .string()
            .optional()
            .describe("Pagination cursor from a previous response"),
          sort: z
            .array(
              z.object({
                field: z.string(),
                direction: z.enum(["asc", "desc"]).optional(),
              }),
            )
            .optional()
            .describe("Sort configuration"),
          view: z
            .string()
            .optional()
            .describe("View name or ID to use for filtering/sorting"),
        },
        async ({
          baseId,
          tableIdOrName,
          fields,
          filterByFormula,
          maxRecords,
          pageSize,
          offset,
          sort,
          view,
        }) => {
          try {
            const orgId = getOrgId();
            const params = new URLSearchParams();
            if (fields) fields.forEach((f) => params.append("fields[]", f));
            if (filterByFormula) params.set("filterByFormula", filterByFormula);
            if (maxRecords) params.set("maxRecords", String(maxRecords));
            if (pageSize) params.set("pageSize", String(pageSize));
            if (offset) params.set("offset", offset);
            if (view) params.set("view", view);
            if (sort) {
              sort.forEach((s, i) => {
                params.set(`sort[${i}][field]`, s.field);
                if (s.direction)
                  params.set(`sort[${i}][direction]`, s.direction);
              });
            }
            const suffix = params.toString() ? `?${params.toString()}` : "";
            const data = await airtableFetch(
              orgId,
              `/v0/${baseId}/${encodeURIComponent(tableIdOrName)}${suffix}`,
            );
            return jsonResult(data);
          } catch (e) {
            return errorResult(
              e instanceof Error ? e.message : "Failed to list records",
            );
          }
        },
      );

      // --- Get single record ---
      server.tool(
        "airtable_get_record",
        "Get a single record by ID from an Airtable table",
        {
          baseId: z.string().min(1).describe("The base ID (starts with 'app')"),
          tableIdOrName: z.string().min(1).describe("Table ID or table name"),
          recordId: z
            .string()
            .min(1)
            .describe("The record ID (starts with 'rec')"),
        },
        async ({ baseId, tableIdOrName, recordId }) => {
          try {
            const orgId = getOrgId();
            const data = await airtableFetch(
              orgId,
              `/v0/${baseId}/${encodeURIComponent(tableIdOrName)}/${recordId}`,
            );
            return jsonResult(data);
          } catch (e) {
            return errorResult(
              e instanceof Error ? e.message : "Failed to get record",
            );
          }
        },
      );

      // --- Create records ---
      server.tool(
        "airtable_create_records",
        "Create one or more records in an Airtable table (max 10 per request)",
        {
          baseId: z.string().min(1).describe("The base ID (starts with 'app')"),
          tableIdOrName: z.string().min(1).describe("Table ID or table name"),
          records: z
            .array(z.object({ fields: z.record(z.any()) }))
            .min(1)
            .max(10)
            .describe("Array of records to create, each with a fields object"),
          typecast: z
            .boolean()
            .optional()
            .describe(
              "If true, auto-convert string values to appropriate types",
            ),
        },
        async ({ baseId, tableIdOrName, records, typecast }) => {
          try {
            const orgId = getOrgId();
            const body: Record<string, unknown> = { records };
            if (typecast !== undefined) body.typecast = typecast;
            const data = await airtableFetch(
              orgId,
              `/v0/${baseId}/${encodeURIComponent(tableIdOrName)}`,
              {
                method: "POST",
                body: JSON.stringify(body),
              },
            );
            return jsonResult(data);
          } catch (e) {
            return errorResult(
              e instanceof Error ? e.message : "Failed to create records",
            );
          }
        },
      );

      // --- Update records (partial) ---
      server.tool(
        "airtable_update_records",
        "Update one or more records in an Airtable table (partial update, max 10 per request)",
        {
          baseId: z.string().min(1).describe("The base ID (starts with 'app')"),
          tableIdOrName: z.string().min(1).describe("Table ID or table name"),
          records: z
            .array(
              z.object({ id: z.string().min(1), fields: z.record(z.any()) }),
            )
            .min(1)
            .max(10)
            .describe("Array of records to update, each with id and fields"),
          typecast: z
            .boolean()
            .optional()
            .describe(
              "If true, auto-convert string values to appropriate types",
            ),
        },
        async ({ baseId, tableIdOrName, records, typecast }) => {
          try {
            const orgId = getOrgId();
            const body: Record<string, unknown> = { records };
            if (typecast !== undefined) body.typecast = typecast;
            const data = await airtableFetch(
              orgId,
              `/v0/${baseId}/${encodeURIComponent(tableIdOrName)}`,
              {
                method: "PATCH",
                body: JSON.stringify(body),
              },
            );
            return jsonResult(data);
          } catch (e) {
            return errorResult(
              e instanceof Error ? e.message : "Failed to update records",
            );
          }
        },
      );

      // --- Delete records ---
      server.tool(
        "airtable_delete_records",
        "Delete one or more records from an Airtable table (max 10 per request)",
        {
          baseId: z.string().min(1).describe("The base ID (starts with 'app')"),
          tableIdOrName: z.string().min(1).describe("Table ID or table name"),
          recordIds: z
            .array(z.string().min(1))
            .min(1)
            .max(10)
            .describe("Array of record IDs to delete"),
        },
        async ({ baseId, tableIdOrName, recordIds }) => {
          try {
            const orgId = getOrgId();
            const params = new URLSearchParams();
            recordIds.forEach((id) => params.append("records[]", id));
            const data = await airtableFetch(
              orgId,
              `/v0/${baseId}/${encodeURIComponent(tableIdOrName)}?${params.toString()}`,
              {
                method: "DELETE",
              },
            );
            return jsonResult(data);
          } catch (e) {
            return errorResult(
              e instanceof Error ? e.message : "Failed to delete records",
            );
          }
        },
      );

      // --- Search records (convenience wrapper around list with filterByFormula) ---
      server.tool(
        "airtable_search_records",
        "Search for records in an Airtable table using a formula filter. Use SEARCH() for case-insensitive text matching, FIND() for exact matching, or direct comparisons like {Field}='value'",
        {
          baseId: z.string().min(1).describe("The base ID (starts with 'app')"),
          tableIdOrName: z.string().min(1).describe("Table ID or table name"),
          formula: z
            .string()
            .min(1)
            .describe(
              "Airtable formula, e.g. SEARCH('term',{Name}), AND({Status}='Active',{Priority}='High')",
            ),
          fields: z
            .array(z.string())
            .optional()
            .describe("Only return these fields"),
          maxRecords: z
            .number()
            .int()
            .min(1)
            .optional()
            .describe("Maximum records to return"),
          sort: z
            .array(
              z.object({
                field: z.string(),
                direction: z.enum(["asc", "desc"]).optional(),
              }),
            )
            .optional()
            .describe("Sort configuration"),
        },
        async ({
          baseId,
          tableIdOrName,
          formula,
          fields,
          maxRecords,
          sort,
        }) => {
          try {
            const orgId = getOrgId();
            const params = new URLSearchParams();
            params.set("filterByFormula", formula);
            if (fields) fields.forEach((f) => params.append("fields[]", f));
            if (maxRecords) params.set("maxRecords", String(maxRecords));
            if (sort) {
              sort.forEach((s, i) => {
                params.set(`sort[${i}][field]`, s.field);
                if (s.direction)
                  params.set(`sort[${i}][direction]`, s.direction);
              });
            }
            const data = await airtableFetch(
              orgId,
              `/v0/${baseId}/${encodeURIComponent(tableIdOrName)}?${params.toString()}`,
            );
            return jsonResult(data);
          } catch (e) {
            return errorResult(
              e instanceof Error ? e.message : "Failed to search records",
            );
          }
        },
      );

      // --- Create table ---
      server.tool(
        "airtable_create_table",
        "Create a new table in an Airtable base",
        {
          baseId: z.string().min(1).describe("The base ID (starts with 'app')"),
          name: z.string().min(1).describe("Name for the new table"),
          description: z
            .string()
            .optional()
            .describe("Optional table description"),
          fields: z
            .array(
              z.object({
                name: z.string().min(1),
                type: z.string().min(1),
                description: z.string().optional(),
                options: z.record(z.any()).optional(),
              }),
            )
            .min(1)
            .describe("Array of field definitions"),
        },
        async ({ baseId, name, description, fields: fieldDefs }) => {
          try {
            const orgId = getOrgId();
            const body: Record<string, unknown> = { name, fields: fieldDefs };
            if (description) body.description = description;
            const data = await airtableFetch(
              orgId,
              `/v0/meta/bases/${baseId}/tables`,
              {
                method: "POST",
                body: JSON.stringify(body),
              },
            );
            return jsonResult(data);
          } catch (e) {
            return errorResult(
              e instanceof Error ? e.message : "Failed to create table",
            );
          }
        },
      );

      // --- Update table ---
      server.tool(
        "airtable_update_table",
        "Update a table's name or description in an Airtable base",
        {
          baseId: z.string().min(1).describe("The base ID (starts with 'app')"),
          tableId: z
            .string()
            .min(1)
            .describe("The table ID (starts with 'tbl')"),
          name: z.string().optional().describe("New table name"),
          description: z.string().optional().describe("New table description"),
        },
        async ({ baseId, tableId, name, description }) => {
          try {
            const orgId = getOrgId();
            const body: Record<string, unknown> = {};
            if (name) body.name = name;
            if (description !== undefined) body.description = description;
            const data = await airtableFetch(
              orgId,
              `/v0/meta/bases/${baseId}/tables/${tableId}`,
              {
                method: "PATCH",
                body: JSON.stringify(body),
              },
            );
            return jsonResult(data);
          } catch (e) {
            return errorResult(
              e instanceof Error ? e.message : "Failed to update table",
            );
          }
        },
      );

      // --- Create field ---
      server.tool(
        "airtable_create_field",
        "Create a new field (column) in an Airtable table",
        {
          baseId: z.string().min(1).describe("The base ID (starts with 'app')"),
          tableId: z
            .string()
            .min(1)
            .describe("The table ID (starts with 'tbl')"),
          name: z.string().min(1).describe("Field name"),
          type: z
            .string()
            .min(1)
            .describe(
              "Field type, e.g. singleLineText, number, singleSelect, date, checkbox, etc.",
            ),
          description: z.string().optional().describe("Field description"),
          options: z
            .record(z.any())
            .optional()
            .describe("Field-type-specific options"),
        },
        async ({ baseId, tableId, name, type, description, options }) => {
          try {
            const orgId = getOrgId();
            const body: Record<string, unknown> = { name, type };
            if (description) body.description = description;
            if (options) body.options = options;
            const data = await airtableFetch(
              orgId,
              `/v0/meta/bases/${baseId}/tables/${tableId}/fields`,
              {
                method: "POST",
                body: JSON.stringify(body),
              },
            );
            return jsonResult(data);
          } catch (e) {
            return errorResult(
              e instanceof Error ? e.message : "Failed to create field",
            );
          }
        },
      );

      // --- Update field ---
      server.tool(
        "airtable_update_field",
        "Update an existing field's name, description, or options in an Airtable table",
        {
          baseId: z.string().min(1).describe("The base ID (starts with 'app')"),
          tableId: z
            .string()
            .min(1)
            .describe("The table ID (starts with 'tbl')"),
          fieldId: z
            .string()
            .min(1)
            .describe("The field ID (starts with 'fld')"),
          name: z.string().optional().describe("New field name"),
          description: z.string().optional().describe("New field description"),
          options: z
            .record(z.any())
            .optional()
            .describe("Updated field options"),
        },
        async ({ baseId, tableId, fieldId, name, description, options }) => {
          try {
            const orgId = getOrgId();
            const body: Record<string, unknown> = {};
            if (name) body.name = name;
            if (description !== undefined) body.description = description;
            if (options) body.options = options;
            const data = await airtableFetch(
              orgId,
              `/v0/meta/bases/${baseId}/tables/${tableId}/fields/${fieldId}`,
              {
                method: "PATCH",
                body: JSON.stringify(body),
              },
            );
            return jsonResult(data);
          } catch (e) {
            return errorResult(
              e instanceof Error ? e.message : "Failed to update field",
            );
          }
        },
      );
    },
    { capabilities: { tools: {} } },
    {
      streamableHttpEndpoint: "/api/mcps/airtable/streamable-http",
      disableSse: true,
      maxDuration: 60,
    },
  );

  return mcpHandler;
}

async function handleRequest(req: NextRequest): Promise<Response> {
  try {
    const authResult = await requireAuthOrApiKeyWithOrg(req);

    const rateLimited = await enforceMcpOrganizationRateLimit(
      authResult.user.organization_id!,
      "airtable",
    );
    if (rateLimited) return rateLimited;

    const handler = await getAirtableMcpHandler();
    const mcpResponse = await authContextStorage.run(authResult, () =>
      handler(req as Request),
    );

    if (!mcpResponse || !isMcpHandlerResponse(mcpResponse)) {
      return new Response(JSON.stringify({ error: "invalid_response" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const bodyText = mcpResponse.text ? await mcpResponse.text() : "";
    const headers: Record<string, string> = {};
    mcpResponse.headers?.forEach((v: string, k: string) => {
      headers[k] = v;
    });

    return new Response(bodyText, { status: mcpResponse.status, headers });
  } catch (error) {
    logger.error("[AirtableMCP]", error);
    return apiFailureResponse(error);
  }
}

async function withTransportValidation(
  req: NextRequest,
  { params }: { params: Promise<{ transport: string }> },
): Promise<Response> {
  const { transport } = await params;
  if (transport !== "streamable-http") {
    return new Response(
      JSON.stringify({
        error: `Transport "${transport}" not supported. Use streamable-http.`,
      }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    );
  }
  return handleRequest(req);
}

export const GET = withTransportValidation;
export const POST = withTransportValidation;
export const DELETE = withTransportValidation;
