// @ts-nocheck — MCP tool types cause exponential type inference
/**
 * HubSpot MCP Tools - CRM: Contacts, Companies, Deals
 * Uses per-organization OAuth tokens via oauthService.
 */

import type { McpServer } from "mcp-handler";
import { z } from "zod3";
import { logger } from "@/lib/utils/logger";
import { oauthService } from "@/lib/services/oauth";
import { getAuthContext } from "../lib/context";
import { jsonResponse, errorResponse } from "../lib/responses";

const HUBSPOT_API_BASE = "https://api.hubapi.com";

async function getHubSpotToken(): Promise<string> {
  const { user } = getAuthContext();
  try {
    const result = await oauthService.getValidTokenByPlatform({
      organizationId: user.organization_id,
      platform: "hubspot",
    });
    return result.accessToken;
  } catch (error) {
    logger.warn("[HubSpotMCP] Failed to get token", {
      organizationId: user.organization_id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error("HubSpot account not connected. Connect in Settings > Connections.");
  }
}

async function hubspotFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const token = await getHubSpotToken();
  const url = endpoint.startsWith("http") ? endpoint : `${HUBSPOT_API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok && response.status !== 204) {
    const error = await response.json().catch(() => {
      logger.warn("[HubSpot] Failed to parse error response", { status: response.status });
      return { message: `HTTP ${response.status}` };
    });
    throw new Error(error.message || `HubSpot API error: ${response.status}`);
  }
  return response;
}

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function registerHubSpotTools(server: McpServer): void {
  // ==================== CONNECTION STATUS ====================

  server.registerTool(
    "hubspot_status",
    {
      description: "Check HubSpot OAuth connection status",
      inputSchema: {},
    },
    async () => {
      try {
        const { user } = getAuthContext();
        const connections = await oauthService.listConnections({
          organizationId: user.organization_id,
          platform: "hubspot",
        });

        const active = connections.find((c) => c.status === "active");
        if (!active) {
          return jsonResponse({
            connected: false,
            message: "HubSpot not connected. Connect in Settings > Connections.",
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

  // ==================== CONTACTS ====================

  server.registerTool(
    "hubspot_list_contacts",
    {
      description: "List contacts from HubSpot CRM",
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(20)
          .describe("Max contacts to return"),
        after: z.string().optional().describe("Pagination cursor"),
        properties: z
          .array(z.string())
          .optional()
          .describe("Properties to include (default: firstname, lastname, email)"),
      },
    },
    async ({ limit = 20, after, properties }) => {
      try {
        const props = properties || ["firstname", "lastname", "email", "phone", "company"];
        const params = new URLSearchParams({
          limit: String(limit),
          properties: props.join(","),
        });
        if (after) params.set("after", after);

        const response = await hubspotFetch(`/crm/v3/objects/contacts?${params}`);
        const data = await response.json();

        return jsonResponse({
          success: true,
          contacts: data.results?.map((c: any) => ({
            id: c.id,
            ...c.properties,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
          })),
          paging: data.paging,
          count: data.results?.length || 0,
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to list contacts"));
      }
    },
  );

  server.registerTool(
    "hubspot_get_contact",
    {
      description: "Get a specific contact by ID",
      inputSchema: {
        contactId: z.string().describe("Contact ID"),
        properties: z.array(z.string()).optional().describe("Properties to include"),
      },
    },
    async ({ contactId, properties }) => {
      try {
        const props = properties || [
          "firstname",
          "lastname",
          "email",
          "phone",
          "company",
          "jobtitle",
          "lifecyclestage",
        ];
        const params = new URLSearchParams({ properties: props.join(",") });

        const response = await hubspotFetch(`/crm/v3/objects/contacts/${contactId}?${params}`);
        const contact = await response.json();

        return jsonResponse({
          success: true,
          contact: {
            id: contact.id,
            ...contact.properties,
            createdAt: contact.createdAt,
            updatedAt: contact.updatedAt,
          },
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get contact"));
      }
    },
  );

  server.registerTool(
    "hubspot_create_contact",
    {
      description: "Create a new contact in HubSpot",
      inputSchema: {
        email: z.string().email().describe("Contact email (required)"),
        firstname: z.string().optional().describe("First name"),
        lastname: z.string().optional().describe("Last name"),
        phone: z.string().optional().describe("Phone number"),
        company: z.string().optional().describe("Company name"),
        jobtitle: z.string().optional().describe("Job title"),
        lifecyclestage: z
          .enum([
            "subscriber",
            "lead",
            "marketingqualifiedlead",
            "salesqualifiedlead",
            "opportunity",
            "customer",
            "evangelist",
          ])
          .optional(),
      },
    },
    async ({ email, firstname, lastname, phone, company, jobtitle, lifecyclestage }) => {
      try {
        const properties: Record<string, string> = { email };
        if (firstname) properties.firstname = firstname;
        if (lastname) properties.lastname = lastname;
        if (phone) properties.phone = phone;
        if (company) properties.company = company;
        if (jobtitle) properties.jobtitle = jobtitle;
        if (lifecyclestage) properties.lifecyclestage = lifecyclestage;

        const response = await hubspotFetch("/crm/v3/objects/contacts", {
          method: "POST",
          body: JSON.stringify({ properties }),
        });

        const contact = await response.json();
        logger.info("[HubSpotMCP] Contact created", {
          contactId: contact.id,
          email,
        });

        return jsonResponse({
          success: true,
          contactId: contact.id,
          contact: {
            id: contact.id,
            ...contact.properties,
          },
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to create contact"));
      }
    },
  );

  server.registerTool(
    "hubspot_update_contact",
    {
      description: "Update an existing contact",
      inputSchema: {
        contactId: z.string().describe("Contact ID"),
        properties: z.record(z.string()).describe("Properties to update (key-value pairs)"),
      },
    },
    async ({ contactId, properties }) => {
      try {
        const response = await hubspotFetch(`/crm/v3/objects/contacts/${contactId}`, {
          method: "PATCH",
          body: JSON.stringify({ properties }),
        });

        const contact = await response.json();
        logger.info("[HubSpotMCP] Contact updated", { contactId });

        return jsonResponse({
          success: true,
          contact: {
            id: contact.id,
            ...contact.properties,
            updatedAt: contact.updatedAt,
          },
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to update contact"));
      }
    },
  );

  server.registerTool(
    "hubspot_search_contacts",
    {
      description: "Search for contacts",
      inputSchema: {
        query: z.string().describe("Search query (searches email, firstname, lastname)"),
        limit: z.number().int().min(1).max(100).optional().default(20),
      },
    },
    async ({ query, limit = 20 }) => {
      try {
        const response = await hubspotFetch("/crm/v3/objects/contacts/search", {
          method: "POST",
          body: JSON.stringify({
            query,
            limit,
            properties: ["firstname", "lastname", "email", "phone", "company"],
          }),
        });

        const data = await response.json();

        return jsonResponse({
          success: true,
          contacts: data.results?.map((c: any) => ({
            id: c.id,
            ...c.properties,
          })),
          paging: data.paging,
          count: data.total || data.results?.length || 0,
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to search contacts"));
      }
    },
  );

  // ==================== COMPANIES ====================

  server.registerTool(
    "hubspot_list_companies",
    {
      description: "List companies from HubSpot CRM",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().default(20),
        after: z.string().optional().describe("Pagination cursor"),
        properties: z.array(z.string()).optional(),
      },
    },
    async ({ limit = 20, after, properties }) => {
      try {
        const props = properties || [
          "name",
          "domain",
          "industry",
          "numberofemployees",
          "annualrevenue",
        ];
        const params = new URLSearchParams({
          limit: String(limit),
          properties: props.join(","),
        });
        if (after) params.set("after", after);

        const response = await hubspotFetch(`/crm/v3/objects/companies?${params}`);
        const data = await response.json();

        return jsonResponse({
          success: true,
          companies: data.results?.map((c: any) => ({
            id: c.id,
            ...c.properties,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
          })),
          paging: data.paging,
          count: data.results?.length || 0,
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to list companies"));
      }
    },
  );

  server.registerTool(
    "hubspot_create_company",
    {
      description: "Create a new company in HubSpot",
      inputSchema: {
        name: z.string().describe("Company name (required)"),
        domain: z.string().optional().describe("Company website domain"),
        industry: z.string().optional().describe("Industry"),
        numberofemployees: z.number().int().optional().describe("Number of employees"),
        annualrevenue: z.number().optional().describe("Annual revenue"),
        description: z.string().optional().describe("Company description"),
      },
    },
    async ({ name, domain, industry, numberofemployees, annualrevenue, description }) => {
      try {
        const properties: Record<string, string | number> = { name };
        if (domain) properties.domain = domain;
        if (industry) properties.industry = industry;
        if (numberofemployees) properties.numberofemployees = numberofemployees;
        if (annualrevenue) properties.annualrevenue = annualrevenue;
        if (description) properties.description = description;

        const response = await hubspotFetch("/crm/v3/objects/companies", {
          method: "POST",
          body: JSON.stringify({ properties }),
        });

        const company = await response.json();
        logger.info("[HubSpotMCP] Company created", {
          companyId: company.id,
          name,
        });

        return jsonResponse({
          success: true,
          companyId: company.id,
          company: {
            id: company.id,
            ...company.properties,
          },
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to create company"));
      }
    },
  );

  server.registerTool(
    "hubspot_search_companies",
    {
      description: "Search for companies",
      inputSchema: {
        query: z.string().describe("Search query"),
        limit: z.number().int().min(1).max(100).optional().default(20),
      },
    },
    async ({ query, limit = 20 }) => {
      try {
        const response = await hubspotFetch("/crm/v3/objects/companies/search", {
          method: "POST",
          body: JSON.stringify({
            query,
            limit,
            properties: ["name", "domain", "industry"],
          }),
        });

        const data = await response.json();

        return jsonResponse({
          success: true,
          companies: data.results?.map((c: any) => ({
            id: c.id,
            ...c.properties,
          })),
          paging: data.paging,
          count: data.total || data.results?.length || 0,
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to search companies"));
      }
    },
  );

  // ==================== DEALS ====================

  server.registerTool(
    "hubspot_list_deals",
    {
      description: "List deals from HubSpot CRM",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().default(20),
        after: z.string().optional().describe("Pagination cursor"),
        properties: z.array(z.string()).optional(),
      },
    },
    async ({ limit = 20, after, properties }) => {
      try {
        const props = properties || [
          "dealname",
          "amount",
          "dealstage",
          "pipeline",
          "closedate",
          "hubspot_owner_id",
        ];
        const params = new URLSearchParams({
          limit: String(limit),
          properties: props.join(","),
        });
        if (after) params.set("after", after);

        const response = await hubspotFetch(`/crm/v3/objects/deals?${params}`);
        const data = await response.json();

        return jsonResponse({
          success: true,
          deals: data.results?.map((d: any) => ({
            id: d.id,
            ...d.properties,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
          })),
          paging: data.paging,
          count: data.results?.length || 0,
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to list deals"));
      }
    },
  );

  server.registerTool(
    "hubspot_create_deal",
    {
      description: "Create a new deal in HubSpot",
      inputSchema: {
        dealname: z.string().describe("Deal name (required)"),
        amount: z.number().optional().describe("Deal amount"),
        dealstage: z.string().optional().describe("Deal stage ID"),
        pipeline: z.string().optional().describe("Pipeline ID (default: default)"),
        closedate: z.string().optional().describe("Expected close date (ISO 8601)"),
        hubspot_owner_id: z.string().optional().describe("Owner ID"),
      },
    },
    async ({ dealname, amount, dealstage, pipeline, closedate, hubspot_owner_id }) => {
      try {
        const properties: Record<string, string | number> = { dealname };
        if (amount !== undefined) properties.amount = amount;
        if (dealstage) properties.dealstage = dealstage;
        if (pipeline) properties.pipeline = pipeline;
        if (closedate) properties.closedate = closedate;
        if (hubspot_owner_id) properties.hubspot_owner_id = hubspot_owner_id;

        const response = await hubspotFetch("/crm/v3/objects/deals", {
          method: "POST",
          body: JSON.stringify({ properties }),
        });

        const deal = await response.json();
        logger.info("[HubSpotMCP] Deal created", { dealId: deal.id, dealname });

        return jsonResponse({
          success: true,
          dealId: deal.id,
          deal: {
            id: deal.id,
            ...deal.properties,
          },
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to create deal"));
      }
    },
  );

  server.registerTool(
    "hubspot_update_deal",
    {
      description: "Update an existing deal",
      inputSchema: {
        dealId: z.string().describe("Deal ID"),
        properties: z.record(z.union([z.string(), z.number()])).describe("Properties to update"),
      },
    },
    async ({ dealId, properties }) => {
      try {
        const response = await hubspotFetch(`/crm/v3/objects/deals/${dealId}`, {
          method: "PATCH",
          body: JSON.stringify({ properties }),
        });

        const deal = await response.json();
        logger.info("[HubSpotMCP] Deal updated", { dealId });

        return jsonResponse({
          success: true,
          deal: {
            id: deal.id,
            ...deal.properties,
            updatedAt: deal.updatedAt,
          },
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to update deal"));
      }
    },
  );

  server.registerTool(
    "hubspot_search_deals",
    {
      description: "Search for deals",
      inputSchema: {
        query: z.string().describe("Search query"),
        limit: z.number().int().min(1).max(100).optional().default(20),
      },
    },
    async ({ query, limit = 20 }) => {
      try {
        const response = await hubspotFetch("/crm/v3/objects/deals/search", {
          method: "POST",
          body: JSON.stringify({
            query,
            limit,
            properties: ["dealname", "amount", "dealstage", "closedate"],
          }),
        });

        const data = await response.json();

        return jsonResponse({
          success: true,
          deals: data.results?.map((d: any) => ({
            id: d.id,
            ...d.properties,
          })),
          paging: data.paging,
          count: data.total || data.results?.length || 0,
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to search deals"));
      }
    },
  );

  // ==================== OWNERS ====================

  server.registerTool(
    "hubspot_list_owners",
    {
      description: "List owners (team members) in HubSpot",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().default(100),
        email: z.string().optional().describe("Filter by email"),
      },
    },
    async ({ limit = 100, email }) => {
      try {
        const params = new URLSearchParams({ limit: String(limit) });
        if (email) params.set("email", email);

        const response = await hubspotFetch(`/crm/v3/owners?${params}`);
        const data = await response.json();

        return jsonResponse({
          success: true,
          owners: data.results?.map((o: any) => ({
            id: o.id,
            email: o.email,
            firstName: o.firstName,
            lastName: o.lastName,
            userId: o.userId,
            teams: o.teams,
          })),
          count: data.results?.length || 0,
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to list owners"));
      }
    },
  );

  // ==================== ASSOCIATIONS ====================

  server.registerTool(
    "hubspot_associate",
    {
      description: "Associate two HubSpot objects (e.g., link contact to company)",
      inputSchema: {
        fromObjectType: z.enum(["contacts", "companies", "deals"]).describe("Source object type"),
        fromObjectId: z.string().describe("Source object ID"),
        toObjectType: z.enum(["contacts", "companies", "deals"]).describe("Target object type"),
        toObjectId: z.string().describe("Target object ID"),
      },
    },
    async ({ fromObjectType, fromObjectId, toObjectType, toObjectId }) => {
      try {
        // Default association type IDs
        const associationTypeMap: Record<string, Record<string, number>> = {
          contacts: { companies: 1, deals: 3 },
          companies: { contacts: 2, deals: 5 },
          deals: { contacts: 4, companies: 6 },
        };

        const associationType = associationTypeMap[fromObjectType]?.[toObjectType];
        if (!associationType) {
          throw new Error(`Invalid association: ${fromObjectType} -> ${toObjectType}`);
        }

        await hubspotFetch(
          `/crm/v3/objects/${fromObjectType}/${fromObjectId}/associations/${toObjectType}/${toObjectId}/${associationType}`,
          { method: "PUT" },
        );

        logger.info("[HubSpotMCP] Association created", {
          fromObjectType,
          fromObjectId,
          toObjectType,
          toObjectId,
        });

        return jsonResponse({
          success: true,
          message: `Associated ${fromObjectType}/${fromObjectId} with ${toObjectType}/${toObjectId}`,
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to create association"));
      }
    },
  );
}
