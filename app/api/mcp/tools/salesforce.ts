/**
 * Salesforce MCP Tools - Accounts, Contacts, Opportunities, Leads, SOQL/SOSL
 * Uses per-organization OAuth tokens via oauthService.
 *
 * Shared Salesforce utilities (fetch, cache, validation) live in lib/salesforce/client.ts.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod3";
import { logger } from "@/lib/utils/logger";
import { oauthService } from "@/lib/services/oauth";
import { getAuthContext } from "../lib/context";
import { jsonResponse, errorResponse } from "../lib/responses";
import {
  SALESFORCE_API_VERSION,
  salesforceFetch as sharedSalesforceFetch,
  validateSOQL,
  validateSOSL,
  stripAttributes,
  errMsg,
} from "@/lib/salesforce/client";

async function getSalesforceToken(): Promise<string> {
  const { user } = getAuthContext();
  try {
    const result = await oauthService.getValidTokenByPlatform({
      organizationId: user.organization_id,
      platform: "salesforce",
    });
    return result.accessToken;
  } catch (error) {
    logger.warn("[SalesforceMCP] Failed to get token", {
      organizationId: user.organization_id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error("Salesforce account not connected. Connect in Settings > Connections.");
  }
}

async function salesforceFetch(path: string, options: RequestInit = {}) {
  const { user } = getAuthContext();
  const token = await getSalesforceToken();
  return sharedSalesforceFetch(token, user.organization_id, path, options);
}

export function registerSalesforceTools(server: McpServer): void {
  // --- Connection status ---
  server.registerTool(
    "salesforce_status",
    {
      description: "Check Salesforce OAuth connection status",
      inputSchema: {},
    },
    async () => {
      try {
        const { user } = getAuthContext();
        const connections = await oauthService.listConnections({
          organizationId: user.organization_id,
          platform: "salesforce",
        });
        const active = connections.find((c) => c.status === "active");
        if (!active) {
          return jsonResponse({
            connected: false,
            message: "Salesforce not connected. Connect in Settings > Connections.",
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

  // --- SOQL Query ---
  server.registerTool(
    "salesforce_query",
    {
      description:
        "Run a SOQL query against Salesforce. Use for listing, filtering, and aggregating any data. Examples: SELECT Id, Name FROM Account LIMIT 10, SELECT Id, Name, Email FROM Contact WHERE AccountId = '001xx'",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe("SOQL query string, e.g. SELECT Id, Name FROM Account WHERE Industry = 'Technology' LIMIT 20"),
      },
    },
    async ({ query }) => {
      try {
        validateSOQL(query);
        const data = await salesforceFetch(
          `/services/data/${SALESFORCE_API_VERSION}/query?q=${encodeURIComponent(query)}`,
        );
        return jsonResponse({
          totalSize: data.totalSize,
          done: data.done,
          records: stripAttributes(data.records as Record<string, unknown>[] | undefined),
          nextRecordsUrl: data.nextRecordsUrl,
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to execute query"));
      }
    },
  );

  // --- Query more (pagination) ---
  server.registerTool(
    "salesforce_query_more",
    {
      description:
        "Fetch the next page of results from a paginated SOQL query using the nextRecordsUrl returned from salesforce_query",
      inputSchema: {
        nextRecordsUrl: z.string().min(1).describe("The nextRecordsUrl from a previous query response"),
      },
    },
    async ({ nextRecordsUrl }) => {
      try {
        const data = await salesforceFetch(nextRecordsUrl);
        return jsonResponse({
          totalSize: data.totalSize,
          done: data.done,
          records: stripAttributes(data.records as Record<string, unknown>[] | undefined),
          nextRecordsUrl: data.nextRecordsUrl,
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to fetch next page"));
      }
    },
  );

  // --- SOSL Search ---
  server.registerTool(
    "salesforce_search",
    {
      description:
        "Search across multiple Salesforce objects using SOSL. Use for full-text search across objects. Example: FIND {John} IN ALL FIELDS RETURNING Contact(Id, Name, Email), Lead(Id, Name)",
      inputSchema: {
        search: z
          .string()
          .min(1)
          .describe(
            "SOSL search string, e.g. FIND {search term} IN ALL FIELDS RETURNING Account(Id, Name), Contact(Id, Name, Email)",
          ),
      },
    },
    async ({ search }) => {
      try {
        validateSOSL(search);
        const data = await salesforceFetch(
          `/services/data/${SALESFORCE_API_VERSION}/search?q=${encodeURIComponent(search)}`,
        );
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to search"));
      }
    },
  );

  // --- List available SObjects ---
  server.registerTool(
    "salesforce_list_objects",
    {
      description:
        "List all available Salesforce objects (SObjects) in the org. Returns object names, labels, and key properties. Use this to discover what objects are available before querying.",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await salesforceFetch(`/services/data/${SALESFORCE_API_VERSION}/sobjects`);
        const objects = (data.sobjects as Record<string, unknown>[] | undefined)?.map((obj) => ({
          name: obj.name,
          label: obj.label,
          queryable: obj.queryable,
          createable: obj.createable,
          updateable: obj.updateable,
          deletable: obj.deletable,
          custom: obj.custom,
        }));
        return jsonResponse({ objects, count: objects?.length });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to list objects"));
      }
    },
  );

  // --- Describe SObject (get schema/fields) ---
  server.registerTool(
    "salesforce_describe_object",
    {
      description:
        "Get the full schema of a Salesforce object including all fields, their types, and properties. Use this to understand what fields are available before creating or querying records.",
      inputSchema: {
        objectName: z
          .string()
          .min(1)
          .describe("API name of the SObject, e.g. Account, Contact, Opportunity, Lead, or a custom object like MyObject__c"),
      },
    },
    async ({ objectName }) => {
      try {
        const data = await salesforceFetch(
          `/services/data/${SALESFORCE_API_VERSION}/sobjects/${encodeURIComponent(objectName)}/describe`,
        );
        const fields = (data.fields as Record<string, unknown>[] | undefined)?.map((f) => ({
          name: f.name,
          label: f.label,
          type: f.type,
          required: !f.nillable && !f.defaultedOnCreate,
          createable: f.createable,
          updateable: f.updateable,
          picklistValues:
            (f.picklistValues as Array<Record<string, unknown>>)?.length > 0
              ? (f.picklistValues as Array<Record<string, unknown>>)
                  .filter((v: Record<string, unknown>) => v.active)
                  .map((v: Record<string, unknown>) => v.value)
              : undefined,
          referenceTo: (f.referenceTo as string[])?.length > 0 ? f.referenceTo : undefined,
        }));
        return jsonResponse({
          name: data.name,
          label: data.label,
          fields,
          recordTypeInfos: (data.recordTypeInfos as Record<string, unknown>[] | undefined)?.filter((rt) => rt.available),
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to describe object"));
      }
    },
  );

  // --- Get single record ---
  server.registerTool(
    "salesforce_get_record",
    {
      description: "Get a single Salesforce record by its ID. Optionally specify which fields to return.",
      inputSchema: {
        objectName: z.string().min(1).describe("API name of the SObject, e.g. Account, Contact"),
        recordId: z.string().min(1).describe("The 15 or 18-character Salesforce record ID"),
        fields: z
          .array(z.string())
          .optional()
          .describe("Specific fields to return. If omitted, returns all accessible fields."),
      },
    },
    async ({ objectName, recordId, fields }) => {
      try {
        const fieldParam = fields?.length ? `?fields=${fields.join(",")}` : "";
        const data = await salesforceFetch(
          `/services/data/${SALESFORCE_API_VERSION}/sobjects/${encodeURIComponent(objectName)}/${recordId}${fieldParam}`,
        );
        const { attributes, ...record } = data;
        return jsonResponse(record);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get record"));
      }
    },
  );

  // --- Create record ---
  server.registerTool(
    "salesforce_create_record",
    {
      description: "Create a new record in Salesforce. Use salesforce_describe_object first to see available fields.",
      inputSchema: {
        objectName: z.string().min(1).describe("API name of the SObject, e.g. Account, Contact, Lead"),
        fields: z
          .record(z.any())
          .describe("Field values for the new record, e.g. { Name: 'Acme Corp', Industry: 'Technology' }"),
      },
    },
    async ({ objectName, fields }) => {
      try {
        const data = await salesforceFetch(
          `/services/data/${SALESFORCE_API_VERSION}/sobjects/${encodeURIComponent(objectName)}`,
          {
            method: "POST",
            body: JSON.stringify(fields),
          },
        );
        logger.info("[SalesforceMCP] Record created", { objectName, id: data.id });
        return jsonResponse({ success: data.success, id: data.id });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to create record"));
      }
    },
  );

  // --- Update record ---
  server.registerTool(
    "salesforce_update_record",
    {
      description: "Update fields on an existing Salesforce record. Only include the fields you want to change.",
      inputSchema: {
        objectName: z.string().min(1).describe("API name of the SObject, e.g. Account, Contact"),
        recordId: z.string().min(1).describe("The record ID to update"),
        fields: z
          .record(z.any())
          .describe("Fields to update, e.g. { Industry: 'Finance', Phone: '555-1234' }"),
      },
    },
    async ({ objectName, recordId, fields }) => {
      try {
        await salesforceFetch(
          `/services/data/${SALESFORCE_API_VERSION}/sobjects/${encodeURIComponent(objectName)}/${recordId}`,
          {
            method: "PATCH",
            body: JSON.stringify(fields),
          },
        );
        logger.info("[SalesforceMCP] Record updated", { objectName, recordId });
        return jsonResponse({ success: true, id: recordId });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to update record"));
      }
    },
  );

  // --- Delete record ---
  server.registerTool(
    "salesforce_delete_record",
    {
      description: "Delete a Salesforce record by its ID.",
      inputSchema: {
        objectName: z.string().min(1).describe("API name of the SObject, e.g. Account, Contact"),
        recordId: z.string().min(1).describe("The record ID to delete"),
      },
    },
    async ({ objectName, recordId }) => {
      try {
        await salesforceFetch(
          `/services/data/${SALESFORCE_API_VERSION}/sobjects/${encodeURIComponent(objectName)}/${recordId}`,
          { method: "DELETE" },
        );
        logger.info("[SalesforceMCP] Record deleted", { objectName, recordId });
        return jsonResponse({ success: true, deleted: recordId });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to delete record"));
      }
    },
  );

  // --- Get recently viewed records ---
  server.registerTool(
    "salesforce_recent_records",
    {
      description: "Get recently viewed records for a specific Salesforce object type.",
      inputSchema: {
        objectName: z
          .string()
          .min(1)
          .describe("API name of the SObject, e.g. Account, Contact, Opportunity"),
        limit: z.number().int().min(1).max(200).optional().describe("Maximum records to return (default 10)"),
      },
    },
    async ({ objectName, limit = 10 }) => {
      try {
        const data = await salesforceFetch(
          `/services/data/${SALESFORCE_API_VERSION}/sobjects/${encodeURIComponent(objectName)}/recent?limit=${limit}`,
        );
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get recent records"));
      }
    },
  );
}
