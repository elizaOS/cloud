// @ts-nocheck — MCP tool types cause exponential type inference
/**
 * HubSpot MCP Tools - CRM: Contacts, Companies, Deals
 * Uses per-organization OAuth tokens via oauthService.
 */

import type { McpServer } from "mcp-handler";
import { z } from "zod3";
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
  mapHubSpotOwner,
  mapHubSpotRecord,
  searchHubSpotObjects,
  updateHubSpotObject,
} from "@/lib/utils/hubspot-mcp-shared";
import { logger } from "@/lib/utils/logger";
import { getAuthContext } from "../lib/context";
import { errorResponse, jsonResponse } from "../lib/responses";

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
        return jsonResponse(await getHubSpotStatus(user.organization_id));
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
        const { user } = getAuthContext();
        const props = properties || DEFAULT_CONTACT_PROPERTIES;
        const data = await listHubSpotObjects(user.organization_id, "contacts", {
          limit,
          after,
          properties: props,
        });

        return jsonResponse({
          success: true,
          contacts: data.results.map((contact) => mapHubSpotRecord(contact)),
          paging: data.paging,
          count: data.count,
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
        const { user } = getAuthContext();
        const contact = await getHubSpotObject(
          user.organization_id,
          "contacts",
          contactId,
          properties || DEFAULT_CONTACT_PROPERTIES,
        );

        return jsonResponse({
          success: true,
          contact: mapHubSpotRecord(contact),
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

        const { user } = getAuthContext();
        const contact = await createHubSpotObject(user.organization_id, "contacts", properties);
        logger.info("[HubSpotMCP] Contact created", {
          contactId: contact.id,
          email,
        });

        return jsonResponse({
          success: true,
          contactId: contact.id,
          contact: mapHubSpotRecord(contact, false),
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
        const { user } = getAuthContext();
        const contact = await updateHubSpotObject(
          user.organization_id,
          "contacts",
          contactId,
          properties,
        );
        logger.info("[HubSpotMCP] Contact updated", { contactId });

        return jsonResponse({
          success: true,
          contact: mapHubSpotRecord(contact),
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
        const { user } = getAuthContext();
        const data = await searchHubSpotObjects(user.organization_id, "contacts", {
          query,
          limit,
          properties: DEFAULT_CONTACT_PROPERTIES,
        });

        return jsonResponse({
          success: true,
          contacts: data.results.map((contact) => mapHubSpotRecord(contact, false)),
          paging: data.paging,
          count: data.total ?? data.count,
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
        const { user } = getAuthContext();
        const data = await listHubSpotObjects(user.organization_id, "companies", {
          limit,
          after,
          properties: properties || DEFAULT_COMPANY_PROPERTIES,
        });

        return jsonResponse({
          success: true,
          companies: data.results.map((company) => mapHubSpotRecord(company)),
          paging: data.paging,
          count: data.count,
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

        const { user } = getAuthContext();
        const company = await createHubSpotObject(user.organization_id, "companies", properties);
        logger.info("[HubSpotMCP] Company created", {
          companyId: company.id,
          name,
        });

        return jsonResponse({
          success: true,
          companyId: company.id,
          company: mapHubSpotRecord(company, false),
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
        const { user } = getAuthContext();
        const data = await searchHubSpotObjects(user.organization_id, "companies", {
          query,
          limit,
          properties: DEFAULT_COMPANY_PROPERTIES,
        });

        return jsonResponse({
          success: true,
          companies: data.results.map((company) => mapHubSpotRecord(company, false)),
          paging: data.paging,
          count: data.total ?? data.count,
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
        const { user } = getAuthContext();
        const data = await listHubSpotObjects(user.organization_id, "deals", {
          limit,
          after,
          properties: properties || DEFAULT_DEAL_PROPERTIES,
        });

        return jsonResponse({
          success: true,
          deals: data.results.map((deal) => mapHubSpotRecord(deal)),
          paging: data.paging,
          count: data.count,
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

        const { user } = getAuthContext();
        const deal = await createHubSpotObject(user.organization_id, "deals", properties);
        logger.info("[HubSpotMCP] Deal created", { dealId: deal.id, dealname });

        return jsonResponse({
          success: true,
          dealId: deal.id,
          deal: mapHubSpotRecord(deal, false),
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
        const { user } = getAuthContext();
        const deal = await updateHubSpotObject(user.organization_id, "deals", dealId, properties);
        logger.info("[HubSpotMCP] Deal updated", { dealId });

        return jsonResponse({
          success: true,
          deal: mapHubSpotRecord(deal),
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
        const { user } = getAuthContext();
        const data = await searchHubSpotObjects(user.organization_id, "deals", {
          query,
          limit,
          properties: DEFAULT_DEAL_PROPERTIES,
        });

        return jsonResponse({
          success: true,
          deals: data.results.map((deal) => mapHubSpotRecord(deal, false)),
          paging: data.paging,
          count: data.total ?? data.count,
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
        const { user } = getAuthContext();
        const data = await listHubSpotOwners(user.organization_id, {
          limit,
          email,
        });

        return jsonResponse({
          success: true,
          owners: data.results.map((owner) => mapHubSpotOwner(owner)),
          count: data.count,
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
        const { user } = getAuthContext();
        await createHubSpotAssociation(
          user.organization_id,
          fromObjectType,
          fromObjectId,
          toObjectType,
          toObjectId,
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
