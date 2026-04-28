// @ts-nocheck — MCP tool types cause exponential type inference
/**
 * HubSpot MCP Server - Contacts, Companies, Deals, Owners
 *
 * Standalone MCP endpoint for HubSpot CRM tools with per-org OAuth.
 * Config: { "type": "streamable-http", "url": "/api/mcps/hubspot/streamable-http" }
 */

import type { NextRequest } from "next/server";
import { authContextStorage } from "@/app/api/mcp/lib/context";
import { apiFailureResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { enforceMcpOrganizationRateLimit } from "@/lib/middleware/rate-limit";
import {
  createHubSpotAssociation,
  createHubSpotObject,
  DEFAULT_COMPANY_PROPERTIES,
  DEFAULT_CONTACT_PROPERTIES,
  DEFAULT_DEAL_PROPERTIES,
  getHubSpotObject,
  getHubSpotStatus,
  listHubSpotObjects,
  listHubSpotOwners,
  searchHubSpotObjects,
  updateHubSpotObject,
} from "@/lib/utils/hubspot-mcp-shared";
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

// Lazy-loaded handler
let mcpHandler: ((req: Request) => Promise<Response>) | null = null;

async function getHubSpotMcpHandler() {
  if (mcpHandler) return mcpHandler;

  const { createMcpHandler } = await import("mcp-handler");
  const { z } = await import("zod3");

  function getOrgId(): string {
    const ctx = authContextStorage.getStore();
    if (!ctx) throw new Error("Not authenticated");
    return ctx.user.organization_id;
  }

  function jsonResult(data: object) {
    return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
  }

  function errorResult(msg: string) {
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
      isError: true,
    };
  }

  mcpHandler = createMcpHandler(
    (server) => {
      // ==================== CONNECTION STATUS ====================
      server.tool("hubspot_status", "Check HubSpot OAuth connection status", {}, async () => {
        try {
          const orgId = getOrgId();
          const status = await getHubSpotStatus(orgId);
          if (status.connected === false && !status.message) {
            return jsonResult({ connected: false });
          }
          return jsonResult(status);
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : "Failed");
        }
      });

      // ==================== CONTACTS ====================
      server.tool(
        "hubspot_list_contacts",
        "List contacts from HubSpot CRM",
        {
          limit: z.number().int().min(1).max(100).optional().default(20),
          after: z.string().optional().describe("Pagination cursor"),
        },
        async ({ limit = 20, after }) => {
          try {
            const orgId = getOrgId();
            const data = await listHubSpotObjects(orgId, "contacts", {
              limit,
              after,
              properties: DEFAULT_CONTACT_PROPERTIES,
            });
            return jsonResult({
              success: true,
              contacts: data.results,
              paging: data.paging,
              count: data.count,
            });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "hubspot_get_contact",
        "Get a specific contact by ID",
        {
          contactId: z.string().describe("Contact ID"),
        },
        async ({ contactId }) => {
          try {
            const orgId = getOrgId();
            const contact = await getHubSpotObject(
              orgId,
              "contacts",
              contactId,
              DEFAULT_CONTACT_PROPERTIES,
            );
            return jsonResult({ success: true, contact });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "hubspot_create_contact",
        "Create a new contact in HubSpot",
        {
          email: z.string().describe("Email address"),
          firstname: z.string().optional().describe("First name"),
          lastname: z.string().optional().describe("Last name"),
          phone: z.string().optional().describe("Phone number"),
          company: z.string().optional().describe("Company name"),
        },
        async ({ email, firstname, lastname, phone, company }) => {
          try {
            const orgId = getOrgId();
            const properties: Record<string, string> = { email };
            if (firstname) properties.firstname = firstname;
            if (lastname) properties.lastname = lastname;
            if (phone) properties.phone = phone;
            if (company) properties.company = company;
            const contact = await createHubSpotObject(orgId, "contacts", properties);
            logger.info("[HubSpotMCP] Contact created", {
              contactId: contact.id,
            });
            return jsonResult({ success: true, contact });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "hubspot_update_contact",
        "Update an existing contact",
        {
          contactId: z.string().describe("Contact ID"),
          properties: z.record(z.string()).describe("Properties to update"),
        },
        async ({ contactId, properties }) => {
          try {
            const orgId = getOrgId();
            const contact = await updateHubSpotObject(orgId, "contacts", contactId, properties);
            logger.info("[HubSpotMCP] Contact updated", { contactId });
            return jsonResult({ success: true, contact });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "hubspot_search_contacts",
        "Search contacts",
        {
          query: z.string().describe("Search query"),
          limit: z.number().int().min(1).max(100).optional().default(20),
        },
        async ({ query, limit = 20 }) => {
          try {
            const orgId = getOrgId();
            const data = await searchHubSpotObjects(orgId, "contacts", {
              query,
              limit,
              properties: DEFAULT_CONTACT_PROPERTIES,
            });
            return jsonResult({
              success: true,
              contacts: data.results,
              paging: data.paging,
              count: data.total ?? data.count,
            });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      // ==================== COMPANIES ====================
      server.tool(
        "hubspot_list_companies",
        "List companies from HubSpot CRM",
        {
          limit: z.number().int().min(1).max(100).optional().default(20),
          after: z.string().optional().describe("Pagination cursor"),
        },
        async ({ limit = 20, after }) => {
          try {
            const orgId = getOrgId();
            const data = await listHubSpotObjects(orgId, "companies", {
              limit,
              after,
              properties: DEFAULT_COMPANY_PROPERTIES,
            });
            return jsonResult({
              success: true,
              companies: data.results,
              paging: data.paging,
              count: data.count,
            });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "hubspot_create_company",
        "Create a new company",
        {
          name: z.string().describe("Company name"),
          domain: z.string().optional().describe("Company website domain"),
          industry: z.string().optional().describe("Industry"),
          phone: z.string().optional().describe("Phone number"),
        },
        async ({ name, domain, industry, phone }) => {
          try {
            const orgId = getOrgId();
            const properties: Record<string, string> = { name };
            if (domain) properties.domain = domain;
            if (industry) properties.industry = industry;
            if (phone) properties.phone = phone;
            const company = await createHubSpotObject(orgId, "companies", properties);
            logger.info("[HubSpotMCP] Company created", {
              companyId: company.id,
            });
            return jsonResult({ success: true, company });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "hubspot_search_companies",
        "Search companies",
        {
          query: z.string().describe("Search query"),
          limit: z.number().int().min(1).max(100).optional().default(20),
        },
        async ({ query, limit = 20 }) => {
          try {
            const orgId = getOrgId();
            const data = await searchHubSpotObjects(orgId, "companies", {
              query,
              limit,
              properties: DEFAULT_COMPANY_PROPERTIES,
            });
            return jsonResult({
              success: true,
              companies: data.results,
              paging: data.paging,
              count: data.total ?? data.count,
            });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      // ==================== DEALS ====================
      server.tool(
        "hubspot_list_deals",
        "List deals from HubSpot CRM",
        {
          limit: z.number().int().min(1).max(100).optional().default(20),
          after: z.string().optional().describe("Pagination cursor"),
        },
        async ({ limit = 20, after }) => {
          try {
            const orgId = getOrgId();
            const data = await listHubSpotObjects(orgId, "deals", {
              limit,
              after,
              properties: DEFAULT_DEAL_PROPERTIES,
            });
            return jsonResult({
              success: true,
              deals: data.results,
              paging: data.paging,
              count: data.count,
            });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "hubspot_create_deal",
        "Create a new deal",
        {
          dealname: z.string().describe("Deal name"),
          amount: z.number().optional().describe("Deal amount"),
          dealstage: z.string().optional().describe("Deal stage"),
          closedate: z.string().optional().describe("Expected close date (ISO 8601)"),
        },
        async ({ dealname, amount, dealstage, closedate }) => {
          try {
            const orgId = getOrgId();
            const properties: Record<string, string | number> = { dealname };
            if (amount !== undefined) properties.amount = amount;
            if (dealstage) properties.dealstage = dealstage;
            if (closedate) properties.closedate = closedate;
            const deal = await createHubSpotObject(orgId, "deals", properties);
            logger.info("[HubSpotMCP] Deal created", { dealId: deal.id });
            return jsonResult({ success: true, deal });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "hubspot_search_deals",
        "Search deals",
        {
          query: z.string().describe("Search query"),
          limit: z.number().int().min(1).max(100).optional().default(20),
        },
        async ({ query, limit = 20 }) => {
          try {
            const orgId = getOrgId();
            const data = await searchHubSpotObjects(orgId, "deals", {
              query,
              limit,
              properties: DEFAULT_DEAL_PROPERTIES,
            });
            return jsonResult({
              success: true,
              deals: data.results,
              paging: data.paging,
              count: data.total ?? data.count,
            });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      // ==================== OWNERS ====================
      server.tool(
        "hubspot_list_owners",
        "List HubSpot owners (sales reps)",
        {
          limit: z.number().int().min(1).max(100).optional().default(100),
        },
        async ({ limit = 100 }) => {
          try {
            const orgId = getOrgId();
            const data = await listHubSpotOwners(orgId, { limit });
            return jsonResult({
              success: true,
              owners: data.results,
              count: data.count,
            });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "hubspot_associate",
        "Associate two HubSpot objects (e.g., link contact to company)",
        {
          fromObjectType: z.enum(["contacts", "companies", "deals"]).describe("Source object type"),
          fromObjectId: z.string().describe("Source object ID"),
          toObjectType: z.enum(["contacts", "companies", "deals"]).describe("Target object type"),
          toObjectId: z.string().describe("Target object ID"),
        },
        async ({ fromObjectType, fromObjectId, toObjectType, toObjectId }) => {
          try {
            const orgId = getOrgId();
            await createHubSpotAssociation(
              orgId,
              fromObjectType,
              fromObjectId,
              toObjectType,
              toObjectId,
            );
            return jsonResult({
              success: true,
              message: `Associated ${fromObjectType}/${fromObjectId} with ${toObjectType}/${toObjectId}`,
            });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );
    },
    { capabilities: { tools: {} } },
    { basePath: "/api/mcps/hubspot", maxDuration: 60 },
  );

  return mcpHandler;
}

async function handleRequest(req: NextRequest): Promise<Response> {
  try {
    const authResult = await requireAuthOrApiKeyWithOrg(req);

    const rateLimited = await enforceMcpOrganizationRateLimit(
      authResult.user.organization_id!,
      "hubspot",
    );
    if (rateLimited) return rateLimited;

    const handler = await getHubSpotMcpHandler();
    const mcpResponse = await authContextStorage.run(authResult, () => handler(req as Request));

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
    logger.error("[HubSpotMCP]", error);
    return apiFailureResponse(error);
  }
}

export const GET = handleRequest;
export const POST = handleRequest;
export const DELETE = handleRequest;
