/**
 * Airtable MCP Tools - Bases, Tables, Records
 * Uses per-organization OAuth tokens via oauthService.
 */

import type { McpServer } from "mcp-handler";
import { z } from "zod3";
import { logger } from "@/lib/utils/logger";
import { oauthService } from "@/lib/services/oauth";
import { getAuthContext } from "../lib/context";
import { jsonResponse, errorResponse } from "../lib/responses";

async function getAirtableToken(): Promise<string> {
  const { user } = getAuthContext();
  try {
    const result = await oauthService.getValidTokenByPlatform({
      organizationId: user.organization_id,
      platform: "airtable",
    });
    return result.accessToken;
  } catch (error) {
    logger.warn("[AirtableMCP] Failed to get token", {
      organizationId: user.organization_id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error("Airtable account not connected. Connect in Settings > Connections.");
  }
}

async function airtableFetch(endpoint: string, options: RequestInit = {}) {
  const token = await getAirtableToken();
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
    const msg = error?.error?.message || error?.message || `Airtable API error: ${response.status}`;
    throw new Error(msg);
  }

  if (response.status === 204) return {};
  const text = await response.text();
  if (!text) return {};
  return JSON.parse(text);
}

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function registerAirtableTools(server: McpServer): void {
  // --- Connection status ---
  server.registerTool(
    "airtable_status",
    {
      description: "Check Airtable OAuth connection status",
      inputSchema: {},
    },
    async () => {
      try {
        const { user } = getAuthContext();
        const connections = await oauthService.listConnections({
          organizationId: user.organization_id,
          platform: "airtable",
        });
        const active = connections.find((c) => c.status === "active");
        if (!active) {
          return jsonResponse({
            connected: false,
            message: "Airtable not connected. Connect in Settings > Connections.",
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

  // --- List bases ---
  server.registerTool(
    "airtable_list_bases",
    {
      description: "List all Airtable bases accessible to the connected account",
      inputSchema: {
        offset: z.string().optional().describe("Pagination cursor from a previous response"),
      },
    },
    async ({ offset }) => {
      try {
        const params = new URLSearchParams();
        if (offset) params.set("offset", offset);
        const suffix = params.toString() ? `?${params.toString()}` : "";
        const data = await airtableFetch(`/v0/meta/bases${suffix}`);
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to list bases"));
      }
    },
  );

  // --- Get base schema (list tables and fields) ---
  server.registerTool(
    "airtable_get_base_schema",
    {
      description: "Get the schema of an Airtable base including all tables and their fields",
      inputSchema: {
        baseId: z.string().min(1).describe("The base ID (starts with 'app')"),
      },
    },
    async ({ baseId }) => {
      try {
        const data = await airtableFetch(`/v0/meta/bases/${baseId}/tables`);
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get base schema"));
      }
    },
  );

  // --- List records ---
  server.registerTool(
    "airtable_list_records",
    {
      description: "List records from an Airtable table with optional filtering, sorting, and field selection",
      inputSchema: {
        baseId: z.string().min(1).describe("The base ID (starts with 'app')"),
        tableIdOrName: z.string().min(1).describe("Table ID (starts with 'tbl') or table name"),
        fields: z.array(z.string()).optional().describe("Only return these fields"),
        filterByFormula: z.string().optional().describe("Airtable formula to filter records, e.g. {Status}='Done'"),
        maxRecords: z.number().int().min(1).optional().describe("Maximum total records to return"),
        pageSize: z.number().int().min(1).max(100).optional().describe("Records per page (max 100)"),
        offset: z.string().optional().describe("Pagination cursor from a previous response"),
        sort: z.array(z.object({ field: z.string(), direction: z.enum(["asc", "desc"]).optional() })).optional().describe("Sort configuration"),
        view: z.string().optional().describe("View name or ID to use for filtering/sorting"),
      },
    },
    async ({ baseId, tableIdOrName, fields, filterByFormula, maxRecords, pageSize, offset, sort, view }) => {
      try {
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
            if (s.direction) params.set(`sort[${i}][direction]`, s.direction);
          });
        }
        const suffix = params.toString() ? `?${params.toString()}` : "";
        const data = await airtableFetch(`/v0/${baseId}/${encodeURIComponent(tableIdOrName)}${suffix}`);
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to list records"));
      }
    },
  );

  // --- Get single record ---
  server.registerTool(
    "airtable_get_record",
    {
      description: "Get a single record by ID from an Airtable table",
      inputSchema: {
        baseId: z.string().min(1).describe("The base ID (starts with 'app')"),
        tableIdOrName: z.string().min(1).describe("Table ID or table name"),
        recordId: z.string().min(1).describe("The record ID (starts with 'rec')"),
      },
    },
    async ({ baseId, tableIdOrName, recordId }) => {
      try {
        const data = await airtableFetch(`/v0/${baseId}/${encodeURIComponent(tableIdOrName)}/${recordId}`);
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get record"));
      }
    },
  );

  // --- Create records ---
  server.registerTool(
    "airtable_create_records",
    {
      description: "Create one or more records in an Airtable table (max 10 per request)",
      inputSchema: {
        baseId: z.string().min(1).describe("The base ID (starts with 'app')"),
        tableIdOrName: z.string().min(1).describe("Table ID or table name"),
        records: z.array(z.object({ fields: z.record(z.any()) })).min(1).max(10).describe("Array of records to create, each with a fields object"),
        typecast: z.boolean().optional().describe("If true, auto-convert string values to appropriate types"),
      },
    },
    async ({ baseId, tableIdOrName, records, typecast }) => {
      try {
        const body: Record<string, unknown> = { records };
        if (typecast !== undefined) body.typecast = typecast;
        const data = await airtableFetch(`/v0/${baseId}/${encodeURIComponent(tableIdOrName)}`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to create records"));
      }
    },
  );

  // --- Update records (partial) ---
  server.registerTool(
    "airtable_update_records",
    {
      description: "Update one or more records in an Airtable table (partial update, max 10 per request)",
      inputSchema: {
        baseId: z.string().min(1).describe("The base ID (starts with 'app')"),
        tableIdOrName: z.string().min(1).describe("Table ID or table name"),
        records: z.array(z.object({ id: z.string().min(1), fields: z.record(z.any()) })).min(1).max(10).describe("Array of records to update, each with id and fields"),
        typecast: z.boolean().optional().describe("If true, auto-convert string values to appropriate types"),
      },
    },
    async ({ baseId, tableIdOrName, records, typecast }) => {
      try {
        const body: Record<string, unknown> = { records };
        if (typecast !== undefined) body.typecast = typecast;
        const data = await airtableFetch(`/v0/${baseId}/${encodeURIComponent(tableIdOrName)}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to update records"));
      }
    },
  );

  // --- Delete records ---
  server.registerTool(
    "airtable_delete_records",
    {
      description: "Delete one or more records from an Airtable table (max 10 per request)",
      inputSchema: {
        baseId: z.string().min(1).describe("The base ID (starts with 'app')"),
        tableIdOrName: z.string().min(1).describe("Table ID or table name"),
        recordIds: z.array(z.string().min(1)).min(1).max(10).describe("Array of record IDs to delete"),
      },
    },
    async ({ baseId, tableIdOrName, recordIds }) => {
      try {
        const params = new URLSearchParams();
        recordIds.forEach((id) => params.append("records[]", id));
        const data = await airtableFetch(`/v0/${baseId}/${encodeURIComponent(tableIdOrName)}?${params.toString()}`, {
          method: "DELETE",
        });
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to delete records"));
      }
    },
  );

  // --- Search records ---
  server.registerTool(
    "airtable_search_records",
    {
      description: "Search for records in an Airtable table using a formula filter. Use SEARCH() for case-insensitive text matching, FIND() for exact matching, or direct comparisons like {Field}='value'",
      inputSchema: {
        baseId: z.string().min(1).describe("The base ID (starts with 'app')"),
        tableIdOrName: z.string().min(1).describe("Table ID or table name"),
        formula: z.string().min(1).describe("Airtable formula, e.g. SEARCH('term',{Name}), AND({Status}='Active',{Priority}='High')"),
        fields: z.array(z.string()).optional().describe("Only return these fields"),
        maxRecords: z.number().int().min(1).optional().describe("Maximum records to return"),
        sort: z.array(z.object({ field: z.string(), direction: z.enum(["asc", "desc"]).optional() })).optional().describe("Sort configuration"),
      },
    },
    async ({ baseId, tableIdOrName, formula, fields, maxRecords, sort }) => {
      try {
        const params = new URLSearchParams();
        params.set("filterByFormula", formula);
        if (fields) fields.forEach((f) => params.append("fields[]", f));
        if (maxRecords) params.set("maxRecords", String(maxRecords));
        if (sort) {
          sort.forEach((s, i) => {
            params.set(`sort[${i}][field]`, s.field);
            if (s.direction) params.set(`sort[${i}][direction]`, s.direction);
          });
        }
        const data = await airtableFetch(`/v0/${baseId}/${encodeURIComponent(tableIdOrName)}?${params.toString()}`);
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to search records"));
      }
    },
  );

  // --- Create table ---
  server.registerTool(
    "airtable_create_table",
    {
      description: "Create a new table in an Airtable base",
      inputSchema: {
        baseId: z.string().min(1).describe("The base ID (starts with 'app')"),
        name: z.string().min(1).describe("Name for the new table"),
        description: z.string().optional().describe("Optional table description"),
        fields: z.array(z.object({
          name: z.string().min(1),
          type: z.string().min(1),
          description: z.string().optional(),
          options: z.record(z.any()).optional(),
        })).min(1).describe("Array of field definitions"),
      },
    },
    async ({ baseId, name, description, fields: fieldDefs }) => {
      try {
        const body: Record<string, unknown> = { name, fields: fieldDefs };
        if (description) body.description = description;
        const data = await airtableFetch(`/v0/meta/bases/${baseId}/tables`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to create table"));
      }
    },
  );

  // --- Update table ---
  server.registerTool(
    "airtable_update_table",
    {
      description: "Update a table's name or description in an Airtable base",
      inputSchema: {
        baseId: z.string().min(1).describe("The base ID (starts with 'app')"),
        tableId: z.string().min(1).describe("The table ID (starts with 'tbl')"),
        name: z.string().optional().describe("New table name"),
        description: z.string().optional().describe("New table description"),
      },
    },
    async ({ baseId, tableId, name, description }) => {
      try {
        const body: Record<string, unknown> = {};
        if (name) body.name = name;
        if (description !== undefined) body.description = description;
        const data = await airtableFetch(`/v0/meta/bases/${baseId}/tables/${tableId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to update table"));
      }
    },
  );

  // --- Create field ---
  server.registerTool(
    "airtable_create_field",
    {
      description: "Create a new field (column) in an Airtable table",
      inputSchema: {
        baseId: z.string().min(1).describe("The base ID (starts with 'app')"),
        tableId: z.string().min(1).describe("The table ID (starts with 'tbl')"),
        name: z.string().min(1).describe("Field name"),
        type: z.string().min(1).describe("Field type, e.g. singleLineText, number, singleSelect, date, checkbox, etc."),
        description: z.string().optional().describe("Field description"),
        options: z.record(z.any()).optional().describe("Field-type-specific options"),
      },
    },
    async ({ baseId, tableId, name, type, description, options }) => {
      try {
        const body: Record<string, unknown> = { name, type };
        if (description) body.description = description;
        if (options) body.options = options;
        const data = await airtableFetch(`/v0/meta/bases/${baseId}/tables/${tableId}/fields`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to create field"));
      }
    },
  );

  // --- Update field ---
  server.registerTool(
    "airtable_update_field",
    {
      description: "Update an existing field's name, description, or options in an Airtable table",
      inputSchema: {
        baseId: z.string().min(1).describe("The base ID (starts with 'app')"),
        tableId: z.string().min(1).describe("The table ID (starts with 'tbl')"),
        fieldId: z.string().min(1).describe("The field ID (starts with 'fld')"),
        name: z.string().optional().describe("New field name"),
        description: z.string().optional().describe("New field description"),
        options: z.record(z.any()).optional().describe("Updated field options"),
      },
    },
    async ({ baseId, tableId, fieldId, name, description, options }) => {
      try {
        const body: Record<string, unknown> = {};
        if (name) body.name = name;
        if (description !== undefined) body.description = description;
        if (options) body.options = options;
        const data = await airtableFetch(`/v0/meta/bases/${baseId}/tables/${tableId}/fields/${fieldId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to update field"));
      }
    },
  );
}
